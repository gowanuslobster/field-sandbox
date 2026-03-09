# Field Sandbox: Project Standards

## 🎯 Vision
Build a high-fidelity, interactive 2D electric field and potential visualizer for advanced physics students, with Manim-style aesthetics and strong numerical reliability.

## 🛠️ Stack & Architecture
- **Framework:** Next.js 15 (App Router) + TypeScript
- **UI:** Shadcn UI + Framer Motion
- **Physics core:** Custom implementation inspired by `gowanuslobster/kinematics-sandbox`
- **Rendering split:**
  - **Background:** WebGL / GLSL fragment shader heatmap
  - **Foreground:** HTML5 Canvas (field lines, particles, overlays)

## ⚖️ Physics Rules (Non-Negotiable)
- **Particle integration:** Symplectic Euler-Cromer only  
  - \( v_{n+1} = v_n + a_n \Delta t \)  
  - \( x_{n+1} = x_n + v_{n+1} \Delta t \)
- **Vector math:** Reuse `Vector2D` style patterns from `kinematics-sandbox` (immutable-friendly utilities, explicit ops).
- **Field-line tracing:** RK4 required for streamline tracing near singularities and steep gradients.
- **Numerics:** Favor stable time steps, singularity guards, and deterministic stepping over micro-optimizations.

## 🎨 Visual / UX Rules
- **Theme:** Dark-mode only (`#0F0F0F` base).
- **Charges:** Glow circles (warm palette for +q, cool palette for -q).
- **Field lines:** Directional animated flow dashes.
- **Motion:** Smooth, subtle, physically meaningful animation only.
- **Aesthetic goal:** Educational clarity first, then visual polish.

## 🧭 Coding Guidelines for Agents
- Keep physics logic separate from rendering logic.
- Prefer small, composable utilities over large monolithic functions.
- Name units and coordinate spaces explicitly (`world`, `screen`, `sim_dt`, etc.).
- Avoid hidden constants; centralize tunables in config files.
- Add concise comments only where math/intent is non-obvious.

## ✅ Testing Expectations
- For physics changes:
  - Validate integration behavior with deterministic checks.
  - Verify RK4 field-line output is smooth and directionally correct around charges.
- For UI/rendering changes:
  - Confirm dark-theme consistency and contrast readability.
  - Verify animation performance and no visual flicker/artifacts.
- Prefer targeted tests over running the full suite when possible.

## 🖥️ Cursor Cloud Specific Instructions
- After non-trivial UI changes, run manual browser validation and provide:
  - one short demo video,
  - one or more screenshots of final state.
- For non-UI logic changes, include terminal evidence from focused test commands.
- Do not claim success without runtime validation.

