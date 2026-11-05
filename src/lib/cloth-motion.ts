import { bindDeformableMeshes } from "./cloth-attachments.ts";
import * as T from "three";
export interface ClothMotionOptions {
  fabric?: "cotton" | "fleece";
  top: number;
  bottom: number;
  collision: boolean;
  resolveContact?: (point: T.Vector3, out: T.Vector3) => T.Vector3;
}
/** Bounded damped elastic modes. This is interactive cloth response, not manufacturing simulation. */
export function createClothMotion(options: ClothMotionOptions) {
  const sway = new T.Vector3(),
    velocity = new T.Vector3(),
    grab = new T.Vector3(),
    grabVelocity = new T.Vector3(),
    desired = new T.Vector3(),
    center = new T.Vector3();
  let held = false,
    enabled = true,
    time = 0;
  const finite = (v: T.Vector3) =>
    Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
  const active = () =>
    enabled &&
    (held ||
      sway.lengthSq() +
        velocity.lengthSq() +
        grab.lengthSq() +
        grabVelocity.lengthSq() >
        1e-8);
  function spring(
    position: T.Vector3,
    speed: T.Vector3,
    target: T.Vector3,
    dt: number,
    stiffness: number,
    damping: number,
  ) {
    speed
      .addScaledVector(target.clone().sub(position), stiffness * dt)
      .multiplyScalar(Math.exp(-damping * dt));
    position.addScaledVector(speed, dt);
    position.clampLength(0, 0.1);
    speed.clampLength(0, 1.2);
  }
  const zero = new T.Vector3(), restContact = new T.Vector3();
  return {
    active,
    kick(x: number, z: number) {
      if (!enabled || !Number.isFinite(x) || !Number.isFinite(z)) return;
      velocity.x = T.MathUtils.clamp(velocity.x + x, -0.65, 0.65);
      velocity.z = T.MathUtils.clamp(velocity.z + z, -0.65, 0.65);
    },
    grab(point: T.Vector3, delta: T.Vector3) {
      if (!enabled || !finite(point) || !finite(delta)) return;
      center.copy(point);
      desired.copy(delta).clampLength(0, 0.1);
      held = true;
    },
    release() {
      held = false;
      desired.set(0, 0, 0);
    },
    setEnabled(value: boolean) {
      enabled = value;
      if (!value) {
        held = false;
        sway.set(0, 0, 0);
        velocity.set(0, 0, 0);
        grab.set(0, 0, 0);
        grabVelocity.set(0, 0, 0);
        desired.set(0, 0, 0);
      }
    },
    step(elapsed: number) {
      if (!enabled || !Number.isFinite(elapsed)) return false;
      const dt = T.MathUtils.clamp(elapsed, 0, 0.05);
      const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
      for (let i = 0; i < steps; i++) {
        spring(sway, velocity, zero, dt / steps, options.fabric === "fleece" ? 80 : 62, options.fabric === "fleece" ? 9 : 6);
        spring(grab, grabVelocity, desired, dt / steps, options.fabric === "fleece" ? 175 : 140, options.fabric === "fleece" ? 15 : 12);
      }
      time += dt;
      if (
        !held &&
        sway.lengthSq() +
          velocity.lengthSq() +
          grab.lengthSq() +
          grabVelocity.lengthSq() <
          1e-8
      ) {
        sway.set(0, 0, 0);
        velocity.set(0, 0, 0);
        grab.set(0, 0, 0);
        grabVelocity.set(0, 0, 0);
      }
      return active();
    },
    deform(rest: T.Vector3, normal: T.Vector3, out: T.Vector3, strength = 1) {
      out.copy(rest);
      if (!enabled || !active() || strength <= 0) return out;
      const gain = T.MathUtils.clamp(strength, 0, 1);
      const fall = T.MathUtils.clamp(
        (options.top - 0.055 - rest.y) /
          Math.max(0.2, options.top - options.bottom - 0.055),
        0,
        1,
      );
      const hood =
        T.MathUtils.clamp((rest.y - options.top - 0.025) / 0.22, 0, 1) * 0.5;
      const freedom = Math.max(fall * fall, hood);
      const dx = rest.x - center.x,
        dy = rest.y - center.y,
        dz = rest.z - center.z;
      const local =
        Math.exp(-(dx * dx + dy * dy + dz * dz) / (0.13 * 0.13)) *
        Math.min(1, freedom * 3);
      const ripple =
        (sway.length() + grab.length() * local) *
        0.09 *
        Math.sin(rest.y * 34 + rest.x * 18 + time * 5) *
        freedom;
      out.x += (sway.x * freedom + grab.x * local) * gain;
      out.y += (grab.y * local - Math.abs(sway.x) * 0.14 * freedom) * gain;
      out.z += (sway.z * freedom + grab.z * local + ripple + sway.x * rest.x * freedom * .65) * gain;
      out.x -= sway.z * rest.x * freedom * .25 * gain;
      if (options.collision && options.resolveContact) {
        options.resolveContact(out, out);
        // Keep contact continuous at zero movement despite lattice approximation at rest.
        options.resolveContact(rest, restContact);
        out.sub(restContact.sub(rest));
      } else if (options.collision) {
        const inward =
          (out.x - rest.x) * normal.x +
          (out.y - rest.y) * normal.y +
          (out.z - rest.z) * normal.z;
        if (inward < -0.0015) out.addScaledVector(normal, -0.0015 - inward);
      }
      return out;
    },
  };
}

/** Apply the shared motion to cloth and surface-bound accessories. */
export function bindClothMeshes(meshes: T.Mesh[], motion: ReturnType<typeof createClothMotion>) {
  return bindDeformableMeshes(meshes, motion);
}
