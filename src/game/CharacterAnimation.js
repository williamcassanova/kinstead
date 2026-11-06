import * as THREE from "three";

const X_AXIS = new THREE.Vector3(1, 0, 0);

/**
 * The Kinstead villagers have no skeleton and no GLB animations. Their
 * hierarchy is still articulated though: each villager is made of separate
 * Leg, Arm, Body, Eyes and hat/outfit meshes under a common root. We animate
 * those nodes procedurally, which preserves the original model and materials.
 */
export class CharacterAnimation {
  constructor(root) {
    this.root = root;
    this.visual = root.userData.model || root;
    this.rig = findRig(root, this.visual);

    this.time = 0;
    this.phase = 0;
    this.moveBlend = 0;
    this.runBlend = 0;
    this.airBlend = 0;
    this.blinkTimer = randomRange(2.2, 5.5);
    this.blinkTime = 0;

    this.baseVisualPosition = this.visual.position.clone();
    this.baseVisualQuaternion = this.visual.quaternion.clone();

    this.baseLimb = new Map();
    for (const node of this.rig.limbs) {
      this.baseLimb.set(node, {
        quaternion: node.quaternion.clone(),
        position: node.position.clone(),
        scale: node.scale.clone(),
      });
    }
    if (this.rig.torso) {
      this.baseLimb.set(this.rig.torso, {
        quaternion: this.rig.torso.quaternion.clone(),
        position: this.rig.torso.position.clone(),
        scale: this.rig.torso.scale.clone(),
      });
    }
    if (this.rig.eyes) {
      this.baseLimb.set(this.rig.eyes, {
        quaternion: this.rig.eyes.quaternion.clone(),
        position: this.rig.eyes.position.clone(),
        scale: this.rig.eyes.scale.clone(),
      });
    }

    this._deltaQuat = new THREE.Quaternion();
    this._euler = new THREE.Euler();
  }

  setImmediateState({ speed = 0, running = false, grounded = true }) {
    this.moveBlend = THREE.MathUtils.clamp(speed / 4.5, 0, 1);
    this.runBlend = running ? 1 : 0;
    this.airBlend = grounded ? 0 : 1;
  }

  update(dt, { speed = 0, running = false, grounded = true } = {}) {
    dt = Math.min(dt, 0.05);
    this.time += dt;

    const targetBlend = THREE.MathUtils.clamp(speed / 4.2, 0, 1);
    const runTarget = THREE.MathUtils.clamp((speed - 4.2) / 3.5, 0, 1);
    const airTarget = grounded ? 0 : 1;
    const damp = 1 - Math.exp(-9 * dt);
    this.moveBlend += (targetBlend - this.moveBlend) * damp;
    this.runBlend += (runTarget - this.runBlend) * damp;
    this.airBlend += (airTarget - this.airBlend) * (1 - Math.exp(-14 * dt));

    const blend = this.moveBlend;
    this.phase += dt * (2.2 + Math.min(speed, 11) * 1.35);

    const legAmp =
      blend * (0.52 + 0.34 * this.runBlend) * (1 - 0.6 * this.airBlend);
    const armAmp =
      blend * (0.42 + 0.3 * this.runBlend) * (1 - 0.4 * this.airBlend);
    const swing = Math.sin(this.phase);
    const idleSway = Math.sin(this.time * 1.35) * 0.022;

    const leftLeg = this.rig.leftLeg;
    const rightLeg = this.rig.rightLeg;
    const leftArm = this.rig.leftArm;
    const rightArm = this.rig.rightArm;

    if (leftLeg) {
      this._setLimbAngle(leftLeg, idleSway + swing * legAmp - this.airBlend * 0.22);
    }
    if (rightLeg) {
      this._setLimbAngle(rightLeg, idleSway - swing * legAmp + this.airBlend * 0.3);
    }
    if (leftArm) {
      this._setLimbAngle(leftArm, -swing * armAmp + idleSway * 0.6 - this.airBlend * 0.4);
    }
    if (rightArm) {
      this._setLimbAngle(rightArm, swing * armAmp + idleSway * 0.6 + this.airBlend * 0.4);
    }

    // Whole-body bob and a small forward lean while moving.
    const bob =
      (Math.abs(Math.sin(this.phase * 2)) * (0.0025 + 0.0045 * blend)) *
      (1 - this.airBlend);
    this.visual.position.y = this.baseVisualPosition.y + bob;
    this.visual.quaternion.copy(this.baseVisualQuaternion);
    const lean = 0.055 * blend * (0.6 + 0.7 * this.runBlend);
    if (lean > 0.0001) {
      this._deltaQuat.setFromAxisAngle(X_AXIS, lean);
      this.visual.quaternion.multiply(this._deltaQuat);
    }

    // Breathing on the torso.
    if (this.rig.torso) {
      const base = this.baseLimb.get(this.rig.torso);
      const breath = Math.sin(this.time * 2.1) * 0.012 * (1 - 0.7 * blend);
      this.rig.torso.scale.set(
        base.scale.x,
        base.scale.y * (1 + breath),
        base.scale.z
      );
    }

    // Blinking.
    if (this.rig.eyes) {
      const base = this.baseLimb.get(this.rig.eyes);
      this.blinkTimer -= dt;
      if (this.blinkTimer <= 0 && this.blinkTime <= 0) {
        this.blinkTime = 0.12;
        this.blinkTimer = randomRange(2.4, 6.5);
      }
      let eyeScale = 1;
      if (this.blinkTime > 0) {
        this.blinkTime -= dt;
        eyeScale = 0.12;
      }
      this.rig.eyes.scale.set(
        base.scale.x,
        base.scale.y * eyeScale,
        base.scale.z
      );
    }
  }

  _setLimbAngle(node, angle) {
    const base = this.baseLimb.get(node);
    if (!base) return;
    this._deltaQuat.setFromAxisAngle(X_AXIS, angle);
    node.quaternion.copy(base.quaternion).multiply(this._deltaQuat);
  }

  resetPose() {
    this.visual.position.copy(this.baseVisualPosition);
    this.visual.quaternion.copy(this.baseVisualQuaternion);
    for (const [node, base] of this.baseLimb) {
      node.quaternion.copy(base.quaternion);
      node.position.copy(base.position);
      node.scale.copy(base.scale);
    }
    this.moveBlend = 0;
    this.runBlend = 0;
    this.airBlend = 0;
  }
}

function findRig(root, visual) {
  const legs = [];
  const arms = [];
  let body = null;
  let eyes = null;
  let torso = null;

  root.traverse((node) => {
    if (!node.name) return;
    // GLTFLoader keeps suffixes ("Leg_2", "Body_1"), so match the base name.
    const base = node.name.replace(/[._-]?\d+$/, "");
    if (base === "Leg") legs.push(node);
    else if (base === "Arm") arms.push(node);
    else if (base === "Body") body = node;
    else if (base === "Eyes") eyes = node;
  });

  if (body && body.parent && body.parent !== visual && body.parent !== root) {
    torso = body.parent;
  } else {
    torso = body;
  }

  root.updateMatrixWorld(true);
  const sortByX = (list) => {
    const v = new THREE.Vector3();
    return list
      .map((node) => {
        node.getWorldPosition(v);
        return { node, x: v.x };
      })
      .sort((a, b) => a.x - b.x)
      .map((item) => item.node);
  };

  const sortedLegs = sortByX(legs);
  const sortedArms = sortByX(arms);

  return {
    legs: sortedLegs,
    arms: sortedArms,
    leftLeg: sortedLegs[0] || null,
    rightLeg: sortedLegs[1] || null,
    leftArm: sortedArms[0] || null,
    rightArm: sortedArms[1] || null,
    body,
    torso,
    eyes,
    limbs: [...sortedLegs, ...sortedArms],
  };
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}
