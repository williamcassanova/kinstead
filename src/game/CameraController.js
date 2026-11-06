import * as THREE from "three";

/**
 * Smooth third-person orbit camera with mouse drag, touch drag, pinch zoom,
 * wheel zoom and building/terrain collision.
 */
export class CameraController {
  constructor({ camera, domElement, collision, settings = {} }) {
    this.camera = camera;
    this.domElement = domElement;
    this.collision = collision;
    this.yaw = settings.yaw ?? 0;
    this.pitch = settings.pitch ?? 0.34;
    this.distance = settings.distance ?? 7.2;
    this.minDistance = 2.2;
    this.maxDistance = 18;
    this.sensitivity = settings.sensitivity ?? 1;
    this.invertY = settings.invertY ?? false;
    this.enabled = true;

    this.target = new THREE.Vector3();
    this.targetSmoothed = new THREE.Vector3();
    this.currentDistance = this.distance;
    this.pointers = new Map();
    this.dragging = false;
    this.pinchDistance = 0;
    this._offset = new THREE.Vector3();
    this._desired = new THREE.Vector3();
    this._candidate = new THREE.Vector3();
    this._baseFov = camera.fov;
    this._fovBoost = 0;
    this._sprint = false;

    if (domElement) this._bind(domElement);
  }

  _bind(domElement) {
    this._onPointerDown = (event) => {
      if (!this.enabled) return;
      if (event.pointerType === "mouse" && event.button > 2) return;
      if (event.target !== domElement) return;
      domElement.setPointerCapture?.(event.pointerId);
      this.pointers.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
        type: event.pointerType,
      });
      if (this.pointers.size === 2) {
        this.pinchDistance = this._pointerDistance();
      }
      this.dragging = true;
    };

    this._onPointerMove = (event) => {
      if (!this.enabled) return;
      const pointer = this.pointers.get(event.pointerId);
      if (!pointer) return;

      const prevX = pointer.x;
      const prevY = pointer.y;
      pointer.x = event.clientX;
      pointer.y = event.clientY;

      if (this.pointers.size === 2) {
        const pinch = this._pointerDistance();
        if (this.pinchDistance > 0 && pinch > 0) {
          this.distance = clamp(
            this.distance * (this.pinchDistance / pinch),
            this.minDistance,
            this.maxDistance
          );
        }
        this.pinchDistance = pinch;
        return;
      }

      if (this.pointers.size === 1) {
        const dx = event.clientX - prevX;
        const dy = event.clientY - prevY;
        const sens = 0.0042 * this.sensitivity;
        this.yaw -= dx * sens;
        const pitchDelta = dy * sens * (this.invertY ? -1 : 1);
        this.pitch = clamp(this.pitch + pitchDelta, 0.05, 1.32);
      }
    };

    this._onPointerUp = (event) => {
      this.pointers.delete(event.pointerId);
      if (this.pointers.size < 2) this.pinchDistance = 0;
      if (this.pointers.size === 0) this.dragging = false;
      try {
        domElement.releasePointerCapture?.(event.pointerId);
      } catch {
        /* pointer may already be released */
      }
    };

    this._onWheel = (event) => {
      if (!this.enabled) return;
      event.preventDefault();
      this.distance = clamp(
        this.distance * Math.exp(event.deltaY * 0.0011),
        this.minDistance,
        this.maxDistance
      );
    };

    this._onContextMenu = (event) => event.preventDefault();

    domElement.addEventListener("pointerdown", this._onPointerDown);
    domElement.addEventListener("pointermove", this._onPointerMove);
    domElement.addEventListener("pointerup", this._onPointerUp);
    domElement.addEventListener("pointercancel", this._onPointerUp);
    domElement.addEventListener("wheel", this._onWheel, { passive: false });
    domElement.addEventListener("contextmenu", this._onContextMenu);
  }

  _pointerDistance() {
    const points = [...this.pointers.values()];
    if (points.length < 2) return 0;
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  }

  setSensitivity(value) {
    this.sensitivity = value;
  }

  setInvertY(value) {
    this.invertY = value;
  }

  setSprint(value) {
    this._sprint = value;
  }

  reset(yaw = 0, pitch = 0.34, distance = 7.2) {
    this.yaw = yaw;
    this.pitch = pitch;
    this.distance = distance;
    this.currentDistance = distance;
  }

  snapTo(targetPosition, targetHeight = 1.25) {
    if (!targetPosition) return;
    this.targetSmoothed.set(
      targetPosition.x,
      targetPosition.y + targetHeight,
      targetPosition.z
    );
    const cosPitch = Math.cos(this.pitch);
    this._offset.set(
      Math.sin(this.yaw) * cosPitch,
      Math.sin(this.pitch),
      Math.cos(this.yaw) * cosPitch
    );
    this.currentDistance = this.distance;
    this.camera.position
      .copy(this.targetSmoothed)
      .addScaledVector(this._offset, this.currentDistance);
    this.camera.lookAt(this.targetSmoothed);
  }

  update(dt, targetPosition, options = {}) {
    if (!targetPosition) return;
    dt = Math.min(dt, 0.05);

    this.target.set(
      targetPosition.x,
      targetPosition.y + (options.targetHeight ?? 1.25),
      targetPosition.z
    );

    const follow = 1 - Math.exp(-11 * dt);
    this.targetSmoothed.lerp(this.target, follow);

    this.pitch = clamp(this.pitch, 0.05, 1.32);
    this.distance = clamp(this.distance, this.minDistance, this.maxDistance);

    const cosPitch = Math.cos(this.pitch);
    this._offset.set(
      Math.sin(this.yaw) * cosPitch,
      Math.sin(this.pitch),
      Math.cos(this.yaw) * cosPitch
    );

    this._desired
      .copy(this.targetSmoothed)
      .addScaledVector(this._offset, this.distance);

    let clearance = 1;
    if (this.collision) {
      clearance = this.collision.cameraClearance(
        this.targetSmoothed,
        this._desired,
        0.32
      );
    }

    const targetDistance = Math.max(
      1.35,
      this.distance * Math.max(0.08, clearance)
    );
    const distanceRate = targetDistance < this.currentDistance ? 18 : 5;
    this.currentDistance +=
      (targetDistance - this.currentDistance) *
      (1 - Math.exp(-distanceRate * dt));

    this._candidate
      .copy(this.targetSmoothed)
      .addScaledVector(this._offset, this.currentDistance);

    if (this.collision) {
      const ground = this.collision.heightAt(this._candidate.x, this._candidate.z);
      if (ground !== null && this._candidate.y < ground + 0.55) {
        this._candidate.y = ground + 0.55;
      }
    }

    this.camera.position.lerp(this._candidate, 1 - Math.exp(-18 * dt));
    this.camera.lookAt(this.targetSmoothed);

    // Small FOV kick while sprinting.
    const fovTarget = this._sprint ? this._baseFov + 5 : this._baseFov;
    this._fovBoost += (fovTarget - (this._baseFov + this._fovBoost)) * (1 - Math.exp(-6 * dt));
    const newFov = this._baseFov + this._fovBoost;
    if (Math.abs(this.camera.fov - newFov) > 0.01) {
      this.camera.fov = newFov;
      this.camera.updateProjectionMatrix();
    }
  }

  dispose() {
    const el = this.domElement;
    if (!el) return;
    el.removeEventListener("pointerdown", this._onPointerDown);
    el.removeEventListener("pointermove", this._onPointerMove);
    el.removeEventListener("pointerup", this._onPointerUp);
    el.removeEventListener("pointercancel", this._onPointerUp);
    el.removeEventListener("wheel", this._onWheel);
    el.removeEventListener("contextmenu", this._onContextMenu);
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
