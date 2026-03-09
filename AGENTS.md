# Field Sandbox: Project Standards

## 🎯 Vision
A high-fidelity, interactive 2D Electric Field & Potential visualizer for advanced physics students. Focus on "Manim-style" aesthetics and numerical precision.

## 🛠 Tech Stack
- **Framework:** Next.js 15 (App Router), TypeScript.
- **UI:** Shadcn UI + Framer Motion.
- **Physics Engine:** Custom implementation based on `gowanuslobster/kinematics-sandbox`.
- **Rendering:** - **Heatmap (Background):** WebGL/GLSL Fragment Shaders.
  - **Lines/Particles (Foreground):** HTML5 Canvas API.

## ⚖️ Physics Implementation (Non-Negotiable)
- **Integration:** Use Symplectic Euler-Cromer for all particle dynamics ($v_{n+1} = v_n + a_n \Delta t$; $x_{n+1} = x_n + v_{n+1} \Delta t$).
- **Vector Math:** Carry over the `Vector2D` utility patterns from `kinematics-sandbox`.
- **Field Tracing:** Use RK4 (Runge-Kutta 4) for drawing field lines to ensure smoothness near singularities.

## 🎨 Aesthetics
- **Theme:** Dark Mode Only (#0F0F0F).
- **Charges:** Glow-effect circles. Red/Orange for $+q$, Blue/Cyan for $-q$.
- **Field Lines:** Animated "flow" dashes showing direction.

