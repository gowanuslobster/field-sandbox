"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  calculateGhostOrbitSuggestion,
  DEFAULT_TEST_PARTICLE_CHARGE,
  DEFAULT_TEST_PARTICLE_MASS,
  PARTICLE_PLUMMER_EPSILON,
  type GhostOrbitSuggestion,
} from "@/physics/dynamics";
import type { Charge } from "@/physics/types";
import type { Vector2Like } from "@/physics/vector2d";

type Mode = "select" | "add_positive" | "add_negative" | "drop_test_charge";

export type SlingshotPreview = {
  particleId: string | null;
  origin: Vector2Like;
  cursor: Vector2Like;
  plannedVelocity: Vector2Like;
  ghostSuggestion: GhostOrbitSuggestion | null;
  ghostAnchor: Vector2Like;
};

type SlingshotSession = {
  origin: Vector2Like;
  ghostSuggestion: GhostOrbitSuggestion | null;
  ghostAnchor: Vector2Like;
};

type UseSlingshotInteractionOptions = {
  getWorldFromClientPoint: (clientX: number, clientY: number) => Vector2Like | null;
  chargesRef: RefObject<Charge[]>;
  modeRef: RefObject<Mode>;
  particleSpawnerRef: RefObject<((position: Vector2Like) => { id: string; pos: Vector2Like; vel: Vector2Like }) | null>;
  particleLaunchRef: RefObject<((id: string, velocity: Vector2Like) => void) | null>;
  dragToVelocityScale: number;
};

/**
 * Owns the drag-to-launch interaction for test particles and batches preview
 * updates so the slingshot overlay does not re-render on every raw pointer event.
 */
export function useSlingshotInteraction({
  getWorldFromClientPoint,
  chargesRef,
  modeRef,
  particleSpawnerRef,
  particleLaunchRef,
  dragToVelocityScale,
}: UseSlingshotInteractionOptions) {
  const sessionRef = useRef<SlingshotSession | null>(null);
  const previewRef = useRef<SlingshotPreview | null>(null);
  const pendingCursorWorldRef = useRef<Vector2Like | null>(null);
  const frameIdRef = useRef<number | null>(null);
  const [hasActiveSlingshot, setHasActiveSlingshot] = useState(false);
  const [slingshotPreview, setSlingshotPreview] = useState<SlingshotPreview | null>(null);

  const commitPreview = useCallback(() => {
    const session = sessionRef.current;
    const cursor = pendingCursorWorldRef.current;
    frameIdRef.current = null;
    if (!session || !cursor) {
      return;
    }

    const dragVector = {
      x: cursor.x - session.origin.x,
      y: cursor.y - session.origin.y,
    };
    const plannedVelocity = {
      x: dragVector.x * dragToVelocityScale,
      y: dragVector.y * dragToVelocityScale,
    };
    const nextPreview: SlingshotPreview = {
      particleId: null,
      origin: session.origin,
      cursor,
      plannedVelocity,
      ghostSuggestion: session.ghostSuggestion,
      ghostAnchor: session.ghostAnchor,
    };
    previewRef.current = nextPreview;
    setSlingshotPreview(nextPreview);
    pendingCursorWorldRef.current = null;
  }, [dragToVelocityScale]);

  // Commits at most one preview update per animation frame while the user drags.
  const schedulePreviewCommit = useCallback(() => {
    if (frameIdRef.current != null) {
      return;
    }
    frameIdRef.current = window.requestAnimationFrame(commitPreview);
  }, [commitPreview]);

  const beginSession = useCallback((session: SlingshotSession) => {
    sessionRef.current = session;
    setHasActiveSlingshot(true);
    pendingCursorWorldRef.current = session.origin;
    if (frameIdRef.current != null) {
      window.cancelAnimationFrame(frameIdRef.current);
      frameIdRef.current = null;
    }
    const initialPreview: SlingshotPreview = {
      particleId: null,
      origin: session.origin,
      cursor: session.origin,
      plannedVelocity: { x: 0, y: 0 },
      ghostSuggestion: session.ghostSuggestion,
      ghostAnchor: session.ghostAnchor,
    };
    previewRef.current = initialPreview;
    setSlingshotPreview(initialPreview);
  }, []);

  const initializeDropSlingshot = useCallback((clientX: number, clientY: number) => {
    const world = getWorldFromClientPoint(clientX, clientY);
    if (!world) {
      return;
    }

    const initialGhostSuggestion =
      modeRef.current === "drop_test_charge"
        ? calculateGhostOrbitSuggestion(
            world,
            { x: 0, y: 0 },
            chargesRef.current,
            DEFAULT_TEST_PARTICLE_CHARGE,
            DEFAULT_TEST_PARTICLE_MASS,
            { softening: PARTICLE_PLUMMER_EPSILON, interactionMode: "electric" },
          )
        : null;

    beginSession({
      origin: world,
      ghostSuggestion: initialGhostSuggestion,
      ghostAnchor: world,
    });
  }, [beginSession, chargesRef, getWorldFromClientPoint, modeRef]);

  // Returns true when the slingshot interaction owns this pointer move.
  const handleGlobalPointerMove = useCallback((event: PointerEvent) => {
    if (!sessionRef.current) {
      return false;
    }

    const world = getWorldFromClientPoint(event.clientX, event.clientY);
    if (!world) {
      return true;
    }

    pendingCursorWorldRef.current = world;
    schedulePreviewCommit();
    return true;
  }, [getWorldFromClientPoint, schedulePreviewCommit]);

  // Pointer release spawns a new particle and launches it from the original drop point.
  const handleGlobalPointerUp = useCallback(() => {
    const session = sessionRef.current;
    if (!session) {
      return;
    }

    if (frameIdRef.current != null) {
      window.cancelAnimationFrame(frameIdRef.current);
      frameIdRef.current = null;
    }
    commitPreview();
    const plannedVelocity = previewRef.current?.plannedVelocity ?? { x: 0, y: 0 };

    const spawned = particleSpawnerRef.current?.(session.origin);
    if (spawned) {
      particleLaunchRef.current?.(spawned.id, plannedVelocity);
    }

    sessionRef.current = null;
    setHasActiveSlingshot(false);
    previewRef.current = null;
    pendingCursorWorldRef.current = null;
    setSlingshotPreview(null);
  }, [commitPreview, particleLaunchRef, particleSpawnerRef]);

  const clearSlingshot = useCallback(() => {
    if (frameIdRef.current != null) {
      window.cancelAnimationFrame(frameIdRef.current);
      frameIdRef.current = null;
    }
    sessionRef.current = null;
    setHasActiveSlingshot(false);
    previewRef.current = null;
    pendingCursorWorldRef.current = null;
    setSlingshotPreview(null);
  }, []);

  useEffect(() => {
    return () => {
      if (frameIdRef.current != null) {
        window.cancelAnimationFrame(frameIdRef.current);
      }
    };
  }, []);

  return {
    hasActiveSlingshot,
    slingshotPreview,
    initializeDropSlingshot,
    handleGlobalPointerMove,
    handleGlobalPointerUp,
    clearSlingshot,
  };
}
