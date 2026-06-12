
/* ════════════════ MISSILE COMMAND ════════════════ */
const mcCv = $("mccv"), mcX = mcCv.getContext("2d");
const MC_W = 560, MC_H = 460, MC_GY = MC_H - 34;
const MC_CITY_X = [78, 148, 218, 342, 412, 482], MC_SILO_X = [30, 280, 530];
let mcCities, mcSilos, mcInc, mcShots, mcBooms, mcParts, mcWaveN, mcScore, mcRun = false, mcRaf = 0;
let mcGroundGrad = null;
let mcQ, mcQT, mcPhase, mcBonusT, mcCross = { x: MC_W/2, y: 200 }, mcReviveBank = 0;
let mcHigh = +localStorage.getItem("gg_mchigh") || 0;
function mcStart(){
  mcCities = MC_CITY_X.map(x => ({ x, alive: true }));
  mcSilos = MC_SILO_X.map(x => ({ x, ammo: 10 }));
  mcInc = []; mcShots = []; mcBooms = []; mcParts = [];
  mcWaveN = 1; mcScore = 0; mcPhase = "play"; mcBonusT = 0; mcReviveBank = 0;
  $("mcover").classList.remove("on");
  $("mchigh").textContent = mcHigh;
  mcNewWave(); mcHud();
  mcRun = true; cancelAnimationFrame(mcRaf); mcLoop();
}
function mcStop(){ mcRun = false; cancelAnimationFrame(mcRaf); mcRaf = 0; }
function mcHud(){
  $("mcscore").textContent = mcScore; $("mcwave").textContent = mcWaveN;
  $("mcammo").textContent = mcSilos.reduce((a, s) => a + s.ammo, 0);
  if (mcScore > mcHigh){ mcHigh = mcScore; localStorage.setItem("gg_mchigh", mcHigh); $("mchigh").textContent = mcHigh; }
}
function mcMult(){ return Math.min(6, 1 + ((mcWaveN - 1)/2 | 0)); }
function mcNewWave(){
  mcQ = [];
  const n = Math.min(26, 7 + mcWaveN*2);
  const sp = 0.55 + mcWaveN*0.11;
  for (let i = 0; i < n; i++) mcQ.push({ at: i*(95 - Math.min(60, mcWaveN*6)) + (Math.random()*40 | 0), sp });
  mcQT = 0; mcPhase = "play";
}
function mcTargets(){
  const t = [];
  for (const c of mcCities) if (c.alive) t.push(c.x);
  for (const s of mcSilos) if (s.ammo > 0) t.push(s.x);
  return t.length ? t : [MC_W/2];
}
function mcSpawnInc(sp, x0, y0){
  const t = mcTargets();
  const tx = t[(Math.random()*t.length)|0] + (Math.random()*14 - 7);
  x0 = x0 === undefined ? Math.random()*MC_W : x0;
  y0 = y0 === undefined ? -4 : y0;
  const dx = tx - x0, dy = MC_GY - y0, d = Math.hypot(dx, dy);
  mcInc.push({ x0, y0, x: x0, y: y0, vx: dx/d*sp, vy: dy/d*sp, tx });
}
function mcBoom(x, y, max, hue){
  mcBooms.push({ x, y, r: 2, max, phase: 1, hue: hue || 0 });
}
function mcFire(px, py){
  if (!mcRun || mcPhase !== "play" || py > MC_GY - 24) return;
  let best = null, bd = 1e9;
  for (const s of mcSilos){
    if (s.ammo <= 0) continue;
    const d = Math.abs(s.x - px);
    if (d < bd){ bd = d; best = s; }
  }
  if (!best){ SND.blip(160, .08); return; }
  best.ammo--; mcHud();
  SND.launch();
  const x0 = best.x, y0 = MC_GY - 16;
  const dx = px - x0, dy = py - y0, d = Math.hypot(dx, dy) || 1;
  mcShots.push({ x0, y0, x: x0, y: y0, vx: dx/d*9.5, vy: dy/d*9.5, tx: px, ty: py });
}
function mcLoop(){
  if (!mcRun) return;
  if (!frameGate("mc")){ mcRaf = requestAnimationFrame(mcLoop); return; }
  if (mcPhase === "play"){
    mcQT++;
    while (mcQ.length && mcQ[0].at <= mcQT){ mcSpawnInc(mcQ.shift().sp); }
    // occasional mid-air split
    for (const m of [...mcInc]){
      if (m.y > 110 && m.y < 250 && Math.random() < 0.0008 + mcWaveN*0.00025) mcSpawnInc(Math.hypot(m.vx, m.vy), m.x, m.y);
    }
  }
  // incoming
  for (let i = mcInc.length - 1; i >= 0; i--){
    const m = mcInc[i];
    m.x += m.vx; m.y += m.vy;
    let dead = false;
    for (const b of mcBooms){
      if ((m.x - b.x)**2 + (m.y - b.y)**2 < b.r*b.r){
        mcScore += 25*mcMult(); mcReviveBank += 25*mcMult();
        mcBoom(m.x, m.y, 26, 1);
        SND.boomA(true); mcHud();
        dead = true; break;
      }
    }
    if (!dead && m.y >= MC_GY){
      mcBoom(m.x, MC_GY, 34, 2);
      SND.boomA(false);
      for (const c of mcCities) if (c.alive && Math.abs(c.x - m.x) < 20){ c.alive = false; screenFlash(); }
      for (const s of mcSilos) if (s.ammo > 0 && Math.abs(s.x - m.x) < 18){ s.ammo = 0; mcHud(); }
      dead = true;
    }
    if (dead) mcInc.splice(i, 1);
  }
  // interceptors
  for (let i = mcShots.length - 1; i >= 0; i--){
    const s = mcShots[i];
    s.x += s.vx; s.y += s.vy;
    if ((s.x - s.tx)**2 + (s.y - s.ty)**2 < 90){
      mcBoom(s.tx, s.ty, 34, 0);
      SND.boomA(true);
      mcShots.splice(i, 1);
    }
  }
  // explosions
  for (let i = mcBooms.length - 1; i >= 0; i--){
    const b = mcBooms[i];
    if (b.phase === 1){ b.r += 1.5; if (b.r >= b.max) b.phase = 2; }
    else { b.r -= 1.1; if (b.r <= 0){ mcBooms.splice(i, 1); continue; } }
  }
  // bonus city every 5000 points
  if (mcReviveBank >= 5000){
    mcReviveBank -= 5000;
    const dead = mcCities.filter(c => !c.alive);
    if (dead.length){ dead[(Math.random()*dead.length)|0].alive = true; SND.gem(); }
  }
  // wave end / game over
  if (mcPhase === "play" && !mcQ.length && !mcInc.length && !mcBooms.length && !mcShots.length){
    if (mcCities.every(c => !c.alive)){
      mcRun = false;
      SND.over(); stArc("missile", mcScore);
      $("mcoverscore").textContent = "SCORE " + mcScore + " · WAVE " + mcWaveN + (mcScore >= mcHigh && mcScore > 0 ? " · NEW BEST" : "");
      $("mcover").classList.add("on");
      return;
    }
    mcPhase = "bonus"; mcBonusT = 90;
    const ammoLeft = mcSilos.reduce((a, s) => a + s.ammo, 0);
    const cityBonus = mcCities.filter(c => c.alive).length*100*mcMult();
    mcScore += ammoLeft*5*mcMult() + cityBonus;
    mcReviveBank += cityBonus;
    SND.power(); mcHud();
  }
  if (mcPhase === "bonus"){
    mcBonusT--;
    if (mcBonusT <= 0){
      mcWaveN++;
      if (mcWaveN >= 5) ach("missileW5");
      for (const s of mcSilos) s.ammo = 10;
      mcNewWave(); mcHud();
    }
  }
  mcDrawF();
  mcRaf = requestAnimationFrame(mcLoop);
}
function mcDrawF(){
  mcX.clearRect(0, 0, MC_W, MC_H);
  mcX.fillStyle = "#08000f"; mcX.fillRect(0, 0, MC_W, MC_H);
  mcX.fillStyle = "rgba(217,185,255,.2)";
  for (let i = 0; i < 50; i++) mcX.fillRect((i*113)%MC_W, (i*59)%(MC_GY - 40), 1.5, 1.5);
  // ground (static gradient — cache it)
  if (!mcGroundGrad){
    mcGroundGrad = mcX.createLinearGradient(0, MC_GY, 0, MC_H);
    mcGroundGrad.addColorStop(0, "#2a0a4d"); mcGroundGrad.addColorStop(1, "#12012a");
  }
  mcX.fillStyle = mcGroundGrad; mcX.fillRect(0, MC_GY, MC_W, MC_H - MC_GY);
  mcX.strokeStyle = "#b44fff"; mcX.lineWidth = 2; mcX.shadowColor = "#b44fff"; mcX.shadowBlur = 8;
  mcX.beginPath(); mcX.moveTo(0, MC_GY); mcX.lineTo(MC_W, MC_GY); mcX.stroke(); mcX.shadowBlur = 0;
  // cities
  for (const c of mcCities){
    if (c.alive){
      mcX.fillStyle = "#3ee8ff"; mcX.shadowColor = "#3ee8ff"; mcX.shadowBlur = 8;
      mcX.fillRect(c.x - 14, MC_GY - 10, 7, 10);
      mcX.fillRect(c.x - 5, MC_GY - 16, 8, 16);
      mcX.fillRect(c.x + 6, MC_GY - 8, 8, 8);
      mcX.shadowBlur = 0;
    } else {
      mcX.fillStyle = "#3a2050";
      mcX.fillRect(c.x - 14, MC_GY - 4, 28, 4);
    }
  }
  // silos
  for (const s of mcSilos){
    mcX.fillStyle = "#7b3bbf"; mcX.shadowColor = "#b44fff"; mcX.shadowBlur = 6;
    mcX.beginPath(); mcX.moveTo(s.x - 22, MC_GY); mcX.lineTo(s.x, MC_GY - 18); mcX.lineTo(s.x + 22, MC_GY); mcX.closePath(); mcX.fill();
    mcX.shadowBlur = 0;
    mcX.fillStyle = "#3ee8ff";
    for (let i = 0; i < s.ammo; i++){
      const row = (i/5)|0, col = i%5;
      mcX.fillRect(s.x - 10 + col*5, MC_GY - 8 + row*4, 3, 3);
    }
  }
  // incoming trails
  for (const m of mcInc){
    mcX.strokeStyle = "rgba(255,45,120,.75)"; mcX.lineWidth = 1.6;
    mcX.shadowColor = "#ff2d78"; mcX.shadowBlur = LOWFX ? 0 : 6;
    mcX.beginPath(); mcX.moveTo(m.x0, m.y0); mcX.lineTo(m.x, m.y); mcX.stroke();
    mcX.fillStyle = "#fff"; mcX.fillRect(m.x - 1.5, m.y - 1.5, 3, 3);
    mcX.shadowBlur = 0;
  }
  // interceptor trails
  for (const s of mcShots){
    mcX.strokeStyle = "rgba(62,232,255,.8)"; mcX.lineWidth = 1.6;
    mcX.shadowColor = "#3ee8ff"; mcX.shadowBlur = LOWFX ? 0 : 6;
    mcX.beginPath(); mcX.moveTo(s.x0, s.y0); mcX.lineTo(s.x, s.y); mcX.stroke();
    mcX.fillStyle = "#fff"; mcX.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
    mcX.shadowBlur = 0;
    // target marker
    mcX.strokeStyle = "rgba(62,232,255,.5)";
    mcX.beginPath(); mcX.moveTo(s.tx - 4, s.ty); mcX.lineTo(s.tx + 4, s.ty);
    mcX.moveTo(s.tx, s.ty - 4); mcX.lineTo(s.tx, s.ty + 4); mcX.stroke();
  }
  // explosions
  for (const b of mcBooms){
    const cols = b.hue === 2 ? ["#ff3b1f","#ff2d78","#ffd23e"] : b.hue === 1 ? ["#ffd23e","#ff9b2d","#fff"] : ["#fff","#3ee8ff","#b44fff"];
    for (let k = 0; k < 3; k++){
      const rr = Math.max(0, b.r - k*6);
      if (rr <= 0) continue;
      mcX.globalAlpha = 0.85 - k*0.22;
      mcX.fillStyle = cols[k]; mcX.shadowColor = cols[0]; mcX.shadowBlur = 16;
      mcX.beginPath(); mcX.arc(b.x, b.y, rr, 0, 7); mcX.fill();
    }
    mcX.globalAlpha = 1; mcX.shadowBlur = 0;
  }
  // crosshair
  mcX.strokeStyle = "#3ee8ff"; mcX.lineWidth = 1.5; mcX.shadowColor = "#3ee8ff"; mcX.shadowBlur = 6;
  mcX.beginPath();
  mcX.moveTo(mcCross.x - 9, mcCross.y); mcX.lineTo(mcCross.x - 3, mcCross.y);
  mcX.moveTo(mcCross.x + 3, mcCross.y); mcX.lineTo(mcCross.x + 9, mcCross.y);
  mcX.moveTo(mcCross.x, mcCross.y - 9); mcX.lineTo(mcCross.x, mcCross.y - 3);
  mcX.moveTo(mcCross.x, mcCross.y + 3); mcX.lineTo(mcCross.x, mcCross.y + 9);
  mcX.stroke(); mcX.shadowBlur = 0;
  // bonus banner
  if (mcPhase === "bonus"){
    mcX.fillStyle = "#7bff8e"; mcX.font = "700 18px Orbitron"; mcX.textAlign = "center";
    mcX.shadowColor = "#7bff8e"; mcX.shadowBlur = 12;
    mcX.fillText("WAVE CLEAR · BONUS AWARDED", MC_W/2, 150);
    mcX.shadowBlur = 0;
  }
}
function mcCanvasPt(e){
  const r = mcCv.getBoundingClientRect();
  const cx = (e.clientX - r.left)*(MC_W/r.width), cy = (e.clientY - r.top)*(MC_H/r.height);
  return { x: cx, y: cy };
}
mcCv.addEventListener("mousemove", e => { mcCross = mcCanvasPt(e); });
mcCv.addEventListener("click", e => { const p = mcCanvasPt(e); mcCross = p; mcFire(p.x, p.y); });
mcCv.addEventListener("touchstart", e => {
  e.preventDefault();
  const t = e.touches[0], p = mcCanvasPt(t);
  mcCross = p; mcFire(p.x, p.y);
}, { passive: false });

registerGame("missile", { init: mcStart, stop: mcStop });
