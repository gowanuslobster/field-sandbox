import { calculateFieldAt, potentialAtPoint } from "@/physics/electrostatics";
import type { Charge } from "@/physics/types";
import { Vector2D, type Vector2Like } from "@/physics/vector2d";

export const SIMULATION_SPEED = 1.6;
export const DEFAULT_TEST_PARTICLE_CHARGE = 10;
export const DEFAULT_TEST_PARTICLE_MASS = 1;
export const PHYSICS_BASE_DT = 0.00025;
export const MAX_SUBSTEPS_PER_FRAME = 96;
export const TRAIL_SAMPLE_EVERY_N_SUBSTEPS = 3;
// Softening tuned to avoid near-center stiffness artifacts in UI integration.
export const PARTICLE_PLUMMER_EPSILON = 0.05;
export const GHOST_ORBIT_MATCH_MAGNITUDE_TOLERANCE = 0.05;
export const GHOST_ORBIT_MATCH_ANGLE_TOLERANCE_DEGREES = 10;

export type InteractionForceMode = "electric" | "gravitational";

export type SourceForceSample = {
  source: Charge;
  displacement: Vector2D;
  distance: number;
  softenedDistance: number;
  force: Vector2D;
  forceMagnitude: number;
  isAttractive: boolean;
};

export type GhostOrbitSuggestion = {
  dominant: SourceForceSample;
  targetVelocity: Vector2D;
  targetSpeed: number;
};

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

export function forceFromSourceOnParticle(
  point: Vector2Like,
  source: Charge,
  particleChargeOrMass: number,
  options?: { softening?: number; interactionMode?: InteractionForceMode },
): SourceForceSample {
  const softening = options?.softening ?? PARTICLE_PLUMMER_EPSILON;
  const interactionMode = options?.interactionMode ?? "electric";
  const displacement = Vector2D.from(point).subtract(source.position);
  const distanceSquared = displacement.magnitudeSquared();
  const softenedDistanceSquared = distanceSquared + softening * softening;
  const softenedDistance = Math.sqrt(softenedDistanceSquared);
  const distance = Math.sqrt(distanceSquared);
  const invSoftenedDistanceCubed = 1 / (softenedDistanceSquared * softenedDistance);
  const coupling =
    interactionMode === "gravitational"
      ? -Math.abs(particleChargeOrMass) * Math.abs(source.value)
      : particleChargeOrMass * source.value;
  const force = displacement.scale(coupling * invSoftenedDistanceCubed);

  return {
    source,
    displacement,
    distance,
    softenedDistance,
    force,
    forceMagnitude: force.magnitude(),
    isAttractive: force.dot(displacement) < 0,
  };
}

export function dominantSourceForceAtPoint(
  point: Vector2Like,
  charges: Charge[],
  particleChargeOrMass: number,
  options?: { softening?: number; interactionMode?: InteractionForceMode },
): SourceForceSample | null {
  let dominant: SourceForceSample | null = null;

  for (const source of charges) {
    const sample = forceFromSourceOnParticle(point, source, particleChargeOrMass, {
      softening: options?.softening,
      interactionMode: options?.interactionMode,
    });
    if (!dominant || sample.forceMagnitude > dominant.forceMagnitude) {
      dominant = sample;
    }
  }

  return dominant;
}

export function calculateGhostOrbitSuggestion(
  point: Vector2Like,
  manualVelocity: Vector2Like,
  charges: Charge[],
  particleCharge: number,
  particleMass: number,
  options?: { softening?: number; interactionMode?: InteractionForceMode },
): GhostOrbitSuggestion | null {
  const dominant = dominantSourceForceAtPoint(point, charges, particleCharge, options);
  if (!dominant || !dominant.isAttractive || dominant.distance < 1e-9) {
    return null;
  }

  const clampedMass = Math.max(1e-6, particleMass);
  const targetSpeed = Math.sqrt(
    (dominant.forceMagnitude * dominant.softenedDistance) / clampedMass,
  );
  if (!Number.isFinite(targetSpeed) || targetSpeed <= 1e-9) {
    return null;
  }

  const radial = dominant.displacement.normalized();
  const tangentCcw = new Vector2D(-radial.y, radial.x);
  const tangentCw = new Vector2D(radial.y, -radial.x);
  const manual = Vector2D.from(manualVelocity);
  const chosenTangent =
    manual.dot(tangentCcw) >= manual.dot(tangentCw) ? tangentCcw : tangentCw;

  return {
    dominant,
    targetSpeed,
    targetVelocity: chosenTangent.scale(targetSpeed),
  };
}

export function isGhostOrbitMatch(
  manualVelocity: Vector2Like,
  targetVelocity: Vector2Like,
  options?: {
    magnitudeTolerance?: number;
    angleToleranceDegrees?: number;
  },
): boolean {
  const magnitudeTolerance =
    options?.magnitudeTolerance ?? GHOST_ORBIT_MATCH_MAGNITUDE_TOLERANCE;
  const angleToleranceDegrees =
    options?.angleToleranceDegrees ?? GHOST_ORBIT_MATCH_ANGLE_TOLERANCE_DEGREES;
  const manual = Vector2D.from(manualVelocity);
  const target = Vector2D.from(targetVelocity);
  const manualSpeed = manual.magnitude();
  const targetSpeed = target.magnitude();

  if (manualSpeed <= 1e-9 || targetSpeed <= 1e-9) {
    return false;
  }

  const magnitudeError = Math.abs(manualSpeed - targetSpeed) / targetSpeed;
  if (magnitudeError > magnitudeTolerance) {
    return false;
  }

  const cosine = manual.dot(target) / (manualSpeed * targetSpeed);
  const angleDegrees =
    (Math.acos(Math.min(1, Math.max(-1, cosine))) * 180) / Math.PI;
  return angleDegrees <= angleToleranceDegrees;
}
