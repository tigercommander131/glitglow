/* ════════════════ ROULETTE ════════════════ */
const RWHEEL = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const RREDS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
let roulBets = {}, roulChipV = 50, roulSpinning = false, roulAngle = 0, roulWin = -1;
function roulChip(v, btn){
  roulChipV = v;
  document.querySelectorAll("#roulchipsel .cbtn").forEach(b => b.style.background = "");
  btn.style.background = "rgba(201,168,76,.25)";
}
function roulInit(){
  const g = $("feltgrid");
  if (!g.dataset.built){
    g.dataset.built = "1";
    let html = `<div class="fcell grn" data-bet="n0" style="grid-row:1/4">0</div>`;
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 12; col++){
        const n = col*3 + (3-row);
        html += `<div class="fcell ${RREDS.has(n)?"red":"blk"}" data-bet="n${n}" style="grid-row:${row+1};grid-column:${col+2}">${n}</div>`;
      }
    for (let row = 0; row < 3; row++)
      html += `<div class="fcell outer" data-bet="col${3-row}" style="grid-row:${row+1};grid-column:14">2:1</div>`;
    const dz = ["1st 12","2nd 12","3rd 12"];
    for (let i = 0; i < 3; i++)
      html += `<div class="fcell outer" data-bet="dz${i+1}" style="grid-row:4;grid-column:${2+i*4}/${6+i*4}">${dz[i]}</div>`;
    const outs = [["lo","1–18"],["even","EVEN"],["red","RED"],["blk","BLACK"],["odd","ODD"],["hi","19–36"]];
    outs.forEach((o,i) => html += `<div class="fcell outer" data-bet="${o[0]}" style="grid-row:5;grid-column:${2+i*2}/${4+i*2}">${o[1]}</div>`);
    g.innerHTML = html;
    g.addEventListener("click", e => {
      const cell = e.target.closest(".fcell"); if (!cell || roulSpinning) return;
      const k = cell.dataset.bet;
      if (roulChipV > chips - stakedTotal()){ toast("Not enough chips"); return; }
      roulBets[k] = (roulBets[k]||0) + roulChipV;
      roulRenderChips();
    });
  }
  roulDrawWheel(roulAngle, 0, -1, 0);
  roulRenderChips();
}
function stakedTotal(){ return Object.values(roulBets).reduce((a,b)=>a+b,0); }
function roulRenderChips(){
  document.querySelectorAll("#feltgrid .betchip").forEach(c => c.remove());
  for (const [k,v] of Object.entries(roulBets)){
    const cell = document.querySelector(`#feltgrid [data-bet="${k}"]`);
    if (cell){ const c = document.createElement("div"); c.className = "betchip"; c.textContent = v >= 1000 ? (v/1000)+"k" : v; cell.appendChild(c); }
  }
  $("roultotal").textContent = "staked: " + fmt(stakedTotal());
}
function roulClear(){ if (!roulSpinning){ roulBets = {}; roulRenderChips(); } }
/* cv + winN are optional so the multiplayer table (js/social/rooms.js) can reuse
   this exact renderer on its own canvas; solo play passes neither and keeps the defaults */
function roulDrawWheel(wheelA, ballA, ballR, ballDrop, trail, cv, winN){
  cv = cv || $("roulcv"); if (winN === undefined) winN = roulWin;
  const ctx = cv.getContext("2d"), W = cv.width, cx = W/2, cy = W/2;
  const R = W/2 - 6;
  ctx.clearRect(0,0,W,W);
  // outer rim
  ctx.beginPath(); ctx.arc(cx,cy,R,0,7); ctx.fillStyle = "#2a1206"; ctx.fill();
  ctx.lineWidth = 5; ctx.strokeStyle = "#c9a84c"; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx,cy,R-14,0,7); ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(232,207,138,.5)"; ctx.stroke();
  // segments
  const segR = R - 22, inR = segR*0.62, seg = Math.PI*2/37;
  for (let i = 0; i < 37; i++){
    const n = RWHEEL[i], a0 = wheelA + i*seg, a1 = a0 + seg;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a0)*inR, cy + Math.sin(a0)*inR);
    ctx.arc(cx,cy,segR,a0,a1); ctx.arc(cx,cy,inR,a1,a0,true); ctx.closePath();
    ctx.fillStyle = n === 0 ? "#0a5c2e" : (RREDS.has(n) ? "#8b1a1a" : "#141414");
    if (n === winN){ ctx.fillStyle = n === 0 ? "#1fae62" : (RREDS.has(n) ? "#e03535" : "#4a4a4a"); }
    ctx.fill();
    ctx.strokeStyle = "rgba(232,207,138,.55)"; ctx.lineWidth = 1; ctx.stroke();
    const am = a0 + seg/2, tr = segR - 13;
    ctx.save(); ctx.translate(cx + Math.cos(am)*tr, cy + Math.sin(am)*tr);
    ctx.rotate(am + Math.PI/2);
    ctx.fillStyle = "#f3e9d4"; ctx.font = "bold 11px JetBrains Mono, monospace";
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(n, 0, 0); ctx.restore();
  }
  // inner decorative rings + hub
  ctx.beginPath(); ctx.arc(cx,cy,inR,0,7); ctx.fillStyle = "#170a02"; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = "#c9a84c"; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx,cy,inR*0.7,0,7); ctx.lineWidth = 1; ctx.strokeStyle = "rgba(201,168,76,.5)"; ctx.stroke();
  for (let i = 0; i < 8; i++){
    const a = wheelA*1 + i*Math.PI/4;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a)*14, cy + Math.sin(a)*14);
    ctx.lineTo(cx + Math.cos(a)*inR*0.7, cy + Math.sin(a)*inR*0.7);
    ctx.strokeStyle = "rgba(201,168,76,.45)"; ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(cx,cy,13,0,7); ctx.fillStyle = "#c9a84c"; ctx.fill();
  // ball + fading light trail
  if (ballR > 0){
    const br = ballR - ballDrop;
    if (trail && trail.length){
      for (let i = 0; i < trail.length; i++){
        const k = i/trail.length;
        ctx.globalAlpha = k*0.35;
        ctx.beginPath(); ctx.arc(cx + Math.cos(trail[i].a)*trail[i].r, cy + Math.sin(trail[i].a)*trail[i].r, 2 + k*3.5, 0, 7);
        ctx.fillStyle = "#fff"; ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    const bx = cx + Math.cos(ballA)*br, by = cy + Math.sin(ballA)*br;
    ctx.beginPath(); ctx.arc(bx,by,6,0,7);
    const g = ctx.createRadialGradient(bx-2,by-2,1,bx,by,6);
    if (typeof przBallGold === "function" && przBallGold()){ g.addColorStop(0,"#ffe9a8"); g.addColorStop(1,"#b8902e"); }
    else { g.addColorStop(0,"#fff"); g.addColorStop(1,"#bbb"); }
    ctx.fillStyle = g; ctx.fill();
  }
  // pointer
  ctx.beginPath(); ctx.moveTo(cx-9,4); ctx.lineTo(cx+9,4); ctx.lineTo(cx,22); ctx.closePath();
  ctx.fillStyle = "#e8cf8a"; ctx.fill();
}
function roulSpin(){
  if (roulSpinning) return;
  const total = stakedTotal();
  if (!total){ toast("Place a bet on the felt"); return; }
  if (total > chips){ toast("Not enough chips"); return; }
  chips -= total; saveChips(); chipToss();
  roulSpinning = true; roulWin = -1; $("roulspin").disabled = true;
  $("roulresult").textContent = ""; $("roulresult").className = "msg";
  document.querySelectorAll(".fcell.winflash").forEach(c => c.classList.remove("winflash"));
  const winIdx = (Math.random()*37)|0, winNum = RWHEEL[winIdx];
  const seg = Math.PI*2/37, pointerA = -Math.PI/2;
  // final wheel angle puts winning segment centre under pointer:
  // whole turns only, normalized against the current angle so every spin
  // travels forward 6-8 full revolutions and ends exactly on target
  const TAU = Math.PI*2, spins = 6 + ((Math.random()*3)|0);
  const startW = roulAngle;
  const targW = pointerA - (winIdx+0.5)*seg;
  const endW = startW - (((startW - targW) % TAU) + TAU) % TAU - TAU*spins;
  const cv = $("roulcv"), R = cv.width/2 - 6, trackR = R - 11;
  const ballStart = Math.random()*7, ballEnd = pointerA + Math.PI*2*(spins+3);
  const T = 5200, t0 = performance.now();
  const ease = t => 1 - Math.pow(1-t, 3);
  const btrail = [];
  let lastTickSeg = -1;
  (function frame(now){
    let t = Math.min(1, (now - t0)/T);
    const e = ease(t);
    roulAngle = startW + (endW - startW)*e;
    const ba = ballStart + (ballEnd - ballStart)*e;
    const tickSeg = Math.floor((ba - roulAngle)/seg);
    if (tickSeg !== lastTickSeg && t < 0.97){ lastTickSeg = tickSeg; SND.tick(); }
    let drop = 0;
    if (t > 0.78){
      const d = (t-0.78)/0.22;
      drop = (trackR - (R-22-18)) * Math.min(1, d) + Math.abs(Math.sin(d*Math.PI*3))*(1-d)*8; // bounce
    }
    if (!RM && t < 0.9){ btrail.push({ a: ba, r: trackR - drop }); if (btrail.length > 10) btrail.shift(); }
    else btrail.shift();
    roulDrawWheel(roulAngle, t < 0.97 ? ba : roulAngle + (winIdx+0.5)*seg, trackR, drop, btrail);
    if (t < 1) requestAnimationFrame(frame);
    else { roulWin = winNum; roulDrawWheel(roulAngle, -Math.PI/2, trackR, trackR-(R-40)); roulSettle(winNum, total); }
  })(t0);
}
function roulSettle(n, total){
  let pay = 0;
  for (const [k,v] of Object.entries(roulBets)){
    if (k === "n"+n) pay += v*36;
    else if (k === "red" && n && RREDS.has(n)) pay += v*2;
    else if (k === "blk" && n && !RREDS.has(n)) pay += v*2;
    else if (k === "odd" && n && n%2===1) pay += v*2;
    else if (k === "even" && n && n%2===0) pay += v*2;
    else if (k === "lo" && n>=1 && n<=18) pay += v*2;
    else if (k === "hi" && n>=19) pay += v*2;
    else if (k === "dz1" && n>=1 && n<=12) pay += v*3;
    else if (k === "dz2" && n>=13 && n<=24) pay += v*3;
    else if (k === "dz3" && n>=25) pay += v*3;
    else if (k.startsWith("col") && n && n%3 === (+k[3])%3) pay += v*3;
  }
  const col = n===0 ? "green" : (RREDS.has(n) ? "red" : "black");
  const r = $("roulresult");
  r.textContent = `Ball lands on ${n} (${col})` + (pay ? ` — paid ${fmt(pay)}` : " — house collects");
  r.className = "msg " + (pay >= total ? "win" : pay ? "push" : "lose");
  const cell = document.querySelector(`#feltgrid [data-bet="n${n}"]`);
  if (cell) cell.classList.add("winflash");
  stRound("roulette", total, pay);
  if (pay){ addChips(pay); winFx(pay, total); }
  roulBets = {}; setTimeout(roulRenderChips, 1500);
  roulSpinning = false; $("roulspin").disabled = false;
}

registerGame("roulette", { init: roulInit });
