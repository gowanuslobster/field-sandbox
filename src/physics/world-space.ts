import type { WorldBounds } from "@/physics/types";
import { Vector2D, type Vector2Like } from "@/physics/vector2d";

export type CameraState = {
  zoom: number;
  offsetX: number;
  offsetY: number;
};

export type WorldToScreenTransform = {
  a: number;
  d: number;
  e: number;
  f: number;
};

export function getViewBounds(
  baseBounds: WorldBounds,
  camera: CameraState,
): WorldBounds {
  const centerX = (baseBounds.minX + baseBounds.maxX) * 0.5 + camera.offsetX;
  const centerY = (baseBounds.minY + baseBounds.maxY) * 0.5 + camera.offsetY;
  const spanX = (baseBounds.maxX - baseBounds.minX) / camera.zoom;
  const spanY = (baseBounds.maxY - baseBounds.minY) / camera.zoom;

  return {
    minX: centerX - spanX * 0.5,
    maxX: centerX + spanX * 0.5,
    minY: centerY - spanY * 0.5,
    maxY: centerY + spanY * 0.5,
  };
}

export function getWorldToScreenTransform(
  bounds: WorldBounds,
  width: number,
  height: number,
): WorldToScreenTransform {
  const spanX = bounds.maxX - bounds.minX;
  const spanY = bounds.maxY - bounds.minY;
  const a = width / spanX;
  const d = -height / spanY;
  const e = -bounds.minX * a;
  const f = height + bounds.minY * (height / spanY);
  return { a, d, e, f };
}

export function transformWorldPoint(
  point: Vector2Like,
  transform: WorldToScreenTransform,
): Vector2D {
  return new Vector2D(
    transform.a * point.x + transform.e,
    transform.d * point.y + transform.f,
  );
}

export function worldToScreen(
  point: Vector2Like,
  bounds: WorldBounds,
  width: number,
  height: number,
): Vector2D {
  return transformWorldPoint(point, getWorldToScreenTransform(bounds, width, height));
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
