import { describe, expect, it } from "vitest";
import { symplecticEulerCromerParticleStep, toTestParticle } from "@/physics/dynamics";
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
    expect(stepped.vel.x).toBeCloseTo(0.3, 8);
    expect(stepped.vel.y).toBeCloseTo(-0.4, 8);
    expect(stepped.pos.x).toBeCloseTo(0.35, 8);
    expect(stepped.pos.y).toBeCloseTo(-0.3, 8);
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
    const field = electricFieldAtPoint(particle.pos, charges);
    const ax = field.x * (particle.charge / particle.mass);
    const ay = field.y * (particle.charge / particle.mass);

    const stepped = symplecticEulerCromerParticleStep(particle, charges, dt);
    const expectedVx = particle.vel.x + ax * dt;
    const expectedVy = particle.vel.y + ay * dt;
    const expectedPx = particle.pos.x + expectedVx * dt;
    const expectedPy = particle.pos.y + expectedVy * dt;

    expect(stepped.vel.x).toBeCloseTo(expectedVx, 8);
    expect(stepped.vel.y).toBeCloseTo(expectedVy, 8);
    expect(stepped.pos.x).toBeCloseTo(expectedPx, 8);
    expect(stepped.pos.y).toBeCloseTo(expectedPy, 8);
  });
});
