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

type FlowPath = {
  points: Vector2Like[];
  cumulativeTimes: number[];
  totalTime: number;
  phase: number;
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function nearestChargeSign(point: Vector2Like, charges: Charge[]): number {
  let bestDistance = Number.POSITIVE_INFINITY;
  let sign = 0;
  for (const charge of charges) {
    const dx = point.x - charge.position.x;
    const dy = point.y - charge.position.y;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      sign = charge.value >= 0 ? 1 : -1;
    }
  }
  return sign;
}

function orientLineForFlow(points: Vector2Like[], charges: Charge[]): Vector2Like[] {
  if (points.length < 2) {
    return points;
  }
  const start = points[0];
  const end = points[points.length - 1];
  const startSign = nearestChargeSign(start, charges);
  const endSign = nearestChargeSign(end, charges);

  if (startSign === 1 && endSign === -1) {
    return points;
  }
  if (startSign === -1 && endSign === 1) {
    return [...points].reverse();
  }

  const startPotential = potentialAtPoint(start, charges);
  const endPotential = potentialAtPoint(end, charges);
  if (startPotential >= endPotential) {
    return points;
  }
  return [...points].reverse();
}

function buildFlowPaths(lines: Vector2D[][], charges: Charge[]): FlowPath[] {
  const paths: FlowPath[] = [];
  lines.forEach((rawLine, lineIndex) => {
    if (rawLine.length < 2) {
      return;
    }
    const points = orientLineForFlow(rawLine, charges);
    if (points.length < 2) {
      return;
    }

    const cumulativeTimes = [0];
    let totalTime = 0;
    for (let pointIndex = 0; pointIndex < points.length - 1; pointIndex += 1) {
      const a = points[pointIndex];
      const b = points[pointIndex + 1];
      const segmentLength = Math.max(Math.hypot(b.x - a.x, b.y - a.y), 1e-5);
      const midpoint = { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
      const fieldMagnitude = electricFieldAtPoint(midpoint, charges).magnitude();
      const normalizedField = clamp01(
        Math.log1p(fieldMagnitude * 0.9) / Math.log1p(8),
      );
      const speedMultiplier = 0.55 + Math.pow(normalizedField, 1.45) * 2.6;
      const segmentTime = segmentLength / speedMultiplier;
      totalTime += segmentTime;
      cumulativeTimes.push(totalTime);
    }

    if (totalTime <= 1e-5) {
      return;
    }
    paths.push({
      points,
      cumulativeTimes,
      totalTime,
      phase: (lineIndex * 0.173) % 1,
    });
  });

  return paths;
}

function findSegmentIndex(cumulativeValues: number[], value: number): number {
  let low = 0;
  let high = cumulativeValues.length - 2;
  while (low <= high) {
    const mid = Math.floor((low + high) * 0.5);
    if (value < cumulativeValues[mid]) {
      high = mid - 1;
      continue;
    }
    if (value >= cumulativeValues[mid + 1]) {
      low = mid + 1;
      continue;
    }
    return mid;
  }
  return Math.max(0, Math.min(cumulativeValues.length - 2, low));
}

function samplePathPosition(path: FlowPath, timeValue: number): Vector2Like {
  if (path.points.length < 2 || path.totalTime <= 1e-6) {
    return path.points[0] ?? { x: 0, y: 0 };
  }

  const localTime =
    ((timeValue % path.totalTime) + path.totalTime) % path.totalTime;
  const segmentIndex = findSegmentIndex(path.cumulativeTimes, localTime);
  const startTime = path.cumulativeTimes[segmentIndex];
  const endTime = path.cumulativeTimes[segmentIndex + 1];
  const span = Math.max(endTime - startTime, 1e-6);
  const t = (localTime - startTime) / span;
  const start = path.points[segmentIndex];
  const end = path.points[segmentIndex + 1];
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
  };
}

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

function drawFlowTrails(
  context: CanvasRenderingContext2D,
  flowPaths: FlowPath[],
  transform: WorldToScreenTransform,
  flowClock: number,
  isDragging: boolean,
): void {
  const particlesPerLine = isDragging ? 3 : 4;
  const trailSegments = isDragging ? 3 : 5;
  for (const path of flowPaths) {
    if (path.points.length < 2 || path.totalTime <= 1e-6) {
      continue;
    }
    const particleStride = path.totalTime / particlesPerLine;
    const trailSpan = Math.min(path.totalTime * 0.22, 0.32);
    const trailStep = trailSpan / trailSegments;
    for (let particleIndex = 0; particleIndex < particlesPerLine; particleIndex += 1) {
      const headTime =
        flowClock +
        path.phase * path.totalTime +
        particleIndex * particleStride;
      for (let trailIndex = 1; trailIndex <= trailSegments; trailIndex += 1) {
        const currentSample = samplePathPosition(
          path,
          headTime - (trailIndex - 1) * trailStep,
        );
        const previousSample = samplePathPosition(path, headTime - trailIndex * trailStep);
        const currentScreen = transformWorldPoint(currentSample, transform);
        const previousScreen = transformWorldPoint(previousSample, transform);
        const fade = 1 - (trailIndex - 1) / trailSegments;
        const alpha = Math.pow(fade, 1.55) * (isDragging ? 0.35 : 0.82);
        context.strokeStyle = `rgba(255, 244, 180, ${alpha})`;
        context.lineWidth = 0.9 + fade * 2;
        context.beginPath();
        context.moveTo(currentScreen.x, currentScreen.y);
        context.lineTo(previousScreen.x, previousScreen.y);
        context.stroke();
      }
      const head = transformWorldPoint(samplePathPosition(path, headTime), transform);
      context.fillStyle = isDragging
        ? "rgba(255, 245, 190, 0.5)"
        : "rgba(255, 250, 215, 0.95)";
      context.beginPath();
      context.arc(head.x, head.y, isDragging ? 1.1 : 1.5, 0, Math.PI * 2);
      context.fill();
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
  const flowPathsRef = useRef<FlowPath[]>([]);
  const chargesRef = useRef(charges);
  const boundsRef = useRef(bounds);
  const modeRef = useRef(mode);
  const useGradientRef = useRef(useGradient);
  const isSimulatingRef = useRef(isSimulating);
  const isDraggingRef = useRef(isDragging);
  const flowClockRef = useRef(0);
  const frameTimeRef = useRef<number | null>(null);
  const lastBuildAtRef = useRef(0);
  const buildThrottleTimerRef = useRef<number | null>(null);
  const needsRenderRef = useRef(true);
  const requestRenderRef = useRef<(() => void) | null>(null);

  const rebuildFieldLines = useCallback(() => {
    const rebuilt = buildFieldLines(chargesRef.current, boundsRef.current);
    linesRef.current = rebuilt;
    flowPathsRef.current = buildFlowPaths(rebuilt, chargesRef.current);
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

      const lastFrameTime = frameTimeRef.current ?? time;
      const deltaSeconds = Math.max(0.001, Math.min(0.05, (time - lastFrameTime) / 1000));
      frameTimeRef.current = time;
      if (modeRef.current === "animated_dashes") {
        flowClockRef.current += deltaSeconds * (isDraggingRef.current ? 0.5 : 1.2);
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
      context.setLineDash([]);
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
      if (modeRef.current === "animated_dashes" && !isDraggingRef.current) {
        context.shadowColor = "rgba(255, 230, 160, 0.55)";
        context.shadowBlur = 9;
        drawFlowTrails(
          context,
          flowPathsRef.current,
          transform,
          flowClockRef.current,
          false,
        );
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
        if (isSimulatingRef.current || needsRenderRef.current) {
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
      frameTimeRef.current = null;
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
