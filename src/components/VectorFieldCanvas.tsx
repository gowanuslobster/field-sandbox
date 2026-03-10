"use client";

import { useEffect, useRef } from "react";
import { electricFieldAtPoint, potentialAtPoint } from "@/physics/electrostatics";
import type { Charge, WorldBounds } from "@/physics/types";
import {
  getWorldToScreenTransform,
  transformWorldPoint,
} from "@/physics/world-space";

type VectorFieldCanvasProps = {
  charges: Charge[];
  bounds: WorldBounds;
  className?: string;
};

type Rgb = { r: number; g: number; b: number };

const MUTED_NEGATIVE: Rgb = { r: 20, g: 56, b: 84 };
const MUTED_POSITIVE: Rgb = { r: 84, g: 33, b: 17 };
const NEON_NEGATIVE: Rgb = { r: 61, g: 196, b: 255 };
const NEON_POSITIVE: Rgb = { r: 255, g: 122, b: 63 };
const HOT_PEAK: Rgb = { r: 255, g: 244, b: 170 };

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mixColor(a: Rgb, b: Rgb, t: number): Rgb {
  return {
    r: lerp(a.r, b.r, t),
    g: lerp(a.g, b.g, t),
    b: lerp(a.b, b.b, t),
  };
}

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
      lengthStrength: number,
      intensityStrength: number,
      potentialSign: number,
    ) => {
      const hotness = Math.pow(intensityStrength, 4.8);
      const length = 2.8 + Math.pow(lengthStrength, 0.38) * 19.5 + hotness * 3.2;
      const startX = x - dx * length * 0.45;
      const startY = y - dy * length * 0.45;
      const endX = x + dx * length * 0.55;
      const endY = y + dy * length * 0.55;

      const mutedColor = potentialSign >= 0 ? MUTED_POSITIVE : MUTED_NEGATIVE;
      const neonColor = potentialSign >= 0 ? NEON_POSITIVE : NEON_NEGATIVE;
      const coreColor = mixColor(mutedColor, neonColor, Math.pow(intensityStrength, 0.55));
      const color = mixColor(coreColor, HOT_PEAK, hotness);
      const alpha = 0.12 + Math.pow(intensityStrength, 3.65) * 0.88;

      context.strokeStyle = `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${alpha})`;
      context.lineWidth = 0.5 + Math.pow(lengthStrength, 0.45) * 2.6 + hotness * 0.7;
      context.shadowColor = `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${0.12 + Math.pow(intensityStrength, 2.9) * 0.86})`;
      context.shadowBlur = 1 + Math.pow(intensityStrength, 2.7) * 17;
      context.beginPath();
      context.moveTo(startX, startY);
      context.lineTo(endX, endY);
      context.stroke();

      const headLength = 2.4 + Math.pow(lengthStrength, 0.5) * 6.6 + hotness * 1.8;
      const angle = Math.atan2(dy, dx);
      const wing = 0.62;
      const leftX = endX - headLength * Math.cos(angle - wing);
      const leftY = endY - headLength * Math.sin(angle - wing);
      const rightX = endX - headLength * Math.cos(angle + wing);
      const rightY = endY - headLength * Math.sin(angle + wing);

      context.fillStyle = `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${Math.min(1, alpha + 0.08)})`;
      context.beginPath();
      context.moveTo(endX, endY);
      context.lineTo(leftX, leftY);
      context.lineTo(rightX, rightY);
      context.closePath();
      context.fill();
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
      context.lineCap = "round";
      context.lineJoin = "round";

      const spacing = 76;
      const transform = getWorldToScreenTransform(boundsRef.current, width, height);
      const worldStepX = spacing / transform.a;
      const worldStepY = spacing / Math.abs(transform.d);

      for (
        let worldY = boundsRef.current.minY + worldStepY * 0.5;
        worldY <= boundsRef.current.maxY;
        worldY += worldStepY
      ) {
        for (
          let worldX = boundsRef.current.minX + worldStepX * 0.5;
          worldX <= boundsRef.current.maxX;
          worldX += worldStepX
        ) {
          const worldPoint = { x: worldX, y: worldY };
          const field = electricFieldAtPoint(worldPoint, chargesRef.current, {
            softening: 0.04,
          });
          const magnitude = field.magnitude();
          if (magnitude < 1e-4) {
            continue;
          }
          const potential = potentialAtPoint(worldPoint, chargesRef.current, {
            softening: 0.04,
          });
          const magnitudeHint = 1 - Math.exp(-magnitude * 1.65);
          const lengthStrength = magnitudeHint;
          const intensityStrength = magnitudeHint;
          const unitWorld = field.normalized();
          const dirScreenX = transform.a * unitWorld.x;
          const dirScreenY = transform.d * unitWorld.y;
          const dirMagnitude = Math.hypot(dirScreenX, dirScreenY);
          if (dirMagnitude < 1e-6) {
            continue;
          }
          const screenPoint = transformWorldPoint(worldPoint, transform);
          drawArrow(
            context,
            screenPoint.x,
            screenPoint.y,
            dirScreenX / dirMagnitude,
            dirScreenY / dirMagnitude,
            lengthStrength,
            intensityStrength,
            potential,
          );
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
