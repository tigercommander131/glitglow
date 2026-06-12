
/* ════════════════ ASTEROIDS ════════════════ */
const astCv = $("astcv"), astX = astCv.getContext("2d");
const AST_W = 520, AST_H = 520;
let astShip, astRocks = [], astBullets = [], astParts = [], astUfo = null, astUfoB = null;
let astScore = 0, astWave = 1, astLives = 3, astRun = false, astRaf = 0, astK = {}, astDeadT = 0;
let astHigh = +localStorage.getItem("gg_asthigh") || 0;
function astStart(){
  astShip = { x: AST_W/2, y: AST_H/2, a: -Math.PI/2, vx: 0, vy: 0, inv: 120 };
  astRocks = []; astBullets = []; astParts = []; astUfo = null; astUfoB = null;
  astScore = 0; astWave = 1; astLives = 3; astDeadT = 0; astK = {};
  $("astover").classList.remove("on");
  $("asthigh").textContent = astHigh;
  astSpawnWave(); astHud();
  astRun = true; cancelAnimationFrame(astRaf); astLoop();
}
function astStop(){ astRun = false; cancelAnimationFrame(astRaf); astRaf = 0; }
function astHud(){
  $("astscore").textContent = astScore; $("astwave").textContent = astWave;
  $("astlives").textContent = Array(Math.max(0, astLives)).fill("▲").join(" ") || "—";
  if (astScore > astHigh){ astHigh = astScore; localStorage.setItem("gg_asthigh", astHigh); $("asthigh").textContent = astHigh; }
  if (astScore >= 10000) ach("asteroids10k");
}
function astMkRock(x, y, size){
  const R = size === 3 ? 42 : size === 2 ? 24 : 13;
  const verts = [];
  for (let i = 0; i < 10; i++) verts.push(R * (0.72 + Math.random()*0.45));
  const sp = 0.5 + Math.random()*0.7 + (3 - size)*0.55;
  const a = Math.random()*Math.PI*2;
  return { x, y, vx: Math.cos(a)*sp, vy: Math.sin(a)*sp, r: R, verts, rot: Math.random()*7, vr: (Math.random()-.5)*.03, size };
}
function astSpawnWave(){
  for (let i = 0; i < 2 + astWave; i++){
    let x, y;
    do { x = Math.random()*AST_W; y = Math.random()*AST_H; }
    while (Math.hypot(x - astShip.x, y - astShip.y) < 170);
    astRocks.push(astMkRock(x, y, 3));
  }
}
function astFire(){
  if (!astRun || astDeadT > 0 || astBullets.length >= 4) return;
  SND.zap();
  astBullets.push({ x: astShip.x + Math.cos(astShip.a)*14, y: astShip.y + Math.sin(astShip.a)*14,
    vx: astShip.vx + Math.cos(astShip.a)*7.5, vy: astShip.vy + Math.sin(astShip.a)*7.5, life: 62 });
}
function astWrap(o, m = 20){
  if (o.x < -m) o.x = AST_W + m; else if (o.x > AST_W + m) o.x = -m;
  if (o.y < -m) o.y = AST_H + m; else if (o.y > AST_H + m) o.y = -m;
}
function astBoomP(x, y, n, col){
  for (let i = 0; i < n; i++){
    const a = Math.random()*7, s = 1 + Math.random()*3.4;
    astParts.push({ x, y, vx: Math.cos(a)*s, vy: Math.sin(a)*s, life: 24 + Math.random()*22, c: col });
  }
}
function astSplit(j){
  const r = astRocks[j];
  astScore += r.size === 3 ? 20 : r.size === 2 ? 50 : 100;
  SND.boomA(r.size < 3);
  astBoomP(r.x, r.y, r.size*7, "#b44fff");
  if (r.size > 1) astRocks.push(astMkRock(r.x, r.y, r.size - 1), astMkRock(r.x, r.y, r.size - 1));
  astRocks.splice(j, 1);
  astHud();
}
function astKillShip(){
  SND.boomA(); astBoomP(astShip.x, astShip.y, 30, "#3ee8ff");
  astLives--; astHud();
  astDeadT = 70;
}
function astOver(){
  astRun = false;
  SND.over(); stArc("asteroids", astScore);
  $("astoverscore").textContent = "SCORE " + astScore + (astScore >= astHigh && astScore > 0 ? " · NEW BEST" : "");
  $("astover").classList.add("on");
}
function astLoop(){
  if (!astRun) return;
  if (!frameGate("ast")){ astRaf = requestAnimationFrame(astLoop); return; }
  if (astDeadT > 0){
    astDeadT--;
    if (astDeadT === 0){
      if (astLives <= 0){ astOver(); return; }
      astShip.x = AST_W/2; astShip.y = AST_H/2; astShip.vx = astShip.vy = 0;
      astShip.a = -Math.PI/2; astShip.inv = 120;
    }
  } else {
    if (astK.left) astShip.a -= 0.072;
    if (astK.right) astShip.a += 0.072;
    if (astK.thrust){
      astShip.vx += Math.cos(astShip.a)*0.14; astShip.vy += Math.sin(astShip.a)*0.14;
      SND.thrust();
      if (Math.random() < .8) astParts.push({ x: astShip.x - Math.cos(astShip.a)*12, y: astShip.y - Math.sin(astShip.a)*12,
        vx: -Math.cos(astShip.a)*2.4 + (Math.random()-.5), vy: -Math.sin(astShip.a)*2.4 + (Math.random()-.5), life: 12, c: "#ff9b2d" });
    }
    astShip.vx *= .992; astShip.vy *= .992;
    astShip.x += astShip.vx; astShip.y += astShip.vy;
    astWrap(astShip);
    if (astShip.inv > 0) astShip.inv--;
  }
  for (let i = astBullets.length - 1; i >= 0; i--){
    const b = astBullets[i];
    b.x += b.vx; b.y += b.vy; b.life--;
    astWrap(b, 4);
    if (b.life <= 0) astBullets.splice(i, 1);
  }
  for (const r of astRocks){ r.x += r.vx; r.y += r.vy; r.rot += r.vr; astWrap(r, r.r); }
  // bullets vs rocks / ufo
  for (let i = astBullets.length - 1; i >= 0; i--){
    const b = astBullets[i];
    let used = false;
    for (let j = astRocks.length - 1; j >= 0; j--){
      const r = astRocks[j];
      if ((b.x - r.x)**2 + (b.y - r.y)**2 < r.r*r.r){ astBullets.splice(i, 1); astSplit(j); used = true; break; }
    }
    if (!used && astUfo && Math.abs(b.x - astUfo.x) < 22 && Math.abs(b.y - astUfo.y) < 14){
      astBullets.splice(i, 1);
      SND.boomA(); astBoomP(astUfo.x, astUfo.y, 26, "#ff2d78");
      astScore += 200; astHud(); astUfo = null;
    }
  }
  // ship vs rocks
  if (astDeadT === 0 && astShip.inv <= 0){
    for (const r of astRocks){
      if ((astShip.x - r.x)**2 + (astShip.y - r.y)**2 < (r.r + 8)**2){ astKillShip(); break; }
    }
  }
  // ufo lifecycle
  if (!astUfo && Math.random() < 0.0016 + astWave*0.0002){
    const dir = Math.random() < .5 ? 1 : -1;
    astUfo = { x: dir > 0 ? -30 : AST_W + 30, y: 60 + Math.random()*(AST_H - 160), vx: dir*(1.6 + astWave*.15), t: 0 };
    SND.alarm();
  }
  if (astUfo){
    astUfo.t++;
    astUfo.x += astUfo.vx; astUfo.y += Math.sin(astUfo.t*.03)*1.4;
    if (astUfo.x < -40 || astUfo.x > AST_W + 40) astUfo = null;
    else if (astUfo.t % 110 === 100 && !astUfoB){
      const dx = astShip.x - astUfo.x, dy = astShip.y - astUfo.y, d = Math.hypot(dx, dy) || 1;
      const wob = (Math.random()-.5)*0.6;
      astUfoB = { x: astUfo.x, y: astUfo.y, vx: dx/d*3.4 + wob, vy: dy/d*3.4 + wob, life: 120 };
      SND.zap2();
    }
  }
  if (astUfoB){
    astUfoB.x += astUfoB.vx; astUfoB.y += astUfoB.vy; astUfoB.life--;
    astWrap(astUfoB, 4);
    if (astUfoB.life <= 0) astUfoB = null;
    else if (astDeadT === 0 && astShip.inv <= 0 && (astUfoB.x - astShip.x)**2 + (astUfoB.y - astShip.y)**2 < 144){
      astUfoB = null; astKillShip();
    }
  }
  for (let i = astParts.length - 1; i >= 0; i--){
    const p = astParts[i];
    p.x += p.vx; p.y += p.vy; p.life--;
    if (p.life <= 0) astParts.splice(i, 1);
  }
  if (!astRocks.length && !astUfo){ astWave++; astHud(); SND.power(); astSpawnWave(); }
  astDrawF();
  astRaf = requestAnimationFrame(astLoop);
}
function astDrawF(){
  astX.clearRect(0, 0, AST_W, AST_H);
  astX.fillStyle = "#08000f"; astX.fillRect(0, 0, AST_W, AST_H);
  astX.fillStyle = "rgba(217,185,255,.25)";
  for (let i = 0; i < 40; i++) astX.fillRect((i*131)%AST_W, (i*73)%AST_H, 1.5, 1.5);
  for (const p of astParts){ astX.globalAlpha = Math.min(1, p.life/20); astX.fillStyle = p.c; astX.fillRect(p.x-1.5, p.y-1.5, 3, 3); }
  astX.globalAlpha = 1;
  astX.strokeStyle = "#b44fff"; astX.lineWidth = 2; astX.shadowColor = "#b44fff"; astX.shadowBlur = LOWFX ? 0 : 10;
  for (const r of astRocks){
    astX.beginPath();
    for (let i = 0; i < r.verts.length; i++){
      const a = r.rot + i/r.verts.length*Math.PI*2;
      const x = r.x + Math.cos(a)*r.verts[i], y = r.y + Math.sin(a)*r.verts[i];
      i ? astX.lineTo(x, y) : astX.moveTo(x, y);
    }
    astX.closePath(); astX.stroke();
  }
  astX.shadowBlur = 0;
  if (astDeadT === 0 && (astShip.inv <= 0 || (astShip.inv>>3)%2 === 0)){
    const shipCol = typeof przShipColor === "function" ? przShipColor() : "#3ee8ff";
    astX.save(); astX.translate(astShip.x, astShip.y); astX.rotate(astShip.a);
    astX.strokeStyle = shipCol; astX.lineWidth = 2; astX.shadowColor = shipCol; astX.shadowBlur = LOWFX ? 6 : 12;
    astX.beginPath(); astX.moveTo(14, 0); astX.lineTo(-10, -9); astX.lineTo(-6, 0); astX.lineTo(-10, 9); astX.closePath(); astX.stroke();
    if (astK.thrust && Math.random() < .7){
      astX.strokeStyle = "#ff9b2d"; astX.shadowColor = "#ff9b2d";
      astX.beginPath(); astX.moveTo(-8, -4); astX.lineTo(-16 - Math.random()*6, 0); astX.lineTo(-8, 4); astX.stroke();
    }
    astX.restore(); astX.shadowBlur = 0;
  }
  astX.fillStyle = "#fff"; astX.shadowColor = "#3ee8ff"; astX.shadowBlur = 8;
  for (const b of astBullets) astX.fillRect(b.x-2, b.y-2, 4, 4);
  astX.shadowBlur = 0;
  if (astUfo){
    astX.save(); astX.translate(astUfo.x, astUfo.y);
    astX.strokeStyle = "#ff2d78"; astX.lineWidth = 2; astX.shadowColor = "#ff2d78"; astX.shadowBlur = 12;
    astX.beginPath(); astX.ellipse(0, 4, 20, 7, 0, 0, 7); astX.stroke();
    astX.beginPath(); astX.moveTo(-9, -1); astX.quadraticCurveTo(0, -13, 9, -1); astX.stroke();
    astX.restore(); astX.shadowBlur = 0;
  }
  if (astUfoB){
    astX.fillStyle = "#ff2d78"; astX.shadowColor = "#ff2d78"; astX.shadowBlur = 8;
    astX.fillRect(astUfoB.x-2, astUfoB.y-2, 4, 4); astX.shadowBlur = 0;
  }
}
addEventListener("keydown", e => {
  if (!$("view-asteroids").classList.contains("on")) return;
  const k = e.key.toLowerCase();
  if (["arrowleft","arrowright","arrowup"," ","a","d","w"].includes(k)) e.preventDefault();
  if (k === "arrowleft" || k === "a") astK.left = true;
  if (k === "arrowright" || k === "d") astK.right = true;
  if (k === "arrowup" || k === "w") astK.thrust = true;
  if (k === " ") astFire();
});
addEventListener("keyup", e => {
  const k = e.key.toLowerCase();
  if (k === "arrowleft" || k === "a") astK.left = false;
  if (k === "arrowright" || k === "d") astK.right = false;
  if (k === "arrowup" || k === "w") astK.thrust = false;
});
document.querySelectorAll("[data-ast]").forEach(b => {
  const a = b.dataset.ast;
  const on = ev => { ev.preventDefault(); if (a === "fire") astFire(); else astK[a] = true; };
  const off = ev => { ev.preventDefault(); if (a !== "fire") astK[a] = false; };
  b.addEventListener("touchstart", on, { passive: false }); b.addEventListener("touchend", off);
  b.addEventListener("mousedown", on); b.addEventListener("mouseup", off); b.addEventListener("mouseleave", off);
});

registerGame("asteroids", { init: astStart, stop: astStop });
