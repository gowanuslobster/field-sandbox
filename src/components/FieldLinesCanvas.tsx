"use client";

import { useEffect, useMemo, useRef } from "react";
import { potentialAtPoint } from "@/physics/electrostatics";
import { buildFieldLines } from "@/physics/streamlines";
import type { Charge, WorldBounds } from "@/physics/types";
import type { Vector2Like } from "@/physics/vector2d";
import { worldToScreen } from "@/physics/world-space";

type FieldLinesCanvasProps = {
  charges: Charge[];
  bounds: WorldBounds;
  useGradient?: boolean;
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
  bounds: WorldBounds,
  width: number,
  height: number,
  useGradient: boolean,
): void {
  if (points.length < 2) {
    return;
  }

  const firstPoint = worldToScreen(points[0], bounds, width, height);
  const lastPoint = worldToScreen(points[points.length - 1], bounds, width, height);

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
    const projected = worldToScreen(points[index], bounds, width, height);
    context.lineTo(projected.x, projected.y);
  }
  context.stroke();
}

export function FieldLinesCanvas({
  charges,
  bounds,
  useGradient = false,
  className,
}: FieldLinesCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lines = useMemo(() => {
    return buildFieldLines(charges, bounds);
  }, [bounds, charges]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    let animationFrame = 0;
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
    });

    resizeObserver.observe(canvas);

    const render = (time: number) => {
      const context = canvas.getContext("2d");
      if (!context) {
        return;
      }

      const dt = Math.max(0.001, (time - previous) / 1000);
      previous = time;
      dashOffset -= dt * 90;

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;

      context.save();
      context.scale(dpr, dpr);
      context.clearRect(0, 0, width, height);

      context.lineWidth = 1.2;
      context.setLineDash([12, 11]);
      context.lineDashOffset = dashOffset;
      context.shadowColor = useGradient
        ? "rgba(188, 142, 255, 0.45)"
        : "rgba(112, 214, 255, 0.35)";
      context.shadowBlur = 8;

      for (const line of lines) {
        drawPolyline(context, line, charges, bounds, width, height, useGradient);
      }

      context.restore();
      animationFrame = window.requestAnimationFrame(render);
    };

    animationFrame = window.requestAnimationFrame(render);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
    };
  }, [bounds, charges, lines, useGradient]);

  return <canvas ref={canvasRef} className={`${className ?? ""} block h-full w-full`} />;
}
