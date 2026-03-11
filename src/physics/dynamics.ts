import { calculateFieldAt } from "@/physics/electrostatics";
import type { Charge } from "@/physics/types";
import { Vector2D, type Vector2Like } from "@/physics/vector2d";

export const SIMULATION_SPEED = 1.6;
export const DEFAULT_TEST_PARTICLE_CHARGE = 10;
export const DEFAULT_TEST_PARTICLE_MASS = 1;
export const PHYSICS_BASE_DT = 0.002;
export const MAX_SUBSTEPS_PER_FRAME = 20;
export const TRAIL_SAMPLE_EVERY_N_SUBSTEPS = 3;
export const PARTICLE_FIELD_SOFTENING = 0.06;
export const ACCELERATION_SOFTENING_EPSILON = 0.05;
export const MAX_PARTICLE_SPEED = 2.6;

export type TestParticle = {
  pos: Vector2D;
  vel: Vector2D;
  mass: number;
  charge: number;
};

export function toTestParticle(
  particle: Omit<TestParticle, "pos" | "vel"> & {
    pos: Vector2Like;
    vel: Vector2Like;
  },
): TestParticle {
  return {
    ...particle,
    pos: Vector2D.from(particle.pos),
    vel: Vector2D.from(particle.vel),
  };
}

export function symplecticEulerCromerParticleStep(
  particle: TestParticle,
  charges: Charge[],
  dt: number,
): TestParticle {
  const effectiveDt = dt * SIMULATION_SPEED;
  const clampedMass = Math.max(1e-6, particle.mass);
  const field = calculateFieldAt(particle.pos.x, particle.pos.y, charges, {
    softening: PARTICLE_FIELD_SOFTENING,
  });
  let minDistanceSquared = Number.POSITIVE_INFINITY;
  for (const charge of charges) {
    const dx = particle.pos.x - charge.position.x;
    const dy = particle.pos.y - charge.position.y;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared < minDistanceSquared) {
      minDistanceSquared = distanceSquared;
    }
  }
  // Additional near-source softening keeps acceleration finite during close fly-bys.
  const attenuation =
    Number.isFinite(minDistanceSquared) && minDistanceSquared > 0
      ? minDistanceSquared / (minDistanceSquared + ACCELERATION_SOFTENING_EPSILON)
      : 1;
  const acceleration = field.scale((particle.charge / clampedMass) * attenuation);
  const nextVelocity = particle.vel.add(acceleration.scale(effectiveDt));
  const nextPosition = particle.pos.add(nextVelocity.scale(effectiveDt));

  return {
    ...particle,
    vel: nextVelocity,
    pos: nextPosition,
  };
}
