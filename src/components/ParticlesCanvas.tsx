"use client";

import { useCallback, useEffect, useRef } from "react";
import { symplecticEulerCromerParticleStep, toTestParticle } from "@/physics/dynamics";
import type { Charge, WorldBounds } from "@/physics/types";
import { Vector2D, type Vector2Like } from "@/physics/vector2d";
import {
  getWorldToScreenTransform,
  transformWorldPoint,
} from "@/physics/world-space";

type SpawnParticle = (position: Vector2Like) => void;

type ParticleSimulationState = {
  id: string;
  particle: ReturnType<typeof toTestParticle>;
  history: Vector2D[];
};

type ParticlesCanvasProps = {
  charges: Charge[];
  bounds: WorldBounds;
  isSimulating: boolean;
  className?: string;
  onSpawnerReady?: (spawn: SpawnParticle | null) => void;
  onParticleCountChange?: (count: number) => void;
};

const MAX_HISTORY_POINTS = 50;
const PARTICLE_CHARGE = 0.22;
const PARTICLE_MASS = 1;
const MAX_PARTICLE_SPEED = 2.2;

function inBounds(point: Vector2Like, bounds: WorldBounds): boolean {
  return (
    point.x >= bounds.minX &&
    point.x <= bounds.maxX &&
    point.y >= bounds.minY &&
    point.y <= bounds.maxY
  );
}

function wrapToBounds(point: Vector2Like, bounds: WorldBounds): Vector2D {
  let x = point.x;
  let y = point.y;
  if (x < bounds.minX) {
    x = bounds.maxX;
  } else if (x > bounds.maxX) {
    x = bounds.minX;
  }
  if (y < bounds.minY) {
    y = bounds.maxY;
  } else if (y > bounds.maxY) {
    y = bounds.minY;
  }
  return new Vector2D(x, y);
}

export function ParticlesCanvas({
  charges,
  bounds,
  isSimulating,
  className,
  onSpawnerReady,
  onParticleCountChange,
}: ParticlesCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chargesRef = useRef(charges);
  const boundsRef = useRef(bounds);
  const isSimulatingRef = useRef(isSimulating);
  const particlesRef = useRef<ParticleSimulationState[]>([]);
  const frameTimeRef = useRef<number | null>(null);
  const idCounterRef = useRef(0);
  const particleCountRef = useRef(0);
  const needsRenderRef = useRef(true);
  const requestRenderRef = useRef<(() => void) | null>(null);

  const emitParticleCount = useCallback(() => {
    const nextCount = particlesRef.current.length;
    if (nextCount === particleCountRef.current) {
      return;
    }
    particleCountRef.current = nextCount;
    onParticleCountChange?.(nextCount);
  }, [onParticleCountChange]);

  const spawnParticle = useCallback<SpawnParticle>(
    (position) => {
      const vectorPosition = Vector2D.from(position);
      particlesRef.current.push({
        id: `tp-${idCounterRef.current++}`,
        particle: toTestParticle({
          pos: vectorPosition,
          vel: new Vector2D(0, 0),
          mass: PARTICLE_MASS,
          charge: PARTICLE_CHARGE,
        }),
        history: [vectorPosition],
      });
      emitParticleCount();
      needsRenderRef.current = true;
      requestRenderRef.current?.();
    },
    [emitParticleCount],
  );

  useEffect(() => {
    onSpawnerReady?.(spawnParticle);
    return () => onSpawnerReady?.(null);
  }, [onSpawnerReady, spawnParticle]);

  useEffect(() => {
    chargesRef.current = charges;
    needsRenderRef.current = true;
    requestRenderRef.current?.();
  }, [charges]);

  useEffect(() => {
    boundsRef.current = bounds;
    needsRenderRef.current = true;
    requestRenderRef.current?.();
  }, [bounds]);

  useEffect(() => {
    isSimulatingRef.current = isSimulating;
    if (isSimulating && particlesRef.current.length > 0) {
      needsRenderRef.current = true;
      requestRenderRef.current?.();
    }
  }, [isSimulating]);

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

    const simulate = (dt: number) => {
      if (particlesRef.current.length === 0) {
        return;
      }

      const nextParticles: ParticleSimulationState[] = [];
      for (const state of particlesRef.current) {
        const stepped = symplecticEulerCromerParticleStep(
          state.particle,
          chargesRef.current,
          dt,
        );
        const speed = stepped.vel.magnitude();
        const cappedVelocity =
          speed > MAX_PARTICLE_SPEED
            ? stepped.vel.scale(MAX_PARTICLE_SPEED / speed)
            : stepped.vel;
        const nextParticle = { ...stepped, vel: cappedVelocity };
        const wrappedPosition = wrapToBounds(nextParticle.pos, boundsRef.current);
        const wrapped = !inBounds(nextParticle.pos, boundsRef.current);

        const nextHistory = wrapped
          ? [wrappedPosition]
          : state.history.length >= MAX_HISTORY_POINTS
            ? [...state.history.slice(1), wrappedPosition]
            : [...state.history, wrappedPosition];
        nextParticles.push({
          ...state,
          particle: { ...nextParticle, pos: wrappedPosition },
          history: nextHistory,
        });
      }
      particlesRef.current = nextParticles;
      emitParticleCount();
    };

    const draw = () => {
      const context = canvas.getContext("2d");
      if (!context) {
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;
      const transform = getWorldToScreenTransform(boundsRef.current, width, height);

      context.save();
      context.scale(dpr, dpr);
      context.clearRect(0, 0, width, height);
      context.lineCap = "round";
      context.lineJoin = "round";
      context.globalCompositeOperation = "lighter";

      for (const state of particlesRef.current) {
        if (state.history.length > 1) {
          context.beginPath();
          for (let index = 0; index < state.history.length; index += 1) {
            const sample = transformWorldPoint(state.history[index], transform);
            if (index === 0) {
              context.moveTo(sample.x, sample.y);
            } else {
              context.lineTo(sample.x, sample.y);
            }
          }
          context.strokeStyle = "rgba(122, 255, 220, 0.62)";
          context.lineWidth = 2;
          context.stroke();
        }

        const head = transformWorldPoint(state.particle.pos, transform);
        context.shadowColor = "rgba(88, 255, 198, 0.95)";
        context.shadowBlur = 14;
        context.fillStyle = "rgba(176, 255, 228, 0.98)";
        context.beginPath();
        context.arc(head.x, head.y, 4.8, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = "rgba(3, 34, 30, 0.7)";
        context.lineWidth = 1.1;
        context.stroke();
        context.fillStyle = "rgba(235, 255, 246, 0.95)";
        context.beginPath();
        context.arc(head.x, head.y, 1.9, 0, Math.PI * 2);
        context.fill();
      }

      context.restore();
    };

    const scheduleRender = () => {
      if (animationFrame !== null) {
        return;
      }
      animationFrame = window.requestAnimationFrame((time) => {
        animationFrame = null;
        const previousTime = frameTimeRef.current ?? time;
        frameTimeRef.current = time;
        const dt = Math.max(0.001, Math.min(0.03, (time - previousTime) / 1000));

        if (isSimulatingRef.current && particlesRef.current.length > 0) {
          simulate(dt);
          needsRenderRef.current = true;
        }
        draw();
        needsRenderRef.current = false;
        const shouldContinue =
          (isSimulatingRef.current && particlesRef.current.length > 0) ||
          needsRenderRef.current;
        if (shouldContinue) {
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
      resizeObserver.disconnect();
    };
  }, [emitParticleCount]);

  return (
    <canvas ref={canvasRef} className={`${className ?? ""} block h-full w-full`} />
  );
}
