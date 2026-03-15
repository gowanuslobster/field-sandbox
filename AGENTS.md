# AGENTS.md

## Overview

This is **Field Sandbox** — an interactive 2D electric-field and potential visualizer for students exploring:

- static source-charge configurations
- local field and potential structure
- test-particle motion in a fixed field
- the relationship between geometry, energy, and force

The app is a self-contained **Next.js + TypeScript** frontend. There is no backend, database, or Docker setup involved in normal development.

## Runbook

- **Dev server:** `npm run dev`
- **Lint:** `npm run lint`
- **Tests:** `npm test`
- **Build:** `npm run build`

With the current config, local development is served under:

- `http://localhost:3000/field-sandbox/`

## Actual stack and architecture

- **Framework:** Next.js 15 (App Router) + TypeScript
- **Background field layer:** WebGL2 shader in [`src/components/FieldHeatmap.tsx`](src/components/FieldHeatmap.tsx)
- **Dynamic overlays:** HTML canvas layers for field lines, vector field, and particles
- **Physics core:** custom electrostatics, streamline, and particle-dynamics utilities under [`src/physics/`](src/physics/)

Important note:
- Do not assume Shadcn UI, Framer Motion, or a generic design system is present.
- Most interaction logic is custom and performance-sensitive.

## Physics and numerics rules

- **Particle integration:** keep test-particle motion on the existing symplectic Euler-Cromer path unless the user explicitly requests a different integrator.
- **Field-line tracing:** keep RK4-based streamline tracing for visual stability near strong gradients and near-source regions.
- **Vector math:** prefer the existing `Vector2D` / `Vector2Like` patterns rather than ad hoc coordinate math when shared vector behavior is needed.
- **Numerics:** prefer stable stepping, singularity guards, and predictable behavior over clever but fragile micro-optimizations.
- **Visual approximations:** if a rendering heuristic is not a literal physics quantity, label it clearly in code comments.

## Preferred engineering style for this repo

### Refactoring approach

- Prefer small, reviewable refactors over large rewrites.
- Work one file at a time when practical, especially for readability and documentation cleanup.
- First separate mixed concerns into named hooks, helpers, or presentational components before adding lots of commentary.
- Prefer extracting coherent units such as:
  - interaction hooks
  - pure geometry/physics helpers
  - small canvas/render helpers
  - control-panel components
- Keep behavior stable unless the user explicitly asks for behavior changes.

### Naming conventions

- Prefer names that reflect the conceptual role of the code, not just the implementation detail.
- Name coordinate spaces and units explicitly where helpful: `world`, `screen`, `bounds`, `zoom`, `offset`, `progress`, `potential`, `field`.
- In UI code, prefer names that match the user-visible concept:
  - `Field Strength Readout`
  - `Energy Readout`
  - `Charge Preset`
- Avoid vague names like `data`, `helper`, `temp2`, or `misc`.
- Keep naming families consistent within a file once a pattern is established.

### Performance-sensitive UI work

- Treat pointer-driven interactions as performance-critical.
- Be cautious about pushing raw `pointermove` events straight into React state.
- Prefer:
  - refs for live interaction state
  - `requestAnimationFrame` batching for drag/pan updates
  - on-demand rendering for canvas layers where possible
- When optimizing, prefer temporary quality reductions only during active interaction, with immediate full-quality restoration on release.
- Avoid degrading visuals more than necessary. Favor subtle reductions over obvious flicker or disappearing layers.

### Comments and docstrings

- Write comments for another developer who may be smart but new to the codebase or less familiar with the physics.
- Aim for **beginner-friendly but not overkill** comments.
- Prefer short docstrings/comments that explain:
  - what a helper or hook is for
  - why a non-obvious block exists
  - what ownership a state/ref has
  - what is approximate versus physically literal
- Add comments especially in:
  - interaction routing
  - pointer/drag/pan logic
  - animation and render scheduling
  - field-line heuristics
  - energy or numerical-stability logic
  - world/screen transform code
- Do not narrate obvious syntax or restate a clear function name.
- Prefer stable explanations over change-log style comments like `NEW`, `FIXME` used as history, or implementation diary notes.
- When comments sit directly above function/type declarations, prefer coherent `/** ... */` doc comments instead of stacking `//` plus doc-comment blocks for the same idea.
- For JSX-heavy sections, comment larger structural blocks rather than individual tags.

### Comment examples

- Good helper docstring: `/** Advances the animated flow particles, scaling their speed by the local field strength so stronger regions feel more active. */`
- Good state comment: `// Cursor hover readout is batched so field sampling does not commit React state on every raw pointer event.`
- Good JSX block comment: `/* The control panel is a pure UI surface; all scene behavior stays here. */`

### Documentation consistency

- If a file has been substantially refactored, do a short consistency pass so comments/docstrings across nearby files feel similar in tone and depth.
- Favor comments that explain intent, constraints, or mental model over comments that enumerate every branch.
- If user-facing behavior changes, update [`README.md`](README.md) in the same pass.

## Verification habits

- Prefer targeted checks first after focused changes:
  - `npx eslint <touched-files>`
  - `npm test`
- Prefer targeted lint on touched files before full lint when repo-wide issues are possible.
- For interaction or rendering changes, do a real manual browser check and report what was verified.
- If the app appears blank after a refactor, first suspect a compile-time error and check lint/build/dev-server output before deeper runtime debugging.

## Current architecture guidance

- [`src/components/ElectricFieldSandbox.tsx`](src/components/ElectricFieldSandbox.tsx) is the top-level composition layer.
- [`src/components/FieldSandboxControlPanel.tsx`](src/components/FieldSandboxControlPanel.tsx) is the floating UI panel.
- Interaction-heavy behavior is intentionally split into hooks such as:
  - [`src/components/useChargeDragging.ts`](src/components/useChargeDragging.ts)
  - [`src/components/useSlingshotInteraction.ts`](src/components/useSlingshotInteraction.ts)
  - [`src/components/useSandboxCamera.ts`](src/components/useSandboxCamera.ts)
  - [`src/components/useCursorReadout.ts`](src/components/useCursorReadout.ts)
- Canvas/WebGL layers should stay as self-contained as possible and avoid leaking large internal state upward unless necessary.

## Scope guidance for future work

- **Gravity mode:** plausible, but only if the abstraction remains clean. Avoid sprinkling special-case gravity conditionals throughout electric-specific UI and naming.
- **Moving-source electromagnetic dynamics:** likely a separate-project concern unless the user explicitly wants a larger architectural expansion here.

