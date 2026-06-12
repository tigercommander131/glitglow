
/* ════════════════ TETRIS ════════════════ */
const ttCv = $("tetcv"), ttCx = ttCv.getContext("2d");
const TTW = 10, TTH = 20, CELL = 28;
const BOARD_X = 130, BOARD_Y = 20;
const TPIECES = {
  I:{c:"#3ee8ff",m:[[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]]},
  O:{c:"#ffd23e",m:[[1,1],[1,1]]},
  T:{c:"#b44fff",m:[[0,1,0],[1,1,1],[0,0,0]]},
  S:{c:"#7bff8e",m:[[0,1,1],[1,1,0],[0,0,0]]},
  Z:{c:"#ff3b3b",m:[[1,1,0],[0,1,1],[0,0,0]]},
  J:{c:"#3e6bff",m:[[1,0,0],[1,1,1],[0,0,0]]},
  L:{c:"#ff9b2d",m:[[0,0,1],[1,1,1],[0,0,0]]}
};
// SRS kick tables
const KICKS = {
  norm: { "0>1":[[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]], "1>0":[[0,0],[1,0],[1,-1],[0,2],[1,2]],
          "1>2":[[0,0],[1,0],[1,-1],[0,2],[1,2]],     "2>1":[[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
          "2>3":[[0,0],[1,0],[1,1],[0,-2],[1,-2]],    "3>2":[[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
          "3>0":[[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],  "0>3":[[0,0],[1,0],[1,1],[0,-2],[1,-2]] },
  I:    { "0>1":[[0,0],[-2,0],[1,0],[-2,-1],[1,2]],   "1>0":[[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
          "1>2":[[0,0],[-1,0],[2,0],[-1,2],[2,-1]],   "2>1":[[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
          "2>3":[[0,0],[2,0],[-1,0],[2,1],[-1,-2]],   "3>2":[[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
          "3>0":[[0,0],[1,0],[-2,0],[1,-2],[-2,1]],   "0>3":[[0,0],[-1,0],[2,0],[-1,2],[2,-1]] }
};
let ttGrid, ttCur, ttHold, ttHeld, ttQueue, ttBag, ttScore, ttLines, ttLevel, ttTimer = 0, ttOver, ttFlash = [];
function ttStop(){ clearInterval(ttTimer); ttTimer = 0; }
function ttBagDraw(){
  if (!ttBag || !ttBag.length){
    ttBag = Object.keys(TPIECES);
    for (let i = ttBag.length-1; i > 0; i--){ const j = (Math.random()*(i+1))|0; [ttBag[i],ttBag[j]] = [ttBag[j],ttBag[i]]; }
  }
  return ttBag.pop();
}
function ttCol(t){
  const pal = typeof przTetPal === "function" && przTetPal();
  return (pal && pal[t]) || TPIECES[t].c;
}
function ttNewPiece(type){
  const t = type || ttQueue.shift();
  if (!type) ttQueue.push(ttBagDraw());
  const m = TPIECES[t].m.map(r => [...r]);
  return { t, m, x: Math.floor((TTW - m.length)/2), y: t === "I" ? -1 : 0, rot: 0 };
}
function tetStart(){
  ttStop();
  ttGrid = Array.from({length:TTH}, () => Array(TTW).fill(null));
  ttBag = []; ttQueue = [ttBagDraw(), ttBagDraw(), ttBagDraw()];
  ttCur = ttNewPiece(); ttHold = null; ttHeld = false;
  ttScore = 0; ttLines = 0; ttLevel = 1; ttOver = false; ttFlash = [];
  ttUI();
  $("ttover").classList.remove("on");
  ttRestartTimer();
  ttDraw();
}
function ttUI(){ $("ttscore").textContent = ttScore; $("ttlines").textContent = ttLines; $("ttlevel").textContent = ttLevel; }
function ttRestartTimer(){
  clearInterval(ttTimer);
  ttTimer = setInterval(() => ttSoft(true), Math.max(80, 800 - (ttLevel-1)*70));
}
function ttFits(m, x, y){
  for (let r = 0; r < m.length; r++)
    for (let c = 0; c < m[r].length; c++){
      if (!m[r][c]) continue;
      const gx = x+c, gy = y+r;
      if (gx < 0 || gx >= TTW || gy >= TTH) return false;
      if (gy >= 0 && ttGrid[gy][gx]) return false;
    }
  return true;
}
function ttRotated(m){
  const n = m.length, out = Array.from({length:n}, () => Array(n).fill(0));
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) out[c][n-1-r] = m[r][c];
  return out;
}
function ttRotate(){
  if (ttOver || ttCur.t === "O") return;
  const m2 = ttRotated(ttCur.m);
  const from = ttCur.rot, to = (from+1)%4;
  const table = ttCur.t === "I" ? KICKS.I : KICKS.norm;
  for (const [dx,dy] of table[from+">"+to]){
    if (ttFits(m2, ttCur.x+dx, ttCur.y-dy)){ // SRS y is up-positive
      ttCur.m = m2; ttCur.x += dx; ttCur.y -= dy; ttCur.rot = to; ttDraw(); return;
    }
  }
}
function ttMove(dx){
  if (ttOver) return;
  if (ttFits(ttCur.m, ttCur.x+dx, ttCur.y)){ ttCur.x += dx; ttDraw(); }
}
function ttSoft(fromTimer){
  if (ttOver) return;
  if (ttFits(ttCur.m, ttCur.x, ttCur.y+1)){ ttCur.y++; if (!fromTimer) ttScore++; ttUI(); }
  else ttLock();
  ttDraw();
}
function ttHard(){
  if (ttOver) return;
  let d = 0;
  while (ttFits(ttCur.m, ttCur.x, ttCur.y+1)){ ttCur.y++; d++; }
  ttScore += d*2; ttLock(); ttDraw();
}
function ttHoldPiece(){
  if (ttOver || ttHeld) return;
  ttHeld = true;
  const cur = ttCur.t;
  ttCur = ttHold ? ttNewPiece(ttHold) : ttNewPiece();
  ttHold = cur;
  ttDraw();
}
function ttLock(){
  for (let r = 0; r < ttCur.m.length; r++)
    for (let c = 0; c < ttCur.m[r].length; c++)
      if (ttCur.m[r][c]){
        const gy = ttCur.y+r, gx = ttCur.x+c;
        if (gy < 0){ ttGameOver(); return; }
        ttGrid[gy][gx] = ttCol(ttCur.t);
      }
  // line clears
  const full = [];
  for (let r = 0; r < TTH; r++) if (ttGrid[r].every(Boolean)) full.push(r);
  if (full.length){
    ttFlash = full;
    SND.line(full.length);
    if (full.length === 4) ach("tetris4");
    ttDraw();
    clearInterval(ttTimer);
    setTimeout(() => {
      for (const r of full){ ttGrid.splice(r,1); ttGrid.unshift(Array(TTW).fill(null)); }
      ttScore += [0,100,300,500,800][full.length] * ttLevel;
      ttLines += full.length;
      const nl = 1 + Math.floor(ttLines/10);
      ttLevel = nl;
      ttFlash = [];
      ttUI(); ttRestartTimer();
      ttSpawn();
      ttDraw();
    }, 240);
    return;
  }
  SND.lock();
  ttSpawn();
}
function ttSpawn(){
  ttHeld = false;
  ttCur = ttNewPiece();
  if (!ttFits(ttCur.m, ttCur.x, ttCur.y)) ttGameOver();
}
function ttGameOver(){
  ttOver = true; ttStop();
  SND.over(); stArc("tetris", ttScore);
  $("ttoverscore").textContent = "SCORE " + ttScore + " · LINES " + ttLines;
  $("ttover").classList.add("on");
}
function ttCell(x, y, col, ghost){
  const px = BOARD_X + x*CELL, py = BOARD_Y + y*CELL;
  if (ghost){
    ttCx.strokeStyle = col; ttCx.globalAlpha = .45; ttCx.lineWidth = 2;
    ttCx.strokeRect(px+2, py+2, CELL-4, CELL-4); ttCx.globalAlpha = 1; return;
  }
  ttCx.fillStyle = col; ttCx.shadowColor = col; ttCx.shadowBlur = 7;
  ttCx.fillRect(px+1, py+1, CELL-2, CELL-2);
  ttCx.shadowBlur = 0;
  ttCx.fillStyle = "rgba(255,255,255,.22)";
  ttCx.fillRect(px+1, py+1, CELL-2, 5);
}
function ttMini(t, ox, oy, scale){
  const p = TPIECES[t];
  for (let r = 0; r < p.m.length; r++)
    for (let c = 0; c < p.m[r].length; c++)
      if (p.m[r][c]){
        ttCx.fillStyle = p.c; ttCx.shadowColor = p.c; ttCx.shadowBlur = 5;
        ttCx.fillRect(ox + c*scale, oy + r*scale, scale-2, scale-2);
      }
  ttCx.shadowBlur = 0;
}
function ttDraw(){
  const W = ttCv.width, H = ttCv.height;
  ttCx.clearRect(0,0,W,H);
  // board frame
  ttCx.strokeStyle = "rgba(180,79,255,.6)"; ttCx.lineWidth = 2;
  ttCx.strokeRect(BOARD_X-2, BOARD_Y-2, TTW*CELL+4, TTH*CELL+4);
  ttCx.strokeStyle = "rgba(180,79,255,.1)"; ttCx.lineWidth = 1;
  for (let x = 1; x < TTW; x++){ ttCx.beginPath(); ttCx.moveTo(BOARD_X+x*CELL,BOARD_Y); ttCx.lineTo(BOARD_X+x*CELL,BOARD_Y+TTH*CELL); ttCx.stroke(); }
  for (let y = 1; y < TTH; y++){ ttCx.beginPath(); ttCx.moveTo(BOARD_X,BOARD_Y+y*CELL); ttCx.lineTo(BOARD_X+TTW*CELL,BOARD_Y+y*CELL); ttCx.stroke(); }
  // settled
  for (let r = 0; r < TTH; r++)
    for (let c = 0; c < TTW; c++)
      if (ttGrid[r][c]) ttCell(c, r, ttFlash.includes(r) ? "#ffffff" : ttGrid[r][c]);
  if (!ttOver && ttCur){
    // ghost
    let gy = ttCur.y;
    while (ttFits(ttCur.m, ttCur.x, gy+1)) gy++;
    for (let r = 0; r < ttCur.m.length; r++)
      for (let c = 0; c < ttCur.m[r].length; c++)
        if (ttCur.m[r][c] && gy+r >= 0) ttCell(ttCur.x+c, gy+r, ttCol(ttCur.t), true);
    // current
    for (let r = 0; r < ttCur.m.length; r++)
      for (let c = 0; c < ttCur.m[r].length; c++)
        if (ttCur.m[r][c] && ttCur.y+r >= 0) ttCell(ttCur.x+c, ttCur.y+r, ttCol(ttCur.t));
  }
  // hold box
  ttCx.fillStyle = "#d9b9ff"; ttCx.font = "bold 13px Orbitron"; ttCx.textAlign = "left";
  ttCx.fillText("HOLD", 24, 40);
  ttCx.strokeStyle = "rgba(180,79,255,.5)"; ttCx.strokeRect(20, 50, 90, 70);
  if (ttHold) ttMini(ttHold, 34, 64, 16);
  // next queue
  ttCx.fillText("NEXT", BOARD_X + TTW*CELL + 24, 40);
  ttCx.strokeRect(BOARD_X + TTW*CELL + 20, 50, 90, 210);
  ttQueue.slice(0,3).forEach((t,i) => ttMini(t, BOARD_X + TTW*CELL + 36, 66 + i*66, 15));
}
addEventListener("keydown", e => {
  if (!$("view-tetris").classList.contains("on") || ttOver) return;
  const k = e.key;
  if (["ArrowLeft","ArrowRight","ArrowDown","ArrowUp"," "].includes(k)) e.preventDefault();
  if (k === "ArrowLeft") ttMove(-1);
  if (k === "ArrowRight") ttMove(1);
  if (k === "ArrowDown") ttSoft(false);
  if (k === "ArrowUp") ttRotate();
  if (k === " ") ttHard();
  if (k.toLowerCase() === "c") ttHoldPiece();
});
document.querySelectorAll("[data-tt]").forEach(b => b.addEventListener("click", () => {
  const a = b.dataset.tt;
  if (a === "left") ttMove(-1); if (a === "right") ttMove(1);
  if (a === "rot") ttRotate(); if (a === "down") ttSoft(false); if (a === "drop") ttHard();
}));
