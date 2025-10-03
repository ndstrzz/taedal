// client/src/components/LiquidChrome.jsx
import { useRef, useEffect } from "react";
import { Renderer, Program, Mesh, Triangle } from "ogl";
import "./LiquidChrome.css";

export default function LiquidChrome({
  bgColor = [0, 0, 0],         // white background (demo default)
  baseColor = [0.949, 0.949, 0.949], // dark grey “chrome” (demo default)
  speed = 0.2,
  amplitude = 0.3,
  frequencyX = 3,
  frequencyY = 3,
  interactive = true,
}) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new Renderer({ antialias: true });
    const gl = renderer.gl;

    // set canvas clear color
    const [r, g, b] = bgColor;
    gl.clearColor(r, g, b, 1);

    const vertexShader = `
      attribute vec2 position;
      attribute vec2 uv;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `;

    const fragmentShader = `
      precision highp float;
      uniform float uTime;
      uniform vec3 uResolution;
      uniform vec3 uBaseColor;
      uniform float uAmplitude;
      uniform float uFrequencyX;
      uniform float uFrequencyY;
      uniform vec2 uMouse;
      varying vec2 vUv;

      vec4 renderImage(vec2 uvCoord) {
        vec2 fragCoord = uvCoord * uResolution.xy;
        vec2 uv = (2.0 * fragCoord - uResolution.xy) / min(uResolution.x, uResolution.y);

        for (float i = 1.0; i < 10.0; i++){
          uv.x += uAmplitude / i * cos(i * uFrequencyX * uv.y + uTime + uMouse.x * 3.14159);
          uv.y += uAmplitude / i * cos(i * uFrequencyY * uv.x + uTime + uMouse.y * 3.14159);
        }

        vec2 diff = (uvCoord - uMouse);
        float dist = length(diff);
        float falloff = exp(-dist * 20.0);
        float ripple = sin(10.0 * dist - uTime * 2.0) * 0.03;
        uv += (diff / (dist + 0.0001)) * ripple * falloff;

        vec3 color = uBaseColor / abs(sin(uTime - uv.y - uv.x));
        return vec4(color, 1.0);
      }

      void main() {
        vec4 col = vec4(0.0);
        for (int i = -1; i <= 1; i++){
          for (int j = -1; j <= 1; j++){
            vec2 offset = vec2(float(i), float(j)) * (1.0 / min(uResolution.x, uResolution.y));
            col += renderImage(vUv + offset);
          }
        }
        gl_FragColor = col / 9.0;
      }
    `;

    const geometry = new Triangle(gl);
    const program = new Program(gl, {
      vertex: vertexShader,
      fragment: fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: new Float32Array([1, 1, 1]) },
        uBaseColor: { value: new Float32Array(baseColor) },
        uAmplitude: { value: amplitude },
        uFrequencyX: { value: frequencyX },
        uFrequencyY: { value: frequencyY },
        uMouse: { value: new Float32Array([0.5, 0.5]) }, // centered to start
      },
    });

    const mesh = new Mesh(gl, { geometry, program });

    function resize() {
      renderer.setSize(container.clientWidth, container.clientHeight);
      const res = program.uniforms.uResolution.value;
      res[0] = gl.canvas.width;
      res[1] = gl.canvas.height;
      res[2] = gl.canvas.width / gl.canvas.height;
    }
    window.addEventListener("resize", resize);
    resize();

    // --- Interactive mouse/touch (listen on window so pointer-events:none is fine)
    let pendingMouse = null;

    const updateMouse = (clientX, clientY) => {
      const rect = container.getBoundingClientRect();
      const x = (clientX - rect.left) / rect.width;
      const y = 1 - (clientY - rect.top) / rect.height;
      const u = program.uniforms.uMouse.value;
      // clamp to [0,1] so it doesn't explode off-canvas
      u[0] = Math.max(0, Math.min(1, x));
      u[1] = Math.max(0, Math.min(1, y));
    };

    const onMouseMove = (e) => {
      // throttle updates to rAF for smoothness
      pendingMouse = [e.clientX, e.clientY];
    };
    const onTouchMove = (e) => {
      if (!e.touches.length) return;
      const t = e.touches[0];
      pendingMouse = [t.clientX, t.clientY];
    };

    if (interactive) {
      window.addEventListener("mousemove", onMouseMove, { passive: true });
      window.addEventListener("touchmove", onTouchMove, { passive: true });
    }

    let raf;
    const loop = (t) => {
      raf = requestAnimationFrame(loop);

      // apply any pending pointer position just before rendering this frame
      if (pendingMouse) {
        updateMouse(pendingMouse[0], pendingMouse[1]);
        pendingMouse = null;
      }

      program.uniforms.uTime.value = (t * 0.001) * speed;
      renderer.render({ scene: mesh });
    };
    raf = requestAnimationFrame(loop);

    container.appendChild(gl.canvas);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      if (interactive) {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("touchmove", onTouchMove);
      }
      if (gl.canvas.parentElement) gl.canvas.parentElement.removeChild(gl.canvas);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [bgColor, baseColor, speed, amplitude, frequencyX, frequencyY, interactive]);

  return <div ref={containerRef} className="liquidChrome-container" />;
}
