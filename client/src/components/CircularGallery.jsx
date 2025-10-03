// client/src/components/CircularGallery.jsx
import { Camera, Mesh, Plane, Program, Renderer, Texture, Transform } from "ogl";
import { useEffect, useRef } from "react";
import "../components/CircularGallery.css";;

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function autoBind(instance) {
  const proto = Object.getPrototypeOf(instance);
  Object.getOwnPropertyNames(proto).forEach((k) => {
    if (k !== "constructor" && typeof instance[k] === "function") instance[k] = instance[k].bind(instance);
  });
}
function createTextTexture(gl, text, font = "bold 30px monospace", color = "white") {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width);
  const h = Math.ceil(parseInt(font, 10) * 1.2);
  canvas.width = w + 20;
  canvas.height = h + 20;
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const tex = new Texture(gl, { generateMipmaps: false });
  tex.image = canvas;
  return { texture: tex, width: canvas.width, height: canvas.height };
}

class Title {
  constructor({ gl, plane, text, textColor = "#ffffff", font = "bold 30px Figtree" }) {
    autoBind(this);
    this.gl = gl;
    this.plane = plane;
    const { texture, width, height } = createTextTexture(this.gl, text, font, textColor);
    const geometry = new Plane(this.gl);
    const program = new Program(this.gl, {
      vertex: `
        attribute vec3 position; attribute vec2 uv;
        uniform mat4 modelViewMatrix, projectionMatrix;
        varying vec2 vUv; void main(){ vUv=uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
      `,
      fragment: `
        precision highp float; uniform sampler2D tMap; varying vec2 vUv;
        void main(){ vec4 c=texture2D(tMap, vUv); if(c.a<0.1) discard; gl_FragColor=c; }
      `,
      uniforms: { tMap: { value: texture } },
      transparent: true,
      depthTest: false, depthWrite: false,
    });
    this.mesh = new Mesh(this.gl, { geometry, program });
    const aspect = width / height;
    const textH = this.plane.scale.y * 0.15;
    this.mesh.scale.set(textH * aspect, textH, 1);
    this.mesh.position.y = -this.plane.scale.y * 0.5 - textH * 0.5 - 0.05;
    this.mesh.setParent(this.plane);
  }
}

class Media {
  constructor({ geometry, gl, image, index, length, scene, viewport, bend, text, textColor, borderRadius, font }) {
    this.geometry = geometry;
    this.gl = gl;
    this.index = index;
    this.length = length;
    this.scene = scene;
    this.viewport = viewport;
    this.bend = bend;
    this.createShader(image, borderRadius);
    this.createMesh();
    this.title = new Title({ gl, plane: this.plane, text, textColor, font });
    this.onResize({ viewport });
  }
  createShader(image, borderRadius = 0.05) {
    const texture = new Texture(this.gl, { generateMipmaps: true });
    this.program = new Program(this.gl, {
      depthTest: false, depthWrite: false, transparent: true,
      vertex: `
        precision highp float;
        attribute vec3 position; attribute vec2 uv;
        uniform mat4 modelViewMatrix, projectionMatrix;
        uniform float uTime, uSpeed;
        varying vec2 vUv;
        void main(){
          vUv=uv; vec3 p=position;
          p.z = (sin(p.x*4.0+uTime)*1.5 + cos(p.y*2.0+uTime)*1.5) * (0.1 + uSpeed*0.5);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);
        }
      `,
      fragment: `
        precision highp float;
        uniform vec2 uImageSizes, uPlaneSizes;
        uniform sampler2D tMap; uniform float uBorderRadius;
        varying vec2 vUv;
        float roundedBoxSDF(vec2 p, vec2 b, float r){
          vec2 d = abs(p)-b; return length(max(d,0.)) + min(max(d.x,d.y),0.) - r;
        }
        void main(){
          vec2 ratio = vec2(
            min((uPlaneSizes.x/uPlaneSizes.y)/(uImageSizes.x/uImageSizes.y),1.0),
            min((uPlaneSizes.y/uPlaneSizes.x)/(uImageSizes.y/uImageSizes.x),1.0)
          );
          vec2 uv = vec2(vUv.x*ratio.x+(1.-ratio.x)*.5, vUv.y*ratio.y+(1.-ratio.y)*.5);
          vec4 c = texture2D(tMap, uv);
          float d = roundedBoxSDF(vUv-0.5, vec2(0.5-uBorderRadius), uBorderRadius);
          float edge = 0.002; float alpha = 1.0 - smoothstep(-edge, edge, d);
          gl_FragColor = vec4(c.rgb, alpha);
        }
      `,
      uniforms: {
        tMap: { value: texture },
        uPlaneSizes: { value: [0, 0] },
        uImageSizes: { value: [0, 0] },
        uSpeed: { value: 0 },
        uTime: { value: 100 * Math.random() },
        uBorderRadius: { value: borderRadius },
      },
    });
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = image;
    img.onload = () => {
      texture.image = img;
      this.program.uniforms.uImageSizes.value = [img.naturalWidth, img.naturalHeight];
    };
  }
  createMesh() {
    this.plane = new Mesh(this.gl, { geometry: this.geometry, program: this.program });
    this.plane.setParent(this.scene);
  }
  update(scroll) {
    this.plane.position.x = this.x - scroll.current;
    // optional bend along an arc
    const H = this.viewport.width / 2;
    if (this.bend === 0) {
      this.plane.position.y = 0; this.plane.rotation.z = 0;
    } else {
      const B = Math.abs(this.bend);
      const R = (H*H + B*B) / (2*B);
      const ex = Math.min(Math.abs(this.plane.position.x), H);
      const arc = R - Math.sqrt(R*R - ex*ex);
      if (this.bend > 0) { this.plane.position.y = -arc; this.plane.rotation.z = -Math.sign(this.plane.position.x)*Math.asin(ex/R); }
      else { this.plane.position.y = arc; this.plane.rotation.z =  Math.sign(this.plane.position.x)*Math.asin(ex/R); }
    }
    this.program.uniforms.uTime.value += 0.04;
    this.program.uniforms.uSpeed.value = scroll.current - scroll.last;
  }
  onResize({ viewport }) {
  this.viewport = viewport;

  // 🔒 target pixel size for each card
  const TARGET_W = 282;
  const TARGET_H = 281;

  // Convert pixels → world units
  // worldWidth  corresponds to 'viewport.width' for 'screen.width' pixels.
  // worldHeight corresponds to 'viewport.height' for 'screen.height' pixels.
  const worldPerPxX = this.viewport.width  / window.innerWidth;
  const worldPerPxY = this.viewport.height / window.innerHeight;

  this.plane.scale.x = TARGET_W * worldPerPxX;
  this.plane.scale.y = TARGET_H * worldPerPxY;

  this.program.uniforms.uPlaneSizes.value = [this.plane.scale.x, this.plane.scale.y];

  // spacing between cards (a small gutter in world units)
  const gutterPx = 16;
  const gutterWorld = gutterPx * worldPerPxX;

  this.width = this.plane.scale.x + gutterWorld;  // “slot” width used for scroll snapping
  this.x = this.width * this.index;
  }
}

class App {
  constructor(container, { items, bend = 3, textColor = "#fff", borderRadius = 0.05, font = "bold 30px Figtree", scrollSpeed = 2, scrollEase = 0.05 } = {}) {
    autoBind(this);
    this.container = container;
    this.scrollSpeed = scrollSpeed;
    this.scroll = { ease: scrollEase, current: 0, target: 0, last: 0 };
    this.createRenderer(); this.createCamera(); this.createScene(); this.onResize();
    this.createGeometry();
    this.createMedias(items, bend, textColor, borderRadius, font);
    this.addEventListeners();
    this.update();
  }
  createRenderer() {
    this.renderer = new Renderer({ alpha: true, antialias: true, dpr: Math.min(window.devicePixelRatio || 1, 2) });
    this.gl = this.renderer.gl; this.gl.clearColor(0,0,0,0);
    this.container.appendChild(this.gl.canvas);
  }
  createCamera() { this.camera = new Camera(this.gl); this.camera.fov = 45; this.camera.position.z = 20; }
  createScene() { this.scene = new Transform(); }
  createGeometry() { this.planeGeometry = new Plane(this.gl, { heightSegments: 50, widthSegments: 100 }); }
  createMedias(items, bend, textColor, borderRadius, font) {
    // 🚫 NO CONCAT → finite list only
    this.mediasImages = (items && items.length ? items : []).map((x) => ({
      image: x.image, text: x.text || ""
    }));
    this.medias = this.mediasImages.map((data, i) => new Media({
      geometry: this.planeGeometry,
      gl: this.gl,
      image: data.image,
      index: i,
      length: this.mediasImages.length,
      scene: this.scene,
      viewport: this.viewport,
      bend,
      text: data.text,
      textColor,
      borderRadius,
      font,
    }));
    // compute max scroll once we know widths
    setTimeout(() => {
      if (!this.medias.length) { this.maxScroll = 0; return; }
      const w = this.medias[0].width;
      const maxIndex = Math.max(0, this.medias.length - 1);
      this.maxScroll = w * maxIndex; // clamp range [0, maxScroll]
    }, 0);
  }
  onTouchDown(e){ this.isDown = true; this.scroll.position = this.scroll.current; this.start = e.touches ? e.touches[0].clientX : e.clientX; }
  onTouchMove(e){ if(!this.isDown) return; const x = e.touches ? e.touches[0].clientX : e.clientX; const d = (this.start - x) * (this.scrollSpeed * 0.025); this.scroll.target = clamp(this.scroll.position + d, 0, this.maxScroll || 0); }
  onTouchUp(){ this.isDown = false; this.snapToNearest(); }
  onWheel(e){ const dir = (e.deltaY || e.wheelDelta || e.detail) > 0 ? 1 : -1; this.scroll.target = clamp(this.scroll.target + dir * (this.scrollSpeed * 0.2), 0, this.maxScroll || 0); this.snapPending = true; clearTimeout(this._wheelTO); this._wheelTO = setTimeout(this.snapToNearest, 150); }
  snapToNearest() {
    if (!this.medias || !this.medias[0]) return;
    const w = this.medias[0].width;
    const idx = clamp(Math.round(this.scroll.target / w), 0, Math.max(0, this.medias.length - 1));
    this.scroll.target = clamp(idx * w, 0, this.maxScroll || 0);
  }
  onResize(){
    this.screen = { width: this.container.clientWidth, height: this.container.clientHeight };
    this.renderer.setSize(this.screen.width, this.screen.height);
    this.camera.perspective({ aspect: this.screen.width / this.screen.height });
    const fov = (this.camera.fov * Math.PI) / 180;
    const height = 2 * Math.tan(fov/2) * this.camera.position.z;
    const width = height * this.camera.aspect;
    this.viewport = { width, height };
    if (this.medias) this.medias.forEach(m => m.onResize({ viewport: this.viewport }));
    // recompute maxScroll when size changes
    if (this.medias && this.medias[0]) {
      const w = this.medias[0].width;
      this.maxScroll = w * Math.max(0, this.medias.length - 1);
      this.scroll.current = clamp(this.scroll.current, 0, this.maxScroll);
      this.scroll.target  = clamp(this.scroll.target,  0, this.maxScroll);
    }
  }
  update(){
    this.scroll.current = lerp(this.scroll.current, this.scroll.target, this.scroll.ease);
    if (this.medias) this.medias.forEach(m => m.update(this.scroll));
    this.renderer.render({ scene: this.scene, camera: this.camera });
    this.scroll.last = this.scroll.current;
    this.raf = requestAnimationFrame(this.update);
  }
  addEventListeners(){
    this.boundResize = this.onResize.bind(this);
    window.addEventListener("resize", this.boundResize);
    window.addEventListener("wheel", this.onWheel, { passive: true });
    window.addEventListener("mousedown", this.onTouchDown);
    window.addEventListener("mousemove", this.onTouchMove);
    window.addEventListener("mouseup", this.onTouchUp);
    window.addEventListener("touchstart", this.onTouchDown, { passive: true });
    window.addEventListener("touchmove", this.onTouchMove, { passive: false });
    window.addEventListener("touchend", this.onTouchUp, { passive: true });
  }
  destroy(){
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.boundResize);
    window.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("mousedown", this.onTouchDown);
    window.removeEventListener("mousemove", this.onTouchMove);
    window.removeEventListener("mouseup", this.onTouchUp);
    window.removeEventListener("touchstart", this.onTouchDown);
    window.removeEventListener("touchmove", this.onTouchMove);
    window.removeEventListener("touchend", this.onTouchUp);
    if (this.renderer?.gl?.canvas?.parentNode) this.renderer.gl.canvas.parentNode.removeChild(this.renderer.gl.canvas);
  }
}

export default function CircularGallery({
  items,             // [{ image, text }]
  bend = 3,
  textColor = "#ffffff",
  borderRadius = 0.05,
  font = "bold 30px Figtree",
  scrollSpeed = 2,
  scrollEase = 0.05,
}) {
  const ref = useRef(null);
  useEffect(() => {
    const app = new App(ref.current, { items, bend, textColor, borderRadius, font, scrollSpeed, scrollEase });
    return () => app.destroy();
  }, [items, bend, textColor, borderRadius, font, scrollSpeed, scrollEase]);
  return <div className="circular-gallery" ref={ref} />;
}
