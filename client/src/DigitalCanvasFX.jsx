import React, { useEffect, useRef } from "react";

/**
 * DigitalCanvasFX
 * - Renders the base SVG image
 * - Adds a canvas overlay with drifting glowing particles
 * - Adds a subtle diagonal shimmer (CSS ::after)
 *
 * Props:
 *  - imageSrc (string) required: url of the SVG
 *  - className (string) optional: pass your "abs canvas-img" here so it keeps the same absolute position
 */
export default function DigitalCanvasFX({ imageSrc, className = "" }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    let running = true;

    // size canvas at devicePixelRatio for crisp glow
    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.width = rect.width + "px";
      canvas.style.height = rect.height + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    // build particles
    const particleCount = 140; // tweak for density/perf
    const parts = Array.from({ length: particleCount }).map(() => ({
      x: Math.random() * wrap.clientWidth,
      y: Math.random() * wrap.clientHeight,
      vx: (Math.random() - 0.5) * 0.25,  // slow drift
      vy: (Math.random() - 0.5) * 0.25,
      r: 0.8 + Math.random() * 1.7,      // radius in CSS pixels
      a: 0.25 + Math.random() * 0.55,    // base alpha
      hue: 200 + Math.random() * 60      // bluish glow range
    }));

    const tick = () => {
      if (!running) return;

      // clear
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // additive glow
      ctx.globalCompositeOperation = "lighter";

      // draw particles
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];

        // update
        p.x += p.vx;
        p.y += p.vy;

        // gentle wrap
        if (p.x < -10) p.x = wrap.clientWidth + 10;
        if (p.x > wrap.clientWidth + 10) p.x = -10;
        if (p.y < -10) p.y = wrap.clientHeight + 10;
        if (p.y > wrap.clientHeight + 10) p.y = -10;

        // twinkle
        const tw = (Math.sin((performance.now() * 0.002) + i) + 1) * 0.5; // 0..1
        const alpha = p.a * (0.65 + tw * 0.55);

        // glow circle
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 6);
        grad.addColorStop(0, `hsla(${p.hue}, 90%, 70%, ${alpha})`);
        grad.addColorStop(1, `hsla(${p.hue}, 90%, 70%, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 6, 0, Math.PI * 2);
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    // start anim (respect reduced motion)
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!prefersReduced) {
      rafRef.current = requestAnimationFrame(tick);
    }

    // cleanup
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, []);

  return (
    <div className={`canvasfx ${className}`} ref={wrapRef}>
      {/* Base SVG image */}
      <img src={imageSrc} alt="digital canvas" className="canvasfx-img" draggable="false" />
      {/* Particle overlay */}
      <canvas ref={canvasRef} className="canvasfx-layer" aria-hidden="true" />
      {/* Shimmer overlay happens via CSS ::after */}
    </div>
  );
}
