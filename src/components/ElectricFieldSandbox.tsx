"use client";

import {
  type PointerEvent as ReactPointerEvent,
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
import { worldToScreen, screenToWorld } from "@/physics/world-space";

type Mode = "select" | "add_positive" | "add_negative";

const CHARGE_RADIUS_PX = 13;

const INITIAL_CHARGES: Charge[] = [
  { id: "q1", position: { x: -0.72, y: 0 }, value: 1.15 },
  { id: "q2", position: { x: 0.72, y: 0 }, value: -1.15 },
  { id: "q3", position: { x: 0, y: 0.62 }, value: 0.55 },
];

function nextChargeId(): string {
  return `q-${Math.random().toString(36).slice(2, 10)}`;
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
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showVectorGrid, setShowVectorGrid] = useState(true);
  const [showFieldLineGradient, setShowFieldLineGradient] = useState(false);
  const [showEquipotentialLines, setShowEquipotentialLines] = useState(false);
  const [fieldLineMode, setFieldLineMode] =
    useState<FieldLineRenderMode>("animated_dashes");

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

  const bounds = useMemo<WorldBounds>(() => {
    const aspect = size.width / Math.max(size.height, 1);
    const halfY = 1.12;
    const halfX = halfY * aspect;
    return { minX: -halfX, maxX: halfX, minY: -halfY, maxY: halfY };
  }, [size]);

  useEffect(() => {
    chargesRef.current = charges;
  }, [charges]);

  useEffect(() => {
    boundsRef.current = bounds;
  }, [bounds]);

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

  const startDrag = (chargeId: string) => {
    dragStateRef.current = { chargeId };
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
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [getWorldFromClientPoint]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Delete" || event.key === "Backspace") {
        removeSelectedCharge();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [removeSelectedCharge]);

  const handleCanvasClick = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (mode === "select") {
      setSelectedChargeId(null);
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

        <p className="mt-4 text-[11px] font-medium uppercase tracking-[0.15em] text-zinc-400">
          Visualization Layers
        </p>
        <div className="mt-2 space-y-2">
          <button
            type="button"
            onClick={() =>
              setFieldLineMode((current) =>
                current === "animated_dashes" ? "static_arrows" : "animated_dashes",
              )
            }
            className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm transition-all duration-200 ${
              fieldLineMode === "animated_dashes"
                ? "bg-violet-300/85 text-black shadow-[0_0_14px_rgba(196,181,253,0.45)]"
                : "bg-violet-400/20 text-violet-100 hover:bg-violet-400/35"
            }`}
          >
            <span>Field Line Mode</span>
            <span className="text-xs font-semibold">
              {fieldLineMode === "animated_dashes"
                ? "Animated"
                : "Static Arrows"}
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
            Tip: Drag glowing charges or switch interaction modes.
          </p>
        </div>
      </div>

      <div
        ref={containerRef}
        onPointerDown={handleCanvasClick}
        className="relative h-full w-full overflow-hidden"
        style={{
          backgroundImage:
            "radial-gradient(circle at center, rgba(255,255,255,0.05), transparent 60%), linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "100% 100%, 48px 48px, 48px 48px",
        }}
      >
        <FieldHeatmap
          charges={charges}
          bounds={bounds}
          opacity={showHeatmap ? 0.9 : 0}
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
        {showEquipotentialLines ? (
          <EquipotentialLinesCanvas
            charges={charges}
            bounds={bounds}
            className="pointer-events-none absolute inset-0 h-full w-full"
          />
        ) : null}
        <FieldLinesCanvas
          charges={charges}
          bounds={bounds}
          useGradient={showFieldLineGradient}
          mode={fieldLineMode}
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
        {showVectorGrid ? (
          <VectorFieldCanvas
            charges={charges}
            bounds={bounds}
            className="pointer-events-none absolute inset-0 h-full w-full"
          />
        ) : null}

        {charges.map((charge) => {
          const screen = worldToScreen(charge.position, bounds, size.width, size.height);
          const selected = selectedChargeId === charge.id;
          return (
            <button
              key={charge.id}
              type="button"
              onPointerDown={(event) => {
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
