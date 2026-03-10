import { calculateFieldAt } from "@/physics/electrostatics";
import type { Charge } from "@/physics/types";
import { Vector2D, type Vector2Like } from "@/physics/vector2d";

export const SIMULATION_SPEED = 2.2;
export const DEFAULT_TEST_PARTICLE_CHARGE = 10;
export const DEFAULT_TEST_PARTICLE_MASS = 1;

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
  const field = calculateFieldAt(particle.pos.x, particle.pos.y, charges);
  const acceleration = field.scale(particle.charge / clampedMass);
  const nextVelocity = particle.vel.add(acceleration.scale(effectiveDt));
  const nextPosition = particle.pos.add(nextVelocity.scale(effectiveDt));

  return {
    ...particle,
    vel: nextVelocity,
    pos: nextPosition,
  };
}
