import type { Vector2Like } from "@/physics/vector2d";

export type Charge = {
  id: string;
  position: Vector2Like;
  value: number;
};

export type WorldBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};
