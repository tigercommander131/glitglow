/* ════════════════ PLINKO ════════════════ */
/* 16-row board · 17 buckets · payout = bet × bucket multiplier, paid exactly once per ball */
const PL_MULTS = {
  low:  [5.6, 2.1, 1.1, 1, 0.5, 0.3, 0.2, 0.2, 0.2, 0.2, 0.2, 0.3, 0.5, 1, 1.1, 2.1, 5.6],
  med:  [13, 3, 1.4, 1.1, 1, 0.5, 0.3, 0.2, 0.2, 0.2, 0.3, 0.5, 1, 1.1, 1.4, 3, 13],
  high: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000]
};
let plRiskKey = "med", plBalls = [], plRaf = 0, plPegs = [], plBucketLit = new Array(17).fill(0);
let plBallGrad = null;
const plcv = $("plinkocv"), plx = plcv.getContext("2d");
const PL_ROWS = 16, PL_W = 520, PL_H = 560, PL_TOP = 44, PL_GAPY = 26, PL_GAPX = 29, PL_PR = 3.5, PL_BR = 6;
function plBuildPegs(){
  plPegs = [];
  for (let row=0; row<PL_ROWS; row++){
    const n = row + 3;
    const y = PL_TOP + row * PL_GAPY;
    const startx = PL_W/2 - (n-1)*PL_GAPX/2;
    for (let i=0;i<n;i++) plPegs.push({ x:startx + i*PL_GAPX, y, hit:0 });
  }
}
function plRowStart(row){ return row*(row+5)/2; } // index of first peg in a row
function plRisk(k, btn){
  if (plBalls.length) { toast("Wait for balls to land"); return; }
  plRiskKey = k;
  document.querySelectorAll("#plrisk .cbtn").forEach(b=>b.classList.toggle("sel", b===btn));
  plDraw();
}
function plInit(){ if (!plPegs.length) plBuildPegs(); plBucketLit.fill(0); plDraw(); }
function plStop(){ cancelAnimationFrame(plRaf); plRaf = 0; }
function plDrop(){
  const bet = takeBet("plbet"); if (!bet) return;
  $("plmsg").textContent = ""; $("plmsg").className = "msg";
  // path decided up front: one left/right deflection per peg row, bucket = number of rights
  const dirs = []; let bucket = 0;
  for (let r=0;r<PL_ROWS;r++){ const d = Math.random()<0.5 ? 0 : 1; dirs.push(d); bucket += d; }
  plBalls.push({
    x: PL_W/2, y: 14, vy: 0, off: 0, row: 0,
    wob: Math.random()*Math.PI*2,
    bet, dirs, bucket, paid: false, trail: []
  });
  if (!plRaf) plLoop();
}
function plLoop(){
  if (!frameGate("pl")){ plRaf = requestAnimationFrame(plLoop); return; }
  const floorY = PL_TOP + PL_ROWS*PL_GAPY + 8;
  for (const b of plBalls){
    b.vy = Math.min(b.vy + 0.26, 7.5);
    b.y += b.vy;
    b.wob += 0.3;
    // peg row crossings: deflect left or right with natural wobble, no payout here
    while (b.row < PL_ROWS && b.y >= PL_TOP + b.row*PL_GAPY){
      b.off += (b.dirs[b.row] ? 1 : -1) * (PL_GAPX/2);
      b.vy *= 0.5; // peg bounce damping
      const n = b.row + 3, startx = PL_W/2 - (n-1)*PL_GAPX/2;
      const pi = plRowStart(b.row) + Math.max(0, Math.min(n-1, Math.round((b.x - startx)/PL_GAPX)));
      if (plPegs[pi]) plPegs[pi].hit = 8;
      SND.peg();
      b.row++;
    }
    b.x += (PL_W/2 + b.off - b.x) * 0.22 + Math.sin(b.wob)*0.35;
    b.trail.push({x:b.x, y:b.y}); if (b.trail.length>14) b.trail.shift();
  }
  // landings — pay the bucket multiplier exactly once per ball: payout = bet × multiplier
  for (let i=plBalls.length-1;i>=0;i--){
    const b = plBalls[i];
    if (b.y > floorY && !b.paid){
      b.paid = true;
      const m = PL_MULTS[plRiskKey][b.bucket];
      const pay = Math.floor(b.bet * m);
      plBucketLit[b.bucket] = 26;
      if (m >= 100) ach("plinko100x");
      stRound("plinko", b.bet, pay);
      if (pay > 0) addChips(pay);
      const net = pay - b.bet;
      $("plmsg").textContent = m+"× · "+(net>=0?"+":"")+fmt(net);
      $("plmsg").className = "msg " + (m>1 ? "win" : m===1 ? "push" : "lose");
      if (m >= 9) winFx(pay, b.bet);
      plBalls.splice(i,1);
    }
  }
  plDraw();
  if (plBalls.length || plBucketLit.some(v=>v>0) || plPegs.some(p=>p.hit>0)){
    plRaf = requestAnimationFrame(plLoop);
  } else plRaf = 0;
}
/* board bg is static; ball gradient is identical per ball — build both once */
let plBgGrad = null;
function plDraw(){
  plx.clearRect(0,0,PL_W,PL_H);
  if (!plBgGrad){
    plBgGrad = plx.createLinearGradient(0,0,0,PL_H);
    plBgGrad.addColorStop(0,"#150a02"); plBgGrad.addColorStop(1,"#0a0502");
  }
  plx.fillStyle = plBgGrad; plx.fillRect(0,0,PL_W,PL_H);
  // pegs
  for (const p of plPegs){
    if (p.hit>0){ p.hit--; plx.shadowColor="rgba(255,233,168,.9)"; plx.shadowBlur=12; plx.fillStyle="#ffe9a8"; }
    else { plx.shadowBlur=0; plx.fillStyle="rgba(201,168,76,.65)"; }
    plx.beginPath(); plx.arc(p.x,p.y,PL_PR,0,7); plx.fill();
  }
  plx.shadowBlur=0;
  // balls + glowing trails
  for (const b of plBalls){
    for (let i=0;i<b.trail.length;i++){
      const t = b.trail[i], a = i/b.trail.length;
      plx.globalAlpha = a*0.35;
      plx.fillStyle = "#ffe9a8";
      plx.beginPath(); plx.arc(t.x,t.y,PL_BR*a*0.8,0,7); plx.fill();
    }
    plx.globalAlpha = 1;
    plx.shadowColor = "rgba(255,233,168,1)"; plx.shadowBlur = 16;
    // gradient in ball-local space (centre offset baked in), positioned via translate
    if (!plBallGrad){
      plBallGrad = plx.createRadialGradient(-2,-2,1,0,0,PL_BR);
      plBallGrad.addColorStop(0,"#fff7dd"); plBallGrad.addColorStop(.5,"#e8cf8a"); plBallGrad.addColorStop(1,"#a8842e");
    }
    plx.save(); plx.translate(b.x, b.y);
    plx.fillStyle = plBallGrad;
    plx.beginPath(); plx.arc(0,0,PL_BR,0,7); plx.fill();
    plx.restore();
    plx.shadowBlur = 0;
  }
  // buckets
  const bw = PL_W/17, by = PL_TOP + PL_ROWS*PL_GAPY + 12;
  const mults = PL_MULTS[plRiskKey];
  for (let k=0;k<17;k++){
    const m = mults[k];
    const hot = m>=10 ? 1 : m>=2 ? .6 : m>=1 ? .3 : .15;
    const lit = plBucketLit[k] > 0;
    if (lit) plBucketLit[k]--;
    plx.fillStyle = lit ? "rgba(255,233,168,.85)" : `rgba(201,168,76,${0.10+hot*0.22})`;
    plx.strokeStyle = lit ? "#ffe9a8" : "rgba(201,168,76,.5)";
    plx.beginPath(); plx.roundRect(k*bw+2, by, bw-4, 32, 5); plx.fill(); plx.stroke();
    plx.fillStyle = lit ? "#140a00" : (m>=10 ? "#ffb1b1" : m>=2 ? "#ffe9a8" : "#d8cba0");
    plx.font = "700 "+(m>=100?"8.5":m>=10?"10":"10.5")+"px 'JetBrains Mono',monospace";
    plx.textAlign = "center"; plx.textBaseline = "middle";
    plx.fillText(m+"×", k*bw+bw/2, by+16);
  }
}


registerGame("plinko", { init: plInit, stop: plStop });
