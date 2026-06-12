/* ════════════════ RUSSIAN ROULETTE ════════════════ */
let rrLive = false, rrBet = 0, rrBullet = 0, rrChamber = 0, rrSurvived = [], rrMult = 1, rrSpinA = 0, rrAnim = 0;
function rrDraw(highlight = -1, bang = -1){
  const cv = $("rrcv"), ctx = cv.getContext("2d"), W = cv.width, cx = W/2, cy = W/2;
  ctx.clearRect(0,0,W,W);
  ctx.save(); ctx.translate(cx,cy); ctx.rotate(rrSpinA);
  // cylinder body
  ctx.beginPath(); ctx.arc(0,0,130,0,7); ctx.fillStyle = "#1c1c22"; ctx.fill();
  ctx.lineWidth = 6; ctx.strokeStyle = "#c9a84c"; ctx.stroke();
  ctx.beginPath(); ctx.arc(0,0,118,0,7); ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(232,207,138,.35)"; ctx.stroke();
  for (let i = 0; i < 6; i++){
    const a = -Math.PI/2 + i*Math.PI/3, x = Math.cos(a)*72, y = Math.sin(a)*72;
    ctx.beginPath(); ctx.arc(x,y,30,0,7);
    let fill = "#0c0c10";
    if (rrSurvived.includes(i)) fill = "#11331e";
    if (i === bang) fill = "#5c0f0f";
    ctx.fillStyle = fill; ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = rrSurvived.includes(i) ? "#2e8b57" : (i === bang ? "#ff3b1f" : "#3a3a44");
    if (i === highlight) ctx.strokeStyle = "#e8cf8a";
    ctx.stroke();
    if (rrSurvived.includes(i)){
      ctx.fillStyle = "#7be0a3"; ctx.font = "bold 20px JetBrains Mono"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.shadowColor = "#2e8b57"; ctx.shadowBlur = 14; ctx.fillText("✓", x, y); ctx.shadowBlur = 0;
    }
    if (i === bang){
      ctx.fillStyle = "#ff7b7b"; ctx.font = "bold 24px JetBrains Mono"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.shadowColor = "#ff3b1f"; ctx.shadowBlur = 20; ctx.fillText("✸", x, y); ctx.shadowBlur = 0;
    }
  }
  ctx.beginPath(); ctx.arc(0,0,16,0,7); ctx.fillStyle = "#c9a84c"; ctx.fill();
  ctx.restore();
  // firing pin marker (top)
  ctx.beginPath(); ctx.moveTo(cx-10,2); ctx.lineTo(cx+10,2); ctx.lineTo(cx,20); ctx.closePath();
  ctx.fillStyle = "#e8cf8a"; ctx.fill();
}
function rrLoad(){
  if (rrLive) return;
  rrBet = takeBet("rrbet"); if (!rrBet) return;
  rrLive = true; rrSurvived = []; rrMult = 1; rrChamber = 0;
  rrBullet = (Math.random()*6)|0;
  $("rrload").disabled = true; $("rrpull").disabled = true; $("rrcash").disabled = true;
  $("rrmsg").textContent = ""; $("rrmsg").className = "msg"; $("rrmult").textContent = "1.00×";
  // spin animation
  const t0 = performance.now(), start = rrSpinA, end = start + Math.PI*2*(3+Math.random()*2);
  cancelAnimationFrame(rrAnim);
  (function f(now){
    const t = Math.min(1, (now-t0)/1600), e = 1 - Math.pow(1-t,3);
    rrSpinA = start + (end-start)*e; rrDraw();
    if (t < 1) rrAnim = requestAnimationFrame(f);
    else { $("rrpull").disabled = false; $("rrmsg").textContent = "Cylinder loaded. Your move."; $("rrmsg").className = "msg push"; }
  })(t0);
}
function rrPull(){
  if (!rrLive) return;
  $("rrpull").disabled = true; $("rrcash").disabled = true;
  const c = rrChamber;
  rrDraw(c);
  setTimeout(() => {
    if (c === rrBullet){
      rrDraw(-1, c);
      screenFlash(); screenShake($("rrpanel"));
      rrLive = false; $("rrload").disabled = false;
      $("rrmsg").textContent = "BANG. Bet lost."; $("rrmsg").className = "msg lose";
      stRound("russian", rrBet, 0);
      return;
    }
    rrSurvived.push(c); rrChamber++;
    const left = 6 - rrSurvived.length;
    rrMult *= (left + 1) / left * 0.97;
    $("rrmult").textContent = rrMult.toFixed(2) + "×";
    rrDraw();
    if (rrSurvived.length === 5){
      // only the bullet remains — auto cash
      rrCash(true); return;
    }
    $("rrpull").disabled = false; $("rrcash").disabled = false;
    $("rrmsg").textContent = `Click — chamber ${rrSurvived.length} survived.`; $("rrmsg").className = "msg win";
  }, 600);
}
function rrCash(maxed){
  if (!rrLive || !rrSurvived.length) return;
  rrLive = false;
  const pay = Math.floor(rrBet * rrMult);
  if (maxed) ach("rrLegend");
  stRound("russian", rrBet, pay);
  addChips(pay); winFx(pay, rrBet);
  $("rrload").disabled = false; $("rrpull").disabled = true; $("rrcash").disabled = true;
  $("rrmsg").textContent = (maxed ? "Five clicks. Legend. " : "You walk away. ") + `+${fmt(pay-rrBet)} at ${rrMult.toFixed(2)}×`;
  $("rrmsg").className = "msg win";
}


registerGame("russian", { init: rrDraw });
