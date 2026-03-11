import { calculateFieldAt, potentialAtPoint } from "@/physics/electrostatics";
import type { Charge } from "@/physics/types";
import { Vector2D, type Vector2Like } from "@/physics/vector2d";

export const SIMULATION_SPEED = 1.6;
export const DEFAULT_TEST_PARTICLE_CHARGE = 10;
export const DEFAULT_TEST_PARTICLE_MASS = 1;
export const PARTICLE_SUBSTEPS_PER_FRAME = 20;
export const TRAIL_SAMPLE_EVERY_N_SUBSTEPS = 3;
// ~8px at the default zoom/viewport scale for stable near-source dynamics.
export const PARTICLE_PLUMMER_EPSILON = 0.02;

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
    softening: PARTICLE_PLUMMER_EPSILON,
  });
  const acceleration = field.scale(particle.charge / clampedMass);
  const nextVelocity = particle.vel.add(acceleration.scale(effectiveDt));
  const nextPosition = particle.pos.add(nextVelocity.scale(effectiveDt));

  return {
    ...particle,
    vel: nextVelocity,
    pos: nextPosition,
  };
}

export function kineticEnergyOfParticle(particle: TestParticle): number {
  return 0.5 * particle.mass * particle.vel.magnitudeSquared();
}

export function potentialEnergyOfParticle(
  particle: TestParticle,
  charges: Charge[],
): number {
  // Uses the same Plummer softening as force integration for consistency.
  return (
    particle.charge *
    potentialAtPoint(particle.pos, charges, {
      softening: PARTICLE_PLUMMER_EPSILON,
    })
  );
}

export function totalEnergyOfParticle(
  particle: TestParticle,
  charges: Charge[],
): number {
  return (
    kineticEnergyOfParticle(particle) + potentialEnergyOfParticle(particle, charges)
  );
}
