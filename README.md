# ⚡ Field Sandbox

An interactive, high-performance 2D visualizer for electric fields and potentials, designed for advanced high school physics students. This project bridges the gap between abstract Maxwellian concepts and intuitive visual motion, using a "3Blue1Brown" (Manim) aesthetic.

## 🌟 Key Features
- **Real-Time Potential Heatmaps:** Leverages WebGL/GLSL Fragment Shaders to render millions of potential calculations ($V = \sum \frac{kq}{r}$) at 60 FPS.
- **Dynamic Field Tracing:** Uses an **RK4 (Runge-Kutta 4)** path-tracer to generate smooth, accurate electric field streamlines that animate in real-time.
- **Interactive "Calculus-Lite" Tools:**
  - **The Slope Probe:** A hover-tool that visualizes the gradient of the potential at any point, showing students that $\vec{E} = -\nabla V$.
  - **Superposition Sandbox:** Drag-and-drop point charges to see how complex fields emerge from simple sources.
- **Physical Dynamics:** Drop "Test Charges" into your field to observe motion integrated via the **Symplectic Euler-Cromer** algorithm.

## 🛠 Tech Stack
- **Framework:** Next.js 15 (App Router), TypeScript, Tailwind CSS.
- **UI & Animation:** Shadcn UI + Framer Motion.
- **Physics Engine:** Modular architecture ported and evolved from `kinematics-sandbox`.
- **Rendering Pipeline:**
  - **Background:** WebGL Shaders for field density and potential gradients.
  - **Foreground:** HTML5 Canvas for particles and vector streamlines.
- **Toolchain:** `uv` for high-performance Python-based physics validation and task running.

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- [uv](https://github.com/astral-sh/uv) (for running physics utility scripts)

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/gowanuslobster/field-sandbox.git
   cd field-sandbox
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```

## ⚖️ Physics Standards
This repository adheres to strict numerical standards defined in `AGENTS.md`. All motion simulations must use the **Symplectic Euler-Cromer** method to ensure energy conservation in orbital or oscillatory trajectories, consistent with the `kinematics-sandbox` heritage.

## 🗺 Roadmap
- [ ] **Phase 1:** Static Point Charges & WebGL Heatmap (Current Focus).
- [ ] **Phase 2:** Test Particle Dynamics & "Slope Probe" UI.
- [ ] **Phase 3:** Gravitational Field Toggle (Similarity/Difference mode).
- [ ] **Phase 4:** Time-Varying Fields (Maxwell-Faraday "Swirl" intuition).

## 📄 License
MIT
