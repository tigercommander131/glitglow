/* ════════════════ SPINNER WHEEL ════════════════ */
const SPSEGS = (() => {
  const tiers = [0,0,0,0,0,0,1.5,1.5,1.5,1.5,1.5,2,2,2,2,3,3,5,5,10];
  // interleave for visual variety
  const order = [0,6,11,1,15,7,2,17,12,3,8,16,4,13,9,19,5,14,10,18];
  return order.map(i => tiers[i]);
})();
const SPCOLS = { 0:"#3a3a44", 1.5:"#0a5c2e", 2:"#1f4f7a", 3:"#7a4f1f", 5:"#8b1a1a", 10:"#c9a84c" };
let spA = 0, spBusy = false;
function spinDraw(angle, winIdx){
  const cv = $("spincv"), ctx = cv.getContext("2d"), W = cv.width, cx = W/2, cy = W/2 + 20, R = W/2 - 14;
  ctx.clearRect(0,0,W,cv.height);
  const seg = Math.PI*2/20;
  for (let i = 0; i < 20; i++){
    const a0 = angle + i*seg, a1 = a0 + seg, v = SPSEGS[i];
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,R,a0,a1); ctx.closePath();
    ctx.fillStyle = SPCOLS[v];
    if (i === winIdx){ ctx.save(); ctx.shadowColor = "#ffe9a8"; ctx.shadowBlur = 22; ctx.fillStyle = "#e8cf8a"; }
    ctx.fill();
    if (i === winIdx) ctx.restore();
    ctx.strokeStyle = "rgba(232,207,138,.55)"; ctx.lineWidth = 1.5; ctx.stroke();
    const am = a0 + seg/2;
    ctx.save(); ctx.translate(cx + Math.cos(am)*R*0.72, cy + Math.sin(am)*R*0.72); ctx.rotate(am + Math.PI/2);
    ctx.fillStyle = i === winIdx ? "#140a00" : "#f3e9d4";
    ctx.font = "bold 14px JetBrains Mono"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(v + "×", 0, 0); ctx.restore();
  }
  ctx.beginPath(); ctx.arc(cx,cy,R,0,7); ctx.lineWidth = 5; ctx.strokeStyle = "#c9a84c"; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx,cy,20,0,7); ctx.fillStyle = "#c9a84c"; ctx.fill();
  // pointer at top
  ctx.beginPath(); ctx.moveTo(cx-14, cy-R-14); ctx.lineTo(cx+14, cy-R-14); ctx.lineTo(cx, cy-R+12); ctx.closePath();
  ctx.fillStyle = "#e8cf8a"; ctx.shadowColor = "#c9a84c"; ctx.shadowBlur = 10; ctx.fill(); ctx.shadowBlur = 0;
}
function spinGo(){
  if (spBusy) return;
  const bet = takeBet("spinbet"); if (!bet) return;
  spBusy = true; $("spingo").disabled = true;
  $("spinmsg").textContent = ""; $("spinmsg").className = "msg";
  const winIdx = (Math.random()*20)|0;
  const seg = Math.PI*2/20, pointerA = -Math.PI/2, TAU = Math.PI*2;
  // whole turns, normalized to the current angle: always 5-7 forward revs, exact landing
  const turns = 5 + ((Math.random()*3)|0);
  const targ = pointerA - (winIdx+0.5)*seg;
  const start = spA, end = start - (((start - targ) % TAU) + TAU) % TAU - TAU*turns;
  const t0 = performance.now(), T = 4200;
  let lastSpTick = -1;
  (function f(now){
    const t = Math.min(1, (now-t0)/T), e = 1 - Math.pow(1-t,3);
    spA = start + (end-start)*e;
    const spTick = Math.floor(-spA/seg);
    if (spTick !== lastSpTick && t < 1){ lastSpTick = spTick; SND.tick(); }
    spinDraw(spA, t === 1 ? winIdx : -1);
    if (t < 1) requestAnimationFrame(f);
    else {
      const m = SPSEGS[winIdx], pay = Math.floor(bet*m), msg = $("spinmsg");
      stRound("spinner", bet, pay);
      if (pay){ addChips(pay); winFx(pay, bet); }
      msg.textContent = m === 0 ? "0× — house keeps it." : `${m}× — paid ${fmt(pay)}`;
      msg.className = "msg " + (m === 0 ? "lose" : m < 2 ? "push" : "win");
      spBusy = false; $("spingo").disabled = false;
    }
  })(t0);
}


registerGame("spinner", { init: () => spinDraw(0, -1) });
