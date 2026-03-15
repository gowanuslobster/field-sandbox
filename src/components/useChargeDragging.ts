"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { Charge } from "@/physics/types";
import type { Vector2Like } from "@/physics/vector2d";

type Mode = "select" | "add_positive" | "add_negative" | "drop_test_charge";

type UseChargeDraggingOptions = {
  getWorldFromClientPoint: (clientX: number, clientY: number) => Vector2Like | null;
  setCharges: Dispatch<SetStateAction<Charge[]>>;
  setSelectedChargeId: (chargeId: string | null) => void;
  setInteractionMode: (mode: Mode) => void;
};

/**
 * Owns interactive dragging of existing source charges and batches pointer-driven
 * position commits so rapid mouse movement does not trigger a React update for
 * every browser event.
 */
export function useChargeDragging({
  getWorldFromClientPoint,
  setCharges,
  setSelectedChargeId,
  setInteractionMode,
}: UseChargeDraggingOptions) {
  const dragStateRef = useRef<{ chargeId: string } | null>(null);
  const pendingWorldPositionRef = useRef<Vector2Like | null>(null);
  const frameIdRef = useRef<number | null>(null);
  const [isDraggingCharge, setIsDraggingCharge] = useState(false);

  // Commits the latest pending drag position once per animation frame.
  const flushPendingPosition = useCallback(() => {
    const dragState = dragStateRef.current;
    const pendingWorldPosition = pendingWorldPositionRef.current;
    frameIdRef.current = null;
    if (!dragState || !pendingWorldPosition) {
      return;
    }

    setCharges((current) =>
      current.map((charge) =>
        charge.id === dragState.chargeId
          ? { ...charge, position: pendingWorldPosition }
          : charge,
      ),
    );
    pendingWorldPositionRef.current = null;
  }, [setCharges]);

  // Schedules at most one React charge-position update per animation frame.
  const schedulePositionCommit = useCallback(() => {
    if (frameIdRef.current != null) {
      return;
    }
    frameIdRef.current = window.requestAnimationFrame(flushPendingPosition);
  }, [flushPendingPosition]);

  const startChargeDrag = useCallback((chargeId: string) => {
    dragStateRef.current = { chargeId };
    pendingWorldPositionRef.current = null;
    setIsDraggingCharge(true);
    setSelectedChargeId(chargeId);
    setInteractionMode("select");
  }, [setInteractionMode, setSelectedChargeId]);

  // Returns true when charge dragging owns this pointer move.
  const handleGlobalPointerMove = useCallback((event: PointerEvent) => {
    const dragState = dragStateRef.current;
    if (!dragState) {
      return false;
    }

    const world = getWorldFromClientPoint(event.clientX, event.clientY);
    if (!world) {
      return true;
    }

    pendingWorldPositionRef.current = world;
    schedulePositionCommit();
    return true;
  }, [getWorldFromClientPoint, schedulePositionCommit]);

  // Pointer release ends the drag and flushes the final world position immediately.
  const handleGlobalPointerUp = useCallback(() => {
    if (!dragStateRef.current) {
      return;
    }

    if (frameIdRef.current != null) {
      window.cancelAnimationFrame(frameIdRef.current);
      frameIdRef.current = null;
    }
    flushPendingPosition();
    dragStateRef.current = null;
    pendingWorldPositionRef.current = null;
    setIsDraggingCharge(false);
  }, [flushPendingPosition]);

  useEffect(() => {
    return () => {
      if (frameIdRef.current != null) {
        window.cancelAnimationFrame(frameIdRef.current);
      }
    };
  }, []);

  return {
    isDraggingCharge,
    startChargeDrag,
    handleGlobalPointerMove,
    handleGlobalPointerUp,
  };
}
