import type { WorldBounds } from "@/physics/types";
import { Vector2D, type Vector2Like } from "@/physics/vector2d";

export function worldToScreen(
  point: Vector2Like,
  bounds: WorldBounds,
  width: number,
  height: number,
): Vector2D {
  const x = ((point.x - bounds.minX) / (bounds.maxX - bounds.minX)) * width;
  const y =
    height - ((point.y - bounds.minY) / (bounds.maxY - bounds.minY)) * height;
  return new Vector2D(x, y);
}

export function screenToWorld(
  point: Vector2Like,
  bounds: WorldBounds,
  width: number,
  height: number,
): Vector2D {
  const x = bounds.minX + (point.x / width) * (bounds.maxX - bounds.minX);
  const y =
    bounds.minY + ((height - point.y) / height) * (bounds.maxY - bounds.minY);
  return new Vector2D(x, y);
}
