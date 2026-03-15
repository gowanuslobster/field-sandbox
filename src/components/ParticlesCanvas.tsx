"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  DEFAULT_TEST_PARTICLE_CHARGE,
  DEFAULT_TEST_PARTICLE_MASS,
  kineticEnergyOfParticle,
  MAX_SUBSTEPS_PER_FRAME,
  PHYSICS_BASE_DT,
  symplecticEulerCromerParticleStep,
  totalEnergyOfParticle,
  TRAIL_SAMPLE_EVERY_N_SUBSTEPS,
  toTestParticle,
} from "@/physics/dynamics";
import type { Charge, WorldBounds } from "@/physics/types";
import { Vector2D, type Vector2Like } from "@/physics/vector2d";
import {
  getWorldToScreenTransform,
  transformWorldPoint,
} from "@/physics/world-space";

type SpawnParticle = (
  position: Vector2Like,
) => { id: string; pos: Vector2Like; vel: Vector2Like };
type ClearParticles = () => void;
type LaunchParticle = (id: string, velocity: Vector2Like) => void;

export type ParticlesController = {
  spawn: SpawnParticle;
  clear: ClearParticles;
  launch: LaunchParticle;
};
export type ParticleEnergySnapshot = {
  particleId: string;
  totalEnergy: number;
  kineticEnergy: number;
  potentialEnergy: number;
  baselineEnergy: number;
  driftPercent: number;
};

type ParticleSimulationState = {
  id: string;
  particle: ReturnType<typeof toTestParticle>;
  history: Vector2D[];
  frozen: boolean;
  unfreezeAtMs: number | null;
};

type ParticlesCanvasProps = {
  charges: Charge[];
  bounds: WorldBounds;
  despawnBounds: WorldBounds;
  isSimulating: boolean;
  className?: string;
  onControllerReady?: (controller: ParticlesController | null) => void;
  onParticleCountChange?: (count: number) => void;
  onEnergySnapshotChange?: (snapshot: ParticleEnergySnapshot | null) => void;
};

const MAX_HISTORY_POINTS = 64;
const VELOCITY_RESET_TRAIL_THRESHOLD = 1.2;
const SPAWN_FREEZE_MS = 500;

function inBounds(point: Vector2Like, bounds: WorldBounds): boolean {
  return (
    point.x >= bounds.minX &&
    point.x <= bounds.maxX &&
    point.y >= bounds.minY &&
    point.y <= bounds.maxY
  );
}

function appendHistory(history: Vector2D[], point: Vector2D): Vector2D[] {
  if (history.length >= MAX_HISTORY_POINTS) {
    return [...history.slice(1), point];
  }
  return [...history, point];
}

export function ParticlesCanvas({
  charges,
  bounds,
  despawnBounds,
  isSimulating,
  className,
  onControllerReady,
  onParticleCountChange,
  onEnergySnapshotChange,
}: ParticlesCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chargesRef = useRef(charges);
  const boundsRef = useRef(bounds);
  const despawnBoundsRef = useRef(despawnBounds);
  const isSimulatingRef = useRef(isSimulating);
  const particlesRef = useRef<ParticleSimulationState[]>([]);
  const frameTimeRef = useRef<number | null>(null);
  const idCounterRef = useRef(0);
  const particleCountRef = useRef(0);
  const trackedEnergyParticleIdRef = useRef<string | null>(null);
  const baselineEnergyRef = useRef<number | null>(null);
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

  const emitEnergySnapshot = useCallback(() => {
    if (!onEnergySnapshotChange) {
      return;
    }
    const states = particlesRef.current;
    if (states.length === 0) {
      trackedEnergyParticleIdRef.current = null;
      baselineEnergyRef.current = null;
      onEnergySnapshotChange(null);
      return;
    }

    const activeStates = states.filter((state) => !state.frozen);
    if (activeStates.length === 0) {
      trackedEnergyParticleIdRef.current = null;
      baselineEnergyRef.current = null;
      onEnergySnapshotChange(null);
      return;
    }

    const trackedState =
      activeStates.find((state) => state.id === trackedEnergyParticleIdRef.current) ??
      activeStates[0]!;
    const totalEnergy = totalEnergyOfParticle(trackedState.particle, chargesRef.current);
    const kineticEnergy = kineticEnergyOfParticle(trackedState.particle);
    const potentialEnergy = totalEnergy - kineticEnergy;

    if (trackedEnergyParticleIdRef.current !== trackedState.id) {
      trackedEnergyParticleIdRef.current = trackedState.id;
      baselineEnergyRef.current = totalEnergy;
    } else if (baselineEnergyRef.current === null) {
      baselineEnergyRef.current = totalEnergy;
    }

    const baselineEnergy = baselineEnergyRef.current ?? totalEnergy;
    const driftPercent =
      Math.abs(baselineEnergy) > 1e-10
        ? ((totalEnergy - baselineEnergy) / Math.abs(baselineEnergy)) * 100
        : 0;

    onEnergySnapshotChange({
      particleId: trackedState.id,
      totalEnergy,
      kineticEnergy,
      potentialEnergy,
      baselineEnergy,
      driftPercent,
    });
  }, [onEnergySnapshotChange]);

  const spawnParticle = useCallback<SpawnParticle>(
    (position) => {
      const vectorPosition = Vector2D.from(position);
      const nextId = `tp-${idCounterRef.current++}`;
      const nextState: ParticleSimulationState = {
        id: nextId,
        particle: toTestParticle({
          pos: vectorPosition,
          vel: new Vector2D(0, 0),
          mass: DEFAULT_TEST_PARTICLE_MASS,
          charge: DEFAULT_TEST_PARTICLE_CHARGE,
        }),
        history: [vectorPosition],
        frozen: true,
        unfreezeAtMs: performance.now() + SPAWN_FREEZE_MS,
      };
      particlesRef.current.push(nextState);
      emitParticleCount();
      emitEnergySnapshot();
      needsRenderRef.current = true;
      requestRenderRef.current?.();
      return {
        id: nextState.id,
        pos: nextState.particle.pos,
        vel: nextState.particle.vel,
      };
    },
    [emitEnergySnapshot, emitParticleCount],
  );

  const clearParticles = useCallback<ClearParticles>(() => {
    particlesRef.current = [];
    emitParticleCount();
    emitEnergySnapshot();
    needsRenderRef.current = true;
    requestRenderRef.current?.();
  }, [emitEnergySnapshot, emitParticleCount]);

  const launchParticle = useCallback<LaunchParticle>((id, velocity) => {
    particlesRef.current = particlesRef.current.map((state) => {
      if (state.id !== id) {
        return state;
      }
      const velocityVector = Vector2D.from(velocity);
      const velocityDelta = velocityVector.subtract(state.particle.vel).magnitude();
      return {
        ...state,
        frozen: false,
        unfreezeAtMs: null,
        particle: {
          ...state.particle,
          vel: velocityVector,
        },
        history:
          velocityDelta > VELOCITY_RESET_TRAIL_THRESHOLD
            ? [state.particle.pos]
            : state.history,
      };
    });
    needsRenderRef.current = true;
    requestRenderRef.current?.();
    emitEnergySnapshot();
  }, [emitEnergySnapshot]);

  useEffect(() => {
    onControllerReady?.({
      spawn: spawnParticle,
      clear: clearParticles,
      launch: launchParticle,
    });
    return () => onControllerReady?.(null);
  }, [
    clearParticles,
    launchParticle,
    onControllerReady,
    spawnParticle,
  ]);

  useEffect(() => {
    chargesRef.current = charges;
    emitEnergySnapshot();
    needsRenderRef.current = true;
    requestRenderRef.current?.();
  }, [charges, emitEnergySnapshot]);

  useEffect(() => {
    boundsRef.current = bounds;
    needsRenderRef.current = true;
    requestRenderRef.current?.();
  }, [bounds]);

  useEffect(() => {
    despawnBoundsRef.current = despawnBounds;
    needsRenderRef.current = true;
    requestRenderRef.current?.();
  }, [despawnBounds]);

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

    const simulate = (dt: number, nowMs: number) => {
      if (particlesRef.current.length === 0) {
        return;
      }

      const nextParticles: ParticleSimulationState[] = [];
      const targetDt = Math.max(0.0001, dt);
      const substeps = Math.max(
        1,
        Math.min(MAX_SUBSTEPS_PER_FRAME, Math.ceil(targetDt / PHYSICS_BASE_DT)),
      );
      const substepDt = targetDt / substeps;
      for (const state of particlesRef.current) {
        const thawedState =
          state.frozen &&
          state.unfreezeAtMs !== null &&
          nowMs >= state.unfreezeAtMs
            ? { ...state, frozen: false, unfreezeAtMs: null }
            : state;
        if (thawedState.frozen) {
          nextParticles.push(thawedState);
          continue;
        }

        let nextParticle = thawedState.particle;
        let nextHistory = thawedState.history;
        let shouldDespawn = false;
        for (let stepIndex = 0; stepIndex < substeps; stepIndex += 1) {
          const stepped = symplecticEulerCromerParticleStep(
            nextParticle,
            chargesRef.current,
            substepDt,
          );
          nextParticle = stepped;

          if (!inBounds(nextParticle.pos, despawnBoundsRef.current)) {
            shouldDespawn = true;
            break;
          }

          const shouldSampleTrail =
            stepIndex === substeps - 1 ||
            (stepIndex + 1) % TRAIL_SAMPLE_EVERY_N_SUBSTEPS === 0;
          if (shouldSampleTrail) {
            nextHistory = appendHistory(nextHistory, nextParticle.pos);
          }
        }

        if (shouldDespawn) {
          continue;
        }

        nextParticles.push({
          ...thawedState,
          particle: nextParticle,
          history: nextHistory,
        });
      }
      particlesRef.current = nextParticles;
      emitParticleCount();
      emitEnergySnapshot();
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
          const firstPoint = transformWorldPoint(state.history[0], transform);
          context.moveTo(firstPoint.x, firstPoint.y);
          if (state.history.length === 2) {
            const secondPoint = transformWorldPoint(state.history[1], transform);
            context.lineTo(secondPoint.x, secondPoint.y);
          } else {
            for (let index = 1; index < state.history.length - 1; index += 1) {
              const current = transformWorldPoint(state.history[index], transform);
              const next = transformWorldPoint(state.history[index + 1], transform);
              const midX = (current.x + next.x) * 0.5;
              const midY = (current.y + next.y) * 0.5;
              context.quadraticCurveTo(current.x, current.y, midX, midY);
            }
            const penultimate = transformWorldPoint(
              state.history[state.history.length - 2],
              transform,
            );
            const last = transformWorldPoint(
              state.history[state.history.length - 1],
              transform,
            );
            context.quadraticCurveTo(penultimate.x, penultimate.y, last.x, last.y);
          }
          context.strokeStyle = "rgba(255, 242, 184, 0.82)";
          context.lineWidth = 2.2;
          context.stroke();
        }

        const head = transformWorldPoint(state.particle.pos, transform);
        context.shadowColor = "rgba(255, 230, 126, 0.98)";
        context.shadowBlur = 16;
        context.fillStyle = "rgba(255, 245, 182, 0.98)";
        context.beginPath();
        context.arc(head.x, head.y, 5.2, 0, Math.PI * 2);
        context.fill();
        context.strokeStyle = "rgba(43, 31, 4, 0.72)";
        context.lineWidth = 1.15;
        context.stroke();
        context.fillStyle = "rgba(255, 255, 236, 0.97)";
        context.beginPath();
        context.arc(head.x, head.y, 2, 0, Math.PI * 2);
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
          simulate(dt, time);
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
  }, [emitEnergySnapshot, emitParticleCount]);

  return (
    <canvas ref={canvasRef} className={`${className ?? ""} block h-full w-full`} />
  );
}
