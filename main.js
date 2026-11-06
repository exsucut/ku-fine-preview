import * as THREE from './vendor/three.module.min.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = t => { t = clamp(t); return t * t * (3 - 2 * t); };
const span = (p, a, b) => clamp((p - a) / (b - a));
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = () => innerWidth <= 820;

/* ── 부드러운 스크롤 (터치는 기본 스크롤 유지) ── */
let lenis = null;
if (!REDUCED && window.Lenis) {
  lenis = new window.Lenis({ lerp: 0.09, wheelMultiplier: 0.9 });
}

/* ── 영상: 원래 속도 재생, 화면 근처만 로드, 화면 안에서만 재생 ── */
const videos = $$('video[data-v]');
const srcOf = v => `assets/v/${v.dataset.v}${isMobile() || navigator.connection?.saveData ? '_m' : ''}.mp4`;
const load = v => { if (!v.src) { v.src = srcOf(v); v.load(); } };
const tryPlay = v => { if (!REDUCED && v.paused) v.play().catch(() => {}); };
const nearIO = new IntersectionObserver(es => es.forEach(e => {
  const v = e.target;
  v._near = e.isIntersecting;
  if (e.isIntersecting) { load(v); if (!('gated' in v.dataset)) tryPlay(v); }
  else v.pause();
}), { rootMargin: '60% 0px' });
videos.forEach(v => nearIO.observe(v));

/* ── 등장 ── */
const riseIO = new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) { e.target.classList.add('in'); riseIO.unobserve(e.target); }
}), { threshold: 0.18 });
$$('[data-rise]').forEach(el => riseIO.observe(el));

/* ── 구간 진행도 ── */
const pins = {};
$$('[data-pin]').forEach(el => pins[el.dataset.pin] = { el, t: 0, p: 0, active: false });
function measure(dt) {
  const vh = innerHeight;
  const k = 1 - Math.exp(-dt * (lenis ? 14 : 9));
  for (const s of Object.values(pins)) {
    const r = s.el.getBoundingClientRect();
    s.t = clamp(-r.top / Math.max(1, r.height - vh));
    s.p += (s.t - s.p) * k;
    if (Math.abs(s.t - s.p) < 1e-4) s.p = s.t;
    s.active = r.top < vh && r.bottom > 0;
  }
}

/* 차례로 나타나는 글자: data-a ~ data-b 구간에서 초점이 맞았다 사라짐 */
const FADE = 0.045;
function seq(root, p) {
  for (const el of root.children) {
    const a = +el.dataset.a, b = +el.dataset.b;
    if (Number.isNaN(a)) continue;
    const o = smooth(span(p, a, a + FADE)) * (1 - smooth(span(p, b - FADE, b)));
    const u = (1 - smooth(span(p, a, a + FADE))) - (1 - (1 - smooth(span(p, b - FADE, b))));
    el.style.opacity = o;
    el.style.visibility = o < 0.004 ? 'hidden' : 'visible';
    el.style.filter = o > 0.995 ? 'none' : `blur(${(1 - o) * 7}px)`;
    if (!el.classList.contains('pf-low')) el.style.transform = `translateY(calc(-50% + ${u * 22}px))`;
  }
}

/* 겹쳐 넘어가는 장면: 샷 사이는 디졸브 */
function stack(pin, n, cb) {
  const items = $$('[data-stack]', pin.el);
  const u = pin.p * n;
  items.forEach((el, i) => {
    const hold = 0.82;
    let o;
    if (i === 0) o = 1;
    else o = smooth((u - (i - 1 + hold)) / (1 - hold) );
    const nextIn = i < n - 1 ? smooth((u - (i + hold)) / (1 - hold)) : 0;
    const vis = o > 0.002 && nextIn < 0.998;
    el.style.visibility = vis ? 'visible' : 'hidden';
    el.style.opacity = o;
    el.classList.toggle('live', vis);
    const v = $('video', el);
    if (v) { if (vis && pin.active && v._near) { load(v); tryPlay(v); } else v.pause(); }
    if (cb) cb(el, i, clamp(u - i + (1 - hold) * 0), vis);
  });
}

/* 숫자 올라감 */
const counters = $$('[data-count]').map(el => ({ el, n: +el.dataset.count, a: +el.dataset.from, b: +el.dataset.to,
  pin: pins[el.closest('[data-pin]').dataset.pin], comma: el.textContent.includes(','), last: -1 }));
function count() {
  for (const c of counters) {
    const v = Math.round(c.n * smooth(span(c.pin.p, c.a, c.b)));
    if (v !== c.last) { c.last = v; c.el.textContent = c.comma ? v.toLocaleString('en-US') : v; }
  }
}

/* ── 3D ── */
let GL = null;
try { GL = initGL(); } catch (e) { console.warn('WebGL off', e); document.documentElement.classList.add('nogl'); }

function initGL() {
  const canvas = $('#gl');
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 120);
  const size = () => {
    renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile() ? 1.5 : 1.75));
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  };
  size(); addEventListener('resize', size);

  /* 무대 1: 여섯 석판 */
  const mono = new THREE.Scene();
  mono.fog = new THREE.FogExp2(0x0a0706, 0.028);
  mono.add(new THREE.AmbientLight(0xffffff, 0.35));
  const core = new THREE.PointLight(0xc01040, 90, 40, 1.6); core.position.set(0, 2, 0); mono.add(core);
  const key = new THREE.DirectionalLight(0xfff0e0, 0.9); key.position.set(-5, 8, 12); mono.add(key);
  const ring = new THREE.Group(); mono.add(ring);
  const mirror = new THREE.Group(); mono.add(mirror);
  const R = 6.4, W = 4.2, H = 5.2, D = 0.42, FLOOR = -H / 2 - 0.02;
  const stone = new THREE.MeshStandardMaterial({ color: 0x241a17, roughness: 0.78, metalness: 0.1 });
  const stoneDim = new THREE.MeshBasicMaterial({ color: 0x0d0807, side: THREE.DoubleSide });
  const geo = new THREE.BoxGeometry(W, H, D);
  const loader = new THREE.TextureLoader();
  const crop = tex => { tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    const r = (W / H) / (16 / 9); tex.repeat.set(r, 1); tex.offset.set((1 - r) / 2, 0); return tex; };
  const glow = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    const rg = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    rg.addColorStop(0, 'rgba(190,20,70,.55)'); rg.addColorStop(.55, 'rgba(139,0,41,.14)'); rg.addColorStop(1, 'rgba(139,0,41,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const slabs = [];
  for (let i = 0; i < 6; i++) {
    const th = i / 6 * Math.PI * 2;
    const face = new THREE.MeshBasicMaterial({ color: 0xffffff, map: crop(loader.load(`assets/v/p${i + 1}.jpg`)) });
    const faceR = new THREE.MeshBasicMaterial({ color: 0x2e2826, map: face.map, side: THREE.DoubleSide, transparent: true });
    const m = new THREE.Mesh(geo, [stone, stone, stone, stone, face, stone]);
    m.position.set(Math.sin(th) * R, 0, Math.cos(th) * R); m.rotation.y = th; ring.add(m);
    const rf = new THREE.Mesh(geo, [stoneDim, stoneDim, stoneDim, stoneDim, faceR, stoneDim]);
    rf.position.set(m.position.x, FLOOR * 2, m.position.z); rf.rotation.y = th; rf.scale.y = -1; mirror.add(rf);
    const line = new THREE.Mesh(new THREE.BoxGeometry(W, 0.022, 0.02), new THREE.MeshBasicMaterial({ color: 0xc41545 }));
    line.position.set(0, -H / 2 + 0.012, D / 2 + 0.012); m.add(line);
    const v = document.createElement('video');
    v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'none'; v.crossOrigin = 'anonymous';
    const s = { m, face, faceR, v, ready: false, loaded: false };
    v.addEventListener('playing', () => {
      if (s.ready) return; s.ready = true;
      const t = crop(new THREE.VideoTexture(v));
      face.map = t; faceR.map = t; face.needsUpdate = faceR.needsUpdate = true;
    });
    slabs.push(s);
  }
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.set(17, 12, 1); mono.add(halo);

  // 부유하는 먼지
  const dustN = isMobile() ? 500 : 1100, dustP = new Float32Array(dustN * 3);
  for (let i = 0; i < dustN; i++) { dustP[i * 3] = (Math.random() - .5) * 34; dustP[i * 3 + 1] = Math.random() * 13 - 3; dustP[i * 3 + 2] = (Math.random() - .5) * 34; }
  const dustG = new THREE.BufferGeometry(); dustG.setAttribute('position', new THREE.BufferAttribute(dustP, 3));
  const dust = new THREE.Points(dustG, new THREE.PointsMaterial({ color: 0xe9c9c0, size: 0.028, transparent: true, opacity: 0.5, depthWrite: false }));
  mono.add(dust);

  /* 무대 2: 1,800개의 기둥. 모두 같은 높이까지 오른다 (조건 없는 기본) */
  const pil = new THREE.Scene();
  const CX = 50, CZ = 36, N = CX * CZ, GAP = 0.3;
  const pg = new THREE.InstancedBufferGeometry();
  const box = new THREE.BoxGeometry(0.15, 1, 0.15); box.translate(0, 0.5, 0);
  pg.index = box.index; pg.setAttribute('position', box.attributes.position); pg.setAttribute('normal', box.attributes.normal);
  const off = new Float32Array(N * 3), del = new Float32Array(N);
  for (let z = 0, k = 0; z < CZ; z++) for (let x = 0; x < CX; x++, k++) {
    const ox = (x - (CX - 1) / 2) * GAP, oz = (z - (CZ - 1) / 2) * GAP;
    off.set([ox, 0, oz], k * 3);
    del[k] = Math.min(1, Math.hypot(ox, oz) / 10) * 0.72 + Math.random() * 0.14;
  }
  pg.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 3));
  pg.setAttribute('aDel', new THREE.InstancedBufferAttribute(del, 1));
  pg.instanceCount = N;
  const pm = new THREE.ShaderMaterial({
    uniforms: { uP: { value: 0 }, uT: { value: 0 }, uH: { value: 3 } },
    vertexShader: `attribute vec3 aOff;attribute float aDel;uniform float uP,uT,uH;varying float vY,vL,vD;
      void main(){float g=clamp((uP*1.86-aDel)/.42,0.,1.);g=g*g*(3.-2.*g);
        float br=sin(uT*.8+aOff.x*.55+aOff.z*.8)*.035*g;float h=max(.012,uH*g+br);
        vec3 p=position;p.y*=h;vec4 mv=modelViewMatrix*vec4(p+aOff,1.);vY=position.y;vL=g;vD=-mv.z;
        vec3 n=normalize(normal);float l=.5+.5*dot(n,normalize(vec3(-.5,.7,.6)));vL*=l;gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `varying float vY,vL,vD;
      void main(){vec3 a=vec3(.006,.001,.002),b=vec3(.2,.004,.04),c=vec3(.95,.72,.62);
        vec3 col=mix(a,b,pow(vY,7.));float top=smoothstep(.985,1.,vY);col=mix(col,c,top*.85);
        col*=.3+vL*.95;float f=smoothstep(27.,12.,vD)*smoothstep(5.5,10.5,vD);gl_FragColor=vec4(col*f,1.);
        #include <colorspace_fragment>
      }`,
    transparent: true,
  });
  const pillars = new THREE.Mesh(pg, pm); pillars.frustumCulled = false; pil.add(pillars);

  /* 무대 3: 5000 입자 → 교표, 70% 고리 */
  const pro = new THREE.Scene();
  const PN = 5000;
  const ps = new Float32Array(PN * 3), pt = new Float32Array(PN * 3), pse = new Float32Array(PN);
  for (let i = 0; i < PN; i++) {
    const r = 3.5 + Math.random() * 7, a = Math.random() * 6.283, c = Math.random() * 2 - 1, q = Math.sqrt(1 - c * c);
    ps.set([Math.cos(a) * q * r, c * r * .75, Math.sin(a) * q * r - 2], i * 3); pse[i] = Math.random();
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(ps, 3));
  pGeo.setAttribute('aT', new THREE.BufferAttribute(pt, 3));
  pGeo.setAttribute('aS', new THREE.BufferAttribute(pse, 1));
  const pMat = new THREE.ShaderMaterial({
    uniforms: { uM: { value: 0 }, uT: { value: 0 }, uA: { value: 1 }, uPx: { value: 1 } },
    vertexShader: `attribute vec3 aT;attribute float aS;uniform float uM,uT,uPx;varying float vS;
      void main(){float m=clamp(uM*1.35-aS*.35,0.,1.);m=m*m*(3.-2.*m);
        vec3 d=position+vec3(sin(uT*.22+aS*40.),cos(uT*.19+aS*30.),sin(uT*.15+aS*20.))*.28;
        vec3 p=mix(d,aT,m);vec4 mv=modelViewMatrix*vec4(p,1.);vS=aS;
        gl_PointSize=uPx*(mix(25.,15.,m)+aS*mix(7.,3.,m))/-mv.z;gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `uniform float uA;varying float vS;
      void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;
        float a=smoothstep(.5,.28,d)*uA*(.72+vS*.28);gl_FragColor=vec4(.975,.945,.89,a);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false,
  });
  const dots = new THREE.Points(pGeo, pMat); dots.frustumCulled = false; pro.add(dots);
  const crestImg = new Image();
  crestImg.onload = () => {
    const c = document.createElement('canvas'); c.width = crestImg.width; c.height = crestImg.height;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(crestImg, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const on = [];
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      const al = d[(y * c.width + x) * 4 + 3], nx = x / c.width, ny = y / c.height;
      // 상단 띠: 면 대신 KOREA UNIVERSITY 글자(비어 있는 부분)를 점으로 찍는다
      if (ny < .285) {
        const letter = al < 110 && nx > .07 && nx < .93 && ny > .058 && ny < .24;
        const rim = al > 140 && (ny < .022 || ny > .262 || nx < .03 || nx > .97);
        if (letter || (rim && Math.random() < .5)) on.push(x, y);
      } else if (al > 140) {
        const edge = nx < .075 || nx > .925 || ny > .9;
        if (Math.random() < (edge ? .5 : 1)) on.push(x, y);
      }
    }
    const K = 3.7 / c.height; // 교표 높이 (월드)
    for (let i = 0; i < PN; i++) {
      const j = Math.floor(Math.random() * on.length / 2) * 2;
      pt.set([(on[j] - c.width / 2 + Math.random() - .5) * K, -(on[j + 1] - c.height / 2 + Math.random() - .5) * K, (Math.random() - .5) * .1], i * 3);
    }
    pGeo.attributes.aT.needsUpdate = true;
  };
  crestImg.src = 'assets/i/crest_p.png';

  const ringGroup = new THREE.Group(); pro.add(ringGroup);
  const rMat = new THREE.ShaderMaterial({
    uniforms: { uF: { value: 0 }, uA: { value: 0 } },
    vertexShader: `varying float vA;void main(){vA=atan(position.x,position.y);if(vA<0.)vA+=6.2831853;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform float uF,uA;varying float vA;void main(){float on=step(vA/6.2831853,uF);vec3 c=mix(vec3(.45,.05,.14),vec3(.985,.955,.9),on);
      gl_FragColor=vec4(c,uA*mix(.55,1.,on));
      #include <colorspace_fragment>
    }`,
    transparent: true,
  });
  const torus = new THREE.Mesh(new THREE.TorusGeometry(2.15, 0.035, 16, 360), rMat);
  ringGroup.add(torus);
  const orbit = new THREE.Mesh(new THREE.TorusGeometry(2.65, 0.006, 8, 240), new THREE.MeshBasicMaterial({ color: 0xf4efe6, transparent: true, opacity: 0 }));
  orbit.rotation.x = 1.15; ringGroup.add(orbit);
  const orbitDot = new THREE.Mesh(new THREE.SphereGeometry(.055, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
  ringGroup.add(orbitDot);

  const look = new THREE.Vector3();
  let modeNow = null;
  function setMode(mode) {
    if (mode === modeNow) return;
    modeNow = mode;
    canvas.classList.toggle('on', !!mode);
    $('#glbg').classList.toggle('crimson', mode === 'proof');
    if (mode !== 'mono') slabs.forEach(s => s.v.pause());
  }

  function frameMono(p, t) {
    const a0 = .13, a1 = .9;
    const u = span(p, a0, a1) * 6 - .5;
    const k = Math.floor(u), f = u - k;
    const a = clamp(k + smooth((f - .6) / .4), 0, 5);
    const intro = 1 - smooth(span(p, .05, .15));
    const outro = smooth(span(p, .92, 1));
    ring.rotation.y = mirror.rotation.y = -a * Math.PI / 3 + intro * .7 - outro * .5;
    const mob = isMobile(), port = camera.aspect < 1;
    const fit = (mob || port) ? clamp(5.2 / (W * 1.14 / camera.aspect / .7), 1, 3) : 1;
    const dist = mob ? Math.max(14.5, 1 / (Math.tan(17.5 * Math.PI / 180) * camera.aspect) * W * .62) : 13.6;
    const sx = mob ? 0 : -3.05;
    const sy = mob ? -1.5 * fit * .85 : 0;
    const camX = -sx + Math.sin(t * .22) * .05, camY = sy + .1 + Math.sin(t * .17) * .04;
    const cz = R + dist;
    mono.fog.density = .028 * (1 - intro * .8);
    camera.position.set(camX * (1 - intro) , camY + intro * 12.5 + outro * 2, cz + intro * 15 + outro * 3);
    look.set(camX * (1 - intro), sy * (1 - intro) + intro * .5, R * (1 - intro));
    camera.lookAt(look);
    halo.position.set(0, .5, R - 1.4 - intro * 4); halo.material.opacity = .42;
    dust.rotation.y = t * .012;
    const nearest = Math.round(a);
    slabs.forEach((s, i) => {
      const dd = Math.min(Math.abs(i - a), 6 - Math.abs(i - a));
      const lit = intro > .3 ? .72 : (.09 + .91 * (1 - smooth(dd / .7)));
      s.face.color.setScalar(lit * (1 - outro * .7)); s.faceR.color.setScalar(lit * .17);
      if (i === nearest && !REDUCED && intro < .95) {
        if (!s.loaded) { s.loaded = true; s.v.src = `assets/v/p${i + 1}_m.mp4`; }
        if (s.v.paused) s.v.play().catch(() => {});
      } else if (!s.v.paused) s.v.pause();
    });
    renderer.render(mono, camera);
    return a;
  }

  function framePillars(p, t) {
    const q = smooth(span(p, .18, .8));
    pm.uniforms.uP.value = span(p, .1, .76); pm.uniforms.uT.value = t;
    const m = isMobile();
    const orbitA = -.62 + p * .95 + Math.sin(t * .08) * .012;
    const rad = (m ? 15.5 : 12.5) - q * 1.4;
    const y = .7 + q * 3.5;
    camera.position.set(Math.sin(orbitA) * rad, y, Math.cos(orbitA) * rad);
    look.set(0, 2.5 + q * 1.2, 0); camera.lookAt(look);
    renderer.render(pil, camera);
  }

  function frameProof(p, t) {
    const m = isMobile();
    const form = smooth(span(p, .56, .72)), out = smooth(span(p, .79, .86));
    pMat.uniforms.uM.value = form * (1 - out); pMat.uniforms.uT.value = t;
    pMat.uniforms.uPx.value = renderer.getPixelRatio() * (m ? .78 : 1) * (innerHeight / 800);
    pMat.uniforms.uA.value = .35 + .65 * form * (1 - out) + .12 * out;
    const s = m ? Math.min(1, camera.aspect * 1.5) : 1;
    dots.scale.setScalar(s);
    dots.position.y = .52 * s + (m ? .3 : 0);
    dots.rotation.y = (1 - form) * .5 + Math.sin(t * .35) * .1 * (form * (1 - out)) + t * .03 * (1 - form);
    dots.rotation.x = Math.sin(t * .27) * .035;
    const rv = smooth(span(p, .81, .88));
    rMat.uniforms.uA.value = rv; rMat.uniforms.uF.value = .7 * smooth(span(p, .82, .94));
    orbit.material.opacity = rv * .4; orbitDot.material.opacity = rv;
    ringGroup.scale.setScalar(s);
    ringGroup.rotation.set(-.14 + Math.sin(t * .3) * .05, -.32 + Math.sin(t * .21) * .08, 0);
    const oa = t * .55; orbitDot.position.set(Math.cos(oa) * 2.65, Math.sin(oa) * 2.65 * Math.cos(1.15), Math.sin(oa) * 2.65 * Math.sin(1.15));
    camera.position.set(0, 0, 9.2); look.set(0, 0, 0); camera.lookAt(look);
    renderer.render(pro, camera);
  }
  return { setMode, frameMono, framePillars, frameProof, slabs };
}

/* ── 장면별 갱신 ── */
const hero = pins.hero, heroFrame = $('#heroFrame'), heroVid = $('video', heroFrame), heroTitle = $('#heroTitle'), heroQ = $('#heroQ'), cue = $('#cue');
const barT = $('#barT'), barB = $('#barB');
const seqs = $$('.seq').map(el => ({ el, pin: pins[el.closest('[data-pin]').dataset.pin], local: el.dataset.local }));
const prList = $$('#prList .pr'), prIntro = $('#prIntro'), prCount = $('#prCount');
const navEl = $('#nav'), navCh = $('#navCh'), bar = $('#bar');

function updateHero() {
  const p = hero.p, vw = innerWidth, vh = innerHeight;
  const titleOut = smooth(span(p, .1, .3));
  heroTitle.style.opacity = 1 - titleOut;
  heroTitle.style.transform = `translateY(${-titleOut * 40}px)`;
  heroTitle.style.visibility = titleOut > .995 ? 'hidden' : 'visible';
  cue.style.visibility = p > .03 ? 'hidden' : 'visible';
  const f = smooth(span(p, .24, .68));
  const ix = f * vw * (isMobile() ? .08 : .2), iy = f * vh * .2;
  heroFrame.style.clipPath = `inset(${iy}px ${ix}px)`;
  heroVid.style.transform = `scale(${1 + f * .08})`;
  const qIn = smooth(span(p, .42, .62)), qOut = smooth(span(p, .88, .98));
  heroQ.style.opacity = qIn * (1 - qOut);
  heroQ.style.filter = qIn >= 1 ? 'none' : `blur(${(1 - qIn) * 8}px)`;
  heroFrame.style.opacity = 1 - smooth(span(p, .84, .98));
  $('.scrim-hero', heroFrame).style.background = `linear-gradient(180deg,rgba(8,5,4,.78),rgba(8,5,4,${.62 + titleOut * .06}) 44%,rgba(8,5,4,${.16 + titleOut * .52}) 70%,rgba(8,5,4,${.5 + titleOut * .2}))`;
  if (document.documentElement.classList.contains('opened')) {
    const h = Math.max(0, 1 - f * 3);
    barT.style.opacity = barB.style.opacity = h;
  }
}

function updatePromises(a, p) {
  const io = 1 - smooth(span(p, .09, .125));
  const iin = smooth(span(p, .008, .05));
  prIntro.style.opacity = iin * io;
  prIntro.style.visibility = iin * io < .004 ? 'hidden' : 'visible';
  const shown = smooth(span(p, .135, .165)) * (1 - smooth(span(p, .93, .985)));
  prList.forEach((el, i) => {
    const o = (1 - smooth(Math.abs(i - a) / .36)) * shown;
    el.style.opacity = o;
    el.style.visibility = o < .004 ? 'hidden' : 'visible';
    const y = (i - a) * 34;
    el.style.transform = isMobile() ? `translateY(${y}px)` : `translateY(calc(-50% + ${y}px))`;
  });
  prCount.textContent = `${Math.round(a) + 1} / 6`;
  prCount.style.opacity = shown;
}

function updateQs() {
  stack(pins.qs, 6, (el, i, _l, vis) => {
    if (!vis) return;
    // 각 장면 안: 질문이 먼저, 이어 답이 올라온다
    const l = pins.qs.p * 6 - i;
    const ans = smooth(span(l, .2, .38));
    const a = $('.q-ans', el), h = $('.q-head', el);
    a.style.opacity = ans; a.style.transform = `translateY(${(1 - ans) * 26}px)`;
    h.style.transform = `translateY(${(1 - ans) * (isMobile() ? 60 : 84)}px) scale(${1.06 - ans * .06})`;
  });
}

const ORDER = ['promises', 'q1', 'proof'];
function updateGL(t, dt) {
  if (!GL) return;
  let mode = null;
  for (const id of ORDER) if (pins[id].active) mode = pins[id].el.dataset.gl;
  GL.setMode(mode);
  if (mode === 'mono') updatePromises(GL.frameMono(pins.promises.p, t), pins.promises.p);
  else if (mode === 'pillars') GL.framePillars(pins.q1.p, t);
  else if (mode === 'proof') GL.frameProof(pins.proof.p, t);
}

/* 상단: 진행선, 장 이름, 색 */
const chapters = $$('[data-ch]');
let chNow = null, lightNow = null;
function updateNav() {
  const max = document.documentElement.scrollHeight - innerHeight;
  bar.style.transform = `scaleX(${clamp(scrollY / Math.max(1, max))})`;
  let ch = '', light = false;
  for (const el of chapters) {
    const r = el.getBoundingClientRect();
    if (r.top <= 40 && r.bottom > 40) { ch = el.dataset.ch; light = el.dataset.nav === 'light'; break; }
  }
  if (ch !== chNow) { chNow = ch; navCh.textContent = ch; }
  if (light !== lightNow) { lightNow = light; navEl.classList.toggle('light', light); }
}

/* 메인 루프 */
let last = performance.now(), T = 0;
function tick(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now; T += dt;
  if (lenis) lenis.raf(now);
  measure(dt);
  if (hero.active) updateHero();
  for (const s of seqs) if (s.pin.active) {
    if (s.local !== undefined) seq(s.el, clamp(s.pin.p * 3 / .82));
    else seq(s.el, s.pin.p);
  }
  if (pins.dirs.active) stack(pins.dirs, 3);
  if (pins.qs.active) updateQs();
  if (pins.ending.active) stack(pins.ending, 3);
  count();
  updateGL(T, dt);
  updateNav();
  requestAnimationFrame(tick);
}

/* 오프닝 */
const root = document.documentElement;
if (REDUCED) { root.classList.add('lit', 'opened'); }
else {
  setTimeout(() => root.classList.add('lit'), 40);
  load(heroVid); tryPlay(heroVid);
  const open = () => root.classList.add('opened');
  let done = false;
  const go = () => { if (done) return; done = true; setTimeout(open, 450); };
  heroVid.addEventListener('playing', go, { once: true });
  setTimeout(go, 900);
}
requestAnimationFrame(tick);

/* 소리 */
const snd = $('#snd'), bgm = $('#bgm');
let fadeId = 0;
function fadeTo(v, done) {
  clearInterval(fadeId);
  fadeId = setInterval(() => {
    const d = v - bgm.volume;
    if (Math.abs(d) < .02) { bgm.volume = v; clearInterval(fadeId); done && done(); return; }
    bgm.volume = clamp(bgm.volume + Math.sign(d) * .02);
  }, 40);
}
snd.addEventListener('click', () => {
  const on = snd.getAttribute('aria-pressed') !== 'true';
  snd.setAttribute('aria-pressed', on);
  if (on) { bgm.volume = 0; bgm.play().catch(() => {}); fadeTo(.55); } else fadeTo(0, () => bgm.pause());
});

/* 전체 영상 (공유본에는 없음) */
const dlg = $('#filmDlg'), filmV = $('#filmV');
if (dlg) {
  $('#filmBtn').addEventListener('click', () => {
    if (!filmV.src) filmV.src = filmV.dataset.src;
    if (!bgm.paused) snd.click();
    lenis && lenis.stop();
    dlg.showModal(); filmV.play().catch(() => {});
  });
  $('#filmClose').addEventListener('click', () => { filmV.pause(); dlg.close(); });
  dlg.addEventListener('close', () => { filmV.pause(); lenis && lenis.start(); });
}

/* 위로 링크 */
$('.nav-id').addEventListener('click', e => { e.preventDefault(); lenis ? lenis.scrollTo(0) : scrollTo({ top: 0, behavior: 'smooth' }); });
