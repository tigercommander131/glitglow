/* ════════════════ SCRATCH CARDS ════════════════ */
const SCR_TIERS = [
  { id:"c100", n:"Bronze", cost:100,  cur:"chips", prizes:[[2,12],[3,8],[5,4],[20,1],[100,0.1]] },
  { id:"c500", n:"Gold", cost:500,  cur:"chips", prizes:[[2,12],[3,8],[5,4],[20,1],[100,0.1]] },
  { id:"t50",  n:"Punter", cost:50,   cur:"tix", prizes:[[250,35],[600,22],[1500,10],[4000,2.5],[15000,0.5]] },
  { id:"t200", n:"High Roller", cost:200, cur:"tix", prizes:[[1000,35],[2500,22],[6000,10],[15000,3],[60000,0.6]] },
  { id:"t500", n:"Vault", cost:500, cur:"tix", prizes:[[3000,35],[7000,22],[15000,10],[40000,3],[150000,0.8]] }
];
const SCR_SYMS = ["🍒","🔔","💎","7️⃣","⭐","🍀","💰","🃏"];
const scGx = $("scrgrid").getContext("2d"), scFoilCv = $("scrfoil"), scFx = scFoilCv.getContext("2d");
let scCard = null, scStrokes = 0;
function scInit(){
  $("scrtiers").innerHTML = SCR_TIERS.map(t =>
    `<button class="${t.cur === "tix" ? "tixt" : ""}" onclick="scBuy('${t.id}')">${t.n} · ${t.cur === "tix" ? t.cost + " 🎟" : fmt(t.cost) + " chips"}</button>`).join("");
}
function scBuy(id){
  if (scCard && !scCard.settled){ toast("Finish this card first"); return; }
  const t = SCR_TIERS.find(x => x.id === id);
  if (t.cur === "chips"){
    if (chips < t.cost){ toast("Not enough chips"); return; }
    chips -= t.cost; saveChips(); chipToss(); SND.chips(2);
  } else {
    if (tickets < t.cost){ toast("Not enough tickets — hit the cabinets"); SND.lose(); return; }
    tickets -= t.cost; saveTix(); SND.chips(2);
  }
  // outcome decided up front, grid laid out to match
  let win = 0;
  const roll = Math.random()*100; let acc = 0;
  for (const [p, pct] of t.prizes){
    acc += pct;
    if (roll < acc){ win = t.cur === "chips" ? Math.floor(t.cost * p) : p; break; }
  }
  const sym = SCR_SYMS[(Math.random()*SCR_SYMS.length)|0];
  const grid = win ? [sym, sym, sym] : [];
  while (grid.length < 9){
    const s = SCR_SYMS[(Math.random()*SCR_SYMS.length)|0];
    if (win && s === sym) continue;
    if (grid.filter(g => g === s).length >= 2) continue;
    grid.push(s);
  }
  for (let i = 8; i > 0; i--){ const j = (Math.random()*(i+1))|0; [grid[i],grid[j]] = [grid[j],grid[i]]; }
  scCard = { tier: t, win, sym, grid, settled: false };
  $("scrmsg").textContent = ""; $("scrmsg").className = "msg";
  $("scrwrap").classList.add("on"); $("scrreveal").style.display = "";
  scDrawGrid(false);
  scResetFoil();
}
function scDrawGrid(showWin){
  const x = scGx;
  x.clearRect(0, 0, 330, 330);
  x.fillStyle = "#140a02"; x.fillRect(0, 0, 330, 330);
  x.textAlign = "center"; x.textBaseline = "middle";
  let winLeft = 3;
  for (let i = 0; i < 9; i++){
    const c = i % 3, r = (i/3)|0, cx = 22 + c*96, cy = 22 + r*96;
    x.fillStyle = "rgba(201,168,76,.08)";
    x.strokeStyle = "rgba(201,168,76,.4)"; x.lineWidth = 2;
    rounded(x, cx, cy, 86, 86, 10); x.fill(); x.stroke();
    const isWin = showWin && scCard.win && scCard.grid[i] === scCard.sym && winLeft > 0;
    if (isWin){
      winLeft--;
      x.strokeStyle = "#7be0a3"; x.lineWidth = 3; x.shadowColor = "#7be0a3"; x.shadowBlur = 14;
      rounded(x, cx, cy, 86, 86, 10); x.stroke(); x.shadowBlur = 0;
    }
    x.font = "40px serif";
    x.fillText(scCard.grid[i], cx + 43, cy + 46);
  }
}
function scResetFoil(){
  const f = scFx;
  f.globalCompositeOperation = "source-over";
  const g = f.createLinearGradient(0, 0, 330, 330);
  g.addColorStop(0, "#c9a84c"); g.addColorStop(.5, "#8b6a1e"); g.addColorStop(1, "#c9a84c");
  f.fillStyle = g; f.fillRect(0, 0, 330, 330);
  f.fillStyle = "rgba(0,0,0,.14)";
  for (let i = -330; i < 330; i += 22){
    f.save(); f.translate(i, 0); f.rotate(Math.PI/4); f.fillRect(0, -240, 9, 720); f.restore();
  }
  f.fillStyle = "#3a2a08"; f.font = "700 24px Orbitron"; f.textAlign = "center"; f.textBaseline = "middle";
  f.fillText("SCRATCH", 165, 150);
  f.fillText("TO REVEAL", 165, 184);
  scStrokes = 0;
}
function scPt(e){
  const r = scFoilCv.getBoundingClientRect();
  return { x: (e.clientX - r.left)*(330/r.width), y: (e.clientY - r.top)*(330/r.height) };
}
let scDown = false;
scFoilCv.addEventListener("pointerdown", e => {
  if (!scCard || scCard.settled) return;
  scDown = true; scFoilCv.setPointerCapture(e.pointerId); scRub(e);
});
scFoilCv.addEventListener("pointermove", e => { if (scDown) scRub(e); });
addEventListener("pointerup", () => scDown = false);
function scRub(e){
  e.preventDefault();
  const p = scPt(e);
  scFx.globalCompositeOperation = "destination-out";
  scFx.beginPath(); scFx.arc(p.x, p.y, 24, 0, 7); scFx.fill();
  if (++scStrokes % 4 === 0) SND.tick();
  if (scStrokes % 14 === 0 && scCoverage() > 0.55) scRevealAll();
}
function scCoverage(){
  const d = scFx.getImageData(0, 0, 330, 330, { willReadFrequently: true }).data;
  let clear = 0, total = 0;
  for (let i = 3; i < d.length; i += 4*331){ total++; if (d[i] < 40) clear++; }
  return total ? clear/total : 0;
}
function scRevealAll(){
  if (!scCard || scCard.settled) return;
  scFx.globalCompositeOperation = "destination-out";
  scFx.fillRect(0, 0, 330, 330);
  scSettle();
}
function scSettle(){
  scCard.settled = true;
  $("scrreveal").style.display = "none";
  const t = scCard.tier, win = scCard.win;
  scDrawGrid(true);
  if (t.cur === "chips") stRound("scratch", t.cost, win);     // handles sounds + stats
  else win ? SND.win(win >= 10000) : SND.lose();
  if (win){
    addChips(win); winFx(win, t.cur === "chips" ? t.cost : 200);
    $("scrmsg").textContent = "Three " + scCard.sym + " — +" + fmt(win) + " chips";
    $("scrmsg").className = "msg win";
  } else {
    $("scrmsg").textContent = "No match. The foil keeps its secrets.";
    $("scrmsg").className = "msg lose";
  }
}


registerGame("scratch", { init: scInit });
