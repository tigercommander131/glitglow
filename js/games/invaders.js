
/* ════════════════ SPACE INVADERS ════════════════ */
const sicv = $("invcv"), siCx = sicv.getContext("2d");
const SI_W = 480, SI_H = 520;
let siInv = [], siBullet = null, siEBullets = [], siShields = [], siCannon = {x:SI_W/2};
let siDir = 1, siStepT = 0, siStepMax = 40, siFrame = 0, siScore = 0, siLives = 3, siWave = 1;
let siRun = false, siRaf = 0, siKeys = {}, siDead = 0, siInvX = 0, siInvY = 0, siHitFlash = [];
let siHigh = parseInt(localStorage.getItem("gg_si_high")||"0",10);
let siPose = 0;
const SI_COLS = 11, SI_ROWS = 4, SI_GX = 36, SI_GY = 34;
const SI_PTS = [40, 40, 20, 10]; // top row to bottom row
const SI_TIER = ["#ff2d78","#ff2d78","#b44fff","#b44fff"];
function siBuildWave(){
  siInv = [];
  for (let r=0;r<SI_ROWS;r++) for (let c=0;c<SI_COLS;c++)
    siInv.push({ r, c, alive: true });
  siInvX = 42; siInvY = 64 + Math.min(60, (siWave-1)*14);
  siDir = 1; siStepT = 0;
  siStepMax = Math.max(8, 40 - (siWave-1)*5);
  siEBullets = []; siBullet = null;
}
function siBuildShields(){
  siShields = [];
  const cw = 4, cols = 14, rows = 9;
  for (let s=0;s<4;s++){
    const x0 = 38 + s*112;
    const cells = [];
    for (let r=0;r<rows;r++) for (let c=0;c<cols;c++){
      // arch shape: skip bottom-centre notch and top corners
      if (r>5 && c>4 && c<9) continue;
      if (r<2 && (c<2-r || c>cols-3+r)) continue;
      cells.push({ x:x0+c*cw, y:404+r*cw, on:true });
    }
    siShields.push(cells);
  }
}
function siStart(){
  siScore = 0; siLives = 3; siWave = 1;
  siBuildWave(); siBuildShields();
  siCannon.x = SI_W/2; siDead = 0;
  $("siover").classList.remove("on");
  $("sihigh").textContent = siHigh;
  siPaintHud();
  siRun = true;
  cancelAnimationFrame(siRaf); siLoop();
}
function siStop(){ siRun = false; cancelAnimationFrame(siRaf); siRaf = 0; }
function siPaintHud(){
  $("siscore").textContent = siScore;
  $("siwave").textContent = siWave;
  $("silives").textContent = Array(Math.max(0,siLives)).fill("▲").join(" ") || "—";
  if (siScore > siHigh){ siHigh = siScore; localStorage.setItem("gg_si_high", String(siHigh)); $("sihigh").textContent = siHigh; }
}
function siAliveCount(){ return siInv.filter(i=>i.alive).length; }
function siGameOver(){
  siRun = false;
  SND.over(); stArc("invaders", siScore);
  $("sioverscore").textContent = "SCORE " + siScore + (siScore>=siHigh?" · NEW BEST":"");
  $("siover").classList.add("on");
}
function siFire(){
  if (!siRun || siBullet || siDead > 0) return;
  siBullet = { x: siCannon.x, y: SI_H - 46 };
  SND.zap();
}
function siLoop(){
  if (!siRun) return;
  if (!frameGate("si")){ siRaf = requestAnimationFrame(siLoop); return; }
  siFrame++;
  const alive = siAliveCount();
  // cannon move
  if (siDead > 0){ siDead--; if (siDead===0 && siLives<=0){ siGameOver(); return; } }
  else {
    if (siKeys.left) siCannon.x = Math.max(20, siCannon.x - 4.2);
    if (siKeys.right) siCannon.x = Math.min(SI_W-20, siCannon.x + 4.2);
  }
  // invader stepping
  siStepT++;
  const stepNow = Math.max(4, Math.round(siStepMax * (alive / (SI_COLS*SI_ROWS)) + 3));
  if (siStepT >= stepNow){
    siStepT = 0;
    siPose = 1 - siPose;
    // edge check
    let minX = 1e9, maxX = -1e9;
    for (const inv of siInv) if (inv.alive){
      const x = siInvX + inv.c*SI_GX;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    }
    if ((siDir===1 && maxX+26 > SI_W-14) || (siDir===-1 && minX < 14)){
      siDir *= -1; siInvY += 16;
    } else siInvX += siDir * 10;
    // reached cannon row?
    let maxY = -1e9;
    for (const inv of siInv) if (inv.alive) maxY = Math.max(maxY, siInvY + inv.r*SI_GY);
    if (maxY > 392){ siLives = 0; siGameOver(); return; }
  }
  // invader shooting
  const rate = 0.012 + (1 - alive/(SI_COLS*SI_ROWS)) * 0.03 + siWave*0.004;
  if (Math.random() < rate && alive && siDead===0){
    const shooters = {};
    for (const inv of siInv) if (inv.alive){
      if (!(inv.c in shooters) || inv.r > shooters[inv.c].r) shooters[inv.c] = inv;
    }
    const arr = Object.values(shooters);
    const s = arr[(Math.random()*arr.length)|0];
    siEBullets.push({ x: siInvX + s.c*SI_GX + 13, y: siInvY + s.r*SI_GY + 18, v: 2.6 + siWave*.25 });
  }
  // player bullet
  if (siBullet){
    siBullet.y -= 9;
    if (siBullet.y < -10) siBullet = null;
    else {
      // shield hit
      if (siShieldHit(siBullet.x, siBullet.y, 2)) siBullet = null;
      else for (const inv of siInv){
        if (!inv.alive) continue;
        const ix = siInvX + inv.c*SI_GX, iy = siInvY + inv.r*SI_GY;
        if (siBullet.x > ix-2 && siBullet.x < ix+28 && siBullet.y > iy-2 && siBullet.y < iy+20){
          inv.alive = false;
          siScore += SI_PTS[inv.r];
          siHitFlash.push({x:ix+13, y:iy+9, t:10});
          siBullet = null;
          SND.boomA(true);
          siPaintHud();
          if (siAliveCount() === 0){
            siWave++; siBuildWave(); siPaintHud();
            SND.power();
            if (siWave >= 5) ach("invadersW5");
          }
          break;
        }
      }
    }
  }
  // enemy bullets
  for (let i=siEBullets.length-1;i>=0;i--){
    const b = siEBullets[i];
    b.y += b.v;
    if (b.y > SI_H+10){ siEBullets.splice(i,1); continue; }
    if (siShieldHit(b.x, b.y, 3)){ siEBullets.splice(i,1); continue; }
    if (siDead===0 && b.y > SI_H-52 && b.y < SI_H-28 && Math.abs(b.x - siCannon.x) < 17){
      siEBullets.splice(i,1);
      siLives--; siDead = 50; siPaintHud(); screenFlash();
    }
  }
  siDraw();
  siRaf = requestAnimationFrame(siLoop);
}
function siShieldHit(x, y, blast){
  for (const cells of siShields){
    for (const c of cells){
      if (c.on && x >= c.x && x < c.x+4 && y >= c.y && y < c.y+4){
        // erode neighbourhood
        for (const c2 of cells){
          if (c2.on && Math.abs(c2.x-c.x) <= blast*4 && Math.abs(c2.y-c.y) <= blast*4 && Math.random() < .72) c2.on = false;
        }
        return true;
      }
    }
  }
  return false;
}
function siDrawInvader(x, y, tier, pose){
  siCx.fillStyle = SI_TIER[tier];
  siCx.shadowColor = SI_TIER[tier]; siCx.shadowBlur = LOWFX ? 0 : 7;
  // body
  siCx.fillRect(x+6, y, 14, 4);
  siCx.fillRect(x+2, y+4, 22, 8);
  siCx.fillRect(x, y+8, 26, 4);
  // eyes (cut out)
  siCx.shadowBlur = 0;
  siCx.fillStyle = "#08000f";
  siCx.fillRect(x+7, y+5, 4, 4); siCx.fillRect(x+15, y+5, 4, 4);
  // legs: two poses
  siCx.fillStyle = SI_TIER[tier];
  if (pose === 0){
    siCx.fillRect(x+2, y+12, 5, 4); siCx.fillRect(x+19, y+12, 5, 4);
    siCx.fillRect(x, y+16, 4, 3); siCx.fillRect(x+22, y+16, 4, 3);
  } else {
    siCx.fillRect(x+6, y+12, 5, 4); siCx.fillRect(x+15, y+12, 5, 4);
    siCx.fillRect(x+8, y+16, 4, 3); siCx.fillRect(x+14, y+16, 4, 3);
  }
}
function siDraw(){
  siCx.clearRect(0,0,SI_W,SI_H);
  siCx.fillStyle = "#08000f"; siCx.fillRect(0,0,SI_W,SI_H);
  // invaders
  for (const inv of siInv) if (inv.alive)
    siDrawInvader(siInvX + inv.c*SI_GX, siInvY + inv.r*SI_GY, inv.r, siPose);
  // hit flashes
  for (let i=siHitFlash.length-1;i>=0;i--){
    const f = siHitFlash[i]; f.t--;
    if (f.t<=0){ siHitFlash.splice(i,1); continue; }
    siCx.strokeStyle = "rgba(255,233,168,"+(f.t/10)+")"; siCx.lineWidth = 2;
    for (let a=0;a<6;a++){
      const ang = a*Math.PI/3, rr = (10-f.t)*2.4;
      siCx.beginPath(); siCx.moveTo(f.x+Math.cos(ang)*4, f.y+Math.sin(ang)*4);
      siCx.lineTo(f.x+Math.cos(ang)*rr, f.y+Math.sin(ang)*rr); siCx.stroke();
    }
  }
  // shields
  siCx.fillStyle = "#7bff8e"; siCx.shadowColor = "#7bff8e"; siCx.shadowBlur = LOWFX ? 0 : 5;
  for (const cells of siShields) for (const c of cells) if (c.on) siCx.fillRect(c.x, c.y, 4, 4);
  siCx.shadowBlur = 0;
  // cannon
  if (siDead === 0 || (siDead>>2)%2===0){
    siCx.fillStyle = "#3ee8ff"; siCx.shadowColor = "#3ee8ff"; siCx.shadowBlur = 10;
    siCx.fillRect(siCannon.x-15, SI_H-38, 30, 10);
    siCx.fillRect(siCannon.x-10, SI_H-44, 20, 6);
    siCx.fillRect(siCannon.x-2.5, SI_H-52, 5, 9);
    siCx.shadowBlur = 0;
  }
  // bullets
  if (siBullet){
    siCx.fillStyle = "#3ee8ff"; siCx.shadowColor="#3ee8ff"; siCx.shadowBlur=8;
    siCx.fillRect(siBullet.x-1.5, siBullet.y-7, 3, 10); siCx.shadowBlur=0;
  }
  siCx.fillStyle = "#ff2d78"; siCx.shadowColor="#ff2d78"; siCx.shadowBlur=8;
  for (const b of siEBullets) siCx.fillRect(b.x-1.5, b.y, 3, 9);
  siCx.shadowBlur = 0;
}
addEventListener("keydown", e=>{
  if (!$("view-invaders").classList.contains("on")) return;
  const k = e.key.toLowerCase();
  if (["arrowleft","arrowright"," ","a","d"].includes(k)) e.preventDefault();
  if (k==="arrowleft"||k==="a") siKeys.left = true;
  if (k==="arrowright"||k==="d") siKeys.right = true;
  if (k===" ") siFire();
});
addEventListener("keyup", e=>{
  const k = e.key.toLowerCase();
  if (k==="arrowleft"||k==="a") siKeys.left = false;
  if (k==="arrowright"||k==="d") siKeys.right = false;
});
document.querySelectorAll("[data-si]").forEach(b=>{
  const a = b.dataset.si;
  const on = ev=>{ ev.preventDefault(); if(a==="fire") siFire(); else siKeys[a]=true; };
  const off = ev=>{ ev.preventDefault(); if(a!=="fire") siKeys[a]=false; };
  b.addEventListener("touchstart", on, {passive:false}); b.addEventListener("touchend", off);
  b.addEventListener("mousedown", on); b.addEventListener("mouseup", off); b.addEventListener("mouseleave", off);
});


registerGame("invaders", { init: siStart, stop: siStop });
