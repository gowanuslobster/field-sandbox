"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { calculateFieldAt, potentialAtPoint } from "@/physics/electrostatics";
import type { Charge } from "@/physics/types";
import type { Vector2Like } from "@/physics/vector2d";

export type CursorReadout = {
  position: Vector2Like;
  potential: number;
  field: ReturnType<typeof calculateFieldAt>;
};

type UseCursorReadoutOptions = {
  getWorldFromClientPoint: (clientX: number, clientY: number) => Vector2Like | null;
  chargesRef: RefObject<Charge[]>;
};

/**
 * Tracks the local field values under the cursor and batches pointer-driven
 * readout updates so hover inspection does not trigger React state on every
 * raw browser event.
 */
export function useCursorReadout({
  getWorldFromClientPoint,
  chargesRef,
}: UseCursorReadoutOptions) {
  const pendingWorldRef = useRef<Vector2Like | null>(null);
  const frameIdRef = useRef<number | null>(null);
  const [cursorReadout, setCursorReadout] = useState<CursorReadout | null>(null);

  // Commits the latest pending cursor sample once per animation frame.
  const flushPendingReadout = useCallback(() => {
    frameIdRef.current = null;
    const pendingWorld = pendingWorldRef.current;
    if (!pendingWorld) {
      return;
    }

    const charges = chargesRef.current ?? [];
    setCursorReadout({
      position: pendingWorld,
      potential: potentialAtPoint(pendingWorld, charges),
      field: calculateFieldAt(pendingWorld.x, pendingWorld.y, charges),
    });
    pendingWorldRef.current = null;
  }, [chargesRef]);

  // Schedules at most one cursor readout update per animation frame.
  const scheduleReadoutFlush = useCallback(() => {
    if (frameIdRef.current != null) {
      return;
    }
    frameIdRef.current = window.requestAnimationFrame(flushPendingReadout);
  }, [flushPendingReadout]);

  const handleGlobalPointerMove = useCallback((event: PointerEvent) => {
    const world = getWorldFromClientPoint(event.clientX, event.clientY);
    if (!world) {
      return;
    }

    pendingWorldRef.current = world;
    scheduleReadoutFlush();
  }, [getWorldFromClientPoint, scheduleReadoutFlush]);

  const clearCursorReadout = useCallback(() => {
    if (frameIdRef.current != null) {
      window.cancelAnimationFrame(frameIdRef.current);
      frameIdRef.current = null;
    }
    pendingWorldRef.current = null;
    setCursorReadout(null);
  }, []);

  useEffect(() => {
    return () => {
      if (frameIdRef.current != null) {
        window.cancelAnimationFrame(frameIdRef.current);
      }
    };
  }, []);

  return {
    cursorReadout,
    handleGlobalPointerMove,
    clearCursorReadout,
  };
}
