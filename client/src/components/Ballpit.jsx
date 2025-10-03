import { useRef, useEffect } from 'react';
import {
  Clock as e,
  PerspectiveCamera as t,
  Scene as i,
  WebGLRenderer as s,
  SRGBColorSpace as n,
  MathUtils as o,
  Vector2 as r,
  Vector3 as a,
  MeshPhysicalMaterial as c,
  ShaderChunk as h,
  Color as l,
  Object3D as m,
  InstancedMesh as d,
  PMREMGenerator as p,
  SphereGeometry as g,
  AmbientLight as f,
  PointLight as u,
  ACESFilmicToneMapping as v,
  Raycaster as y,
  Plane as w
} from 'three';
import { RoomEnvironment as z } from 'three/examples/jsm/environments/RoomEnvironment.js';

/* ---------- minimal Three renderer wrapper ---------- */
class x {
  #e;
  canvas; camera; cameraMinAspect; cameraMaxAspect; cameraFov;
  maxPixelRatio; minPixelRatio; scene; renderer; #t;
  size = { width: 0, height: 0, wWidth: 0, wHeight: 0, ratio: 0, pixelRatio: 0 };
  render = this.#i;
  onBeforeRender = () => {}; onAfterRender = () => {}; onAfterResize = () => {};
  #s = false; #n = false; isDisposed = false; #o; #r; #a; #c = new e(); #h = { elapsed: 0, delta: 0 }; #l;
  constructor(e) { this.#e = { ...e }; this.#m(); this.#d(); this.#p(); this.resize(); this.#g(); }
  #m() { this.camera = new t(); this.cameraFov = this.camera.fov; }
  #d() { this.scene = new i(); }
  #p() {
    if (this.#e.canvas) this.canvas = this.#e.canvas;
    else if (this.#e.id) this.canvas = document.getElementById(this.#e.id);
    else console.error('Three: Missing canvas or id parameter');
    this.canvas.style.display = 'block';
    const e = { canvas: this.canvas, powerPreference: 'high-performance', ...(this.#e.rendererOptions ?? {}) };
    this.renderer = new s(e);
    this.renderer.outputColorSpace = n;
  }
  #g() {
    if (!(this.#e.size instanceof Object)) {
      window.addEventListener('resize', this.#f.bind(this));
      if (this.#e.size === 'parent' && this.canvas.parentNode) {
        this.#r = new ResizeObserver(this.#f.bind(this));
        this.#r.observe(this.canvas.parentNode);
      }
    }
    this.#o = new IntersectionObserver(this.#u.bind(this), { root: null, rootMargin: '0px', threshold: 0 });
    this.#o.observe(this.canvas);
    document.addEventListener('visibilitychange', this.#v.bind(this));
  }
  #y() {
    window.removeEventListener('resize', this.#f.bind(this));
    this.#r?.disconnect(); this.#o?.disconnect();
    document.removeEventListener('visibilitychange', this.#v.bind(this));
  }
  #u(e) { this.#s = e[0].isIntersecting; this.#s ? this.#w() : this.#z(); }
  #v() { if (this.#s) { document.hidden ? this.#z() : this.#w(); } }
  #f() { if (this.#a) clearTimeout(this.#a); this.#a = setTimeout(this.resize.bind(this), 100); }
  resize() {
    let e, t;
    if (this.#e.size instanceof Object) { e = this.#e.size.width; t = this.#e.size.height; }
    else if (this.#e.size === 'parent' && this.canvas.parentNode) { e = this.canvas.parentNode.offsetWidth; t = this.canvas.parentNode.offsetHeight; }
    else { e = window.innerWidth; t = window.innerHeight; }
    this.size.width = e; this.size.height = t; this.size.ratio = e / t;
    this.#x(); this.#b(); this.onAfterResize(this.size);
  }
  #x() {
    this.camera.aspect = this.size.width / this.size.height;
    if (this.camera.isPerspectiveCamera && this.cameraFov) {
      if (this.cameraMinAspect && this.camera.aspect < this.cameraMinAspect) this.#A(this.cameraMinAspect);
      else if (this.cameraMaxAspect && this.camera.aspect > this.cameraMaxAspect) this.#A(this.cameraMaxAspect);
      else this.camera.fov = this.cameraFov;
    }
    this.camera.updateProjectionMatrix();
    this.updateWorldSize();
  }
  #A(e) {
    const t = Math.tan(o.degToRad(this.cameraFov / 2)) / (this.camera.aspect / e);
    this.camera.fov = 2 * o.radToDeg(Math.atan(t));
  }
  updateWorldSize() {
    if (this.camera.isPerspectiveCamera) {
      const e = (this.camera.fov * Math.PI) / 180;
      this.size.wHeight = 2 * Math.tan(e / 2) * this.camera.position.length();
      this.size.wWidth = this.size.wHeight * this.camera.aspect;
    } else if (this.camera.isOrthographicCamera) {
      this.size.wHeight = this.camera.top - this.camera.bottom;
      this.size.wWidth = this.camera.right - this.camera.left;
    }
  }
  #b() {
    this.renderer.setSize(this.size.width, this.size.height);
    this.#t?.setSize(this.size.width, this.size.height);
    let e = window.devicePixelRatio;
    if (this.maxPixelRatio && e > this.maxPixelRatio) e = this.maxPixelRatio;
    else if (this.minPixelRatio && e < this.minPixelRatio) e = this.minPixelRatio;
    this.renderer.setPixelRatio(e);
    this.size.pixelRatio = e;
  }
  get postprocessing() { return this.#t; }
  set postprocessing(e) { this.#t = e; this.render = e.render.bind(e); }
  #w() {
    if (this.#n) return;
    const animate = () => {
      this.#l = requestAnimationFrame(animate);
      this.#h.delta = this.#c.getDelta();
      this.#h.elapsed += this.#h.delta;
      this.onBeforeRender(this.#h);
      this.render();
      this.onAfterRender(this.#h);
    };
    this.#n = true; this.#c.start(); animate();
  }
  #z() { if (this.#n) { cancelAnimationFrame(this.#l); this.#n = false; this.#c.stop(); } }
  #i() { this.renderer.render(this.scene, this.camera); }
  clear() {
    this.scene.traverse(e => {
      if (e.isMesh && typeof e.material === 'object' && e.material !== null) {
        Object.keys(e.material).forEach(t => {
          const i = e.material[t];
          if (i !== null && typeof i === 'object' && typeof i.dispose === 'function') i.dispose();
        });
        e.material.dispose(); e.geometry.dispose();
      }
    });
    this.scene.clear();
  }
  dispose() { this.#y(); this.#z(); this.clear(); this.#t?.dispose(); this.renderer.dispose(); this.isDisposed = true; }
}

/* ---------- pointer interaction helpers ---------- */
const map = new Map(), pointer = new r(); let attached = false;
function attach(domElement, opts) {
  const t = {
    position: new r(), nPosition: new r(), hover: false, touching: false,
    onEnter() {}, onMove() {}, onClick() {}, onLeave() {}, ...opts
  };
  if (!map.has(domElement)) {
    map.set(domElement, t);
    if (!attached) {
      document.body.addEventListener('pointermove', onPointerMove);
      document.body.addEventListener('pointerleave', onPointerLeave);
      document.body.addEventListener('click', onClick);
      document.body.addEventListener('touchstart', onTouchStart, { passive: false });
      document.body.addEventListener('touchmove', onTouchMove, { passive: false });
      document.body.addEventListener('touchend', onTouchEnd, { passive: false });
      document.body.addEventListener('touchcancel', onTouchEnd, { passive: false });
      attached = true;
    }
  }
  t.dispose = () => {
    map.delete(domElement);
    if (map.size === 0) {
      document.body.removeEventListener('pointermove', onPointerMove);
      document.body.removeEventListener('pointerleave', onPointerLeave);
      document.body.removeEventListener('click', onClick);
      document.body.removeEventListener('touchstart', onTouchStart);
      document.body.removeEventListener('touchmove', onTouchMove);
      document.body.removeEventListener('touchend', onTouchEnd);
      document.body.removeEventListener('touchcancel', onTouchEnd);
      attached = false;
    }
  };
  return t;
}
function onPointerMove(e){ pointer.x=e.clientX; pointer.y=e.clientY; processInteraction(); }
function onClick(e){ pointer.x=e.clientX; pointer.y=e.clientY; for (const [elem,t] of map){ const rect=elem.getBoundingClientRect(); updateNorm(t,rect); if (inside(rect)) t.onClick(t); } }
function onPointerLeave(){ for (const t of map.values()){ if (t.hover){ t.hover=false; t.onLeave(t); } } }
function onTouchStart(e){
  if (e.touches.length>0){ e.preventDefault(); pointer.x=e.touches[0].clientX; pointer.y=e.touches[0].clientY;
    for (const [elem,t] of map){ const rect=elem.getBoundingClientRect(); if (inside(rect)){ t.touching=true; updateNorm(t,rect); if (!t.hover){ t.hover=true; t.onEnter(t);} t.onMove(t);} } }
}
function onTouchMove(e){
  if (e.touches.length>0){ e.preventDefault(); pointer.x=e.touches[0].clientX; pointer.y=e.touches[0].clientY;
    for (const [elem,t] of map){ const rect=elem.getBoundingClientRect(); updateNorm(t,rect);
      if (inside(rect)){ if (!t.hover){ t.hover=true; t.touching=true; t.onEnter(t);} t.onMove(t);} else if (t.hover && t.touching){ t.onMove(t);} } }
}
function onTouchEnd(){ for (const [,t] of map){ if (t.touching){ t.touching=false; if (t.hover){ t.hover=false; t.onLeave(t);} } } }
function processInteraction(){ for (const [elem,t] of map){ const rect=elem.getBoundingClientRect(); if (inside(rect)){ updateNorm(t,rect); if (!t.hover){ t.hover=true; t.onEnter(t);} t.onMove(t);} else if (t.hover && !t.touching){ t.hover=false; t.onLeave(t);} } }
function updateNorm(t,rect){ const {position:i,nPosition:s}=t; i.x=pointer.x-rect.left; i.y=pointer.y-rect.top; s.x=(i.x/rect.width)*2-1; s.y=(-i.y/rect.height)*2+1; }
function inside(rect){ const {x,y}=pointer; const {left,top,width,height}=rect; return x>=left && x<=left+width && y>=top && y<=top+height; }

/* ---------- physics + instancing ---------- */
const { randFloat: k, randFloatSpread: E } = o;
const F=new a(), I=new a(), O=new a(), V=new a(), B=new a(), N=new a(), _=new a(), j=new a(), H=new a(), T=new a();

class W {
  constructor(e){ this.config=e;
    this.positionData=new Float32Array(3*e.count).fill(0);
    this.velocityData=new Float32Array(3*e.count).fill(0);
    this.sizeData=new Float32Array(e.count).fill(1);
    this.center=new a(); this.#R(); this.setSizes();
  }
  #R(){ const {config:e,positionData:t}=this; this.center.toArray(t,0);
    for (let i=1;i<e.count;i++){ const s=3*i; t[s]=E(2*e.maxX); t[s+1]=E(2*e.maxY); t[s+2]=E(2*e.maxZ); } }
  setSizes(){ const {config:e,sizeData:t}=this; t[0]=e.size0; for (let i=1;i<e.count;i++) t[i]=k(e.minSize,e.maxSize); }
  update(e){
    const {config:t,center:i,positionData:s,sizeData:n,velocityData:o}=this; let r=0;
    if (t.controlSphere0){ r=1; F.fromArray(s,0); F.lerp(i,0.1).toArray(s,0); V.set(0,0,0).toArray(o,0); }
    for (let idx=r; idx<t.count; idx++){ const base=3*idx; I.fromArray(s,base); B.fromArray(o,base);
      B.y -= e.delta * t.gravity * n[idx]; B.multiplyScalar(t.friction); B.clampLength(0,t.maxVelocity);
      I.add(B); I.toArray(s,base); B.toArray(o,base); }
    for (let idx=r; idx<t.count; idx++){
      const base=3*idx; I.fromArray(s,base); B.fromArray(o,base); const radius=n[idx];
      for (let jdx=idx+1; jdx<t.count; jdx++){
        const otherBase=3*jdx; O.fromArray(s,otherBase); N.fromArray(o,otherBase); const otherRadius=n[jdx];
        _.copy(O).sub(I); const dist=_.length(); const sumRadius=radius+otherRadius;
        if (dist<sumRadius){ const overlap=sumRadius-dist;
          j.copy(_).normalize().multiplyScalar(0.5*overlap);
          H.copy(j).multiplyScalar(Math.max(B.length(),1)); T.copy(j).multiplyScalar(Math.max(N.length(),1));
          I.sub(j); B.sub(H); I.toArray(s,base); B.toArray(o,base);
          O.add(j); N.add(T); O.toArray(s,otherBase); N.toArray(o,otherBase);
        }
      }
      if (t.controlSphere0){ _.copy(F).sub(I); const dist=_.length(); const sumRadius0=radius+n[0];
        if (dist<sumRadius0){ const diff=sumRadius0-dist; j.copy(_.normalize()).multiplyScalar(diff); H.copy(j).multiplyScalar(Math.max(B.length(),2)); I.sub(j); B.sub(H); } }
      if (Math.abs(I.x)+radius>t.maxX){ I.x=Math.sign(I.x)*(t.maxX-radius); B.x=-B.x*t.wallBounce; }
      if (t.gravity===0){ if (Math.abs(I.y)+radius>t.maxY){ I.y=Math.sign(I.y)*(t.maxY-radius); B.y=-B.y*t.wallBounce; } }
      else if (I.y-radius<-t.maxY){ I.y=-t.maxY+radius; B.y=-B.y*t.wallBounce; }
      const maxBoundary=Math.max(t.maxZ,t.maxSize);
      if (Math.abs(I.z)+radius>maxBoundary){ I.z=Math.sign(I.z)*(t.maxZ-radius); B.z=-B.z*t.wallBounce; }
      I.toArray(s,base); B.toArray(o,base);
    }
  }
}

/* ---------- material with glossy tweak ---------- */
class Y extends c {
  constructor(e){ super(e);
    this.uniforms={ thicknessDistortion:{value:0.1}, thicknessAmbient:{value:0}, thicknessAttenuation:{value:0.1}, thicknessPower:{value:2}, thicknessScale:{value:10} };
    this.defines.USE_UV=''; this.onBeforeCompile = e => {
      Object.assign(e.uniforms,this.uniforms);
      e.fragmentShader = '\nuniform float thicknessPower;\nuniform float thicknessScale;\nuniform float thicknessDistortion;\nuniform float thicknessAmbient;\nuniform float thicknessAttenuation;\n' + e.fragmentShader;
      e.fragmentShader = e.fragmentShader.replace('void main() {',
`void RE_Direct_Scattering(const in IncidentLight directLight, const in vec2 uv, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, inout ReflectedLight reflectedLight) {
  vec3 scatteringHalf = normalize(directLight.direction + (geometryNormal * thicknessDistortion));
  float scatteringDot = pow(saturate(dot(geometryViewDir, -scatteringHalf)), thicknessPower) * thicknessScale;
  #ifdef USE_COLOR
    vec3 scatteringIllu = (scatteringDot + thicknessAmbient) * vColor;
  #else
    vec3 scatteringIllu = (scatteringDot + thicknessAmbient) * diffuse;
  #endif
  reflectedLight.directDiffuse += scatteringIllu * thicknessAttenuation * directLight.color;
}
void main() {`);
      const t = h.lights_fragment_begin.replaceAll(
        'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );',
        'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );\nRE_Direct_Scattering(directLight, vUv, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, reflectedLight);'
      );
      e.fragmentShader = e.fragmentShader.replace('#include <lights_fragment_begin>', t);
      if (this.onBeforeCompile2) this.onBeforeCompile2(e);
    };
  }
}

/* ---------- defaults ---------- */
const X = {
  count: 200,
  colors: [0, 0, 0],
  ambientColor: 0xffffff,
  ambientIntensity: 1,
  lightIntensity: 200,
  materialParams: { metalness: 0.5, roughness: 0.5, clearcoat: 1, clearcoatRoughness: 0.15 },
  minSize: 0.5, maxSize: 1, size0: 1,
  gravity: 0.5, friction: 0.9975, wallBounce: 0.95, maxVelocity: 0.15,
  maxX: 5, maxY: 5, maxZ: 2,
  controlSphere0: false, followCursor: true
};

const TMP = new m();

/* ---------- instanced spheres ---------- */
class Z extends d {
  constructor(e, t = {}) {
    const i = { ...X, ...t };
    const env = new z();
    const tex = new p(e, 0.04).fromScene(env).texture;
    const geom = new g();
    const mat = new Y({ envMap: tex, ...i.materialParams });
    mat.envMapRotation.x = -Math.PI / 2;
    super(geom, mat, i.count);
    this.config = i;
    this.physics = new W(i);
    this.#S();
    this.setColors(i.colors);
  }
  #S() {
    this.ambientLight = new f(this.config.ambientColor, this.config.ambientIntensity);
    this.add(this.ambientLight);
    this.light = new u(this.config.colors[0], this.config.lightIntensity);
    this.add(this.light);
  }
  setColors(colors) {
    if (Array.isArray(colors) && colors.length > 1) {
      const grad = (function (arr) {
        let raw = [], list = [];
        function setColors(a) { raw = a; list = []; raw.forEach(col => { list.push(new l(col)); }); }
        setColors(arr);
        return {
          setColors,
          getColorAt: function (ratio, out = new l()) {
            const scaled = Math.max(0, Math.min(1, ratio)) * (raw.length - 1);
            const idx = Math.floor(scaled);
            const start = list[idx];
            if (idx >= raw.length - 1) return start.clone();
            const alpha = scaled - idx;
            const end = list[idx + 1];
            out.r = start.r + alpha * (end.r - start.r);
            out.g = start.g + alpha * (end.g - start.g);
            out.b = start.b + alpha * (end.b - start.b);
            return out;
          }
        };
      })(colors);
      for (let idx = 0; idx < this.count; idx++) {
        this.setColorAt(idx, grad.getColorAt(idx / this.count));
        if (idx === 0) this.light.color.copy(grad.getColorAt(idx / this.count));
      }
      this.instanceColor.needsUpdate = true;
    }
  }
  update(e) {
    this.physics.update(e);
    for (let idx = 0; idx < this.count; idx++) {
      TMP.position.fromArray(this.physics.positionData, 3 * idx);
      if (idx === 0 && this.config.followCursor === false) TMP.scale.setScalar(0);
      else TMP.scale.setScalar(this.physics.sizeData[idx]);
      TMP.updateMatrix();
      this.setMatrixAt(idx, TMP.matrix);
      if (idx === 0) this.light.position.copy(TMP.position);
    }
    this.instanceMatrix.needsUpdate = true;
  }
}

/* ---------- factory ---------- */
function createBallpit(canvas, opts = {}) {
  const three = new x({ canvas, size: 'parent', rendererOptions: { antialias: true, alpha: true } });
  let spheres;
  three.renderer.toneMapping = v;
  three.camera.position.set(0, 0, 20);
  three.camera.lookAt(0, 0, 0);
  three.cameraMaxAspect = 1.5;
  three.resize();

  init(opts);

  const ray = new y();
  const plane = new w(new a(0, 0, 1), 0);
  const pt = new a();
  let paused = false;

  canvas.style.touchAction = 'none';
  canvas.style.userSelect = 'none';
  canvas.style.webkitUserSelect = 'none';

  const inter = attach(canvas, {
    onMove() {
      ray.setFromCamera(inter.nPosition, three.camera);
      three.camera.getWorldDirection(plane.normal);
      ray.ray.intersectPlane(plane, pt);
      spheres.physics.center.copy(pt);
      spheres.config.controlSphere0 = true;
    },
    onLeave() {
      spheres.config.controlSphere0 = false;
    }
  });

  function init(e) {
    if (spheres) {
      three.clear();
      three.scene.remove(spheres);
    }
    spheres = new Z(three.renderer, e);
    three.scene.add(spheres);
  }

  three.onBeforeRender = e => { if (!paused) spheres.update(e); };
  three.onAfterResize = e => { spheres.config.maxX = e.wWidth / 2; spheres.config.maxY = e.wHeight / 2; };

  return {
    three,
    get spheres() { return spheres; },
    setCount(e) { init({ ...spheres.config, count: e }); },
    togglePause() { paused = !paused; },
    dispose() { inter.dispose(); three.dispose(); }
  };
}

/* ---------- React wrapper ---------- */
const Ballpit = ({ className = '', followCursor = true, ...props }) => {
  const canvasRef = useRef(null);
  const instRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    instRef.current = createBallpit(canvas, { followCursor, ...props });
    return () => { instRef.current?.dispose(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      className={className}
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  );
};

export default Ballpit;   // ✅ default export
export { Ballpit };       // (optional named export)
