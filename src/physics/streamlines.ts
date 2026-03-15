import { electricFieldAtPoint } from "@/physics/electrostatics";
import type { Charge, WorldBounds } from "@/physics/types";
import { Vector2D, type Vector2Like } from "@/physics/vector2d";

type TraceOptions = {
  stepSize: number;
  maxSteps: number;
  minFieldMagnitude: number;
  captureRadius: number;
  softening: number;
  seedOffsetRadius: number;
  angularOffset: number;
  adaptiveStepThreshold: number;
  seedDensityMultiplier: number;
  occupancyResolution: number;
};

const DEFAULT_TRACE_OPTIONS: TraceOptions = {
  stepSize: 0.03,
  maxSteps: 360,
  minFieldMagnitude: 0.0025,
  captureRadius: 0.06,
  softening: 0.04,
  seedOffsetRadius: 0.076,
  angularOffset: 0.08,
  adaptiveStepThreshold: 0.24,
  seedDensityMultiplier: 1,
  occupancyResolution: 180,
};

function inBounds(point: Vector2Like, bounds: WorldBounds): boolean {
  return (
    point.x >= bounds.minX &&
    point.x <= bounds.maxX &&
    point.y >= bounds.minY &&
    point.y <= bounds.maxY
  );
}

function toSpatialCellKey(
  point: Vector2Like,
  bounds: WorldBounds,
  resolution: number,
): string | null {
  if (!inBounds(point, bounds)) {
    return null;
  }
  const xNorm = (point.x - bounds.minX) / (bounds.maxX - bounds.minX);
  const yNorm = (point.y - bounds.minY) / (bounds.maxY - bounds.minY);
  const cellX = Math.floor(xNorm * resolution);
  const cellY = Math.floor(yNorm * resolution);
  return `${cellX}:${cellY}`;
}

function nearAnyCharge(
  point: Vector2Like,
  charges: Charge[],
  directionSign: number,
  captureRadius: number,
  sourceChargeId: string | null,
): boolean {
  const captureRadiusSquared = captureRadius * captureRadius;
  const captureNegative = directionSign > 0;
  return charges.some((charge) => {
    if (sourceChargeId && charge.id === sourceChargeId) {
      return false;
    }
    if (captureNegative ? charge.value >= 0 : charge.value <= 0) {
      return false;
    }
    const dx = point.x - charge.position.x;
    const dy = point.y - charge.position.y;
    return dx * dx + dy * dy <= captureRadiusSquared;
  });
}

function distanceToNearestCharge(point: Vector2Like, charges: Charge[]): number {
  let minSquared = Number.POSITIVE_INFINITY;
  for (const charge of charges) {
    const dx = point.x - charge.position.x;
    const dy = point.y - charge.position.y;
    const squared = dx * dx + dy * dy;
    if (squared < minSquared) {
      minSquared = squared;
    }
  }
  return Math.sqrt(minSquared);
}

function rk4DirectionStep(
  point: Vector2D,
  directionSign: number,
  stepSize: number,
  charges: Charge[],
  softening: number,
): Vector2D {
  const directionAt = (position: Vector2Like): Vector2D => {
    const field = electricFieldAtPoint(position, charges, { softening });
    return field.normalized().scale(directionSign);
  };

  const k1 = directionAt(point);
  const k2 = directionAt(point.add(k1.scale(stepSize * 0.5)));
  const k3 = directionAt(point.add(k2.scale(stepSize * 0.5)));
  const k4 = directionAt(point.add(k3.scale(stepSize)));

  const weighted = k1
    .add(k2.scale(2))
    .add(k3.scale(2))
    .add(k4)
    .scale(stepSize / 6);

  return point.add(weighted);
}

function traceDirection(
  seed: Vector2Like,
  charges: Charge[],
  bounds: WorldBounds,
  directionSign: number,
  options: TraceOptions,
  sourceChargeId: string | null,
): Vector2D[] {
  const points: Vector2D[] = [];
  let current = Vector2D.from(seed);
  let hasEnteredBounds = false;

  for (let step = 0; step < options.maxSteps; step += 1) {
    const insideBounds = inBounds(current, bounds);
    if (!insideBounds && hasEnteredBounds) {
      break;
    }

    const field = electricFieldAtPoint(current, charges, {
      softening: options.softening,
    });
    if (field.magnitude() < options.minFieldMagnitude) {
      break;
    }
    if (insideBounds) {
      hasEnteredBounds = true;
      if (
        step > 0 &&
        nearAnyCharge(
          current,
          charges,
          directionSign,
          options.captureRadius,
          sourceChargeId,
        )
      ) {
        break;
      }
      points.push(current);
    }
    const nearestChargeDistance = distanceToNearestCharge(current, charges);
    const adaptiveScale = Math.min(
      1,
      nearestChargeDistance / options.adaptiveStepThreshold,
    );
    const effectiveStep = options.stepSize * Math.max(0.18, adaptiveScale);
    current = rk4DirectionStep(
      current,
      directionSign,
      effectiveStep,
      charges,
      options.softening,
    );
  }

  return points;
}

export function traceFieldLine(
  seed: Vector2Like,
  charges: Charge[],
  bounds: WorldBounds,
  directionSign?: number,
  sourceChargeId?: string | null,
  options?: Partial<TraceOptions>,
): Vector2D[] {
  const mergedOptions = { ...DEFAULT_TRACE_OPTIONS, ...options };
  let resolvedDirectionSign = directionSign;
  if (resolvedDirectionSign === undefined) {
    const sourceCharge = charges.find((charge) => charge.id === sourceChargeId);
    resolvedDirectionSign = sourceCharge && sourceCharge.value < 0 ? -1 : 1;
  }
  return traceDirection(
    seed,
    charges,
    bounds,
    resolvedDirectionSign,
    mergedOptions,
    sourceChargeId ?? null,
  );
}

export function buildSeedPoints(
  charges: Charge[],
  bounds: WorldBounds,
  options?: Partial<TraceOptions>,
): Array<{ seed: Vector2D; directionSign: number; sourceChargeId: string }> {
  const mergedOptions = { ...DEFAULT_TRACE_OPTIONS, ...options };
  const seeds: Array<{
    seed: Vector2D;
    directionSign: number;
    sourceChargeId: string;
  }> = [];
  const seedRadius = Math.max(
    mergedOptions.seedOffsetRadius,
    mergedOptions.captureRadius * 1.15,
  );
  const expandedBounds: WorldBounds = {
    minX: bounds.minX - seedRadius * 2,
    maxX: bounds.maxX + seedRadius * 2,
    minY: bounds.minY - seedRadius * 2,
    maxY: bounds.maxY + seedRadius * 2,
  };

  for (let chargeIndex = 0; chargeIndex < charges.length; chargeIndex += 1) {
    const charge = charges[chargeIndex];
    if (!inBounds(charge.position, expandedBounds)) {
      continue;
    }
    const directionSign = charge.value >= 0 ? 1 : -1;
    const seedsForCharge = Math.max(
      8,
      Math.floor(Math.abs(charge.value) * 12 * mergedOptions.seedDensityMultiplier),
    );
    const chargeAngularOffset =
      mergedOptions.angularOffset + chargeIndex * 0.097;
    for (let lineIndex = 0; lineIndex < seedsForCharge; lineIndex += 1) {
      const angle = chargeAngularOffset + (lineIndex / seedsForCharge) * Math.PI * 2;
      const radial = new Vector2D(Math.cos(angle), Math.sin(angle)).scale(
        seedRadius,
      );
      const seed = Vector2D.from(charge.position).add(radial);
      seeds.push({ seed, directionSign, sourceChargeId: charge.id });
    }
  }

  return seeds;
}

export function buildFieldLines(
  charges: Charge[],
  bounds: WorldBounds,
  options?: Partial<TraceOptions>,
): Vector2D[][] {
  const mergedOptions = { ...DEFAULT_TRACE_OPTIONS, ...options };
  const seeds = buildSeedPoints(charges, bounds, mergedOptions);
  const lines: Vector2D[][] = [];
  const occupiedCells = new Set<string>();

  for (const { seed, directionSign, sourceChargeId } of seeds) {
    const line = traceFieldLine(
      seed,
      charges,
      bounds,
      directionSign,
      sourceChargeId,
      mergedOptions,
    );
    if (line.length > 12) {
      let sampled = 0;
      let overlap = 0;
      for (let index = 0; index < line.length; index += 6) {
        const key = toSpatialCellKey(
          line[index],
          bounds,
          mergedOptions.occupancyResolution,
        );
        if (!key) {
          continue;
        }
        sampled += 1;
        if (occupiedCells.has(key)) {
          overlap += 1;
        }
      }

      if (sampled > 0 && overlap / sampled > 0.74) {
        continue;
      }

      lines.push(line);
      for (let index = 0; index < line.length; index += 4) {
        const key = toSpatialCellKey(
          line[index],
          bounds,
          mergedOptions.occupancyResolution,
        );
        if (key) {
          occupiedCells.add(key);
        }
      }
    }
  }

  return lines;
}
