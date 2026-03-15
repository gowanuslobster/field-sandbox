# Field Sandbox

Field Sandbox is an interactive 2D electric field and potential visualizer for students who want to experiment with point charges, field structure, and test-particle motion instead of only reading equations.

Open the app, place charges, drag them around, launch test particles, and use the overlays to connect the pictures to the math.

## What You Can Do

### Build and reshape fields
- Add positive and negative source charges.
- Drag existing charges to new positions.
- Remove the selected charge.
- Adjust the selected charge magnitude with the slider in the control panel.

### Read the field visually
- View the scalar potential as a heatmap.
- Toggle the vector grid on and off.
- Switch field lines between `Animated`, `Static`, and `Off`.
- Enable contour-style equipotential overlays.
- Increase or decrease contour density.

### Probe local values
- Drag the slope probe anywhere in the scene.
- Read the local potential `V`.
- Read the local field vector `E` and its magnitude.

### Launch and study test charges
- Use `Drop Test Charge` to place a particle and slingshot it with an initial velocity.
- Watch particle trails over time.
- Monitor the live energy HUD for total, kinetic, and potential energy.
- Use the Ghost Orbit guide to estimate a circular-orbit launch near an attractive source.
  - The guide appears only while the drop tool is active and the pointer is engaged.
  - The ghost arrow is frozen at the initial drop point so you can compare your real drag vector against it.
  - When your launch direction and speed are close enough, the guide turns gold and shows `Stable Orbit Path`.

### Navigate the sandbox
- Zoom with the mouse wheel or the `Zoom In` / `Zoom Out` buttons.
- Reset the camera with `Reset View`.
- Pan with right-drag, `Space` + drag, or Select-mode drag on empty space.

## Quick Start

### Requirements
- Node.js 18+
- npm

### Install and run
```bash
npm install
npm run dev
```

With the current Next.js config, the app is served under:

```text
http://localhost:3000/field-sandbox/
```

## How To Use The App

### 1. Set up charges
Start in `Select / Drag` to inspect the default scene. Add charges with `+ Add Charge` or `- Add Charge`, then drag them to create the configuration you want.

### 2. Turn on the overlays you need
Use the control panel to combine the potential heatmap, vector grid, field lines, and equipotential contours. Different combinations are useful for different questions:
- Heatmap + probe: local potential and gradient intuition
- Field lines + vector grid: direction and flow structure
- Equipotentials + field lines: orthogonality and geometric relationships

### 3. Drop a test charge
Switch to `Drop Test Charge`, click to place a particle, then drag before release to set its initial velocity.

### 4. Use the Ghost Orbit guide
If the drop point is dominated by an attractive source, a dashed guide arrow appears on the overlay:
- It shows the tangential launch direction and speed for a softened circular orbit around the dominant source.
- It is based on the same Plummer-softened force model used by the particle dynamics.
- It stays fixed at the original drop location while you continue dragging.

### 5. Read the energy HUD
After launch, watch the energy panel to see how kinetic and potential energy trade off during motion and how stable the integration remains over time.

## Current Implementation Notes

### Physics and numerics
- Electrostatic potential and field are computed from point charges with configurable softening.
- Test-particle motion uses symplectic Euler-Cromer integration.
- Field-line tracing uses RK4 for smoother streamline generation.
- The Ghost Orbit guide uses the dominant single-source force at the drop point, then computes the softened circular speed from that force and the particle mass.

### Rendering model
- `FieldHeatmap` renders the background scalar field.
- `FieldLinesCanvas`, `VectorFieldCanvas`, and `ParticlesCanvas` render dynamic overlays.
- The slingshot preview, probe arrow, and Ghost Orbit guide are drawn on the SVG interaction layer in the main sandbox component.

### Main files
- [`src/components/ElectricFieldSandbox.tsx`](src/components/ElectricFieldSandbox.tsx): top-level interaction model, control panel, and overlay composition
- [`src/components/FieldHeatmap.tsx`](src/components/FieldHeatmap.tsx): potential heatmap and contour rendering
- [`src/components/FieldLinesCanvas.tsx`](src/components/FieldLinesCanvas.tsx): streamline rendering and animation
- [`src/components/VectorFieldCanvas.tsx`](src/components/VectorFieldCanvas.tsx): sampled field-vector grid
- [`src/components/ParticlesCanvas.tsx`](src/components/ParticlesCanvas.tsx): test-particle simulation and trail rendering
- [`src/physics/electrostatics.ts`](src/physics/electrostatics.ts): potential and electric field calculations
- [`src/physics/dynamics.ts`](src/physics/dynamics.ts): particle dynamics, energy utilities, and Ghost Orbit helper math
- [`src/physics/streamlines.ts`](src/physics/streamlines.ts): RK4 streamline tracing

## Development

### Useful commands
```bash
npm run dev
npm run lint
npm test
```

### Project configuration
- Next.js uses `basePath: "/field-sandbox"` and `trailingSlash: true`.
- The app is configured for static export output.
- Path aliases use `@` for `src/`.

## Notes On README Scope

This README is intentionally user-first:
- The top half explains what the app can do and how to use it.
- The lower sections document the current architecture and developer entry points.

If you change user-facing controls, overlays, or simulation behavior, update this README before adding more implementation detail.
