import { electricFieldAtPoint } from "@/physics/electrostatics";
import type { Charge, WorldBounds } from "@/physics/types";
import { Vector2D, type Vector2Like } from "@/physics/vector2d";

type TraceOptions = {
  stepSize: number;
  maxSteps: number;
  minFieldMagnitude: number;
  captureRadius: number;
  softening: number;
};

const DEFAULT_TRACE_OPTIONS: TraceOptions = {
  stepSize: 0.03,
  maxSteps: 420,
  minFieldMagnitude: 0.0025,
  captureRadius: 0.065,
  softening: 0.04,
};

function inBounds(point: Vector2Like, bounds: WorldBounds): boolean {
  return (
    point.x >= bounds.minX &&
    point.x <= bounds.maxX &&
    point.y >= bounds.minY &&
    point.y <= bounds.maxY
  );
}

function nearAnyCharge(
  point: Vector2Like,
  charges: Charge[],
  captureRadius: number,
): boolean {
  const captureRadiusSquared = captureRadius * captureRadius;
  return charges.some((charge) => {
    const dx = point.x - charge.position.x;
    const dy = point.y - charge.position.y;
    return dx * dx + dy * dy < captureRadiusSquared;
  });
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
): Vector2D[] {
  const points: Vector2D[] = [];
  let current = Vector2D.from(seed);

  for (let step = 0; step < options.maxSteps; step += 1) {
    if (!inBounds(current, bounds)) {
      break;
    }

    const field = electricFieldAtPoint(current, charges, {
      softening: options.softening,
    });
    if (field.magnitude() < options.minFieldMagnitude) {
      break;
    }
    if (step > 0 && nearAnyCharge(current, charges, options.captureRadius)) {
      break;
    }

    points.push(current);
    current = rk4DirectionStep(
      current,
      directionSign,
      options.stepSize,
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
  options?: Partial<TraceOptions>,
): Vector2D[] {
  const mergedOptions = { ...DEFAULT_TRACE_OPTIONS, ...options };
  const forward = traceDirection(seed, charges, bounds, 1, mergedOptions);
  const backward = traceDirection(seed, charges, bounds, -1, mergedOptions);

  if (forward.length + backward.length < 8) {
    return [];
  }

  const withoutSharedSeed = backward.reverse().slice(0, -1);
  return withoutSharedSeed.concat(forward);
}

export function buildSeedPoints(
  charges: Charge[],
  bounds: WorldBounds,
  targetCount: number,
): Vector2D[] {
  const cols = Math.max(14, Math.round(Math.sqrt(targetCount) * 1.7));
  const rows = Math.max(10, Math.round(Math.sqrt(targetCount) * 1.1));
  const seeds: Vector2D[] = [];

  const spanX = bounds.maxX - bounds.minX;
  const spanY = bounds.maxY - bounds.minY;
  const stepX = spanX / cols;
  const stepY = spanY / rows;

  for (let row = 0; row <= rows; row += 1) {
    for (let col = 0; col <= cols; col += 1) {
      const jitterX = (row % 2 === 0 ? 0.35 : -0.35) * stepX;
      const jitterY = (col % 2 === 0 ? -0.25 : 0.25) * stepY;

      const point = new Vector2D(
        bounds.minX + col * stepX + jitterX,
        bounds.minY + row * stepY + jitterY,
      );
      if (!inBounds(point, bounds)) {
        continue;
      }

      const fieldMagnitude = electricFieldAtPoint(point, charges).magnitude();
      const priority = Math.min(fieldMagnitude / 0.12, 1.4);
      const shouldKeep = priority > 0.18 || (row + col) % 3 === 0;
      if (shouldKeep) {
        seeds.push(point);
      }
    }
  }

  return seeds.slice(0, targetCount);
}

export function buildFieldLines(
  charges: Charge[],
  bounds: WorldBounds,
  targetCount: number,
): Vector2D[][] {
  const seeds = buildSeedPoints(charges, bounds, targetCount);
  const lines: Vector2D[][] = [];

  for (const seed of seeds) {
    const line = traceFieldLine(seed, charges, bounds);
    if (line.length > 12) {
      lines.push(line);
    }
  }

  return lines;
}
