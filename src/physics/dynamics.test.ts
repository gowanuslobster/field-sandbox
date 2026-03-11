import { describe, expect, it } from "vitest";
import {
  ACCELERATION_SOFTENING_EPSILON,
  PARTICLE_FIELD_SOFTENING,
  SIMULATION_SPEED,
  symplecticEulerCromerParticleStep,
  toTestParticle,
} from "@/physics/dynamics";
import { electricFieldAtPoint } from "@/physics/electrostatics";
import type { Charge } from "@/physics/types";

describe("symplecticEulerCromerParticleStep", () => {
  it("advances with constant velocity when field is zero", () => {
    const particle = toTestParticle({
      pos: { x: 0.2, y: -0.1 },
      vel: { x: 0.3, y: -0.4 },
      mass: 1,
      charge: 1,
    });

    const stepped = symplecticEulerCromerParticleStep(particle, [], 0.5);
    const effectiveDt = 0.5 * SIMULATION_SPEED;
    expect(stepped.vel.x).toBeCloseTo(0.3, 8);
    expect(stepped.vel.y).toBeCloseTo(-0.4, 8);
    expect(stepped.pos.x).toBeCloseTo(0.2 + 0.3 * effectiveDt, 8);
    expect(stepped.pos.y).toBeCloseTo(-0.1 + -0.4 * effectiveDt, 8);
  });

  it("updates velocity first, then position using new velocity", () => {
    const charges: Charge[] = [
      { id: "source", position: { x: 0, y: 0 }, value: 1 },
    ];
    const particle = toTestParticle({
      pos: { x: 1, y: 0 },
      vel: { x: 0, y: 0 },
      mass: 2,
      charge: 1,
    });
    const dt = 0.1;
    const field = electricFieldAtPoint(particle.pos, charges, {
      softening: PARTICLE_FIELD_SOFTENING,
    });
    const dx = particle.pos.x - charges[0]!.position.x;
    const dy = particle.pos.y - charges[0]!.position.y;
    const minDistanceSquared = dx * dx + dy * dy;
    const attenuation =
      minDistanceSquared / (minDistanceSquared + ACCELERATION_SOFTENING_EPSILON);
    const ax = field.x * (particle.charge / particle.mass) * attenuation;
    const ay = field.y * (particle.charge / particle.mass) * attenuation;
    const effectiveDt = dt * SIMULATION_SPEED;

    const stepped = symplecticEulerCromerParticleStep(particle, charges, dt);
    const expectedVx = particle.vel.x + ax * effectiveDt;
    const expectedVy = particle.vel.y + ay * effectiveDt;
    const expectedPx = particle.pos.x + expectedVx * effectiveDt;
    const expectedPy = particle.pos.y + expectedVy * effectiveDt;

    expect(stepped.vel.x).toBeCloseTo(expectedVx, 8);
    expect(stepped.vel.y).toBeCloseTo(expectedVy, 8);
    expect(stepped.pos.x).toBeCloseTo(expectedPx, 8);
    expect(stepped.pos.y).toBeCloseTo(expectedPy, 8);
  });

  it("keeps close-pass updates finite near a source charge", () => {
    const charges: Charge[] = [
      { id: "source", position: { x: 0, y: 0 }, value: 1 },
    ];
    const particle = toTestParticle({
      pos: { x: 0.001, y: 0 },
      vel: { x: 0, y: 0 },
      mass: 1,
      charge: 10,
    });

    const stepped = symplecticEulerCromerParticleStep(particle, charges, 0.002);
    expect(Number.isFinite(stepped.pos.x)).toBe(true);
    expect(Number.isFinite(stepped.pos.y)).toBe(true);
    expect(Number.isFinite(stepped.vel.x)).toBe(true);
    expect(Number.isFinite(stepped.vel.y)).toBe(true);
  });
});
