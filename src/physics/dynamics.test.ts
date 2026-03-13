import { describe, expect, it } from "vitest";
import {
  calculateGhostOrbitSuggestion,
  dominantSourceForceAtPoint,
  forceFromSourceOnParticle,
  isGhostOrbitMatch,
  MAX_SUBSTEPS_PER_FRAME,
  PARTICLE_PLUMMER_EPSILON,
  PHYSICS_BASE_DT,
  SIMULATION_SPEED,
  totalEnergyOfParticle,
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
      softening: PARTICLE_PLUMMER_EPSILON,
    });
    const ax = field.x * (particle.charge / particle.mass);
    const ay = field.y * (particle.charge / particle.mass);
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

  it("keeps total energy nearly constant for softened radial oscillation", () => {
    const charges: Charge[] = [{ id: "source", position: { x: 0, y: 0 }, value: 1 }];
    let particle = toTestParticle({
      pos: { x: 0.65, y: 0 },
      vel: { x: 0, y: 0 },
      mass: 1,
      charge: -1,
    });
    const initialEnergy = totalEnergyOfParticle(particle, charges);
    const steps = 4000;
    const dt = 0.0005;

    for (let i = 0; i < steps; i += 1) {
      particle = symplecticEulerCromerParticleStep(particle, charges, dt);
    }

    const finalEnergy = totalEnergyOfParticle(particle, charges);
    const relativeDrift = Math.abs(finalEnergy - initialEnergy) / Math.abs(initialEnergy);
    expect(relativeDrift).toBeLessThan(0.0012);
  });

  it("crosses through source and reaches opposite turning side", () => {
    const charges: Charge[] = [{ id: "source", position: { x: 0, y: 0 }, value: 1 }];
    let particle = toTestParticle({
      pos: { x: 0.65, y: 0 },
      vel: { x: 0, y: 0 },
      mass: 1,
      charge: -1,
    });
    let minX = particle.pos.x;
    const steps = 4000;
    const dt = 0.0005;

    for (let i = 0; i < steps; i += 1) {
      particle = symplecticEulerCromerParticleStep(particle, charges, dt);
      if (particle.pos.x < minX) {
        minX = particle.pos.x;
      }
    }

    expect(minX).toBeLessThan(-0.58);
  });

  it("remains bounded and reaches opposite side under frame sub-stepping", () => {
    const charges: Charge[] = [{ id: "source", position: { x: 0, y: 0 }, value: -1 }];
    let particle = toTestParticle({
      pos: { x: 0.65, y: 0 },
      vel: { x: 0, y: 0 },
      mass: 1,
      charge: 10,
    });
    let minX = particle.pos.x;
    let maxX = particle.pos.x;
    const frameDt = 1 / 60;
    const frames = 1200;

    for (let frame = 0; frame < frames; frame += 1) {
      const substeps = Math.max(
        1,
        Math.min(MAX_SUBSTEPS_PER_FRAME, Math.ceil(frameDt / PHYSICS_BASE_DT)),
      );
      const substepDt = frameDt / substeps;
      for (let step = 0; step < substeps; step += 1) {
        particle = symplecticEulerCromerParticleStep(particle, charges, substepDt);
      }
      if (particle.pos.x < minX) {
        minX = particle.pos.x;
      }
      if (particle.pos.x > maxX) {
        maxX = particle.pos.x;
      }
    }

    expect(minX).toBeLessThan(-0.45);
    expect(maxX).toBeLessThan(1.1);
  });

  it("returns near initial radius after one full oscillation cycle", () => {
    const charges: Charge[] = [{ id: "source", position: { x: 0, y: 0 }, value: -1 }];
    let particle = toTestParticle({
      pos: { x: 0.65, y: 0 },
      vel: { x: 0, y: 0 },
      mass: 1,
      charge: 10,
    });

    const frameDt = 1 / 60;
    const frames = 1800;
    let crossedToNegativeSide = false;
    let passedLeftTurningPoint = false;
    let rightTurningPoint: { x: number; speed: number; y: number } | null = null;

    for (let frame = 0; frame < frames; frame += 1) {
      const substeps = Math.max(
        1,
        Math.min(MAX_SUBSTEPS_PER_FRAME, Math.ceil(frameDt / PHYSICS_BASE_DT)),
      );
      const substepDt = frameDt / substeps;
      for (let step = 0; step < substeps; step += 1) {
        const previousVx = particle.vel.x;
        particle = symplecticEulerCromerParticleStep(particle, charges, substepDt);

        if (!crossedToNegativeSide && particle.pos.x < 0) {
          crossedToNegativeSide = true;
        }
        if (
          crossedToNegativeSide &&
          !passedLeftTurningPoint &&
          previousVx < 0 &&
          particle.vel.x >= 0 &&
          particle.pos.x < 0
        ) {
          passedLeftTurningPoint = true;
        }
        if (
          passedLeftTurningPoint &&
          previousVx > 0 &&
          particle.vel.x <= 0 &&
          particle.pos.x > 0
        ) {
          rightTurningPoint = {
            x: particle.pos.x,
            speed: particle.vel.magnitude(),
            y: particle.pos.y,
          };
          break;
        }
      }
      if (rightTurningPoint) {
        break;
      }
    }

    expect(crossedToNegativeSide).toBe(true);
    expect(passedLeftTurningPoint).toBe(true);
    expect(rightTurningPoint).not.toBeNull();
    expect(Math.abs((rightTurningPoint?.x ?? 0) - 0.65)).toBeLessThan(0.08);
    expect(rightTurningPoint?.speed ?? Number.POSITIVE_INFINITY).toBeLessThan(0.25);
    expect(Math.abs(rightTurningPoint?.y ?? Number.POSITIVE_INFINITY)).toBeLessThan(0.06);
  });
});

describe("ghost orbit helpers", () => {
  it("identifies the highest-magnitude source force at the cursor", () => {
    const charges: Charge[] = [
      { id: "far", position: { x: -1.2, y: 0 }, value: -4 },
      { id: "near", position: { x: 0.4, y: 0 }, value: -1 },
    ];

    const dominant = dominantSourceForceAtPoint(
      { x: 0, y: 0 },
      charges,
      10,
      { softening: PARTICLE_PLUMMER_EPSILON },
    );

    expect(dominant?.source.id).toBe("near");
    expect(dominant?.isAttractive).toBe(true);
  });

  it("marks like-charge electric interaction as repulsive", () => {
    const sample = forceFromSourceOnParticle(
      { x: 0.6, y: 0 },
      { id: "source", position: { x: 0, y: 0 }, value: 1 },
      10,
      { softening: PARTICLE_PLUMMER_EPSILON },
    );

    expect(sample.isAttractive).toBe(false);
    expect(sample.force.x).toBeGreaterThan(0);
  });

  it("suppresses the orbit guide when the dominant source is repulsive", () => {
    const charges: Charge[] = [
      { id: "dominant-repulsive", position: { x: 0.2, y: 0 }, value: 4 },
      { id: "weaker-attractive", position: { x: -1.3, y: 0 }, value: -2 },
    ];

    const suggestion = calculateGhostOrbitSuggestion(
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      charges,
      10,
      1,
      { softening: PARTICLE_PLUMMER_EPSILON },
    );

    expect(suggestion).toBeNull();
  });

  it("computes the softened circular orbit speed and tangent closest to drag", () => {
    const charges: Charge[] = [
      { id: "source", position: { x: 0, y: 0 }, value: -2 },
    ];

    const suggestion = calculateGhostOrbitSuggestion(
      { x: 1, y: 0 },
      { x: 0, y: -5 },
      charges,
      10,
      2,
      { softening: PARTICLE_PLUMMER_EPSILON },
    );

    expect(suggestion).not.toBeNull();
    expect(suggestion?.targetVelocity.x ?? Number.NaN).toBeCloseTo(0, 8);
    expect(suggestion?.targetVelocity.y ?? Number.NaN).toBeLessThan(0);

    const sourceForceMagnitude = forceFromSourceOnParticle(
      { x: 1, y: 0 },
      charges[0]!,
      10,
      { softening: PARTICLE_PLUMMER_EPSILON },
    ).forceMagnitude;
    const expectedSpeed = Math.sqrt(
      (sourceForceMagnitude *
        Math.sqrt(1 + PARTICLE_PLUMMER_EPSILON * PARTICLE_PLUMMER_EPSILON)) /
        2,
    );
    expect(suggestion?.targetSpeed ?? Number.NaN).toBeCloseTo(expectedSpeed, 8);
  });

  it("requires both magnitude and angle agreement for a stable-orbit match", () => {
    expect(
      isGhostOrbitMatch(
        { x: 0, y: 1.03 },
        { x: 0, y: 1 },
      ),
    ).toBe(true);
    expect(
      isGhostOrbitMatch(
        { x: 0.3, y: 0.95 },
        { x: 0, y: 1 },
      ),
    ).toBe(false);
    expect(
      isGhostOrbitMatch(
        { x: 0, y: 1.08 },
        { x: 0, y: 1 },
      ),
    ).toBe(false);
  });
});
