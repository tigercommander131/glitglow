
/* ════════════════ CRASH ════════════════ */
let crLive = false, crBet = 0, crRaf = 0, crPts = [], crT0 = 0, crPoint = 1;
function crashIdleDraw(){ crashDrawGraph(1, []); }
function crashMultAt(ms){ return Math.pow(Math.E, 0.00012 * ms * 1.45); }
function crashStart(){
  if (crLive) return;
  crBet = takeBet("crashbet"); if (!crBet) return;
  escrowHold("crash", crBet);
  crLive = true; $("crashgo").disabled = true; $("crashcash").disabled = false;
  $("crashmsg").textContent = ""; $("crashmsg").className = "msg";
  const r = Math.random();
  crPoint = Math.max(1.0, Math.floor((0.97/(1-r))*100)/100); // 3% instant-ish edge
  crPts = []; crT0 = performance.now();
  crLoop();
}
function crLoop(){
  const ms = performance.now() - crT0;
  const m = crashMultAt(ms);
  crPts.push(m);
  const el = $("crashmult");
  el.textContent = m.toFixed(2) + "×";
  el.style.color = m < 2 ? "#7be0a3" : m < 5 ? "#ffd966" : "#ff7b7b";
  crashDrawGraph(m, crPts);
  if (m >= crPoint){ crashBoom(); return; }
  crRaf = requestAnimationFrame(crLoop);
}
function crashDrawGraph(maxM, pts){
  const cv = $("crashcv"), ctx = cv.getContext("2d"), W = cv.width, H = cv.height;
  ctx.clearRect(0,0,W,H);
  const top = Math.max(2, maxM * 1.15);
  // grid + labels
  ctx.font = "11px JetBrains Mono, monospace"; ctx.fillStyle = "rgba(232,207,138,.45)";
  ctx.strokeStyle = "rgba(201,168,76,.12)"; ctx.lineWidth = 1;
  const steps = 5;
  for (let i = 0; i <= steps; i++){
    const v = 1 + (top-1)*i/steps, y = H - 26 - (H-46)*(v-1)/(top-1);
    ctx.beginPath(); ctx.moveTo(46,y); ctx.lineTo(W-10,y); ctx.stroke();
    ctx.fillText(v.toFixed(1)+"×", 6, y+4);
  }
  for (let i = 0; i <= 6; i++){
    const x = 46 + (W-56)*i/6;
    ctx.beginPath(); ctx.moveTo(x,12); ctx.lineTo(x,H-26); ctx.stroke();
    ctx.fillText((i*2)+"s", x-6, H-8);
  }
  if (!pts.length) return;
  // line
  const n = pts.length;
  ctx.beginPath();
  for (let i = 0; i < n; i++){
    const x = 46 + (W-56)*i/Math.max(120, n);
    const y = H - 26 - (H-46)*(pts[i]-1)/(top-1);
    i ? ctx.lineTo(x,y) : ctx.moveTo(x,y);
  }
  ctx.lineWidth = 3; ctx.strokeStyle = "#e8cf8a";
  ctx.shadowColor = "#c9a84c"; ctx.shadowBlur = 16; ctx.stroke();
  ctx.shadowBlur = 0;
  // tip glow
  const lx = 46 + (W-56)*(n-1)/Math.max(120,n), ly = H - 26 - (H-46)*(pts[n-1]-1)/(top-1);
  ctx.beginPath(); ctx.arc(lx,ly,5,0,7); ctx.fillStyle = "#fff"; ctx.shadowColor = "#fff"; ctx.shadowBlur = 18; ctx.fill(); ctx.shadowBlur = 0;
}
function crashCash(){
  if (!crLive) return;
  const m = crashMultAt(performance.now() - crT0);
  cancelAnimationFrame(crRaf); crLive = false; escrowSettle("crash");
  $("crashgo").disabled = false; $("crashcash").disabled = true;
  const pay = Math.floor(crBet * m);
  addChips(pay); winFx(pay, crBet);
  stRound("crash", crBet, pay);
  if (m >= 10) ach("crash10x");
  $("crashmsg").textContent = `Cashed out at ${m.toFixed(2)}× — +${fmt(pay-crBet)}`;
  $("crashmsg").className = "msg win";
}
function crashBoom(){
  cancelAnimationFrame(crRaf); crLive = false; escrowSettle("crash");
  $("crashgo").disabled = false; $("crashcash").disabled = true;
  $("crashmult").textContent = crPoint.toFixed(2) + "×"; $("crashmult").style.color = "#ff3b1f";
  screenFlash(); screenShake($("crashpanel"));
  stRound("crash", crBet, 0);
  $("crashmsg").textContent = `Crashed at ${crPoint.toFixed(2)}× — bet lost.`;
  $("crashmsg").className = "msg lose";
}
function crashAbort(){ if (crLive){ cancelAnimationFrame(crRaf); crLive = false; escrowSettle("crash"); addChips(crBet); $("crashgo").disabled = false; $("crashcash").disabled = true; } }

