import { Background, useStoreApi } from '@xyflow/react';
import { useLayoutEffect, useRef, useState } from 'react';
import './CanvasBackground.css';

const vertexSource = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const fragmentSource = `#version 300 es
precision highp float;
uniform vec2 offset;
uniform float gap;
uniform float radius;
uniform float height;
uniform vec4 color;
out vec4 pixel;
void main() {
  vec2 screen = vec2(gl_FragCoord.x, height - gl_FragCoord.y);
  vec2 cell = mod(screen - offset + gap * 0.5, gap) - gap * 0.5;
  // Keep subpixel dots visible, with the same size-dependent fade as FLORA.
  float visibleRadius = max(radius, 0.6);
  float distance = length(cell) - visibleRadius;
  float feather = fwidth(distance);
  float coverage = 1.0 - smoothstep(-feather, feather, distance);
  float alpha = coverage * min(radius / visibleRadius, 1.0) * color.a;
  if (alpha <= 0.001) discard;
  pixel = vec4(color.rgb * alpha, alpha);
}`;

/** Draw only when the viewport changes; panning does not render React per frame. */
export function CanvasBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const store = useStoreApi();
  const [fallback, setFallback] = useState(false);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false });
    if (!gl) { setFallback(true); return; }
    let program: WebGLProgram | null = null;
    let buffer: WebGLBuffer | null = null;
    let uniforms: Record<string, WebGLUniformLocation | null> = {};

    const dispose = () => {
      canvas.dataset.ready = 'false';
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      buffer = null;
      program = null;
    };
    const draw = () => {
      if (!program || gl.isContextLost()) return;
      const { transform: [x, y, zoom], width, height } = store.getState();
      if (!width || !height) return;
      const dpr = window.devicePixelRatio || 1;
      const pixelWidth = Math.max(1, Math.round(width * dpr));
      const pixelHeight = Math.max(1, Math.round(height * dpr));
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      const gap = Math.max(32 * zoom * dpr, 1);
      const radius = zoom * dpr / 2;
      const wrap = (value: number) => ((value * dpr + radius) % gap + gap) % gap;
      gl.viewport(0, 0, pixelWidth, pixelHeight);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniform2f(uniforms.offset, wrap(x), wrap(y));
      gl.uniform1f(uniforms.gap, gap);
      gl.uniform1f(uniforms.radius, radius);
      gl.uniform1f(uniforms.height, pixelHeight);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      canvas.dataset.ready = 'true';
    };
    const initialize = () => {
      const shaders: WebGLShader[] = [];
      for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]] as const) {
        const shader = gl.createShader(type);
        if (!shader) { shaders.forEach(item => gl.deleteShader(item)); setFallback(true); return; }
        shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          shaders.forEach(item => gl.deleteShader(item));
          setFallback(true);
          return;
        }
      }
      program = gl.createProgram();
      if (program) {
        shaders.forEach(shader => gl.attachShader(program!, shader));
        gl.linkProgram(program);
      }
      shaders.forEach(shader => gl.deleteShader(shader));
      if (!program || !gl.getProgramParameter(program, gl.LINK_STATUS)) { dispose(); setFallback(true); return; }
      buffer = gl.createBuffer();
      if (!buffer) { dispose(); setFallback(true); return; }
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.useProgram(program);
      const position = gl.getAttribLocation(program, 'position');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      uniforms = Object.fromEntries(['offset', 'gap', 'radius', 'height', 'color']
        .map(name => [name, gl.getUniformLocation(program!, name)]));
      const hex = getComputedStyle(canvas).getPropertyValue('--canvas-grid-dot').trim().slice(1);
      const channel = (index: number) => parseInt(hex.slice(index, index + 2), 16) / 255;
      gl.uniform4f(uniforms.color, channel(0), channel(2), channel(4), channel(6));
      gl.clearColor(0, 0, 0, 0);
      setFallback(false);
      draw();
    };
    const onContextLost = (event: Event) => {
      event.preventDefault();
      dispose();
      setFallback(true);
    };
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', initialize);
    initialize();
    const unsubscribe = store.subscribe((next, previous) => {
      if (next.transform !== previous.transform || next.width !== previous.width || next.height !== previous.height) draw();
    });
    let resolution: MediaQueryList;
    const onResolutionChange = () => {
      resolution?.removeEventListener('change', onResolutionChange);
      resolution = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      resolution.addEventListener('change', onResolutionChange);
      draw();
    };
    onResolutionChange();
    return () => {
      unsubscribe();
      resolution.removeEventListener('change', onResolutionChange);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', initialize);
      dispose();
    };
  }, [store]);

  return <div className="canvas-background" aria-hidden="true">
    {fallback && <Background gap={32} size={1} bgColor="var(--canvas-background)" color="var(--canvas-grid-dot)" />}
    <canvas ref={canvasRef} />
  </div>;
}
