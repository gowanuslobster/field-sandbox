"use client";

import {
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FieldHeatmap } from "@/components/FieldHeatmap";
import {
  FieldLinesCanvas,
  type FieldLineRenderMode,
} from "@/components/FieldLinesCanvas";
import { EquipotentialLinesCanvas } from "@/components/EquipotentialLinesCanvas";
import { VectorFieldCanvas } from "@/components/VectorFieldCanvas";
import { potentialAtPoint } from "@/physics/electrostatics";
import type { Charge, WorldBounds } from "@/physics/types";
import {
  getViewBounds,
  screenToWorld,
  worldToScreen,
} from "@/physics/world-space";

type Mode = "select" | "add_positive" | "add_negative";

const CHARGE_RADIUS_PX = 13;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 6.5;

const INITIAL_CHARGES: Charge[] = [
  { id: "q1", position: { x: -0.72, y: 0 }, value: 1 },
  { id: "q2", position: { x: 0.72, y: 0 }, value: -1 },
  { id: "q3", position: { x: 0, y: 0.62 }, value: 1 },
];

function nextChargeId(): string {
  return `q-${Math.random().toString(36).slice(2, 10)}`;
}

function nextFieldLineMode(mode: FieldLineRenderMode): FieldLineRenderMode {
  if (mode === "animated_dashes") {
    return "static_arrows";
  }
  if (mode === "static_arrows") {
    return "off";
  }
  return "animated_dashes";
}

function toChargeClass(value: number, selected: boolean): string {
  const base =
    "absolute -translate-x-1/2 -translate-y-1/2 rounded-full border transition-transform duration-75 cursor-grab active:cursor-grabbing";
  const selectedClass = selected
    ? " scale-110 ring-2 ring-white/75"
    : " hover:scale-105";
  if (value >= 0) {
    return `${base} ${selectedClass} border-orange-200/80 bg-orange-400/95 shadow-[0_0_24px_6px_rgba(255,122,63,0.55)]`;
  }
  return `${base} ${selectedClass} border-cyan-200/85 bg-cyan-400/95 shadow-[0_0_24px_6px_rgba(61,196,255,0.6)]`;
}

export function ElectricFieldSandbox() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{ chargeId: string } | null>(null);
  const panStateRef = useRef<{
    startX: number;
    startY: number;
    startOffsetX: number;
    startOffsetY: number;
  } | null>(null);
  const isSpacePressedRef = useRef(false);
  const cameraRef = useRef({ offsetX: 0, offsetY: 0 });
  const zoomRef = useRef(1);
  const chargesRef = useRef(INITIAL_CHARGES);
  const boundsRef = useRef<WorldBounds>({
    minX: -1.6,
    maxX: 1.6,
    minY: -1.1,
    maxY: 1.1,
  });

  const [size, setSize] = useState({ width: 1280, height: 760 });
  const [mode, setMode] = useState<Mode>("select");
  const [charges, setCharges] = useState<Charge[]>(INITIAL_CHARGES);
  const [selectedChargeId, setSelectedChargeId] = useState<string | null>(null);
  const [cursorPotential, setCursorPotential] = useState<number>(0);
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showVectorGrid, setShowVectorGrid] = useState(true);
  const [showFieldLineGradient, setShowFieldLineGradient] = useState(false);
  const [showEquipotentialLines, setShowEquipotentialLines] = useState(false);
  const [fieldLineMode, setFieldLineMode] =
    useState<FieldLineRenderMode>("static_arrows");
  const [isDraggingCharge, setIsDraggingCharge] = useState(false);
  const [isSimulating, setIsSimulating] = useState(
    fieldLineMode === "animated_dashes",
  );

  const panFromClientDelta = useCallback((clientX: number, clientY: number) => {
    const activePan = panStateRef.current;
    if (!activePan) {
      return false;
    }
    const element = containerRef.current;
    if (!element) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return false;
    }
    const spanX = boundsRef.current.maxX - boundsRef.current.minX;
    const spanY = boundsRef.current.maxY - boundsRef.current.minY;
    const dx = clientX - activePan.startX;
    const dy = clientY - activePan.startY;
    setOffsetX(activePan.startOffsetX - (dx / rect.width) * spanX);
    setOffsetY(activePan.startOffsetY + (dy / rect.height) * spanY);
    return true;
  }, []);

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
  }, []);

  const baseBounds = useMemo<WorldBounds>(() => {
    const aspect = size.width / Math.max(size.height, 1);
    const halfY = 1.12;
    const halfX = halfY * aspect;
    return { minX: -halfX, maxX: halfX, minY: -halfY, maxY: halfY };
  }, [size]);

  const viewBounds = useMemo(
    () => getViewBounds(baseBounds, { zoom, offsetX, offsetY }),
    [baseBounds, zoom, offsetX, offsetY],
  );
  const selectedCharge = useMemo(
    () => charges.find((charge) => charge.id === selectedChargeId) ?? null,
    [charges, selectedChargeId],
  );

  useEffect(() => {
    chargesRef.current = charges;
  }, [charges]);

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
    (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value)),
    [],
  );

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
    [baseBounds, clampZoom],
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
  }, []);

  const zoomByFactor = useCallback(
    (factor: number) => {
      const element = containerRef.current;
      if (!element) {
        return;
      }
      const rect = element.getBoundingClientRect();
      zoomAtClientPoint(
        rect.left + rect.width * 0.5,
        rect.top + rect.height * 0.5,
        zoom * factor,
      );
    },
    [zoom, zoomAtClientPoint],
  );

  const resetView = useCallback(() => {
    setZoom(1);
    setOffsetX(0);
    setOffsetY(0);
  }, []);

  const startDrag = (chargeId: string) => {
    dragStateRef.current = { chargeId };
    setIsDraggingCharge(true);
    setIsSimulating(true);
    setSelectedChargeId(chargeId);
    setMode("select");
  };

  const removeSelectedCharge = useCallback(() => {
    if (!selectedChargeId) {
      return;
    }
    setCharges((current) =>
      current.filter((charge) => charge.id !== selectedChargeId),
    );
    setSelectedChargeId(null);
  }, [selectedChargeId]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (!panStateRef.current && !dragStateRef.current) {
        const wantsRightPan = (event.buttons & 2) === 2;
        const wantsSpacePan =
          isSpacePressedRef.current && (event.buttons & 1) === 1;
        if (wantsRightPan || wantsSpacePan) {
          panStateRef.current = {
            startX: event.clientX,
            startY: event.clientY,
            startOffsetX: cameraRef.current.offsetX,
            startOffsetY: cameraRef.current.offsetY,
          };
        }
      }

      if (panFromClientDelta(event.clientX, event.clientY)) {
        return;
      }

      const world = getWorldFromClientPoint(event.clientX, event.clientY);
      if (!world) {
        return;
      }

      setCursorPotential(potentialAtPoint(world, chargesRef.current));
      const dragging = dragStateRef.current;
      if (!dragging) {
        return;
      }
      setCharges((current) =>
        current.map((charge) =>
          charge.id === dragging.chargeId
            ? { ...charge, position: { x: world.x, y: world.y } }
            : charge,
        ),
      );
    };

    const onPointerUp = () => {
      dragStateRef.current = null;
      panStateRef.current = null;
      setIsDraggingCharge(false);
      setIsSimulating(fieldLineMode === "animated_dashes");
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [fieldLineMode, getWorldFromClientPoint, panFromClientDelta]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        isSpacePressedRef.current = true;
        event.preventDefault();
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        removeSelectedCharge();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") {
        isSpacePressedRef.current = false;
      }
    };
    const onBlur = () => {
      isSpacePressedRef.current = false;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [removeSelectedCharge]);

  const handleCanvasPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const shouldPan =
      event.button === 2 ||
      (event.button === 0 && (isSpacePressedRef.current || mode === "select"));
    if (shouldPan) {
      event.preventDefault();
      setSelectedChargeId(null);
      panStateRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        startOffsetX: offsetX,
        startOffsetY: offsetY,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    if (event.button !== 0) {
      return;
    }
    const world = getWorldFromClientPoint(event.clientX, event.clientY);
    if (!world) {
      return;
    }

    const value = mode === "add_positive" ? 1 : -1;
    const id = nextChargeId();
    setCharges((current) => {
      const newCharge: Charge = {
        id,
        value,
        position: { x: world.x, y: world.y },
      };
      return [...current, newCharge];
    });
    setSelectedChargeId(id);
  };

  const handleCanvasWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const zoomFactor = Math.exp(-event.deltaY * 0.0015);
    zoomAtClientPoint(
      event.clientX,
      event.clientY,
      zoomRef.current * zoomFactor,
    );
  };

  return (
    <section className="h-dvh w-full bg-[#0F0F0F] text-zinc-100">
      <div className="absolute left-4 top-4 z-20 w-[330px] rounded-2xl border border-cyan-300/20 bg-black/65 p-4 shadow-[0_0_36px_rgba(56,189,248,0.2)] backdrop-blur-md">
        <p className="text-xs uppercase tracking-[0.22em] text-cyan-200/70">
          Field Sandbox
        </p>
        <h1 className="mt-1 text-lg font-semibold text-white">Control Overlay</h1>

        <p className="mt-3 text-[11px] font-medium uppercase tracking-[0.15em] text-zinc-400">
          Charge Interaction
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode("select")}
            className={`rounded-md px-3 py-2 text-sm transition-all duration-200 ${
              mode === "select"
                ? "bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.35)]"
                : "bg-white/10 text-white hover:bg-white/20"
            }`}
          >
            Select / Drag
          </button>
          <button
            type="button"
            onClick={() => setMode("add_positive")}
            className={`rounded-md px-3 py-2 text-sm transition-all duration-200 ${
              mode === "add_positive"
                ? "bg-orange-300 text-black shadow-[0_0_20px_rgba(255,160,90,0.45)]"
                : "bg-orange-400/20 text-orange-200 hover:bg-orange-400/35"
            }`}
          >
            + Add Charge
          </button>
          <button
            type="button"
            onClick={() => setMode("add_negative")}
            className={`rounded-md px-3 py-2 text-sm transition-all duration-200 ${
              mode === "add_negative"
                ? "bg-cyan-200 text-black shadow-[0_0_20px_rgba(94,220,255,0.45)]"
                : "bg-cyan-400/20 text-cyan-100 hover:bg-cyan-400/35"
            }`}
          >
            - Add Charge
          </button>
          <button
            type="button"
            onClick={removeSelectedCharge}
            className="rounded-md bg-rose-400/20 px-3 py-2 text-sm text-rose-100 transition-colors duration-200 hover:bg-rose-400/35"
          >
            Remove Selected
          </button>
        </div>
        {selectedCharge ? (
          <div className="mt-3 rounded-lg border border-cyan-200/20 bg-cyan-950/25 px-3 py-2">
            <div className="flex items-center justify-between text-xs text-cyan-100">
              <span>Selected charge magnitude</span>
              <span className="font-semibold">
                {selectedCharge.value > 0 ? "+" : ""}
                {selectedCharge.value.toFixed(1)}q
              </span>
            </div>
            <input
              type="range"
              min={-5}
              max={5}
              step={0.5}
              value={selectedCharge.value}
              onChange={(event) => {
                const nextValue = Number.parseFloat(event.currentTarget.value);
                setCharges((current) =>
                  current.map((charge) =>
                    charge.id === selectedCharge.id
                      ? { ...charge, value: nextValue }
                      : charge,
                  ),
                );
              }}
              className="mt-2 w-full accent-cyan-300"
              aria-label="Selected charge magnitude slider"
            />
          </div>
        ) : null}
        <div className="mt-2 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => zoomByFactor(1.18)}
            className="rounded-md bg-indigo-300/85 px-2 py-2 text-xs font-medium text-black shadow-[0_0_14px_rgba(129,140,248,0.45)] transition-colors duration-200 hover:bg-indigo-200"
          >
            Zoom In
          </button>
          <button
            type="button"
            onClick={() => zoomByFactor(1 / 1.18)}
            className="rounded-md bg-indigo-400/25 px-2 py-2 text-xs font-medium text-indigo-100 transition-colors duration-200 hover:bg-indigo-400/38"
          >
            Zoom Out
          </button>
          <button
            type="button"
            onClick={resetView}
            className="rounded-md bg-zinc-200/20 px-2 py-2 text-xs font-medium text-zinc-200 transition-colors duration-200 hover:bg-zinc-200/32"
          >
            Reset View
          </button>
        </div>
        <p className="mt-2 text-xs tracking-wide text-indigo-200/80">
          View Zoom: {(zoom * 100).toFixed(0)}%
        </p>

        <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.15em] text-zinc-400">
          Visualization Layers
        </p>
        <div className="mt-2 space-y-2">
          <button
            type="button"
            onClick={() =>
              setFieldLineMode((current) => {
                const nextMode = nextFieldLineMode(current);
                setIsSimulating(isDraggingCharge || nextMode === "animated_dashes");
                return nextMode;
              })
            }
            className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-all duration-200 ${
              fieldLineMode === "animated_dashes"
                ? "bg-violet-300/85 text-black shadow-[0_0_14px_rgba(196,181,253,0.45)]"
                : fieldLineMode === "static_arrows"
                  ? "bg-violet-200/85 text-black shadow-[0_0_14px_rgba(216,180,254,0.4)]"
                  : "bg-violet-400/20 text-violet-100 hover:bg-violet-400/35"
            }`}
          >
            <span>Field Line Mode</span>
            <span className="text-xs font-semibold">
              {fieldLineMode === "animated_dashes"
                ? "Animated"
                : fieldLineMode === "static_arrows"
                  ? "Static"
                  : "Off"}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setShowHeatmap((current) => !current)}
            className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-all duration-200 ${
              showHeatmap
                ? "bg-emerald-300/85 text-black shadow-[0_0_14px_rgba(52,211,153,0.4)]"
                : "bg-emerald-400/20 text-emerald-100 hover:bg-emerald-400/35"
            }`}
          >
            <span>Show Potential Heatmap</span>
            <span className="text-xs font-semibold">{showHeatmap ? "ON" : "OFF"}</span>
          </button>
          <button
            type="button"
            onClick={() => setShowFieldLineGradient((current) => !current)}
            className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-all duration-200 ${
              showFieldLineGradient
                ? "bg-amber-300/85 text-black shadow-[0_0_14px_rgba(251,191,36,0.4)]"
                : "bg-amber-400/20 text-amber-100 hover:bg-amber-400/35"
            }`}
          >
            <span>Show Field Line Gradient</span>
            <span className="text-xs font-semibold">
              {showFieldLineGradient ? "ON" : "OFF"}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setShowEquipotentialLines((current) => !current)}
            className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-all duration-200 ${
              showEquipotentialLines
                ? "bg-sky-300/90 text-black shadow-[0_0_14px_rgba(56,189,248,0.42)]"
                : "bg-sky-400/20 text-sky-100 hover:bg-sky-400/35"
            }`}
          >
            <span>Show Equipotential Lines</span>
            <span className="text-xs font-semibold">
              {showEquipotentialLines ? "ON" : "OFF"}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setShowVectorGrid((current) => !current)}
            className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-all duration-200 ${
              showVectorGrid
                ? "bg-fuchsia-300/85 text-black shadow-[0_0_14px_rgba(232,121,249,0.45)]"
                : "bg-fuchsia-400/20 text-fuchsia-100 hover:bg-fuchsia-400/35"
            }`}
          >
            <span>Show Vector Grid</span>
            <span className="text-xs font-semibold">{showVectorGrid ? "ON" : "OFF"}</span>
          </button>
        </div>

        <div className="mt-4 rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-xs">
          <p className="font-medium tracking-wide text-zinc-100">Charges: {charges.length}</p>
          <p className="text-zinc-300">Cursor potential V ≈ {cursorPotential.toFixed(3)}</p>
          <p className="mt-1 text-zinc-400">
            Tip: Wheel to zoom; pan with Select-drag, right-drag, or Space-drag.
          </p>
        </div>
      </div>

      <div
        ref={containerRef}
        onPointerDown={handleCanvasPointerDown}
        onPointerUp={() => {
          panStateRef.current = null;
        }}
        onPointerCancel={() => {
          panStateRef.current = null;
        }}
        onWheel={handleCanvasWheel}
        onContextMenu={(event) => event.preventDefault()}
        className="relative h-full w-full overflow-hidden"
        style={{
          backgroundImage:
            "radial-gradient(circle at center, rgba(255,255,255,0.05), transparent 60%), linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "100% 100%, 48px 48px, 48px 48px",
        }}
      >
        <FieldHeatmap
          charges={charges}
          baseBounds={baseBounds}
          zoom={zoom}
          offsetX={offsetX}
          offsetY={offsetY}
          isSimulating={isSimulating}
          opacity={showHeatmap ? 0.9 : 0}
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
        {showEquipotentialLines ? (
          <EquipotentialLinesCanvas
            charges={charges}
            bounds={viewBounds}
            className="pointer-events-none absolute inset-0 h-full w-full"
          />
        ) : null}
        <FieldLinesCanvas
          charges={charges}
          bounds={viewBounds}
          isSimulating={isSimulating}
          isDragging={isDraggingCharge}
          useGradient={showFieldLineGradient}
          mode={fieldLineMode}
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
        {showVectorGrid ? (
          <VectorFieldCanvas
            charges={charges}
            bounds={viewBounds}
            className="pointer-events-none absolute inset-0 h-full w-full"
          />
        ) : null}

        {charges.map((charge) => {
          const screen = worldToScreen(
            charge.position,
            viewBounds,
            size.width,
            size.height,
          );
          const selected = selectedChargeId === charge.id;
          return (
            <button
              key={charge.id}
              type="button"
              onPointerDown={(event) => {
                if (event.button === 2 || isSpacePressedRef.current) {
                  return;
                }
                event.stopPropagation();
                startDrag(charge.id);
              }}
              className={toChargeClass(charge.value, selected)}
              style={{
                left: `${screen.x}px`,
                top: `${screen.y}px`,
                width: `${CHARGE_RADIUS_PX * 2}px`,
                height: `${CHARGE_RADIUS_PX * 2}px`,
              }}
              aria-label={`Charge ${charge.value > 0 ? "positive" : "negative"}`}
              title={`${charge.value > 0 ? "+" : ""}${charge.value.toFixed(2)}q`}
            >
              <span className="text-[10px] font-bold text-black/90">
                {charge.value >= 0 ? "+" : "−"}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
