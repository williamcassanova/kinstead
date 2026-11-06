import * as THREE from "three";

const FORWARD = new THREE.Vector3();
const RIGHT = new THREE.Vector3();
const DESIRED = new THREE.Vector3();

/**
 * Third-person character motor. DOM-free: the game/UI writes into `input`.
 *
 * input = { x, y, run }  (x right, y forward, both -1..1)
 */
export class CharacterController {
  constructor({
    model,
    animation,
    collision,
    spawn,
    radius = 0.38,
    walkSpeed = 5.0,
    runSpeed = 9.6,
  }) {
    this.model = model;
    this.animation = animation;
    this.collision = collision;
    this.radius = radius;
    this.walkSpeed = walkSpeed;
    this.runSpeed = runSpeed;
    this.acceleration = 28;
    this.deceleration = 40;
    this.turnRate = 13;
    this.gravity = 24;
    this.jumpSpeed = 7.4;

    this.position = new THREE.Vector3(spawn.x, spawn.y ?? 0, spawn.z);
    const ground = collision.groundHeight(spawn.x, spawn.z);
    this.position.y = ground ?? 0;

    this.velocity = new THREE.Vector3();
    this.velocityY = 0;
    this.heading = spawn.heading ?? Math.PI;
    this.targetHeading = this.heading;
    this.grounded = true;
    this.speed = 0;
    this.running = false;
    this.jumpBuffer = 0;
    this.input = { x: 0, y: 0, run: false };
    this.enabled = true;
    this.lastBlocked = false;

    this.model.position.copy(this.position);
    this.model.rotation.y = this.heading;
    if (this.animation) {
      this.animation.setImmediateState({ speed: 0, running: false, grounded: true });
    }
  }

  requestJump() {
    this.jumpBuffer = 0.16;
  }

  update(dt, cameraYaw) {
    dt = Math.min(Math.max(dt, 0), 0.05);
    if (dt === 0) return;
    if (!this.enabled) {
      this.velocity.multiplyScalar(0);
      this.speed = 0;
      return;
    }

    let inputX = this.input.x;
    let inputY = this.input.y;
    const mag = Math.hypot(inputX, inputY);
    if (mag > 1) {
      inputX /= mag;
      inputY /= mag;
    }

    // Camera-relative movement basis.
    FORWARD.set(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw));
    RIGHT.set(Math.cos(cameraYaw), 0, -Math.sin(cameraYaw));
    DESIRED.set(0, 0, 0)
      .addScaledVector(FORWARD, inputY)
      .addScaledVector(RIGHT, inputX);

    const hasInput = DESIRED.lengthSq() > 1e-6;
    if (hasInput) DESIRED.normalize();

    this.running = !!this.input.run && hasInput;
    const maxSpeed = this.running ? this.runSpeed : this.walkSpeed;
    const targetX = hasInput ? DESIRED.x * maxSpeed : 0;
    const targetZ = hasInput ? DESIRED.z * maxSpeed : 0;

    const rate = hasInput ? this.acceleration : this.deceleration;
    const airFactor = this.grounded ? 1 : 0.42;
    const k = 1 - Math.exp(-rate * airFactor * dt);
    this.velocity.x += (targetX - this.velocity.x) * k;
    this.velocity.z += (targetZ - this.velocity.z) * k;

    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    this.speed = speed;

    if (speed > 0.15) {
      this.targetHeading = Math.atan2(this.velocity.x, this.velocity.z);
    }
    this.heading = dampAngle(this.heading, this.targetHeading, this.turnRate, dt);

    // Jump buffering and gravity.
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    if (this.grounded && this.jumpBuffer > 0) {
      this.velocityY = this.jumpSpeed;
      this.grounded = false;
      this.jumpBuffer = 0;
    }

    if (!this.grounded) this.velocityY -= this.gravity * dt;

    const oldX = this.position.x;
    const oldZ = this.position.z;
    const move = this.collision.move(
      this.position,
      this.velocity.x * dt,
      this.velocity.z * dt,
      this.radius
    );
    this.lastBlocked = move.blocked;

    if (move.blocked) {
      // Relax velocity when pushing into a wall so the character doesn't
      // keep accelerating against it.
      const dx = this.position.x - oldX;
      const dz = this.position.z - oldZ;
      if (Math.abs(dx) < Math.abs(this.velocity.x * dt) * 0.35) {
        this.velocity.x *= 0.55;
      }
      if (Math.abs(dz) < Math.abs(this.velocity.z * dt) * 0.35) {
        this.velocity.z *= 0.55;
      }
      this.speed = Math.hypot(this.velocity.x, this.velocity.z);
    }

    const ground = this.collision.groundHeight(this.position.x, this.position.z);
    if (ground !== null) {
      if (this.grounded) {
        this.position.y = ground;
        this.velocityY = 0;
      } else {
        this.position.y += this.velocityY * dt;
        if (this.position.y <= ground) {
          this.position.y = ground;
          this.velocityY = 0;
          this.grounded = true;
        }
      }
    } else {
      this.position.y += this.velocityY * dt;
      if (this.position.y < -10) {
        this.position.y = -10;
        this.velocityY = 0;
      }
    }

    // Keep the visual glued to the motor.
    this.model.position.copy(this.position);
    this.model.rotation.y = this.heading;

    if (this.animation) {
      this.animation.update(dt, {
        speed: this.speed,
        running: this.running,
        grounded: this.grounded,
      });
    }
  }

  teleport(x, z, heading = this.heading) {
    const ground = this.collision.groundHeight(x, z);
    if (ground === null) return false;
    this.position.set(x, ground, z);
    this.velocity.set(0, 0, 0);
    this.velocityY = 0;
    this.grounded = true;
    this.heading = heading;
    this.targetHeading = heading;
    this.model.position.copy(this.position);
    this.model.rotation.y = heading;
    return true;
  }

  faceToward(x, z) {
    this.targetHeading = Math.atan2(x - this.position.x, z - this.position.z);
    this.heading = this.targetHeading;
  }
}

function dampAngle(current, target, rate, dt) {
  let delta = target - current;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return current + delta * (1 - Math.exp(-rate * dt));
}
