"use client";

import { useEffect, useMemo, useRef } from "react";
import { buildFieldLines } from "@/physics/streamlines";
import type { Charge, WorldBounds } from "@/physics/types";
import type { Vector2Like } from "@/physics/vector2d";
import { worldToScreen } from "@/physics/world-space";

type FieldLinesCanvasProps = {
  charges: Charge[];
  bounds: WorldBounds;
  className?: string;
};

function drawPolyline(
  context: CanvasRenderingContext2D,
  points: Vector2Like[],
  bounds: WorldBounds,
  width: number,
  height: number,
): void {
  if (points.length < 2) {
    return;
  }

  const firstPoint = worldToScreen(points[0], bounds, width, height);
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
      context.strokeStyle = "rgba(198, 229, 255, 0.65)";
      context.shadowColor = "rgba(112, 214, 255, 0.35)";
      context.shadowBlur = 8;

      for (const line of lines) {
        drawPolyline(context, line, bounds, width, height);
      }

      context.restore();
      animationFrame = window.requestAnimationFrame(render);
    };

    animationFrame = window.requestAnimationFrame(render);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
    };
  }, [bounds, lines]);

  return <canvas ref={canvasRef} className={`${className ?? ""} block h-full w-full`} />;
}
