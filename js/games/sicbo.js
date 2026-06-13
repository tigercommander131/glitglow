/* ════════════════ SIC BO ════════════════ */
const SB_TOTPAY = {4:60,5:30,6:17,7:12,8:8,9:6,10:6,11:6,12:6,13:8,14:12,15:17,16:30,17:60};
let sbChipV = 50, sbBets = {}, sbRolling = false, sbDice = [3,5,2], sbRaf = 0;
const sbcv = $("sicbocv"), sbx = sbcv.getContext("2d");
function sbChip(v, btn){
  sbChipV = v;
  document.querySelectorAll("#sbchipsel .cbtn").forEach(b=>b.style.background = b===btn ? "rgba(201,168,76,.25)" : "");
}
function sbStakedTotal(){ return Object.values(sbBets).reduce((a,b)=>a+b,0); }
function sbBuildBoard(){
  const g = $("sbgrid");
  let html = "";
  html += `<button class="fcell outer span2" data-sb="small">SMALL<small>4–10 · 1:1</small></button>`;
  html += `<button class="fcell grn span2" data-sb="triple">ANY TRIPLE<small>30:1</small></button>`;
  html += `<button class="fcell outer span2" data-sb="big">BIG<small>11–17 · 1:1</small></button>`;
  for (let d=1; d<=6; d++) html += `<button class="fcell red" data-sb="dbl${d}">${d}+${d}<small>10:1</small></button>`;
  for (let t=4; t<=17; t++){
    html += `<button class="fcell blk${t>=16?" span3":""}" data-sb="tot${t}">${t}<small>${SB_TOTPAY[t]}:1</small></button>`;
  }
  g.innerHTML = html;
  g.querySelectorAll("[data-sb]").forEach(c => c.addEventListener("click", ()=>sbPlace(c.dataset.sb, c)));
}
function sbPlace(key, cell){
  if (sbRolling) return;
  if (sbStakedTotal() + sbChipV > chips){ toast("Not enough chips"); return; }
  sbBets[key] = (sbBets[key]||0) + sbChipV;
  sbRenderChips();
}
function sbRenderChips(){
  document.querySelectorAll("#sbgrid .betchip").forEach(e=>e.remove());
  for (const [k,v] of Object.entries(sbBets)){
    const cell = document.querySelector(`#sbgrid [data-sb="${k}"]`);
    if (cell){ const ch = document.createElement("div"); ch.className = "betchip"; ch.textContent = v; cell.appendChild(ch); }
  }
  $("sbtotal").textContent = "staked: " + fmt(sbStakedTotal());
}
function sbClear(){ if (!sbRolling){ sbBets = {}; sbRenderChips(); } }
function sbInit(){ if (!$("sbgrid").children.length) sbBuildBoard(); sbRenderChips(); sbDraw(sbDice, [0,0,0], [0,0,0]); }
function sbStop(){ cancelAnimationFrame(sbRaf); sbRaf = 0; sbRolling = false; if($("sbroll")) $("sbroll").disabled = false; }
const SB_PIPS = {
  1:[[0,0]], 2:[[-1,-1],[1,1]], 3:[[-1,-1],[0,0],[1,1]],
  4:[[-1,-1],[1,-1],[-1,1],[1,1]], 5:[[-1,-1],[1,-1],[0,0],[-1,1],[1,1]],
  6:[[-1,-1],[1,-1],[-1,0],[1,0],[-1,1],[1,1]]
};
/* ctx is optional so the multiplayer table (js/social/rooms.js) can draw on its own
   canvas; solo play passes neither and keeps the module context (behaviour unchanged) */
function sbDrawDie(x, y, size, face, rot, glow, ctx){
  ctx = ctx || sbx;
  ctx.save();
  ctx.translate(x, y); ctx.rotate(rot);
  if (glow){ ctx.shadowColor = "rgba(255,233,168,.95)"; ctx.shadowBlur = 24; }
  else { ctx.shadowColor = "rgba(0,0,0,.55)"; ctx.shadowBlur = 10; }
  const goldDie = typeof przDiceGold === "function" && przDiceGold();
  const g = ctx.createLinearGradient(-size/2,-size/2,size/2,size/2);
  if (goldDie){ g.addColorStop(0,"#ffe9a8"); g.addColorStop(1,"#b8902e"); }
  else { g.addColorStop(0,"#fdf8ec"); g.addColorStop(1,"#e3d6b8"); }
  ctx.fillStyle = g;
  rounded(ctx, -size/2, -size/2, size, size, size*0.18); ctx.fill();
  ctx.shadowBlur = 0;
  if (glow){ ctx.strokeStyle = "#ffe9a8"; ctx.lineWidth = 2.5; rounded(ctx,-size/2,-size/2,size,size,size*0.18); ctx.stroke(); }
  ctx.fillStyle = goldDie ? "#241500" : "#1a1a1a";
  const off = size*0.26, pr = size*0.085;
  for (const [px,py] of SB_PIPS[face]){
    ctx.beginPath(); ctx.arc(px*off, py*off, pr, 0, 7); ctx.fill();
  }
  ctx.restore();
}
function sbDraw(faces, rots, lifts, glows, ctx, cv){
  ctx = ctx || sbx; cv = cv || sbcv;
  ctx.clearRect(0,0,cv.width,cv.height);
  const size = 66, cy = 76, xs = [86, 190, 294];
  for (let i=0;i<3;i++)
    sbDrawDie(xs[i], cy - (lifts?lifts[i]:0), size, faces[i], rots?rots[i]:0, glows?glows[i]:false, ctx);
}
function sbRoll(){
  if (sbRolling) return;
  const total = sbStakedTotal();
  if (!total){ toast("Place a bet on the felt"); return; }
  if (total > chips){ toast("Not enough chips"); return; }
  chips -= total; saveChips(); chipToss();
  sbRolling = true; $("sbroll").disabled = true;
  $("sbmsg").textContent = ""; $("sbmsg").className = "msg";
  document.querySelectorAll("#sbgrid .fcell.winflash").forEach(c=>c.classList.remove("winflash"));
  const result = [0,0,0].map(()=>1+(Math.random()*6|0));
  let t = 0, dur = 80;
  const anim = ()=>{
    t++;
    if (t % 7 === 1 && t/dur < 0.72) SND.dice();
    const k = t/dur, settle = Math.min(1, k);
    const faces = [0,1,2].map(i => k > 0.72 + i*0.09 ? result[i] : 1+(Math.random()*6|0));
    const rots = [0,1,2].map(i => k > 0.72 + i*0.09 ? 0 : Math.sin(t*.5+i*2)*(1-settle)*.6);
    const lifts = [0,1,2].map(i => k > 0.72 + i*0.09 ? 0 : Math.abs(Math.sin(t*.28+i*1.4))*26*(1-settle));
    sbDraw(faces, rots, lifts);
    if (t < dur){ sbRaf = requestAnimationFrame(anim); }
    else sbResolve(result);
  };
  anim();
}
function sbResolve(d){
  const sum = d[0]+d[1]+d[2];
  const isTriple = d[0]===d[1] && d[1]===d[2];
  const winners = [];
  let pay = 0;
  for (const [k,stake] of Object.entries(sbBets)){
    let mult = 0; // total return multiplier on win (stake + profit)
    if (k === "small" && sum >= 4 && sum <= 10 && !isTriple) mult = 2;
    if (k === "big" && sum >= 11 && sum <= 17 && !isTriple) mult = 2;
    if (k === "triple" && isTriple) mult = 31;
    if (k.startsWith("dbl")){
      const n = +k.slice(3);
      if (d.filter(x=>x===n).length >= 2) mult = 11;
    }
    if (k.startsWith("tot") && sum === +k.slice(3)) mult = SB_TOTPAY[sum] + 1;
    if (mult > 0){
      pay += stake * mult;
      winners.push(k);
    }
  }
  sbDraw(d, [0,0,0], [0,0,0], [true,true,true]);
  winners.forEach(k=>{
    const cell = document.querySelector(`#sbgrid [data-sb="${k}"]`);
    if (cell) cell.classList.add("winflash");
  });
  const staked = sbStakedTotal();
  if (isTriple && winners.includes("triple")) ach("sbTriple");
  stRound("sicbo", staked, pay);
  if (pay > 0){
    addChips(pay); winFx(pay, staked);
    const net = pay - staked;
    $("sbmsg").textContent = d.join(" · ")+" = "+sum+(isTriple?" TRIPLE":"")+" · "+(net>=0?"+":"")+fmt(net);
    $("sbmsg").className = "msg " + (net>=0?"win":"push");
  } else {
    $("sbmsg").textContent = d.join(" · ")+" = "+sum+(isTriple?" TRIPLE":"")+" · house takes it";
    $("sbmsg").className = "msg lose";
  }
  sbBets = {}; sbRenderChips();
  sbRolling = false; $("sbroll").disabled = false; sbRaf = 0;
}

registerGame("sicbo", { init: sbInit, stop: sbStop });
