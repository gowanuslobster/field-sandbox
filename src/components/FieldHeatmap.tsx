"use client";

import { useEffect, useRef } from "react";
import type { Charge, WorldBounds } from "@/physics/types";

const MAX_CHARGES = 32;

const VERTEX_SHADER_SOURCE = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

uniform vec2 uResolution;
uniform vec4 uBaseBounds;
uniform float uZoom;
uniform vec2 uOffset;
uniform int uChargeCount;
uniform vec3 uCharges[${MAX_CHARGES}];
uniform float uSoftening;
uniform float uPotentialScale;
uniform float uOpacity;
uniform float uContourInterval;
uniform float uContourOpacity;

out vec4 outColor;

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 baseCenter = vec2(
    (uBaseBounds.x + uBaseBounds.y) * 0.5,
    (uBaseBounds.z + uBaseBounds.w) * 0.5
  );
  vec2 baseSpan = vec2(
    uBaseBounds.y - uBaseBounds.x,
    uBaseBounds.w - uBaseBounds.z
  );
  vec2 world = baseCenter + uOffset + (uv - vec2(0.5, 0.5)) * (baseSpan / uZoom);

  float potential = 0.0;
  for (int i = 0; i < ${MAX_CHARGES}; i++) {
    if (i >= uChargeCount) {
      break;
    }
    vec3 charge = uCharges[i];
    vec2 delta = world - charge.xy;
    float radius = sqrt(dot(delta, delta) + (uSoftening * uSoftening));
    potential += charge.z / radius;
  }

  float intensity = 1.0 - exp(-abs(potential) * uPotentialScale);
  float alpha = pow(intensity, 0.8) * uOpacity;

  vec3 positive = vec3(1.0, 0.36, 0.17);
  vec3 negative = vec3(0.15, 0.68, 1.0);
  vec3 color = mix(negative, positive, step(0.0, potential)) * intensity;

  float contourPhase = potential / max(uContourInterval, 0.0001);
  float contourDistance = abs(contourPhase - round(contourPhase));
  float contourAA = fwidth(contourPhase) * 0.75 + 0.001;
  float contourMask = 1.0 - smoothstep(0.0, contourAA, contourDistance);
  float contourBlend = contourMask * clamp(uContourOpacity, 0.0, 1.0);
  vec3 contourColor = vec3(0.9, 0.96, 1.0);
  color = mix(color, contourColor, contourBlend * 0.9);
  alpha = clamp(alpha + contourBlend * 0.92, 0.0, 1.0);

  outColor = vec4(color, alpha);
}
`;

type FieldHeatmapProps = {
  charges: Charge[];
  baseBounds: WorldBounds;
  zoom: number;
  offsetX: number;
  offsetY: number;
  isSimulating: boolean;
  contourInterval?: number;
  contourOpacity?: number;
  opacity?: number;
  className?: string;
};

type UniformLocations = {
  resolution: WebGLUniformLocation;
  baseBounds: WebGLUniformLocation;
  zoom: WebGLUniformLocation;
  offset: WebGLUniformLocation;
  chargeCount: WebGLUniformLocation;
  charges: WebGLUniformLocation;
  softening: WebGLUniformLocation;
  potentialScale: WebGLUniformLocation;
  opacity: WebGLUniformLocation;
  contourInterval: WebGLUniformLocation;
  contourOpacity: WebGLUniformLocation;
};

type GlState = {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  uniforms: UniformLocations;
  chargeData: Float32Array;
};

function compileShader(
  gl: WebGL2RenderingContext,
  source: string,
  type: number,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error("Failed to create shader.");
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "Unknown shader compile error.";
    gl.deleteShader(shader);
    throw new Error(log);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext): GlState {
  const vertexShader = compileShader(gl, VERTEX_SHADER_SOURCE, gl.VERTEX_SHADER);
  const fragmentShader = compileShader(
    gl,
    FRAGMENT_SHADER_SOURCE,
    gl.FRAGMENT_SHADER,
  );
  const program = gl.createProgram();
  if (!program) {
    throw new Error("Failed to create WebGL program.");
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? "Unknown program link error.";
    gl.deleteProgram(program);
    throw new Error(log);
  }

  const positionBuffer = gl.createBuffer();
  const positionLocation = gl.getAttribLocation(program, "aPosition");
  if (!positionBuffer || positionLocation < 0) {
    throw new Error("Failed to create quad geometry.");
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1,
    ]),
    gl.STATIC_DRAW,
  );
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(positionLocation);

  const getUniform = (name: string): WebGLUniformLocation => {
    const location = gl.getUniformLocation(program, name);
    if (!location) {
      throw new Error(`Missing uniform: ${name}`);
    }
    return location;
  };

  const uniforms: UniformLocations = {
    resolution: getUniform("uResolution"),
    baseBounds: getUniform("uBaseBounds"),
    zoom: getUniform("uZoom"),
    offset: getUniform("uOffset"),
    chargeCount: getUniform("uChargeCount"),
    charges: getUniform("uCharges[0]"),
    softening: getUniform("uSoftening"),
    potentialScale: getUniform("uPotentialScale"),
    opacity: getUniform("uOpacity"),
    contourInterval: getUniform("uContourInterval"),
    contourOpacity: getUniform("uContourOpacity"),
  };

  return {
    gl,
    program,
    uniforms,
    chargeData: new Float32Array(MAX_CHARGES * 3),
  };
}

export function FieldHeatmap({
  charges,
  baseBounds,
  zoom,
  offsetX,
  offsetY,
  isSimulating,
  contourInterval = 1,
  contourOpacity = 0,
  opacity = 0.9,
  className,
}: FieldHeatmapProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glStateRef = useRef<GlState | null>(null);
  const chargesRef = useRef(charges);
  const baseBoundsRef = useRef(baseBounds);
  const zoomRef = useRef(zoom);
  const offsetRef = useRef({ x: offsetX, y: offsetY });
  const isSimulatingRef = useRef(isSimulating);
  const opacityTargetRef = useRef(opacity);
  const opacityCurrentRef = useRef(opacity);
  const contourIntervalRef = useRef(contourInterval);
  const contourOpacityRef = useRef(contourOpacity);
  const needsRenderRef = useRef(true);
  const requestRenderRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    chargesRef.current = charges;
    needsRenderRef.current = true;
    requestRenderRef.current?.();
  }, [charges]);

  useEffect(() => {
    baseBoundsRef.current = baseBounds;
    needsRenderRef.current = true;
    requestRenderRef.current?.();
  }, [baseBounds]);

  useEffect(() => {
    zoomRef.current = zoom;
    needsRenderRef.current = true;
    requestRenderRef.current?.();
  }, [zoom]);

  useEffect(() => {
    offsetRef.current = { x: offsetX, y: offsetY };
    needsRenderRef.current = true;
    requestRenderRef.current?.();
  }, [offsetX, offsetY]);

  useEffect(() => {
    isSimulatingRef.current = isSimulating;
    if (isSimulating) {
      needsRenderRef.current = true;
      requestRenderRef.current?.();
    }
  }, [isSimulating]);

  useEffect(() => {
    opacityTargetRef.current = opacity;
    needsRenderRef.current = true;
    requestRenderRef.current?.();
  }, [opacity]);

  useEffect(() => {
    contourIntervalRef.current = contourInterval;
    needsRenderRef.current = true;
    requestRenderRef.current?.();
  }, [contourInterval]);

  useEffect(() => {
    contourOpacityRef.current = contourOpacity;
    needsRenderRef.current = true;
    requestRenderRef.current?.();
  }, [contourOpacity]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const gl = canvas.getContext("webgl2", { alpha: true, antialias: false });
    if (!gl) {
      return;
    }

    try {
      glStateRef.current = createProgram(gl);
    } catch {
      return;
    }

    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    let animationFrame: number | null = null;
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const width = Math.max(1, Math.floor(entry.contentRect.width));
      const height = Math.max(1, Math.floor(entry.contentRect.height));
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      needsRenderRef.current = true;
      requestRenderRef.current?.();
    });

    resizeObserver.observe(canvas);

    const render = () => {
      const state = glStateRef.current;
      if (!state) {
        return;
      }

      const activeCharges = chargesRef.current.slice(0, MAX_CHARGES);
      const { gl: context, uniforms, program, chargeData } = state;
      const { width, height } = canvas;
      const baseBoundsValue = baseBoundsRef.current;
      const offset = offsetRef.current;

      context.viewport(0, 0, width, height);
      context.clear(context.COLOR_BUFFER_BIT);
      context.useProgram(program);

      chargeData.fill(0);
      for (let i = 0; i < activeCharges.length; i += 1) {
        const dataOffset = i * 3;
        chargeData[dataOffset] = activeCharges[i].position.x;
        chargeData[dataOffset + 1] = activeCharges[i].position.y;
        chargeData[dataOffset + 2] = activeCharges[i].value;
      }

      context.uniform2f(uniforms.resolution, width, height);
      context.uniform4f(
        uniforms.baseBounds,
        baseBoundsValue.minX,
        baseBoundsValue.maxX,
        baseBoundsValue.minY,
        baseBoundsValue.maxY,
      );
      context.uniform1f(uniforms.zoom, zoomRef.current);
      context.uniform2f(uniforms.offset, offset.x, offset.y);
      context.uniform1i(uniforms.chargeCount, activeCharges.length);
      context.uniform3fv(uniforms.charges, chargeData);
      context.uniform1f(uniforms.softening, 0.04);
      context.uniform1f(uniforms.potentialScale, 0.6);
      context.uniform1f(uniforms.contourInterval, contourIntervalRef.current);
      context.uniform1f(uniforms.contourOpacity, contourOpacityRef.current);
      opacityCurrentRef.current +=
        (opacityTargetRef.current - opacityCurrentRef.current) * 0.14;
      context.uniform1f(uniforms.opacity, opacityCurrentRef.current);
      context.drawArrays(context.TRIANGLES, 0, 6);
    };
    const scheduleRender = () => {
      if (animationFrame !== null) {
        return;
      }
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = null;
        render();
        const opacitySettled =
          Math.abs(opacityTargetRef.current - opacityCurrentRef.current) < 0.003;
        needsRenderRef.current = false;
        const keepRendering =
          isSimulatingRef.current || needsRenderRef.current || !opacitySettled;
        if (keepRendering) {
          scheduleRender();
        }
      });
    };
    requestRenderRef.current = () => {
      needsRenderRef.current = true;
      scheduleRender();
    };
    scheduleRender();
    return () => {
      requestRenderRef.current = null;
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
      resizeObserver.disconnect();
    };
  }, []);
  return <canvas ref={canvasRef} className={`${className ?? ""} block h-full w-full`} />;
}
