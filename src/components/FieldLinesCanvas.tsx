"use client";

import { useCallback, useEffect, useRef } from "react";
import { electricFieldAtPoint, potentialAtPoint } from "@/physics/electrostatics";
import { buildFieldLines } from "@/physics/streamlines";
import type { Charge, WorldBounds } from "@/physics/types";
import type { Vector2D, Vector2Like } from "@/physics/vector2d";
import {
  type WorldToScreenTransform,
  getWorldToScreenTransform,
  transformWorldPoint,
} from "@/physics/world-space";

export type FieldLineRenderMode = "animated_dashes" | "static_arrows" | "off";

type FieldLinesCanvasProps = {
  charges: Charge[];
  bounds: WorldBounds;
  isSimulating: boolean;
  isDragging?: boolean;
  useGradient?: boolean;
  mode?: FieldLineRenderMode;
  className?: string;
};

function mapPotentialToColor(potential: number, alpha: number): string {
  const normalized = Math.tanh(potential * 0.2);
  if (normalized >= 0) {
    const green = Math.round(78 + 95 * normalized);
    return `rgba(255, ${green}, 86, ${alpha})`;
  }
  const red = Math.round(58 + 45 * (1 + normalized));
  return `rgba(${red}, 214, 255, ${alpha})`;
}

function drawPolyline(
  context: CanvasRenderingContext2D,
  points: Vector2Like[],
  charges: Charge[],
  transform: WorldToScreenTransform,
  useGradient: boolean,
): void {
  if (points.length < 2) {
    return;
  }

  const firstPoint = transformWorldPoint(points[0], transform);
  const lastPoint = transformWorldPoint(points[points.length - 1], transform);

  if (useGradient) {
    const startPotential = potentialAtPoint(points[0], charges);
    const endPotential = potentialAtPoint(points[points.length - 1], charges);
    const gradient = context.createLinearGradient(
      firstPoint.x,
      firstPoint.y,
      lastPoint.x,
      lastPoint.y,
    );
    gradient.addColorStop(0, mapPotentialToColor(startPotential, 0.72));
    gradient.addColorStop(1, mapPotentialToColor(endPotential, 0.72));
    context.strokeStyle = gradient;
  } else {
    context.strokeStyle = "rgba(198, 229, 255, 0.65)";
  }

  context.beginPath();
  context.moveTo(firstPoint.x, firstPoint.y);
  for (let index = 1; index < points.length; index += 1) {
    const projected = transformWorldPoint(points[index], transform);
    context.lineTo(projected.x, projected.y);
  }
  context.stroke();
}

function drawDirectionArrows(
  context: CanvasRenderingContext2D,
  points: Vector2Like[],
  charges: Charge[],
  transform: WorldToScreenTransform,
): void {
  if (points.length < 2) {
    return;
  }

  const spacingPx = 155;
  const maxArrowsPerLine = 3;
  let arrowsPlaced = 0;
  let distanceSinceArrow = spacingPx * 0.5;

  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    const aScreen = transformWorldPoint(a, transform);
    const bScreen = transformWorldPoint(b, transform);
    const segmentDx = bScreen.x - aScreen.x;
    const segmentDy = bScreen.y - aScreen.y;
    const segmentLength = Math.hypot(segmentDx, segmentDy);
    if (segmentLength < 1e-4) {
      continue;
    }

    let segmentProgress = 0;
    while (
      distanceSinceArrow + (segmentLength - segmentProgress) >= spacingPx &&
      arrowsPlaced < maxArrowsPerLine
    ) {
      const remainingToArrow = spacingPx - distanceSinceArrow;
      const t = (segmentProgress + remainingToArrow) / segmentLength;
      if (t >= 0 && t <= 1) {
        const worldPoint = {
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
        };
        const screenPoint = {
          x: aScreen.x + segmentDx * t,
          y: aScreen.y + segmentDy * t,
        };
        const field = electricFieldAtPoint(worldPoint, charges);
        const direction = field.normalized();
        const dirScreenX = transform.a * direction.x;
        const dirScreenY = transform.d * direction.y;
        const dirMagnitude = Math.hypot(dirScreenX, dirScreenY);
        if (dirMagnitude < 1e-6) {
          continue;
        }
        const dirX = dirScreenX / dirMagnitude;
        const dirY = dirScreenY / dirMagnitude;
        const arrowLength = 9;
        const headLength = 4.5;
        const angle = Math.atan2(dirY, dirX);
        const tipX = screenPoint.x + dirX * arrowLength * 0.5;
        const tipY = screenPoint.y + dirY * arrowLength * 0.5;
        const tailX = screenPoint.x - dirX * arrowLength * 0.5;
        const tailY = screenPoint.y - dirY * arrowLength * 0.5;

        context.beginPath();
        context.moveTo(tailX, tailY);
        context.lineTo(tipX, tipY);
        context.moveTo(tipX, tipY);
        context.lineTo(
          tipX - headLength * Math.cos(angle - 0.58),
          tipY - headLength * Math.sin(angle - 0.58),
        );
        context.moveTo(tipX, tipY);
        context.lineTo(
          tipX - headLength * Math.cos(angle + 0.58),
          tipY - headLength * Math.sin(angle + 0.58),
        );
        context.stroke();
        arrowsPlaced += 1;
      }
      segmentProgress += remainingToArrow;
      distanceSinceArrow = 0;
    }

    distanceSinceArrow += segmentLength - segmentProgress;
    if (arrowsPlaced >= maxArrowsPerLine) {
      break;
    }
  }
}

export function FieldLinesCanvas({
  charges,
  bounds,
  isSimulating,
  isDragging = false,
  useGradient = false,
  mode = "animated_dashes",
  className,
}: FieldLinesCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const linesRef = useRef<Vector2D[][]>([]);
  const chargesRef = useRef(charges);
  const boundsRef = useRef(bounds);
  const modeRef = useRef(mode);
  const useGradientRef = useRef(useGradient);
  const isSimulatingRef = useRef(isSimulating);
  const isDraggingRef = useRef(isDragging);
  const lastBuildAtRef = useRef(0);
  const buildThrottleTimerRef = useRef<number | null>(null);
  const needsRenderRef = useRef(true);
  const requestRenderRef = useRef<(() => void) | null>(null);

  const rebuildFieldLines = useCallback(() => {
    linesRef.current = buildFieldLines(chargesRef.current, boundsRef.current);
    lastBuildAtRef.current = performance.now();
    needsRenderRef.current = true;
    requestRenderRef.current?.();
  }, []);

  const scheduleFieldLineBuild = useCallback(() => {
    if (!isDraggingRef.current) {
      if (buildThrottleTimerRef.current !== null) {
        window.clearTimeout(buildThrottleTimerRef.current);
        buildThrottleTimerRef.current = null;
      }
      rebuildFieldLines();
      return;
    }

    const throttleMs = 16;
    const elapsed = performance.now() - lastBuildAtRef.current;
    if (elapsed >= throttleMs) {
      rebuildFieldLines();
      return;
    }
    if (buildThrottleTimerRef.current !== null) {
      return;
    }
    buildThrottleTimerRef.current = window.setTimeout(() => {
      buildThrottleTimerRef.current = null;
      rebuildFieldLines();
    }, throttleMs - elapsed);
  }, [rebuildFieldLines]);

  useEffect(() => {
    chargesRef.current = charges;
    boundsRef.current = bounds;
    scheduleFieldLineBuild();
  }, [bounds, charges, isDragging, scheduleFieldLineBuild]);

  useEffect(() => {
    modeRef.current = mode;
    needsRenderRef.current = true;
    requestRenderRef.current?.();
  }, [mode]);

  useEffect(() => {
    useGradientRef.current = useGradient;
    needsRenderRef.current = true;
    requestRenderRef.current?.();
  }, [useGradient]);

  useEffect(() => {
    isSimulatingRef.current = isSimulating;
    if (isSimulating) {
      needsRenderRef.current = true;
      requestRenderRef.current?.();
    }
  }, [isSimulating]);

  useEffect(() => {
    isDraggingRef.current = isDragging;
    if (!isDragging) {
      scheduleFieldLineBuild();
    }
  }, [isDragging, scheduleFieldLineBuild]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    let animationFrame: number | null = null;
    let dashOffset = 0;
    let previous = performance.now();
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const width = Math.max(1, Math.floor(entry.contentRect.width));
      const height = Math.max(1, Math.floor(entry.contentRect.height));
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      needsRenderRef.current = true;
      requestRenderRef.current?.();
    });

    resizeObserver.observe(canvas);

    const drawFrame = (time: number) => {
      const context = canvas.getContext("2d");
      if (!context) {
        return;
      }

      if (modeRef.current === "animated_dashes") {
        const dt = Math.max(0.001, (time - previous) / 1000);
        previous = time;
        dashOffset -= dt * 90;
      }

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;

      context.save();
      context.scale(dpr, dpr);
      context.clearRect(0, 0, width, height);
      context.lineCap = "round";
      context.lineJoin = "round";

      if (modeRef.current === "off") {
        context.restore();
        return;
      }

      context.lineWidth = 1.2;
      if (modeRef.current === "animated_dashes") {
        context.setLineDash([12, 11]);
        context.lineDashOffset = dashOffset;
      } else {
        context.setLineDash([]);
      }
      context.shadowColor = useGradientRef.current
        ? "rgba(188, 142, 255, 0.45)"
        : "rgba(112, 214, 255, 0.35)";
      context.shadowBlur = 8;
      const transform = getWorldToScreenTransform(boundsRef.current, width, height);

      for (const line of linesRef.current) {
        drawPolyline(
          context,
          line,
          chargesRef.current,
          transform,
          useGradientRef.current,
        );
        if (modeRef.current === "static_arrows") {
          drawDirectionArrows(context, line, chargesRef.current, transform);
        }
      }

      context.restore();
    };

    const scheduleRender = () => {
      if (animationFrame !== null) {
        return;
      }
      animationFrame = window.requestAnimationFrame((time) => {
        animationFrame = null;
        drawFrame(time);
        needsRenderRef.current = false;
        const keepRendering =
          isSimulatingRef.current || modeRef.current === "animated_dashes";
        if (keepRendering || needsRenderRef.current) {
          scheduleRender();
        }
      });
    };

    requestRenderRef.current = () => {
      needsRenderRef.current = true;
      scheduleRender();
    };
    scheduleRender();

    return () => {
      requestRenderRef.current = null;
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
      if (buildThrottleTimerRef.current !== null) {
        window.clearTimeout(buildThrottleTimerRef.current);
        buildThrottleTimerRef.current = null;
      }
      resizeObserver.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className={`${className ?? ""} block h-full w-full`} />;
}
