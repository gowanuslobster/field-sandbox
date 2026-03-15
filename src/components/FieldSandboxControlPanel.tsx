"use client";

import type { FieldLineRenderMode } from "@/components/FieldLinesCanvas";
import type { CursorReadout } from "@/components/useCursorReadout";
import type { ParticleEnergySnapshot } from "@/components/ParticlesCanvas";
import type { Charge } from "@/physics/types";

type InteractionMode =
  | "select"
  | "add_positive"
  | "add_negative"
  | "drop_test_charge";

type FieldSandboxControlPanelProps = {
  mode: InteractionMode;
  selectedCharge: Charge | null;
  chargesCount: number;
  zoom: number;
  fieldLineMode: FieldLineRenderMode;
  showHeatmap: boolean;
  showVectorGrid: boolean;
  showFieldLineGradient: boolean;
  showEquipotentialLines: boolean;
  contourDensity: number;
  cursorReadout: CursorReadout | null;
  particleEnergySnapshot: ParticleEnergySnapshot | null;
  testParticleCount: number;
  isParticleMotionPaused: boolean;
  onInteractionModeChange: (mode: InteractionMode) => void;
  onRemoveSelectedCharge: () => void;
  onClearTestCharges: () => void;
  onSelectedChargeValueChange: (value: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  onFieldLineModeCycle: () => void;
  onShowHeatmapChange: () => void;
  onShowFieldLineGradientChange: () => void;
  onShowEquipotentialLinesChange: () => void;
  onContourDensityChange: (value: number) => void;
  onShowVectorGridChange: () => void;
  onParticleMotionPausedToggle: () => void;
};

/**
 * Renders the sandbox control overlay while leaving interaction state and
 * simulation behavior owned by the top-level sandbox component.
 */
export function FieldSandboxControlPanel({
  mode,
  selectedCharge,
  chargesCount,
  zoom,
  fieldLineMode,
  showHeatmap,
  showVectorGrid,
  showFieldLineGradient,
  showEquipotentialLines,
  contourDensity,
  cursorReadout,
  particleEnergySnapshot,
  testParticleCount,
  isParticleMotionPaused,
  onInteractionModeChange,
  onRemoveSelectedCharge,
  onClearTestCharges,
  onSelectedChargeValueChange,
  onZoomIn,
  onZoomOut,
  onResetView,
  onFieldLineModeCycle,
  onShowHeatmapChange,
  onShowFieldLineGradientChange,
  onShowEquipotentialLinesChange,
  onContourDensityChange,
  onShowVectorGridChange,
  onParticleMotionPausedToggle,
}: FieldSandboxControlPanelProps) {
  return (
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
          onClick={() => onInteractionModeChange("select")}
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
          onClick={() => onInteractionModeChange("add_positive")}
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
          onClick={() => onInteractionModeChange("add_negative")}
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
          onClick={onRemoveSelectedCharge}
          className="rounded-md bg-rose-400/20 px-3 py-2 text-sm text-rose-100 transition-colors duration-200 hover:bg-rose-400/35"
        >
          Remove Selected
        </button>
        <button
          type="button"
          onClick={() => onInteractionModeChange("drop_test_charge")}
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
          onClick={onClearTestCharges}
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
            onChange={(event) =>
              onSelectedChargeValueChange(Number.parseFloat(event.currentTarget.value))
            }
            className="mt-2 w-full accent-cyan-300"
            aria-label="Selected charge magnitude slider"
          />
        </div>
      ) : null}

      <div className="mt-2 grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={onZoomIn}
          className="rounded-md bg-indigo-300/85 px-2 py-2 text-xs font-medium text-black shadow-[0_0_14px_rgba(129,140,248,0.45)] transition-colors duration-200 hover:bg-indigo-200"
        >
          Zoom In
        </button>
        <button
          type="button"
          onClick={onZoomOut}
          className="rounded-md bg-indigo-400/25 px-2 py-2 text-xs font-medium text-indigo-100 transition-colors duration-200 hover:bg-indigo-400/38"
        >
          Zoom Out
        </button>
        <button
          type="button"
          onClick={onResetView}
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
          onClick={onFieldLineModeCycle}
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
          onClick={onShowHeatmapChange}
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
          onClick={onShowFieldLineGradientChange}
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
          onClick={onShowEquipotentialLinesChange}
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
              onContourDensityChange(Number.parseFloat(event.currentTarget.value))
            }
            className="mt-2 w-full accent-sky-300"
            aria-label="Contour Density slider"
          />
        </div>
        <button
          type="button"
          onClick={onShowVectorGridChange}
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
            onClick={onParticleMotionPausedToggle}
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
        <p className="font-medium tracking-wide text-zinc-100">Charges: {chargesCount}</p>
        <p className="text-zinc-300">Test Particles: {testParticleCount}</p>
        <p className="mt-1 text-zinc-400">
          Tip: Wheel to zoom; pan with Select-drag/right-drag/Space-drag; drag a
          test particle to slingshot.
        </p>
      </div>
    </div>
  );
}
