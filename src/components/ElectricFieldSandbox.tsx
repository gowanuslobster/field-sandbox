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
import { useChargeDragging } from "@/components/useChargeDragging";
import { useCursorReadout } from "@/components/useCursorReadout";
import { useSandboxCamera } from "@/components/useSandboxCamera";
import {
  useSlingshotInteraction,
} from "@/components/useSlingshotInteraction";
import {
  FieldLinesCanvas,
  type FieldLineRenderMode,
} from "@/components/FieldLinesCanvas";
import {
  ParticlesCanvas,
  type ParticleEnergySnapshot,
  type ParticlesController,
} from "@/components/ParticlesCanvas";
import { VectorFieldCanvas } from "@/components/VectorFieldCanvas";
import {
  isGhostOrbitMatch,
} from "@/physics/dynamics";
import type { Charge } from "@/physics/types";
import type { Vector2Like } from "@/physics/vector2d";
import { getViewBounds, worldToScreen } from "@/physics/world-space";

type Mode = "select" | "add_positive" | "add_negative" | "drop_test_charge";

const CHARGE_RADIUS_PX = 13;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 6.5;
const SLINGSHOT_DRAG_TO_VELOCITY = 4.8;

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
  const particleSpawnerRef = useRef<
    ((position: Vector2Like) => { id: string; pos: Vector2Like; vel: Vector2Like }) | null
  >(null);
  const particleClearRef = useRef<(() => void) | null>(null);
  const particleLaunchRef = useRef<
    ((id: string, velocity: Vector2Like) => void) | null
  >(null);
  const isSpacePressedRef = useRef(false);
  const modeRef = useRef<Mode>("select");
  const chargesRef = useRef(INITIAL_CHARGES);

  const [mode, setMode] = useState<Mode>("select");
  const [charges, setCharges] = useState<Charge[]>(INITIAL_CHARGES);
  const [selectedChargeId, setSelectedChargeId] = useState<string | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showVectorGrid, setShowVectorGrid] = useState(true);
  const [showFieldLineGradient, setShowFieldLineGradient] = useState(false);
  const [showEquipotentialLines, setShowEquipotentialLines] = useState(false);
  const [contourDensity, setContourDensity] = useState(1.3);
  const [fieldLineMode, setFieldLineMode] =
    useState<FieldLineRenderMode>("static_arrows");
  const [testParticleCount, setTestParticleCount] = useState(0);
  const [particleEnergySnapshot, setParticleEnergySnapshot] =
    useState<ParticleEnergySnapshot | null>(null);
  const [isParticleMotionPaused, setIsParticleMotionPaused] = useState(false);
  const setInteractionMode = useCallback((nextMode: Mode) => {
    modeRef.current = nextMode;
    setMode(nextMode);
  }, []);
  const handleParticleControllerReady = useCallback(
    (controller: ParticlesController | null) => {
      particleSpawnerRef.current = controller?.spawn ?? null;
      particleClearRef.current = controller?.clear ?? null;
      particleLaunchRef.current = controller?.launch ?? null;
    },
    [],
  );
  const handleParticleCountChange = useCallback((count: number) => {
    setTestParticleCount(count);
    if (count === 0) {
      setIsParticleMotionPaused(false);
    }
  }, []);
  const {
    size,
    zoom,
    offsetX,
    offsetY,
    baseBounds,
    viewBounds,
    getWorldFromClientPoint,
    beginPan,
    maybeStartImplicitPan,
    handleGlobalPointerMove: handlePanPointerMove,
    endPan,
    handleWheelZoom,
    zoomByFactor,
    resetView,
  } = useSandboxCamera({
    containerRef,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
  });
  const selectedCharge = useMemo(
    () => charges.find((charge) => charge.id === selectedChargeId) ?? null,
    [charges, selectedChargeId],
  );
  const contourInterval = useMemo(
    () => 1 / Math.max(0.35, contourDensity),
    [contourDensity],
  );
  const particleDespawnBounds = useMemo(
    () => getViewBounds(baseBounds, { zoom: MIN_ZOOM, offsetX, offsetY }),
    [baseBounds, offsetX, offsetY],
  );

  useEffect(() => {
    chargesRef.current = charges;
  }, [charges]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // Charge dragging is handled as its own interaction subsystem so pointermove
  // events can be batched before committing charge-position state.
  const {
    isDraggingCharge,
    startChargeDrag,
    handleGlobalPointerMove: handleChargeDragPointerMove,
    handleGlobalPointerUp: handleChargeDragPointerUp,
  } = useChargeDragging({
    getWorldFromClientPoint,
    setCharges,
    setSelectedChargeId,
    setInteractionMode,
  });
  // Slingshot interaction now only applies at particle creation time.
  const {
    hasActiveSlingshot,
    slingshotPreview,
    initializeDropSlingshot,
    handleGlobalPointerMove: handleSlingshotPointerMove,
    handleGlobalPointerUp: handleSlingshotPointerUp,
    clearSlingshot,
  } = useSlingshotInteraction({
    getWorldFromClientPoint,
    chargesRef,
    modeRef,
    particleSpawnerRef,
    particleLaunchRef,
    dragToVelocityScale: SLINGSHOT_DRAG_TO_VELOCITY,
  });
  // Cursor hover readout is batched so field sampling does not commit React
  // state on every raw pointer event.
  const {
    cursorReadout,
    handleGlobalPointerMove: handleCursorReadoutPointerMove,
    clearCursorReadout,
  } = useCursorReadout({
    getWorldFromClientPoint,
    chargesRef,
  });

  const isSimulating =
    isDraggingCharge ||
    fieldLineMode === "animated_dashes" ||
    testParticleCount > 0;
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
      maybeStartImplicitPan(
        event,
        !isDraggingCharge && !hasActiveSlingshot,
        isSpacePressedRef.current,
      );

      if (handlePanPointerMove(event)) {
        return;
      }

      if (handleChargeDragPointerMove(event)) {
        return;
      }

      if (handleSlingshotPointerMove(event)) {
        return;
      }

      handleCursorReadoutPointerMove(event);
    };

    const onPointerUp = () => {
      handleSlingshotPointerUp();
      handleChargeDragPointerUp();
      endPan();
    };

    const onPointerLeaveWindow = () => {
      clearCursorReadout();
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("blur", onPointerLeaveWindow);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("blur", onPointerLeaveWindow);
    };
  }, [
    handleChargeDragPointerMove,
    handleChargeDragPointerUp,
    handlePanPointerMove,
    handleCursorReadoutPointerMove,
    handleSlingshotPointerMove,
    handleSlingshotPointerUp,
    hasActiveSlingshot,
    isDraggingCharge,
    maybeStartImplicitPan,
    endPan,
    clearCursorReadout,
  ]);

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
    const interactionMode = modeRef.current;
    if (interactionMode === "drop_test_charge" && event.button === 0) {
      if (!hasActiveSlingshot) {
        initializeDropSlingshot(event.clientX, event.clientY);
      }
      return;
    }

    const shouldPan =
      event.button === 2 ||
      (event.button === 0 &&
        (isSpacePressedRef.current || interactionMode === "select"));
    if (shouldPan) {
      event.preventDefault();
      setSelectedChargeId(null);
      beginPan(event.clientX, event.clientY);
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

    const value = interactionMode === "add_positive" ? 1 : -1;
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
    handleWheelZoom(event.clientX, event.clientY, event.deltaY);
  };

  const slingshotOriginScreen = slingshotPreview
    ? worldToScreen(slingshotPreview.origin, viewBounds, size.width, size.height)
    : null;
  const slingshotCursorScreen = slingshotPreview
    ? worldToScreen(slingshotPreview.cursor, viewBounds, size.width, size.height)
    : null;
  const slingshotDx =
    slingshotOriginScreen && slingshotCursorScreen
      ? slingshotCursorScreen.x - slingshotOriginScreen.x
      : 0;
  const slingshotDy =
    slingshotOriginScreen && slingshotCursorScreen
      ? slingshotCursorScreen.y - slingshotOriginScreen.y
      : 0;
  const slingshotLength = Math.hypot(slingshotDx, slingshotDy);
  const slingshotUx = slingshotLength > 1e-6 ? slingshotDx / slingshotLength : 0;
  const slingshotUy = slingshotLength > 1e-6 ? slingshotDy / slingshotLength : 0;
  const plannedVelocityMagnitude = slingshotPreview
    ? Math.hypot(
        slingshotPreview.plannedVelocity.x,
        slingshotPreview.plannedVelocity.y,
      )
    : 0;
  const ghostOrbitSuggestion =
    mode === "drop_test_charge" ? slingshotPreview?.ghostSuggestion ?? null : null;
  const ghostOrbitMatch =
    slingshotPreview && ghostOrbitSuggestion
      ? isGhostOrbitMatch(
          slingshotPreview.plannedVelocity,
          ghostOrbitSuggestion.targetVelocity,
        )
      : false;
  const ghostArrowWorldEnd =
    slingshotPreview && ghostOrbitSuggestion
        ? {
          x:
            slingshotPreview.ghostAnchor.x +
            ghostOrbitSuggestion.targetVelocity.x / SLINGSHOT_DRAG_TO_VELOCITY,
          y:
            slingshotPreview.ghostAnchor.y +
            ghostOrbitSuggestion.targetVelocity.y / SLINGSHOT_DRAG_TO_VELOCITY,
        }
      : null;
  const ghostArrowStartScreen =
    slingshotPreview && ghostOrbitSuggestion
      ? worldToScreen(
          slingshotPreview.ghostAnchor,
          viewBounds,
          size.width,
          size.height,
        )
      : null;
  const ghostArrowEndScreen =
    ghostArrowWorldEnd && ghostOrbitSuggestion
      ? worldToScreen(ghostArrowWorldEnd, viewBounds, size.width, size.height)
      : null;
  const ghostArrowDx =
    ghostArrowStartScreen && ghostArrowEndScreen
      ? ghostArrowEndScreen.x - ghostArrowStartScreen.x
      : 0;
  const ghostArrowDy =
    ghostArrowStartScreen && ghostArrowEndScreen
      ? ghostArrowEndScreen.y - ghostArrowStartScreen.y
      : 0;
  const ghostArrowLength = Math.hypot(ghostArrowDx, ghostArrowDy);
  const ghostArrowUx = ghostArrowLength > 1e-6 ? ghostArrowDx / ghostArrowLength : 0;
  const ghostArrowUy = ghostArrowLength > 1e-6 ? ghostArrowDy / ghostArrowLength : 0;
  const ghostArrowColor = ghostOrbitMatch
    ? "rgba(255, 214, 92, 0.98)"
    : "rgba(159, 247, 255, 0.62)";
  const ghostArrowGlowColor = ghostOrbitMatch
    ? "rgba(255, 214, 92, 0.42)"
    : "rgba(159, 247, 255, 0.18)";

  const handleCanvasPointerDownCapture = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || modeRef.current !== "drop_test_charge") {
        return;
      }
      if (hasActiveSlingshot) {
        return;
      }
      initializeDropSlingshot(event.clientX, event.clientY);
    },
    [hasActiveSlingshot, initializeDropSlingshot],
  );

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
            onClick={() => setInteractionMode("select")}
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
            onClick={() => setInteractionMode("add_positive")}
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
            onClick={() => setInteractionMode("add_negative")}
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
          <button
            type="button"
            onClick={() => setInteractionMode("drop_test_charge")}
            className={`col-span-2 rounded-md px-3 py-2 text-sm transition-all duration-200 ${
              mode === "drop_test_charge"
                ? "bg-amber-200 text-black shadow-[0_0_20px_rgba(255,226,153,0.42)]"
                : "bg-amber-300/20 text-amber-100 hover:bg-amber-300/35"
            }`}
          >
            + Drop Test Charge
          </button>
          <button
            type="button"
            onClick={() => {
              clearSlingshot();
              particleClearRef.current?.();
              setIsParticleMotionPaused(false);
              setInteractionMode("select");
            }}
            className="col-span-2 rounded-md bg-cyan-300/20 px-3 py-2 text-sm text-cyan-100 transition-colors duration-200 hover:bg-cyan-300/35"
          >
            Clear Test Charges
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
            onClick={() => setFieldLineMode((current) => nextFieldLineMode(current))}
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
          <div className="rounded-lg border border-sky-200/20 bg-sky-950/20 px-3 py-2">
            <div className="flex items-center justify-between text-xs text-sky-100">
              <span>Contour Density</span>
              <span className="font-semibold">{contourDensity.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min={0.6}
              max={3.4}
              step={0.1}
              value={contourDensity}
              onChange={(event) =>
                setContourDensity(Number.parseFloat(event.currentTarget.value))
              }
              className="mt-2 w-full accent-sky-300"
              aria-label="Contour Density slider"
            />
          </div>
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

        <div className="mt-4 rounded-lg border border-cyan-200/20 bg-cyan-950/20 px-3 py-2 text-xs">
          <p className="font-medium uppercase tracking-[0.15em] text-cyan-100/85">
            Field Strength Readout
          </p>
          {cursorReadout ? (
            <div className="mt-2 space-y-1 text-cyan-100">
              <p>
                V: <span className="font-semibold">{cursorReadout.potential.toFixed(3)}</span>
              </p>
              <p>
                E:{" "}
                <span className="font-semibold">
                  ({cursorReadout.field.x.toFixed(3)}, {cursorReadout.field.y.toFixed(3)}) | |E|{" "}
                  {cursorReadout.field.magnitude().toFixed(3)}
                </span>
              </p>
              <p>
                (x, y):{" "}
                <span className="font-semibold">
                  ({cursorReadout.position.x.toFixed(3)}, {cursorReadout.position.y.toFixed(3)})
                </span>
              </p>
            </div>
          ) : (
            <p className="mt-2 text-cyan-100/80">
              Move the cursor over the field to inspect local potential and force.
            </p>
          )}
        </div>
        <div className="mt-3 rounded-lg border border-amber-200/20 bg-amber-950/20 px-3 py-2 text-xs">
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium uppercase tracking-[0.15em] text-amber-100/85">
              Energy Readout
            </p>
            <button
              type="button"
              onClick={() => setIsParticleMotionPaused((current) => !current)}
              disabled={testParticleCount === 0}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors duration-200 ${
                testParticleCount === 0
                  ? "cursor-not-allowed bg-amber-100/10 text-amber-100/35"
                  : "bg-amber-200/20 text-amber-100 hover:bg-amber-200/35"
              }`}
            >
              {isParticleMotionPaused ? "Resume" : "Pause"}
            </button>
          </div>
          {particleEnergySnapshot ? (
            <div className="mt-2 space-y-1 text-amber-100">
              <p>
                Tracked:{" "}
                <span className="font-semibold">{particleEnergySnapshot.particleId}</span>
              </p>
              <p>
                E = KE + PE:{" "}
                <span className="font-semibold">
                  {particleEnergySnapshot.totalEnergy.toFixed(2)}
                </span>
              </p>
              <p>
                KE / PE:{" "}
                <span className="font-semibold">
                  {particleEnergySnapshot.kineticEnergy.toFixed(2)} /{" "}
                  {particleEnergySnapshot.potentialEnergy.toFixed(2)}
                </span>
              </p>
              <p>
                Energy conservation violation:{" "}
                <span className="font-semibold">
                  {particleEnergySnapshot.driftPercent >= 0 ? "+" : ""}
                  {particleEnergySnapshot.driftPercent.toFixed(2)}%
                </span>
              </p>
              <p className="text-amber-100/80">
                Small nonzero values come from imperfect trajectory simulation.
              </p>
              {isParticleMotionPaused ? (
                <p className="text-amber-100/80">Particle motion is currently paused.</p>
              ) : null}
            </div>
          ) : (
            <p className="mt-2 text-amber-100/80">Drop a test particle to monitor KE + PE.</p>
          )}
        </div>

        <div className="mt-4 rounded-lg border border-white/10 bg-black/35 px-3 py-2 text-xs">
          <p className="font-medium tracking-wide text-zinc-100">Charges: {charges.length}</p>
          <p className="text-zinc-300">Test Particles: {testParticleCount}</p>
          <p className="mt-1 text-zinc-400">
            Tip: Wheel to zoom; pan with Select-drag/right-drag/Space-drag; drag a
            test particle to slingshot.
          </p>
        </div>
      </div>

      <div
        ref={containerRef}
        onPointerDownCapture={handleCanvasPointerDownCapture}
        onPointerDown={handleCanvasPointerDown}
        onPointerLeave={clearCursorReadout}
        onPointerUp={endPan}
        onPointerCancel={endPan}
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
          contourInterval={contourInterval}
          contourOpacity={showEquipotentialLines ? 0.92 : 0}
          opacity={showHeatmap ? 0.9 : 0}
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
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
        <ParticlesCanvas
          charges={charges}
          bounds={viewBounds}
          despawnBounds={particleDespawnBounds}
          isSimulating={isSimulating}
          isPaused={isParticleMotionPaused}
          onControllerReady={handleParticleControllerReady}
          onParticleCountChange={handleParticleCountChange}
          onEnergySnapshotChange={setParticleEnergySnapshot}
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
        <svg className="pointer-events-none absolute inset-0 h-full w-full">
          {ghostArrowStartScreen && ghostArrowEndScreen ? (
            <>
              <line
                x1={ghostArrowStartScreen.x}
                y1={ghostArrowStartScreen.y}
                x2={ghostArrowEndScreen.x}
                y2={ghostArrowEndScreen.y}
                stroke={ghostArrowGlowColor}
                strokeWidth={ghostOrbitMatch ? "8" : "5"}
                strokeLinecap="round"
              />
              <line
                x1={ghostArrowStartScreen.x}
                y1={ghostArrowStartScreen.y}
                x2={ghostArrowEndScreen.x}
                y2={ghostArrowEndScreen.y}
                stroke={ghostArrowColor}
                strokeWidth={ghostOrbitMatch ? "3.6" : "2.4"}
                strokeLinecap="round"
                strokeDasharray="8 7"
              />
              <line
                x1={ghostArrowEndScreen.x}
                y1={ghostArrowEndScreen.y}
                x2={
                  ghostArrowEndScreen.x -
                  ghostArrowUx * 10 -
                  ghostArrowUy * 5.5
                }
                y2={
                  ghostArrowEndScreen.y -
                  ghostArrowUy * 10 +
                  ghostArrowUx * 5.5
                }
                stroke={ghostArrowColor}
                strokeWidth={ghostOrbitMatch ? "3.2" : "2.4"}
                strokeLinecap="round"
              />
              <line
                x1={ghostArrowEndScreen.x}
                y1={ghostArrowEndScreen.y}
                x2={
                  ghostArrowEndScreen.x -
                  ghostArrowUx * 10 +
                  ghostArrowUy * 5.5
                }
                y2={
                  ghostArrowEndScreen.y -
                  ghostArrowUy * 10 -
                  ghostArrowUx * 5.5
                }
                stroke={ghostArrowColor}
                strokeWidth={ghostOrbitMatch ? "3.2" : "2.4"}
                strokeLinecap="round"
              />
              {ghostOrbitMatch ? (
                <>
                  <rect
                    x={ghostArrowEndScreen.x + 12}
                    y={ghostArrowEndScreen.y - 26}
                    width={118}
                    height={20}
                    rx={5}
                    fill="rgba(26, 17, 0, 0.78)"
                    stroke="rgba(255, 214, 92, 0.72)"
                    strokeWidth="1"
                  />
                  <text
                    x={ghostArrowEndScreen.x + 20}
                    y={ghostArrowEndScreen.y - 12}
                    fill="rgba(255, 238, 179, 0.98)"
                    fontSize="12"
                    fontWeight="700"
                  >
                    Stable Orbit Path
                  </text>
                </>
              ) : null}
            </>
          ) : null}
          {slingshotOriginScreen && slingshotCursorScreen ? (
            <>
              <line
                x1={slingshotOriginScreen.x}
                y1={slingshotOriginScreen.y}
                x2={slingshotCursorScreen.x}
                y2={slingshotCursorScreen.y}
                stroke="rgba(255, 247, 122, 0.98)"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
              <line
                x1={slingshotCursorScreen.x}
                y1={slingshotCursorScreen.y}
                x2={
                  slingshotCursorScreen.x -
                  slingshotUx * 9 -
                  slingshotUy * 5
                }
                y2={
                  slingshotCursorScreen.y -
                  slingshotUy * 9 +
                  slingshotUx * 5
                }
                stroke="rgba(255, 247, 122, 0.98)"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <line
                x1={slingshotCursorScreen.x}
                y1={slingshotCursorScreen.y}
                x2={
                  slingshotCursorScreen.x -
                  slingshotUx * 9 +
                  slingshotUy * 5
                }
                y2={
                  slingshotCursorScreen.y -
                  slingshotUy * 9 -
                  slingshotUx * 5
                }
                stroke="rgba(255, 247, 122, 0.98)"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <rect
                x={(slingshotOriginScreen.x + slingshotCursorScreen.x) * 0.5 + 4}
                y={(slingshotOriginScreen.y + slingshotCursorScreen.y) * 0.5 - 22}
                width={90}
                height={18}
                rx={4}
                fill="rgba(2, 10, 16, 0.75)"
                stroke="rgba(255, 247, 122, 0.55)"
                strokeWidth="1"
              />
              <text
                x={(slingshotOriginScreen.x + slingshotCursorScreen.x) * 0.5 + 10}
                y={(slingshotOriginScreen.y + slingshotCursorScreen.y) * 0.5 - 8}
                fill="rgba(255, 252, 198, 0.98)"
                fontSize="12"
                fontWeight="700"
              >
                v: {plannedVelocityMagnitude.toFixed(2)}
              </text>
            </>
          ) : null}
        </svg>

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
                if (modeRef.current === "drop_test_charge") {
                  return;
                }
                event.stopPropagation();
                startChargeDrag(charge.id);
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
