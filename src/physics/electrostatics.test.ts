import { describe, expect, it } from "vitest";
import { electricFieldAtPoint, potentialAtPoint } from "@/physics/electrostatics";
import type { Charge } from "@/physics/types";

const DIPOLE: Charge[] = [
  { id: "positive", position: { x: -1, y: 0 }, value: 1 },
  { id: "negative", position: { x: 1, y: 0 }, value: -1 },
];

describe("electrostatics dipole behavior", () => {
  it("gives near-zero potential at midpoint", () => {
    const potential = potentialAtPoint({ x: 0, y: 0 }, DIPOLE, { softening: 1e-3 });
    expect(potential).toBeCloseTo(0, 10);
  });

  it("creates field direction from positive to negative at midpoint", () => {
    const field = electricFieldAtPoint({ x: 0, y: 0 }, DIPOLE, { softening: 1e-3 });
    expect(field.x).toBeGreaterThan(0);
    expect(Math.abs(field.y)).toBeLessThan(1e-10);
  });
});
