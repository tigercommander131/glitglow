
/* ════════════════ THREE.JS AMBIENT SCENES ════════════════
   Disabled below 768px (CSS backgrounds remain as the fallback). 30fps cap on all loops. */
const THREE_OK = typeof THREE !== "undefined" && window.innerWidth >= 768
  && !matchMedia("(prefers-reduced-motion: reduce)").matches;
if (THREE_OK) document.body.classList.add("threeon");

function makeTicker(render){
  let raf = 0, on = false, last = 0;
  function frame(t){
    if (!on) return;
    raf = requestAnimationFrame(frame);
    if (t - last < 33) return; // 30fps cap
    last = t;
    render(t);
  }
  return {
    start(){ if (on) return; on = true; last = 0; raf = requestAnimationFrame(frame); },
    stop(){ on = false; cancelAnimationFrame(raf); raf = 0; }
  };
}

/* ── casino: drifting gold wireframe solids in deep fog ── */
let casScene = null;
function casInit(){
  if (casScene || !THREE_OK) return;
  const renderer = new THREE.WebGLRenderer({ canvas: $("bg3d-casino"), alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0e0500, 0.05);
  const cam = new THREE.PerspectiveCamera(60, innerWidth/innerHeight, 0.1, 120);
  cam.position.set(0, 0, 14);
  const geos = [new THREE.IcosahedronGeometry(1), new THREE.OctahedronGeometry(1)];
  const objs = [];
  for (let i = 0; i < 40; i++){
    const mat = new THREE.LineBasicMaterial({ color: 0xc9a84c, transparent: true, opacity: 0.13 + Math.random()*0.17 });
    const m = new THREE.LineSegments(new THREE.EdgesGeometry(geos[i % 2]), mat);
    m.scale.setScalar(0.6 + Math.random()*1.8);
    m.position.set((Math.random()-.5)*36, (Math.random()-.5)*22, -2 - Math.random()*34);
    m.userData = {
      rx: (Math.random()-.5)*0.0035, ry: (Math.random()-.5)*0.0035,
      vx: (Math.random()-.5)*0.008, vy: (Math.random()-.5)*0.005
    };
    scene.add(m); objs.push(m);
  }
  // tumbling playing cards drifting down through the fog
  const cardSuits = ["♠","♥","♦","♣","♠","♥"], fogCards = [];
  for (let i = 0; i < 6; i++){
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 2),
      new THREE.MeshBasicMaterial({ map: authCardTexture(cardSuits[i]), transparent: true,
        opacity: 0.3, side: THREE.DoubleSide, depthWrite: false })
    );
    m.position.set((Math.random()-.5)*30, (Math.random()-.5)*18, -4 - Math.random()*26);
    m.userData = {
      rx: (Math.random()-.5)*0.007, ry: (Math.random()-.5)*0.009,
      vy: -0.006 - Math.random()*0.007
    };
    scene.add(m); fogCards.push(m);
  }
  const tick = makeTicker(t => {
    for (const m of objs){
      m.rotation.x += m.userData.rx; m.rotation.y += m.userData.ry;
      m.position.x += m.userData.vx; m.position.y += m.userData.vy;
      if (m.position.x > 20) m.position.x = -20; else if (m.position.x < -20) m.position.x = 20;
      if (m.position.y > 13) m.position.y = -13; else if (m.position.y < -13) m.position.y = 13;
    }
    for (const c of fogCards){
      c.rotation.x += c.userData.rx; c.rotation.y += c.userData.ry;
      c.position.y += c.userData.vy;
      if (c.position.y < -12) c.position.y = 12;
    }
    // imperceptible sine drift
    cam.position.x = Math.sin(t*0.00006)*1.4;
    cam.position.y = Math.cos(t*0.00004)*0.9;
    cam.lookAt(0, 0, -12);
    renderer.render(scene, cam);
  });
  casScene = { renderer, cam, tick };
}

/* ── arcade: infinite synthwave grid + rising particle field ── */
let arcScene3 = null;
function arcInit(){
  if (arcScene3 || !THREE_OK) return;
  const renderer = new THREE.WebGLRenderer({ canvas: $("bg3d-arcade"), alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0d001a, 10, 95);
  const cam = new THREE.PerspectiveCamera(70, innerWidth/innerHeight, 0.1, 200);
  cam.position.set(0, 3.2, 12);
  cam.lookAt(0, 2.2, -60);
  const SEG_Z = 200/50; // one grid cell of z — scroll wraps on this for a seamless loop
  const grid = new THREE.Mesh(
    new THREE.PlaneGeometry(180, 200, 36, 50),
    new THREE.MeshBasicMaterial({ color: 0xb44fff, wireframe: true, transparent: true, opacity: 0.32 })
  );
  grid.rotation.x = -Math.PI/2;
  grid.position.set(0, -0.5, -60);
  scene.add(grid);
  const mkPts = (color) => {
    const n = 70, pos = new Float32Array(n*3);
    for (let i = 0; i < n; i++){
      pos[i*3] = (Math.random()-.5)*140;
      pos[i*3+1] = Math.random()*34;
      pos[i*3+2] = -15 - Math.random()*80;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ color, size: 0.35, transparent: true, opacity: 0.8 }));
    scene.add(p); return p;
  };
  const pink = mkPts(0xff2d78), cyan = mkPts(0x3ee8ff);
  const tick = makeTicker(t => {
    grid.position.z = -60 + ((t*0.0035) % SEG_Z); // scroll toward camera
    for (const pts of [pink, cyan]){
      const a = pts.geometry.attributes.position;
      for (let i = 0; i < a.count; i++){
        let y = a.getY(i) + 0.018;
        if (y > 34) y = 0;
        a.setY(i, y);
      }
      a.needsUpdate = true;
    }
    renderer.render(scene, cam);
  });
  arcScene3 = { renderer, cam, tick };
}

/* ── auth modal: floating card shuffle behind the form ── */
let authScene = null, authFxState = "closed", authFxT0 = 0, authStopT = 0;
function authCardTexture(suit){
  const cv = document.createElement("canvas"); cv.width = 128; cv.height = 180;
  const c = cv.getContext("2d");
  c.beginPath(); c.roundRect(3, 3, 122, 174, 12);
  c.fillStyle = "#f7f1e1"; c.fill();
  c.strokeStyle = "#c9a84c"; c.lineWidth = 4; c.stroke();
  const red = suit === "♥" || suit === "♦";
  c.fillStyle = red ? "#8b1a1a" : "#1a1a1a";
  c.textAlign = "center"; c.textBaseline = "middle";
  c.font = "700 64px 'Playfair Display', serif"; c.fillText(suit, 64, 92);
  c.font = "700 24px 'Playfair Display', serif"; c.fillText(suit, 21, 26); c.fillText(suit, 107, 155);
  return new THREE.CanvasTexture(cv);
}
function authFxInit(){
  if (authScene || !THREE_OK) return;
  const renderer = new THREE.WebGLRenderer({ canvas: $("authfx"), alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(55, innerWidth/innerHeight, 0.1, 60);
  cam.position.z = 12;
  const suits = ["♠","♥","♦","♣","♠","♥"];
  const cards = [];
  for (let i = 0; i < 6; i++){
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2.8),
      new THREE.MeshBasicMaterial({ map: authCardTexture(suits[i]), transparent: true, opacity: 0.85, side: THREE.DoubleSide })
    );
    const ang = i/6 * Math.PI*2;
    m.userData = {
      home: new THREE.Vector3(Math.cos(ang)*5.6, Math.sin(ang)*3.2, -1 - (i % 3)),
      out: new THREE.Vector3(Math.cos(ang)*24, Math.sin(ang)*15, -4),
      ph: Math.random()*Math.PI*2,
      rs: 0.004 + Math.random()*0.004
    };
    m.position.copy(m.userData.out);
    scene.add(m); cards.push(m);
  }
  const tick = makeTicker(t => {
    const k = Math.min(1, (performance.now() - authFxT0)/700);
    const e = 1 - Math.pow(1-k, 3);
    for (const m of cards){
      const opening = authFxState === "open";
      m.position.lerpVectors(opening ? m.userData.out : m.userData.home,
                             opening ? m.userData.home : m.userData.out, e);
      m.position.y += Math.sin(t*0.001 + m.userData.ph)*0.2;
      m.rotation.y += m.userData.rs;
      m.rotation.z = Math.sin(t*0.0008 + m.userData.ph)*0.16;
    }
    renderer.render(scene, cam);
  });
  authScene = { renderer, cam, tick };
}
if (THREE_OK){
  new MutationObserver(() => {
    const open = $("authmodal").classList.contains("on");
    if (open){
      authFxInit();
      authFxState = "open"; authFxT0 = performance.now();
      clearTimeout(authStopT); authScene.tick.start();
    } else if (authScene){
      authFxState = "closed"; authFxT0 = performance.now();
      clearTimeout(authStopT); authStopT = setTimeout(() => authScene.tick.stop(), 900);
    }
  }).observe($("authmodal"), { attributes: true, attributeFilter: ["class"] });
}

/* ── scene switching, hooked from showView ── */
/* synthwave 3D backdrop only on the hub — running it behind live game loops cost a
   full extra WebGL render pass during play */
const ARCADE_3D_VIEWS = ["arcade"];
function updateBgScenes(name){
  if (!THREE_OK) return;
  const casOn = name === "home" || name === "casino";
  const arcOn = ARCADE_3D_VIEWS.includes(name);
  $("bg3d-casino").classList.toggle("on", casOn);
  $("bg3d-arcade").classList.toggle("on", arcOn);
  if (casOn){ casInit(); casScene.tick.start(); } else if (casScene) casScene.tick.stop();
  if (arcOn){ arcInit(); arcScene3.tick.start(); } else if (arcScene3) arcScene3.tick.stop();
}
addEventListener("resize", () => {
  if (!THREE_OK) return;
  for (const s of [casScene, arcScene3, authScene]){
    if (!s) continue;
    s.renderer.setSize(innerWidth, innerHeight);
    s.cam.aspect = innerWidth/innerHeight;
    s.cam.updateProjectionMatrix();
  }
});
updateBgScenes("home");
