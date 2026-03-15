"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { WorldBounds } from "@/physics/types";
import { getViewBounds, screenToWorld } from "@/physics/world-space";

type UseSandboxCameraOptions = {
  containerRef: RefObject<HTMLDivElement | null>;
  minZoom: number;
  maxZoom: number;
};

/**
 * Owns the sandbox camera, including viewport sizing, zoom-about-cursor math,
 * and panning. Pan updates are batched to animation frames so dragging the
 * whole display does not commit React state on every raw pointer event.
 */
export function useSandboxCamera({
  containerRef,
  minZoom,
  maxZoom,
}: UseSandboxCameraOptions) {
  const cameraRef = useRef({ offsetX: 0, offsetY: 0 });
  const zoomRef = useRef(1);
  const boundsRef = useRef<WorldBounds>({
    minX: -1.6,
    maxX: 1.6,
    minY: -1.1,
    maxY: 1.1,
  });
  const panStateRef = useRef<{
    startX: number;
    startY: number;
    startOffsetX: number;
    startOffsetY: number;
  } | null>(null);
  const pendingOffsetRef = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const frameIdRef = useRef<number | null>(null);

  const [size, setSize] = useState({ width: 1280, height: 760 });
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [isPanning, setIsPanning] = useState(false);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      setSize({
        width: Math.max(1, Math.floor(entry.contentRect.width)),
        height: Math.max(1, Math.floor(entry.contentRect.height)),
      });
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [containerRef]);

  const baseBounds = useMemo<WorldBounds>(() => {
    const aspect = size.width / Math.max(size.height, 1);
    const halfY = 1.12;
    const halfX = halfY * aspect;
    return { minX: -halfX, maxX: halfX, minY: -halfY, maxY: halfY };
  }, [size]);

  const viewBounds = useMemo(
    () => getViewBounds(baseBounds, { zoom, offsetX, offsetY }),
    [baseBounds, offsetX, offsetY, zoom],
  );

  useEffect(() => {
    cameraRef.current = { offsetX, offsetY };
  }, [offsetX, offsetY]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    boundsRef.current = viewBounds;
  }, [viewBounds]);

  const clampZoom = useCallback(
    (value: number) => Math.min(maxZoom, Math.max(minZoom, value)),
    [maxZoom, minZoom],
  );

  const getWorldFromClientPoint = useCallback((clientX: number, clientY: number) => {
    const element = containerRef.current;
    if (!element) {
      return null;
    }
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return null;
    }
    return screenToWorld(
      { x: clientX - rect.left, y: clientY - rect.top },
      boundsRef.current,
      rect.width,
      rect.height,
    );
  }, [containerRef]);

  const zoomAtClientPoint = useCallback(
    (clientX: number, clientY: number, desiredZoom: number) => {
      const element = containerRef.current;
      if (!element) {
        return;
      }
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        return;
      }

      const boundedZoom = clampZoom(desiredZoom);
      const localX = clientX - rect.left;
      const localY = clientY - rect.top;
      const worldBefore = screenToWorld(
        { x: localX, y: localY },
        boundsRef.current,
        rect.width,
        rect.height,
      );

      const spanX = (baseBounds.maxX - baseBounds.minX) / boundedZoom;
      const spanY = (baseBounds.maxY - baseBounds.minY) / boundedZoom;
      const normalizedX = localX / rect.width;
      const normalizedY = (rect.height - localY) / rect.height;
      const minX = worldBefore.x - normalizedX * spanX;
      const minY = worldBefore.y - normalizedY * spanY;
      const centerX = minX + spanX * 0.5;
      const centerY = minY + spanY * 0.5;
      const baseCenterX = (baseBounds.minX + baseBounds.maxX) * 0.5;
      const baseCenterY = (baseBounds.minY + baseBounds.maxY) * 0.5;

      zoomRef.current = boundedZoom;
      setZoom(boundedZoom);
      setOffsetX(centerX - baseCenterX);
      setOffsetY(centerY - baseCenterY);
    },
    [baseBounds, clampZoom, containerRef],
  );

  const zoomByFactor = useCallback((factor: number) => {
    const element = containerRef.current;
    if (!element) {
      return;
    }
    const rect = element.getBoundingClientRect();
    zoomAtClientPoint(
      rect.left + rect.width * 0.5,
      rect.top + rect.height * 0.5,
      zoomRef.current * factor,
    );
  }, [containerRef, zoomAtClientPoint]);

  const resetView = useCallback(() => {
    zoomRef.current = 1;
    setZoom(1);
    setOffsetX(0);
    setOffsetY(0);
  }, []);

  // Commits the latest pending pan offsets once per animation frame.
  const flushPendingPan = useCallback(() => {
    const pendingOffset = pendingOffsetRef.current;
    frameIdRef.current = null;
    if (!pendingOffset) {
      return;
    }
    setOffsetX(pendingOffset.offsetX);
    setOffsetY(pendingOffset.offsetY);
    pendingOffsetRef.current = null;
  }, []);

  // Schedules one camera-state commit even if many pointermove events arrive first.
  const schedulePanCommit = useCallback(() => {
    if (frameIdRef.current != null) {
      return;
    }
    frameIdRef.current = window.requestAnimationFrame(flushPendingPan);
  }, [flushPendingPan]);

  const beginPan = useCallback((clientX: number, clientY: number) => {
    panStateRef.current = {
      startX: clientX,
      startY: clientY,
      startOffsetX: cameraRef.current.offsetX,
      startOffsetY: cameraRef.current.offsetY,
    };
    setIsPanning(true);
  }, []);

  // Allows right-drag or Space-drag panning to begin even if the initial
  // button press was handled outside the sandbox container.
  const maybeStartImplicitPan = useCallback((
    event: PointerEvent,
    allowPanStart: boolean,
    isSpacePressed: boolean,
  ) => {
    if (panStateRef.current || !allowPanStart) {
      return;
    }

    const wantsRightPan = (event.buttons & 2) === 2;
    const wantsSpacePan = isSpacePressed && (event.buttons & 1) === 1;
    if (wantsRightPan || wantsSpacePan) {
      beginPan(event.clientX, event.clientY);
    }
  }, [beginPan]);

  // Returns true when camera panning owns this pointer move.
  const handleGlobalPointerMove = useCallback((event: PointerEvent) => {
    const activePan = panStateRef.current;
    if (!activePan) {
      return false;
    }

    const element = containerRef.current;
    if (!element) {
      return true;
    }
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return true;
    }

    const spanX = boundsRef.current.maxX - boundsRef.current.minX;
    const spanY = boundsRef.current.maxY - boundsRef.current.minY;
    const dx = event.clientX - activePan.startX;
    const dy = event.clientY - activePan.startY;
    pendingOffsetRef.current = {
      offsetX: activePan.startOffsetX - (dx / rect.width) * spanX,
      offsetY: activePan.startOffsetY + (dy / rect.height) * spanY,
    };
    schedulePanCommit();
    return true;
  }, [containerRef, schedulePanCommit]);

  const endPan = useCallback(() => {
    if (frameIdRef.current != null) {
      window.cancelAnimationFrame(frameIdRef.current);
      frameIdRef.current = null;
    }
    flushPendingPan();
    panStateRef.current = null;
    pendingOffsetRef.current = null;
    setIsPanning(false);
  }, [flushPendingPan]);

  const handleWheelZoom = useCallback((clientX: number, clientY: number, deltaY: number) => {
    const zoomFactor = Math.exp(-deltaY * 0.0015);
    zoomAtClientPoint(clientX, clientY, zoomRef.current * zoomFactor);
  }, [zoomAtClientPoint]);

  useEffect(() => {
    return () => {
      if (frameIdRef.current != null) {
        window.cancelAnimationFrame(frameIdRef.current);
      }
    };
  }, []);

  return {
    size,
    zoom,
    offsetX,
    offsetY,
    isPanning,
    baseBounds,
    viewBounds,
    getWorldFromClientPoint,
    beginPan,
    maybeStartImplicitPan,
    handleGlobalPointerMove,
    endPan,
    handleWheelZoom,
    zoomByFactor,
    resetView,
  };
}
