/* ════════════════ BREAKOUT ════════════════ */
const brCv = $("breakcv"), brCx = brCv.getContext("2d");
const BRC = ["#ff2d78","#b44fff","#3ee8ff","#7bff8e","#ffd23e"];
let brBricks, brBall, brPad, brScore, brLives, brLevel, brRaf = 0, brLaunched, brParts, brTrail;
let brPadGrad = null, brPadGradW = 0;
let brBrickCv = null, brBrickCx = null, brBrickDirty = true; // bricks pre-rendered, repainted only on change
function brStop(){ cancelAnimationFrame(brRaf); brRaf = 0; }
function breakStart(){
  brStop();
  brScore = 0; brLives = 3; brLevel = 1;
  $("brscore").textContent = 0; $("brlevel").textContent = 1;
  $("brover").classList.remove("on");
  brNewLevel();
  brRaf = requestAnimationFrame(brLoop);
}
function brNewLevel(){
  brBricks = [];
  const cols = 10, bw = (brCv.width - 40) / cols, bh = 20;
  const pal = (typeof przBrickPal === "function" && przBrickPal()) || BRC;
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < cols; c++)
      brBricks.push({ x: 20 + c*bw, y: 50 + r*(bh+6), w: bw-5, h: bh, col: pal[r], alive: true });
  brPad = { w: 90, x: brCv.width/2 - 45, y: brCv.height - 28 };
  brResetBall();
  brParts = []; brTrail = [];
  brBrickDirty = true;
  brLivesUI();
}
function brResetBall(){
  brLaunched = false;
  const sp = 4.4 + (brLevel-1)*0.6;
  brBall = { x: brCv.width/2, y: brCv.height-40, vx: sp*0.6, vy: -sp, r: 7, sp };
}
function brLivesUI(){ $("brlives").textContent = "● ".repeat(brLives).trim() || "—"; }
function brLoop(){
  if (!frameGate("br")){ brRaf = requestAnimationFrame(brLoop); return; }
  const W = brCv.width, H = brCv.height;
  brCx.clearRect(0,0,W,H);
  // ball physics
  if (brLaunched){
    brBall.x += brBall.vx; brBall.y += brBall.vy;
    if (brBall.x < brBall.r || brBall.x > W-brBall.r) brBall.vx *= -1;
    if (brBall.y < brBall.r) brBall.vy *= -1;
    if (brBall.y > H + 14){
      brLives--; brLivesUI();
      if (brLives <= 0){ brGameOver(); return; }
      brResetBall();
    }
    // paddle
    if (brBall.vy > 0 && brBall.y + brBall.r >= brPad.y && brBall.y < brPad.y + 14 && brBall.x > brPad.x - 4 && brBall.x < brPad.x + brPad.w + 4){
      const hit = (brBall.x - (brPad.x + brPad.w/2)) / (brPad.w/2);
      const ang = hit * Math.PI/3;
      brBall.vx = Math.sin(ang) * brBall.sp; brBall.vy = -Math.cos(ang) * brBall.sp;
      brBall.y = brPad.y - brBall.r;
      SND.blip(300, .08);
    }
    // bricks
    for (const b of brBricks){
      if (!b.alive) continue;
      if (brBall.x > b.x - brBall.r && brBall.x < b.x + b.w + brBall.r && brBall.y > b.y - brBall.r && brBall.y < b.y + b.h + brBall.r){
        b.alive = false;
        brBrickDirty = true;
        brScore += 10; $("brscore").textContent = brScore;
        SND.blip(480 + Math.random()*320, .08);
        const fromSide = brBall.x < b.x || brBall.x > b.x + b.w;
        fromSide ? brBall.vx *= -1 : brBall.vy *= -1;
        for (let i = 0; i < 14; i++) brParts.push({ x: brBall.x, y: brBall.y, vx: (Math.random()-.5)*6, vy: (Math.random()-.5)*6, life: 26, c: b.col });
        break;
      }
    }
    if (brBricks.every(b => !b.alive)){
      brLevel++; $("brlevel").textContent = brLevel;
      SND.power();
      if (brLevel >= 3) ach("breakout3");
      brNewLevel();
    }
    brTrail.push({ x: brBall.x, y: brBall.y });
    if (brTrail.length > 9) brTrail.shift();
  } else {
    brBall.x = brPad.x + brPad.w/2; brBall.y = brPad.y - 10;
  }
  // bricks: blit the cached layer, repaint only when one breaks
  if (!brBrickCv){
    brBrickCv = document.createElement("canvas");
    brBrickCv.width = brCv.width; brBrickCv.height = brCv.height;
    brBrickCx = brBrickCv.getContext("2d");
  }
  if (brBrickDirty){
    brBrickDirty = false;
    brBrickCx.clearRect(0, 0, W, H);
    for (const b of brBricks){
      if (!b.alive) continue;
      brBrickCx.fillStyle = b.col; brBrickCx.shadowColor = b.col; brBrickCx.shadowBlur = 8;
      rounded(brBrickCx, b.x, b.y, b.w, b.h, 4); brBrickCx.fill();
    }
    brBrickCx.shadowBlur = 0;
  }
  brCx.drawImage(brBrickCv, 0, 0);
  // trail
  brTrail.forEach((t,i) => {
    brCx.globalAlpha = i / brTrail.length * 0.4;
    brCx.beginPath(); brCx.arc(t.x,t.y,brBall.r*(i/brTrail.length),0,7); brCx.fillStyle = "#3ee8ff"; brCx.fill();
  });
  brCx.globalAlpha = 1;
  // ball
  brCx.beginPath(); brCx.arc(brBall.x,brBall.y,brBall.r,0,7);
  brCx.fillStyle = "#fff"; brCx.shadowColor = "#3ee8ff"; brCx.shadowBlur = 18; brCx.fill(); brCx.shadowBlur = 0;
  // paddle: gradient cached in paddle-local space, repositioned via translate
  if (!brPadGrad || brPadGradW !== brPad.w){
    brPadGrad = brCx.createLinearGradient(0,0,brPad.w,0);
    brPadGrad.addColorStop(0,"#b44fff"); brPadGrad.addColorStop(1,"#ff2d78");
    brPadGradW = brPad.w;
  }
  brCx.save(); brCx.translate(brPad.x, 0);
  brCx.fillStyle = brPadGrad; brCx.shadowColor = "#ff2d78"; brCx.shadowBlur = 12;
  rounded(brCx, 0, brPad.y, brPad.w, 12, 6); brCx.fill();
  brCx.restore();
  // particles
  brParts = brParts.filter(p => p.life > 0);
  for (const p of brParts){
    p.x += p.vx; p.y += p.vy; p.vy += .12; p.life--;
    brCx.globalAlpha = p.life/26; brCx.fillStyle = p.c; brCx.fillRect(p.x-2,p.y-2,4,4);
  }
  brCx.globalAlpha = 1;
  if (!brLaunched){
    brCx.fillStyle = "rgba(217,185,255,.8)"; brCx.font = "14px Orbitron"; brCx.textAlign = "center";
    brCx.fillText("CLICK / TAP TO LAUNCH", W/2, H/2 + 60);
  }
  brRaf = requestAnimationFrame(brLoop);
}
function brGameOver(){
  brStop();
  SND.over(); stArc("breakout", brScore);
  $("broverscore").textContent = "SCORE " + brScore;
  $("brover").classList.add("on");
}
function brMove(clientX){
  const r = brCv.getBoundingClientRect();
  const x = (clientX - r.left) * (brCv.width / r.width);
  brPad.x = Math.max(0, Math.min(brCv.width - brPad.w, x - brPad.w/2));
}
brCv.addEventListener("mousemove", e => brMove(e.clientX));
brCv.addEventListener("touchmove", e => { brMove(e.touches[0].clientX); e.preventDefault(); }, {passive:false});
brCv.addEventListener("click", () => { brLaunched = true; });
brCv.addEventListener("touchstart", () => { brLaunched = true; }, {passive:true});
addEventListener("keydown", e => {
  if (!$("view-breakout").classList.contains("on")) return;
  if (e.key === "ArrowLeft"){ brPad.x = Math.max(0, brPad.x - 26); e.preventDefault(); }
  if (e.key === "ArrowRight"){ brPad.x = Math.min(brCv.width - brPad.w, brPad.x + 26); e.preventDefault(); }
  if (e.key === " "){ brLaunched = true; e.preventDefault(); }
});

registerGame("breakout", { init: breakStart, stop: brStop });
