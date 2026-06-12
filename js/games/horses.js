/* ════════════════ HORSE RACE ════════════════ */
const HR_NAMES = [["Gilded Ghost","#ffd23e"],["Midnight Run","#3e6bff"],["Neon Nerve","#ff2d78"],
  ["Velvet Thunder","#b44fff"],["Lucky Drip","#7be0a3"],["Old Money","#e8cf8a"]];
const hrCvE = $("hrcv"), hrCxE = hrCvE.getContext("2d");
const HR_FIN = 488;
let hrW = [], hrMult = [], hrPick = -1, hrRunning = false, hrRaf2 = 0, hrXs = [], hrBob = [];
function hrOdds(){
  hrW = HR_NAMES.map(() => 0.75 + Math.random()*0.85);
  const tot = hrW.reduce((a,b) => a+b, 0);
  // ~12% overround baked into the multipliers
  hrMult = hrW.map(w => Math.max(1.5, Math.round((0.88 / (w/tot)) * 10) / 10));
}
function hrPaintOdds(){
  $("hrodds").innerHTML = HR_NAMES.map((h,i) =>
    `<button class="${hrPick === i ? "picked" : ""}" onclick="hrPickH(${i})"><span>🐎 ${h[0]}</span><span class="om">${hrMult[i]}×</span></button>`).join("");
}
function hrPickH(i){ if (hrRunning) return; hrPick = i; hrPaintOdds(); }
function hrInit(){
  if (hrRunning) return;
  hrOdds(); hrPick = -1; hrPaintOdds();
  $("hrmsg").textContent = ""; $("hrmsg").className = "msg";
  hrXs = HR_NAMES.map(() => 0); hrBob = HR_NAMES.map(() => Math.random()*7);
  hrDraw(-1);
}
function hrStop(){
  // leaving mid-race aborts and refunds, like crash
  if (hrRunning && hrBetLive){ addChips(hrBetLive); hrBetLive = 0; $("hrgo").disabled = false; }
  hrRunning = false; cancelAnimationFrame(hrRaf2); hrRaf2 = 0;
}
let hrBetLive = 0;
function hrRace(){
  if (hrRunning) return;
  if (hrPick < 0){ toast("Pick a runner first"); return; }
  const bet = takeBet("hrbet"); if (!bet) return;
  hrBetLive = bet;
  hrRunning = true; $("hrgo").disabled = true;
  $("hrmsg").textContent = ""; $("hrmsg").className = "msg";
  hrXs = HR_NAMES.map(() => 0);
  SND.dice();
  (function loop(){
    if (!hrRunning) return;
    if (!frameGate("hr")){ hrRaf2 = requestAnimationFrame(loop); return; }
    for (let i = 0; i < 6; i++) hrXs[i] += hrW[i] * (0.9 + Math.random()*1.3) * 1.12;
    const past = hrXs.map((x,i) => [x,i]).filter(p => p[0] >= HR_FIN);
    if (past.length){
      past.sort((a,b) => b[0]-a[0]);
      const win = past[0][1];
      hrRunning = false; hrBetLive = 0; $("hrgo").disabled = false;
      hrDraw(win);
      const pay = win === hrPick ? Math.floor(bet * hrMult[win]) : 0;
      stRound("horses", bet, pay);
      if (pay){
        addChips(pay); winFx(pay, bet);
        $("hrmsg").textContent = HR_NAMES[win][0] + " takes it at " + hrMult[win] + "× — +" + fmt(pay - bet);
        $("hrmsg").className = "msg win";
      } else {
        $("hrmsg").textContent = HR_NAMES[win][0] + " takes it — not your horse.";
        $("hrmsg").className = "msg lose";
      }
      hrOdds(); setTimeout(hrPaintOdds, 1400);
      return;
    }
    hrDraw(-1);
    hrRaf2 = requestAnimationFrame(loop);
  })();
}
function hrDraw(winner){
  const x = hrCxE, W = 560, H = 300, laneH = 46, y0 = 14;
  x.clearRect(0, 0, W, H);
  x.fillStyle = "#0e0500"; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 6; i++){
    const y = y0 + i*laneH;
    x.fillStyle = i % 2 ? "rgba(201,168,76,.05)" : "rgba(201,168,76,.09)";
    x.fillRect(0, y, W, laneH - 4);
  }
  x.strokeStyle = "rgba(255,255,255,.55)"; x.setLineDash([6,6]); x.lineWidth = 2;
  x.beginPath(); x.moveTo(HR_FIN + 36, 6); x.lineTo(HR_FIN + 36, H - 6); x.stroke(); x.setLineDash([]);
  x.textAlign = "left"; x.textBaseline = "middle";
  for (let i = 0; i < 6; i++){
    const y = y0 + i*laneH + (laneH-4)/2;
    hrBob[i] += 0.31;
    const bob = hrRunning ? Math.sin(hrBob[i])*2.5 : 0;
    x.font = "10px 'JetBrains Mono'"; x.fillStyle = i === hrPick ? "#ffe9a8" : "#a89878";
    x.fillText(HR_NAMES[i][0].toUpperCase(), 6, y - 15);
    x.font = "26px serif";
    if (winner === i){ x.shadowColor = HR_NAMES[i][1]; x.shadowBlur = 18; }
    x.save(); x.translate(14 + hrXs[i] + 18, y + bob); x.scale(-1, 1);
    x.fillText("🐎", -18, 0); x.restore();
    x.shadowBlur = 0;
    x.fillStyle = HR_NAMES[i][1];
    x.fillRect(6, y + 10, Math.min(40, 8 + hrXs[i]/14), 3);
  }
}

