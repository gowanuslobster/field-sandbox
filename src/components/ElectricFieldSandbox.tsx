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
  FieldSandboxControlPanel,
  type ChargePresetKey,
} from "@/components/FieldSandboxControlPanel";
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

function buildChargePreset(preset: ChargePresetKey): Charge[] {
  switch (preset) {
    case "single_positive":
      return [
        { id: nextChargeId(), position: { x: 0, y: 0 }, value: 1 },
      ];
    case "single_negative":
      return [
        { id: nextChargeId(), position: { x: 0, y: 0 }, value: -1 },
      ];
    case "dipole":
      return [
        { id: nextChargeId(), position: { x: -0.42, y: 0 }, value: 1 },
        { id: nextChargeId(), position: { x: 0.42, y: 0 }, value: -1 },
      ];
    case "quadrupole":
      return [
        { id: nextChargeId(), position: { x: -0.42, y: 0.42 }, value: 1 },
        { id: nextChargeId(), position: { x: 0.42, y: 0.42 }, value: -1 },
        { id: nextChargeId(), position: { x: -0.42, y: -0.42 }, value: -1 },
        { id: nextChargeId(), position: { x: 0.42, y: -0.42 }, value: 1 },
      ];
  }
}

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

/**
 * Composes the main sandbox scene, coordinates the interaction hooks, and
 * passes the current view and source configuration down to the render layers.
 */
export function ElectricFieldSandbox() {
  // Long-lived refs connect the sandbox to child-layer control callbacks and
  // to global pointer/keyboard handlers without forcing rerenders.
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

  // Top-level UI mode changes also update a ref so pointer handlers can read
  // the latest interaction mode outside React's event cycle.
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
    isPanning,
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

  // Keep the interaction hooks synchronized with the latest scene data.
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

  const clearTestParticles = useCallback(() => {
    clearSlingshot();
    particleClearRef.current?.();
    setIsParticleMotionPaused(false);
    setInteractionMode("select");
  }, [clearSlingshot, setInteractionMode]);

  const applyChargePreset = useCallback((preset: ChargePresetKey) => {
    clearTestParticles();
    setCharges(buildChargePreset(preset));
    setSelectedChargeId(null);
    resetView();
  }, [clearTestParticles, resetView]);

  useEffect(() => {
    // Global pointer ownership is routed through the interaction hooks in a
    // fixed order so only one subsystem consumes each move event.
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

    // Drop mode uses pointer down to establish the slingshot anchor before any
    // drag vector exists.
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

  // These screen-space values drive the launch-vector and Ghost Orbit overlay.
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
      // Capture starts the launch interaction before the bubbling handler has a
      // chance to treat the click like a pan or charge-placement event.
      if (hasActiveSlingshot) {
        return;
      }
      initializeDropSlingshot(event.clientX, event.clientY);
    },
    [hasActiveSlingshot, initializeDropSlingshot],
  );

  return (
    <section className="h-dvh w-full bg-[#0F0F0F] text-zinc-100">
      {/* The control panel is a pure UI surface; all scene behavior stays here. */}
      <FieldSandboxControlPanel
        mode={mode}
        selectedCharge={selectedCharge}
        chargesCount={charges.length}
        zoom={zoom}
        fieldLineMode={fieldLineMode}
        showHeatmap={showHeatmap}
        showVectorGrid={showVectorGrid}
        showFieldLineGradient={showFieldLineGradient}
        showEquipotentialLines={showEquipotentialLines}
        contourDensity={contourDensity}
        cursorReadout={cursorReadout}
        particleEnergySnapshot={particleEnergySnapshot}
        testParticleCount={testParticleCount}
        isParticleMotionPaused={isParticleMotionPaused}
        onInteractionModeChange={setInteractionMode}
        onChargePresetApply={applyChargePreset}
        onRemoveSelectedCharge={removeSelectedCharge}
        onClearTestCharges={clearTestParticles}
        onSelectedChargeValueChange={(nextValue) => {
          if (!selectedCharge) {
            return;
          }
          setCharges((current) =>
            current.map((charge) =>
              charge.id === selectedCharge.id
                ? { ...charge, value: nextValue }
                : charge,
            ),
          );
        }}
        onZoomIn={() => zoomByFactor(1.18)}
        onZoomOut={() => zoomByFactor(1 / 1.18)}
        onResetView={resetView}
        onFieldLineModeCycle={() =>
          setFieldLineMode((current) => nextFieldLineMode(current))
        }
        onShowHeatmapChange={() => setShowHeatmap((current) => !current)}
        onShowFieldLineGradientChange={() =>
          setShowFieldLineGradient((current) => !current)
        }
        onShowEquipotentialLinesChange={() =>
          setShowEquipotentialLines((current) => !current)
        }
        onContourDensityChange={setContourDensity}
        onShowVectorGridChange={() => setShowVectorGrid((current) => !current)}
        onParticleMotionPausedToggle={() =>
          setIsParticleMotionPaused((current) => !current)
        }
      />

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
        {/* Each visualization layer renders independently from the same source
            charges and camera bounds so students can mix overlays freely. */}
        <FieldHeatmap
          charges={charges}
          baseBounds={baseBounds}
          zoom={zoom}
          offsetX={offsetX}
          offsetY={offsetY}
          isPanning={isPanning}
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
            isPanning={isPanning}
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
        {/* The SVG layer holds transient teaching overlays such as the launch
            vector and Ghost Orbit guide. */}
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

        {/* Source charges stay as regular buttons because they are the only
            scene objects students can directly drag and edit after placement. */}
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
