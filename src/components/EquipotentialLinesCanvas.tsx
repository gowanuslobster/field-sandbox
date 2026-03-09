"use client";

import { useEffect, useRef } from "react";
import { potentialAtPoint } from "@/physics/electrostatics";
import type { Charge, WorldBounds } from "@/physics/types";
import { screenToWorld } from "@/physics/world-space";

type EquipotentialLinesCanvasProps = {
  charges: Charge[];
  bounds: WorldBounds;
  className?: string;
};

type Point = { x: number; y: number };

const LEVELS = [-2.2, -1.4, -0.9, -0.45, 0.45, 0.9, 1.4, 2.2];

function interpolatePoint(
  p1: Point,
  p2: Point,
  v1: number,
  v2: number,
  level: number,
): Point | null {
  const delta = v2 - v1;
  if (Math.abs(delta) < 1e-9) {
    return null;
  }
  const t = (level - v1) / delta;
  if (t < 0 || t > 1) {
    return null;
  }
  return {
    x: p1.x + (p2.x - p1.x) * t,
    y: p1.y + (p2.y - p1.y) * t,
  };
}

function findCrossings(
  p00: Point,
  p10: Point,
  p11: Point,
  p01: Point,
  v00: number,
  v10: number,
  v11: number,
  v01: number,
  level: number,
): Point[] {
  const points: Point[] = [];
  const top = interpolatePoint(p00, p10, v00, v10, level);
  const right = interpolatePoint(p10, p11, v10, v11, level);
  const bottom = interpolatePoint(p11, p01, v11, v01, level);
  const left = interpolatePoint(p01, p00, v01, v00, level);

  if (top) points.push(top);
  if (right) points.push(right);
  if (bottom) points.push(bottom);
  if (left) points.push(left);
  return points;
}

export function EquipotentialLinesCanvas({
  charges,
  bounds,
  className,
}: EquipotentialLinesCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chargesRef = useRef(charges);
  const boundsRef = useRef(bounds);

  useEffect(() => {
    chargesRef.current = charges;
  }, [charges]);

  useEffect(() => {
    boundsRef.current = bounds;
  }, [bounds]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    let animationFrame = 0;
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

    const render = () => {
      const context = canvas.getContext("2d");
      if (!context) {
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;
      const step = 28;
      const cols = Math.max(2, Math.floor(width / step));
      const rows = Math.max(2, Math.floor(height / step));

      const potentials = new Float32Array((cols + 1) * (rows + 1));
      for (let row = 0; row <= rows; row += 1) {
        for (let col = 0; col <= cols; col += 1) {
          const x = (col / cols) * width;
          const y = (row / rows) * height;
          const world = screenToWorld({ x, y }, boundsRef.current, width, height);
          potentials[row * (cols + 1) + col] = potentialAtPoint(world, chargesRef.current);
        }
      }

      context.save();
      context.scale(dpr, dpr);
      context.clearRect(0, 0, width, height);
      context.lineWidth = 1;
      context.shadowBlur = 4;

      for (const level of LEVELS) {
        const strokeColor =
          level > 0
            ? "rgba(255, 136, 82, 0.34)"
            : "rgba(96, 203, 255, 0.34)";
        context.strokeStyle = strokeColor;
        context.shadowColor =
          level > 0 ? "rgba(255, 122, 73, 0.25)" : "rgba(94, 210, 255, 0.25)";

        for (let row = 0; row < rows; row += 1) {
          for (let col = 0; col < cols; col += 1) {
            const p00 = { x: (col / cols) * width, y: (row / rows) * height };
            const p10 = { x: ((col + 1) / cols) * width, y: (row / rows) * height };
            const p11 = {
              x: ((col + 1) / cols) * width,
              y: ((row + 1) / rows) * height,
            };
            const p01 = { x: (col / cols) * width, y: ((row + 1) / rows) * height };

            const v00 = potentials[row * (cols + 1) + col];
            const v10 = potentials[row * (cols + 1) + col + 1];
            const v11 = potentials[(row + 1) * (cols + 1) + col + 1];
            const v01 = potentials[(row + 1) * (cols + 1) + col];

            const crossings = findCrossings(
              p00,
              p10,
              p11,
              p01,
              v00,
              v10,
              v11,
              v01,
              level,
            );

            if (crossings.length === 2) {
              context.beginPath();
              context.moveTo(crossings[0].x, crossings[0].y);
              context.lineTo(crossings[1].x, crossings[1].y);
              context.stroke();
            } else if (crossings.length === 4) {
              context.beginPath();
              context.moveTo(crossings[0].x, crossings[0].y);
              context.lineTo(crossings[1].x, crossings[1].y);
              context.moveTo(crossings[2].x, crossings[2].y);
              context.lineTo(crossings[3].x, crossings[3].y);
              context.stroke();
            }
          }
        }
      }

      context.restore();
      animationFrame = window.requestAnimationFrame(render);
    };

    animationFrame = window.requestAnimationFrame(render);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className={`${className ?? ""} block h-full w-full`} />;
}
