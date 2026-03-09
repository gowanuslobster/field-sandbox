"use client";

import { useEffect, useRef } from "react";
import { electricFieldAtPoint } from "@/physics/electrostatics";
import type { Charge, WorldBounds } from "@/physics/types";
import { screenToWorld } from "@/physics/world-space";

type VectorFieldCanvasProps = {
  charges: Charge[];
  bounds: WorldBounds;
  className?: string;
};

export function VectorFieldCanvas({
  charges,
  bounds,
  className,
}: VectorFieldCanvasProps) {
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

    const drawArrow = (
      context: CanvasRenderingContext2D,
      x: number,
      y: number,
      dx: number,
      dy: number,
      strength: number,
    ) => {
      const length = 4 + strength * 10;
      const startX = x - dx * length * 0.45;
      const startY = y - dy * length * 0.45;
      const endX = x + dx * length * 0.55;
      const endY = y + dy * length * 0.55;

      context.strokeStyle = `rgba(160, 232, 255, ${0.16 + strength * 0.52})`;
      context.lineWidth = 0.8 + strength * 0.85;
      context.beginPath();
      context.moveTo(startX, startY);
      context.lineTo(endX, endY);
      context.stroke();

      const headLength = 2.8 + strength * 4;
      const angle = Math.atan2(dy, dx);
      const wing = 0.56;

      context.beginPath();
      context.moveTo(endX, endY);
      context.lineTo(
        endX - headLength * Math.cos(angle - wing),
        endY - headLength * Math.sin(angle - wing),
      );
      context.moveTo(endX, endY);
      context.lineTo(
        endX - headLength * Math.cos(angle + wing),
        endY - headLength * Math.sin(angle + wing),
      );
      context.stroke();
    };

    const render = () => {
      const context = canvas.getContext("2d");
      if (!context) {
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;

      context.save();
      context.scale(dpr, dpr);
      context.clearRect(0, 0, width, height);
      context.shadowColor = "rgba(82, 210, 255, 0.34)";
      context.shadowBlur = 3.5;

      const spacing = 76;
      for (let y = spacing * 0.5; y < height; y += spacing) {
        for (let x = spacing * 0.5; x < width; x += spacing) {
          const worldPoint = screenToWorld(
            { x, y },
            boundsRef.current,
            width,
            height,
          );
          const field = electricFieldAtPoint(worldPoint, chargesRef.current, {
            softening: 0.04,
          });
          const magnitude = field.magnitude();
          if (magnitude < 1e-4) {
            continue;
          }
          const strength = Math.min(1, Math.log1p(magnitude * 3.5) / 2.3);
          const unit = field.normalized();
          drawArrow(context, x, y, unit.x, -unit.y, strength);
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
