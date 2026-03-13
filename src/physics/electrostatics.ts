import { Vector2D, type Vector2Like } from "@/physics/vector2d";
import type { Charge } from "@/physics/types";

export const SIMULATION_COULOMB_CONSTANT = 1;
export const DEFAULT_SOFTENING = 0.04;

export function potentialAtPoint(
  point: Vector2Like,
  charges: Charge[],
  options?: { k?: number; softening?: number },
): number {
  const k = options?.k ?? SIMULATION_COULOMB_CONSTANT;
  const softening = options?.softening ?? DEFAULT_SOFTENING;

  return charges.reduce((accumulator, charge) => {
    const delta = Vector2D.from(point).subtract(charge.position);
    const radius = Math.sqrt(delta.magnitudeSquared() + softening * softening);
    return accumulator + (k * charge.value) / radius;
  }, 0);
}

export function electricFieldAtPoint(
  point: Vector2Like,
  charges: Charge[],
  options?: { k?: number; softening?: number },
): Vector2D {
  const k = options?.k ?? SIMULATION_COULOMB_CONSTANT;
  const softening = options?.softening ?? DEFAULT_SOFTENING;

  let fieldX = 0;
  let fieldY = 0;

  for (const charge of charges) {
    const delta = Vector2D.from(point).subtract(charge.position);
    const rSquared = delta.magnitudeSquared() + softening * softening;
    const invRSquared = 1 / rSquared;
    const invR = 1 / Math.sqrt(rSquared);
    const scale = k * charge.value * invRSquared * invR;
    fieldX += delta.x * scale;
    fieldY += delta.y * scale;
  }

  return new Vector2D(fieldX, fieldY);
}

export function calculateFieldAt(
  x: number,
  y: number,
  charges: Charge[],
  options?: { k?: number; softening?: number },
): Vector2D {
  return electricFieldAtPoint({ x, y }, charges, options);
}
