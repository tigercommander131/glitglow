/* ════════════════ FLAPWAVE ════════════════ */
const fwcv = $("flapcv"), fwCx = fwcv.getContext("2d");
const FW_W = 420, FW_H = 560;
let fwBird, fwPipes, fwScore, fwRun = false, fwRaf = 0, fwT = 0, fwDying = false, fwGridOff = 0;
let fwHigh = parseInt(localStorage.getItem("gg_fw_high")||"0",10);
function fwStart(){
  fwBird = { y: FW_H/2, v: 0, rot: 0, trail: [] };
  fwPipes = []; fwScore = 0; fwT = 0; fwDying = false;
  $("fwover").classList.remove("on");
  $("fwscore").textContent = "0"; $("fwhigh").textContent = fwHigh;
  fwRun = true;
  cancelAnimationFrame(fwRaf); fwLoop();
}
function fwStop(){ fwRun = false; cancelAnimationFrame(fwRaf); fwRaf = 0; }
function fwFlap(){
  if (!fwRun || fwDying) return;
  fwBird.v = -7;
  SND.flap();
}
function fwGap(){ return Math.max(118, 168 - Math.floor(fwScore/10)*12); }
function fwLoop(){
  if (!fwRun) return;
  if (!frameGate("fw")){ fwRaf = requestAnimationFrame(fwLoop); return; }
  fwT++;
  fwGridOff = (fwGridOff + 0.6) % 44;
  // spawn pipes
  if (fwT % 95 === 1 && !fwDying){
    const gap = fwGap();
    const cy = 90 + gap/2 + Math.random()*(FW_H - 180 - gap);
    fwPipes.push({ x: FW_W + 30, cy, gap, passed: false });
  }
  // physics
  fwBird.v += 0.35;
  fwBird.y += fwBird.v;
  fwBird.rot = fwDying ? fwBird.rot + 0.22 : Math.max(-0.5, Math.min(1.1, fwBird.v * 0.07));
  fwBird.trail.push({ x: 110, y: fwBird.y });
  for (const t of fwBird.trail) t.x -= 2.6;
  if (fwBird.trail.length > 16) fwBird.trail.shift();
  if (!fwDying){
    for (const p of fwPipes){
      p.x -= 2.6;
      if (!p.passed && p.x + 28 < 110){
        p.passed = true; fwScore++;
        SND.point();
        $("fwscore").textContent = fwScore;
        if (fwScore > fwHigh){ fwHigh = fwScore; localStorage.setItem("gg_fw_high", String(fwHigh)); $("fwhigh").textContent = fwHigh; }
      }
      // collision (bird radius ~9 at x=110)
      if (Math.abs(110 - (p.x+14)) < 23){
        if (fwBird.y - 9 < p.cy - p.gap/2 || fwBird.y + 9 > p.cy + p.gap/2) return fwDie();
      }
    }
    fwPipes = fwPipes.filter(p => p.x > -60);
    if (fwBird.y > FW_H - 12 || fwBird.y < -20) return fwDie();
  } else {
    if (fwBird.y > FW_H + 30){
      fwRun = false;
      SND.over(); stArc("flapwave", fwScore);
      $("fwoverscore").textContent = "SCORE " + fwScore + (fwScore>=fwHigh && fwScore>0 ? " · NEW BEST" : "");
      $("fwover").classList.add("on");
      return;
    }
  }
  fwDraw();
  fwRaf = requestAnimationFrame(fwLoop);
}
function fwDie(){
  fwDying = true; fwBird.v = -4;
  screenFlash(); screenShake($("flapcv").closest(".panel"));
  fwDraw();
  fwRaf = requestAnimationFrame(fwLoop);
}
function fwDraw(){
  fwCx.clearRect(0,0,FW_W,FW_H);
  fwCx.fillStyle = "#08000f"; fwCx.fillRect(0,0,FW_W,FW_H);
  // parallax perspective grid (bottom half)
  fwCx.save();
  fwCx.strokeStyle = "rgba(180,79,255,.22)"; fwCx.lineWidth = 1;
  const horizon = FW_H*0.62;
  for (let i=0;i<10;i++){
    const yy = horizon + Math.pow(i/9, 1.7) * (FW_H - horizon);
    fwCx.beginPath(); fwCx.moveTo(0,yy); fwCx.lineTo(FW_W,yy); fwCx.stroke();
  }
  for (let x=-44+fwGridOff; x<FW_W+44; x+=44){
    const vx = (x - FW_W/2) * 3.4 + FW_W/2;
    fwCx.beginPath(); fwCx.moveTo(x, horizon); fwCx.lineTo(vx, FW_H); fwCx.stroke();
  }
  fwCx.strokeStyle = "rgba(255,45,120,.3)";
  fwCx.beginPath(); fwCx.moveTo(0,horizon); fwCx.lineTo(FW_W,horizon); fwCx.stroke();
  fwCx.restore();
  // pipes
  for (const p of fwPipes){
    const topH = p.cy - p.gap/2, botY = p.cy + p.gap/2;
    fwCx.fillStyle = "rgba(180,79,255,.85)";
    fwCx.shadowColor = "#b44fff"; fwCx.shadowBlur = 12;
    fwCx.fillRect(p.x, 0, 28, topH - 12);
    fwCx.fillRect(p.x, botY + 12, 28, FW_H - botY);
    fwCx.fillStyle = "#ff2d78"; fwCx.shadowColor = "#ff2d78";
    fwCx.fillRect(p.x - 3, topH - 12, 34, 12);
    fwCx.fillRect(p.x - 3, botY, 34, 12);
    fwCx.shadowBlur = 0;
  }
  // trail
  for (let i=0;i<fwBird.trail.length;i++){
    const t = fwBird.trail[i], a = i/fwBird.trail.length;
    fwCx.globalAlpha = a * 0.4;
    fwCx.fillStyle = "#3ee8ff";
    const s = 8*a;
    fwCx.save(); fwCx.translate(t.x, t.y); fwCx.rotate(Math.PI/4);
    fwCx.fillRect(-s/2, -s/2, s, s); fwCx.restore();
  }
  fwCx.globalAlpha = 1;
  // bird: glowing diamond
  fwCx.save();
  fwCx.translate(110, fwBird.y); fwCx.rotate(Math.PI/4 + fwBird.rot);
  fwCx.shadowColor = "#3ee8ff"; fwCx.shadowBlur = 18;
  const g = fwCx.createLinearGradient(-9,-9,9,9);
  g.addColorStop(0,"#d8fbff"); g.addColorStop(1,"#3ee8ff");
  fwCx.fillStyle = g;
  fwCx.fillRect(-9,-9,18,18);
  fwCx.shadowBlur = 0;
  fwCx.restore();
  // score on canvas
  fwCx.font = "900 52px Orbitron, sans-serif";
  fwCx.textAlign = "center";
  fwCx.fillStyle = "rgba(255,45,120,.9)";
  fwCx.shadowColor = "rgba(255,45,120,.8)"; fwCx.shadowBlur = 16;
  fwCx.fillText(fwScore, FW_W/2, 78);
  fwCx.shadowBlur = 0;
}
fwcv.addEventListener("pointerdown", e=>{ e.preventDefault(); fwFlap(); });
addEventListener("keydown", e=>{
  if (!$("view-flapwave").classList.contains("on")) return;
  if (e.key === " "){ e.preventDefault(); fwFlap(); }
});

registerGame("flapwave", { init: fwStart, stop: fwStop });
