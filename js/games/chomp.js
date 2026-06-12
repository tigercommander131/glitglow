
/* ════════════════ CHOMP — maze chase, 4 ghost personalities ════════════════ */
const chCv = $("chompcv"), chX = chCv.getContext("2d");
const CH_T = 24, CH_COLS = 19, CH_ROWS = 21, CH_W = CH_COLS*CH_T, CH_H = CH_ROWS*CH_T;
const CH_MAZE = [
  "###################",
  "#........#........#",
  "#o##.###.#.###.##o#",
  "#.................#",
  "#.##.#.#####.#.##.#",
  "#....#...#...#....#",
  "####.##.###.##.####",
  "####.#.......#.####",
  "####.#.##=##.#.####",
  "T....#.#   #.#....T",
  "####.#.#####.#.####",
  "####.#.......#.####",
  "####.#.#####.#.####",
  "#........#........#",
  "#.##.###.#.###.##.#",
  "#o.#.....@.....#.o#",
  "##.#.#.#####.#.#.##",
  "#....#...#...#....#",
  "#.######.#.######.#",
  "#.................#",
  "###################"
];
let chGrid, chDots, chDotsEaten, chPac, chGhosts, chScore, chLevel, chLives, chRun = false, chRaf = 0;
let chFrame = 0, chModeIdx, chModeT, chFrightT, chCombo, chDying = 0, chFlashT = 0, chFruit = null, chFreezeT = 0;
let chHigh = +localStorage.getItem("gg_chomphigh") || 0;
const CH_PHASES = [420, 1200, 420, 1200, 300, Infinity]; // scatter/chase alternating, frames
const CH_CORNERS = [[17,1],[1,1],[17,19],[1,19]];
const CH_GCOL = ["#ff2d78","#ff9bd2","#3ee8ff","#ff9b2d"];
function chWall(c, r, ghost){
  if (r < 0 || r >= CH_ROWS) return true;
  if (c < 0 || c >= CH_COLS) return r !== 9; // tunnel row wraps
  const ch = CH_MAZE[r][c];
  if (ch === "#") return true;
  if (ch === "=") return !ghost; // ghost door
  if (ch === " " && r >= 8 && r <= 10 && c >= 7 && c <= 11) return !ghost; // house interior
  return false;
}
/* static layers: walls + pellets are pre-rendered offscreen so the frame loop
   blits two images instead of stroking ~200 glowing tiles every frame */
let chWallNorm = null, chWallFlash = null, chDotCv = null, chDotCx = null, chPower = new Set();
function chBuildWalls(flash){
  const cv = document.createElement("canvas"); cv.width = CH_W; cv.height = CH_H;
  const c2 = cv.getContext("2d");
  c2.strokeStyle = flash ? "#ffffff" : "rgba(180,79,255,.85)";
  c2.lineWidth = 2; c2.shadowColor = "#b44fff"; c2.shadowBlur = flash ? 14 : 6;
  for (let r = 0; r < CH_ROWS; r++)
    for (let c = 0; c < CH_COLS; c++){
      if (CH_MAZE[r][c] !== "#") continue;
      rounded(c2, c*CH_T + 3, r*CH_T + 3, CH_T - 6, CH_T - 6, 5);
      c2.stroke();
    }
  c2.shadowBlur = 0;
  c2.strokeStyle = "#ff9bd2"; c2.lineWidth = 3;
  c2.beginPath(); c2.moveTo(9*CH_T + 3, 8*CH_T + CH_T/2); c2.lineTo(10*CH_T - 3, 8*CH_T + CH_T/2); c2.stroke();
  return cv;
}
function chParse(){
  chDots = new Set(); chPower = new Set();
  if (!chWallNorm){ chWallNorm = chBuildWalls(false); chWallFlash = chBuildWalls(true); }
  if (!chDotCv){ chDotCv = document.createElement("canvas"); chDotCv.width = CH_W; chDotCv.height = CH_H; chDotCx = chDotCv.getContext("2d"); }
  chDotCx.clearRect(0, 0, CH_W, CH_H);
  chDotCx.fillStyle = "#e8d5ff";
  for (let r = 0; r < CH_ROWS; r++)
    for (let c = 0; c < CH_COLS; c++){
      const ch = CH_MAZE[r][c];
      if (ch !== "." && ch !== "o") continue;
      const key = r*CH_COLS + c;
      chDots.add(key);
      if (ch === "o"){ chPower.add(key); continue; } // power pellets stay dynamic for the pulse
      chDotCx.beginPath(); chDotCx.arc(c*CH_T + CH_T/2, r*CH_T + CH_T/2, 3, 0, 7); chDotCx.fill();
    }
}
function chActor(c, r){ return { x: c*CH_T + CH_T/2, y: r*CH_T + CH_T/2, dir: {x:0,y:0}, want: {x:0,y:0} }; }
function chResetActors(){
  chPac = chActor(9, 15); chPac.dir = {x:-1,y:0}; chPac.want = {x:-1,y:0}; chPac.mouth = 0;
  chGhosts = [];
  for (let i = 0; i < 4; i++){
    const g = chActor(8 + (i%3), 9);
    g.id = i; g.col = CH_GCOL[i];
    g.state = i === 0 ? "play" : "house"; // blinky starts outside
    g.bob = Math.random()*7;
    g.release = [0, 8, 25, 50][i]; // dots eaten before leaving home
    if (i === 0){ const o = chActor(9, 7); g.x = o.x; g.y = o.y; g.dir = {x:-1,y:0}; }
    chGhosts.push(g);
  }
  chModeIdx = 0; chModeT = 0; chFrightT = 0; chCombo = 0; chFreezeT = 60;
}
function chStart(){
  chParse();
  chScore = 0; chLevel = 1; chLives = 3; chDotsEaten = 0; chDying = 0; chFlashT = 0; chFruit = null; chFrame = 0;
  chResetActors();
  $("chover").classList.remove("on");
  $("chhigh").textContent = chHigh;
  chHud();
  chRun = true; cancelAnimationFrame(chRaf); chLoop();
}
function chStop(){ chRun = false; cancelAnimationFrame(chRaf); chRaf = 0; }
function chHud(){
  $("chscore").textContent = chScore; $("chlevel").textContent = chLevel;
  $("chlives").textContent = Array(Math.max(0, chLives)).fill("●").join(" ") || "—";
  if (chScore > chHigh){ chHigh = chScore; localStorage.setItem("gg_chomphigh", chHigh); $("chhigh").textContent = chHigh; }
}
function chTile(a){ return { c: Math.round((a.x - CH_T/2)/CH_T), r: Math.round((a.y - CH_T/2)/CH_T) }; }
function chAtCenter(a, sp){
  const t = chTile(a), cx = t.c*CH_T + CH_T/2, cy = t.r*CH_T + CH_T/2;
  return Math.abs(a.x - cx) < sp*0.55 && Math.abs(a.y - cy) < sp*0.55;
}
function chSnap(a){ const t = chTile(a); a.x = t.c*CH_T + CH_T/2; a.y = t.r*CH_T + CH_T/2; return t; }
function chWrapX(a){
  if (a.x < -CH_T/2) a.x = CH_W + CH_T/2 - 1;
  else if (a.x > CH_W + CH_T/2) a.x = -CH_T/2 + 1;
}
function chPacSpeed(){ return 2.4; }
function chGhostSpeed(g){
  if (g.state === "eyes") return 4;
  const t = chTile(g);
  if (t.r === 9 && (t.c < 3 || t.c > 15)) return 1.2; // tunnel crawl
  if (chFrightT > 0 && g.state === "play") return 1.5;
  return Math.min(2.4, 2 + (chLevel-1)*0.1);
}
function chGhostTarget(g){
  if (g.state === "eyes") return [9, 7];
  const scatter = CH_PHASES.length && chModeIdx % 2 === 0;
  const pt = chTile(chPac);
  if (scatter && chFrightT <= 0) return CH_CORNERS[g.id];
  if (g.id === 0) return [pt.c, pt.r];                                    // chase head-on
  if (g.id === 1) return [pt.c + chPac.dir.x*4, pt.r + chPac.dir.y*4];    // ambush 4 ahead
  if (g.id === 2){                                                        // flank via blinky vector
    const b = chTile(chGhosts[0]);
    const px = pt.c + chPac.dir.x*2, py = pt.r + chPac.dir.y*2;
    return [px + (px - b.c), py + (py - b.r)];
  }
  const d = Math.hypot(pt.c - chTile(g).c, pt.r - chTile(g).r);           // shy: bail when close
  return d > 8 ? [pt.c, pt.r] : CH_CORNERS[3];
}
function chGhostDecide(g, t){
  const opts = [];
  for (const d of [{x:0,y:-1},{x:-1,y:0},{x:0,y:1},{x:1,y:0}]){
    if (d.x === -g.dir.x && d.y === -g.dir.y && (g.dir.x || g.dir.y)) continue; // no reversing
    // door + house interior only open to eyes heading home
    if (!chWall(t.c + d.x, t.r + d.y, g.state === "eyes")) opts.push(d);
  }
  if (!opts.length){ g.dir = { x: -g.dir.x, y: -g.dir.y }; return; }
  if (chFrightT > 0 && g.state === "play"){ g.dir = opts[(Math.random()*opts.length)|0]; return; }
  const [tc, tr] = chGhostTarget(g);
  let best = opts[0], bd = 1e9;
  for (const d of opts){
    const dist = (t.c + d.x - tc)**2 + (t.r + d.y - tr)**2;
    if (dist < bd){ bd = dist; best = d; }
  }
  g.dir = best;
}
function chMoveGhost(g){
  const sp = chGhostSpeed(g);
  if (g.state === "house"){
    g.bob += 0.08;
    g.y = 9*CH_T + CH_T/2 + Math.sin(g.bob)*4;
    if (chDotsEaten >= g.release) g.state = "exit";
    return;
  }
  if (g.state === "exit"){
    const doorX = 9*CH_T + CH_T/2;
    if (Math.abs(g.x - doorX) > sp) g.x += Math.sign(doorX - g.x)*sp;
    else { g.x = doorX;
      const outY = 7*CH_T + CH_T/2;
      if (g.y > outY) g.y -= sp;
      else { g.y = outY; g.state = "play"; g.dir = { x: Math.random() < .5 ? -1 : 1, y: 0 }; }
    }
    return;
  }
  if (chAtCenter(g, sp)){
    const t = chSnap(g);
    if (g.state === "eyes" && t.c === 9 && t.r === 7){
      g.x = 9*CH_T + CH_T/2; g.y = 9*CH_T + CH_T/2;
      g.state = "house"; g.release = chDotsEaten + 5;
      return;
    }
    chGhostDecide(g, t);
  }
  g.x += g.dir.x*sp; g.y += g.dir.y*sp;
  chWrapX(g);
}
function chEatPac(){
  chDying = 110; chFreezeT = 0;
  SND.boom();
}
function chLevelClear(){
  ach("chompClear");
  SND.power();
  chFlashT = 100;
}
function chLoop(){
  if (!chRun) return;
  if (!frameGate("ch")){ chRaf = requestAnimationFrame(chLoop); return; }
  chFrame++;
  if (chFlashT > 0){ // level-clear maze flash
    chFlashT--;
    if (chFlashT === 0){
      chLevel++; chHud();
      chParse(); chDotsEaten = 0; chFruit = null;
      chResetActors();
    }
    chDrawF();
    chRaf = requestAnimationFrame(chLoop);
    return;
  }
  if (chDying > 0){
    chDying--;
    if (chDying === 0){
      chLives--; chHud();
      if (chLives <= 0){
        chRun = false;
        SND.over(); stArc("chomp", chScore);
        $("choverscore").textContent = "SCORE " + chScore + (chScore >= chHigh && chScore > 0 ? " · NEW BEST" : "");
        $("chover").classList.add("on");
        return;
      }
      chResetActors();
    }
    chDrawF();
    chRaf = requestAnimationFrame(chLoop);
    return;
  }
  if (chFreezeT > 0){ chFreezeT--; chDrawF(); chRaf = requestAnimationFrame(chLoop); return; }
  // mode clock (paused while frightened)
  if (chFrightT > 0) chFrightT--;
  else {
    chModeT++;
    if (chModeT >= CH_PHASES[Math.min(chModeIdx, CH_PHASES.length-1)]){
      chModeT = 0; chModeIdx++;
      for (const g of chGhosts) if (g.state === "play") g.dir = { x: -g.dir.x, y: -g.dir.y };
    }
  }
  // pac
  const psp = chPacSpeed();
  chPac.mouth += 0.16;
  if (chAtCenter(chPac, psp)){
    const t = chSnap(chPac);
    if (!chWall(t.c + chPac.want.x, t.r + chPac.want.y, false)) chPac.dir = { ...chPac.want };
    if (chWall(t.c + chPac.dir.x, t.r + chPac.dir.y, false)) chPac.dir = { x: 0, y: 0 };
    const key = t.r*CH_COLS + t.c;
    if (chDots.has(key)){
      chDots.delete(key); chDotsEaten++;
      chDotCx.clearRect(t.c*CH_T, t.r*CH_T, CH_T, CH_T);
      const power = CH_MAZE[t.r][t.c] === "o";
      chScore += power ? 50 : 10;
      power ? SND.power() : SND.eat();
      if (power){
        chFrightT = Math.max(120, 420 - (chLevel-1)*40);
        chCombo = 0;
        for (const g of chGhosts) if (g.state === "play") g.dir = { x: -g.dir.x, y: -g.dir.y };
      }
      if (chDotsEaten === 70 || chDotsEaten === 170){
        chFruit = { c: 9, r: 11, t: 540, val: Math.min(500, 100*chLevel) };
      }
      chHud();
      if (!chDots.size){ chLevelClear(); chDrawF(); chRaf = requestAnimationFrame(chLoop); return; }
    }
    if (chFruit && t.c === chFruit.c && t.r === chFruit.r){
      chScore += chFruit.val; SND.gem(); chHud(); chFruit = null;
    }
  } else if (chPac.dir.x && chPac.want.y === 0 && chPac.want.x === -chPac.dir.x) chPac.dir = { ...chPac.want };
  else if (chPac.dir.y && chPac.want.x === 0 && chPac.want.y === -chPac.dir.y) chPac.dir = { ...chPac.want };
  chPac.x += chPac.dir.x*psp; chPac.y += chPac.dir.y*psp;
  chWrapX(chPac);
  if (chFruit && --chFruit.t <= 0) chFruit = null;
  // ghosts
  for (const g of chGhosts){
    chMoveGhost(g);
    if (g.state !== "play" && g.state !== "eyes") continue;
    if (Math.hypot(g.x - chPac.x, g.y - chPac.y) < 12){
      if (g.state === "eyes") continue;
      if (chFrightT > 0){
        const pts = 200 * Math.pow(2, chCombo);
        chCombo++; chScore += pts; chHud();
        SND.ghosteat();
        g.state = "eyes";
      } else { chEatPac(); break; }
    }
  }
  chDrawF();
  chRaf = requestAnimationFrame(chLoop);
}
function chDrawF(){
  chX.clearRect(0, 0, CH_W, CH_H);
  chX.fillStyle = "#08000f"; chX.fillRect(0, 0, CH_W, CH_H);
  // static layers
  const flashOn = chFlashT > 0 && (chFlashT>>3) % 2 === 0;
  chX.drawImage(flashOn ? chWallFlash : chWallNorm, 0, 0);
  chX.drawImage(chDotCv, 0, 0);
  // power pellets pulse (only 4 — cheap to keep dynamic)
  for (const key of chPower){
    if (!chDots.has(key)) continue;
    const r = (key/CH_COLS)|0, c = key%CH_COLS;
    const x = c*CH_T + CH_T/2, y = r*CH_T + CH_T/2;
    const pul = 4 + Math.sin(chFrame*0.15)*1.6;
    chX.fillStyle = "#ff2d78"; chX.shadowColor = "#ff2d78"; chX.shadowBlur = LOWFX ? 0 : 12;
    chX.beginPath(); chX.arc(x, y, pul, 0, 7); chX.fill(); chX.shadowBlur = 0;
  }
  // fruit
  if (chFruit){
    const x = chFruit.c*CH_T + CH_T/2, y = chFruit.r*CH_T + CH_T/2;
    chX.save(); chX.translate(x, y); chX.rotate(Math.PI/4);
    chX.fillStyle = "#7bff8e"; chX.shadowColor = "#7bff8e"; chX.shadowBlur = 14;
    chX.fillRect(-7, -7, 14, 14);
    chX.restore(); chX.shadowBlur = 0;
  }
  // pac
  if (chDying === 0 || (chDying>>2) % 2 === 0){
    const ang = Math.atan2(chPac.dir.y, chPac.dir.x) || (chPac.dir.x === 0 && chPac.dir.y === 0 ? Math.PI : 0);
    const m = chDying > 0 ? Math.max(0.05, chDying/110) * Math.PI*0.9 : (Math.abs(Math.sin(chPac.mouth)) * 0.55 + 0.05);
    const pacCol = typeof przPacColor === "function" ? przPacColor() : "#ffd23e";
    chX.save(); chX.translate(chPac.x, chPac.y); chX.rotate(chPac.dir.x || chPac.dir.y ? ang : Math.PI);
    chX.fillStyle = pacCol; chX.shadowColor = pacCol; chX.shadowBlur = LOWFX ? 0 : 14;
    chX.beginPath(); chX.moveTo(0, 0); chX.arc(0, 0, 10, m, Math.PI*2 - m); chX.closePath(); chX.fill();
    chX.restore(); chX.shadowBlur = 0;
  }
  // ghosts
  for (const g of chGhosts){
    const fright = chFrightT > 0 && g.state === "play";
    const flash = fright && chFrightT < 120 && (chFrightT>>3) % 2 === 0;
    chX.save(); chX.translate(g.x, g.y);
    if (g.state !== "eyes"){
      const col = fright ? (flash ? "#f3e9d4" : "#3e6bff") : g.col;
      chX.fillStyle = col; chX.shadowColor = col; chX.shadowBlur = LOWFX ? 0 : 12;
      chX.beginPath();
      chX.arc(0, -1, 9.5, Math.PI, 0);
      const w = Math.sin(chFrame*0.3 + g.id)*1.6;
      chX.lineTo(9.5, 8);
      chX.lineTo(6.3, 5.5 + w); chX.lineTo(3.1, 8); chX.lineTo(0, 5.5 + w);
      chX.lineTo(-3.1, 8); chX.lineTo(-6.3, 5.5 + w); chX.lineTo(-9.5, 8);
      chX.closePath(); chX.fill();
      chX.shadowBlur = 0;
    }
    // eyes
    const ex = g.dir.x*2, ey = g.dir.y*2;
    if (chFrightT > 0 && g.state === "play"){
      chX.fillStyle = "#f3e9d4";
      chX.fillRect(-5, -4, 3, 3); chX.fillRect(2, -4, 3, 3);
      chX.strokeStyle = "#f3e9d4"; chX.lineWidth = 1.5;
      chX.beginPath(); chX.moveTo(-6, 4); chX.lineTo(-3, 2); chX.lineTo(0, 4); chX.lineTo(3, 2); chX.lineTo(6, 4); chX.stroke();
    } else {
      chX.fillStyle = "#fff";
      chX.beginPath(); chX.ellipse(-3.6 + ex*.6, -2 + ey*.6, 3, 3.6, 0, 0, 7); chX.fill();
      chX.beginPath(); chX.ellipse(3.6 + ex*.6, -2 + ey*.6, 3, 3.6, 0, 0, 7); chX.fill();
      chX.fillStyle = "#1a1aff";
      chX.beginPath(); chX.arc(-3.6 + ex, -2 + ey, 1.6, 0, 7); chX.fill();
      chX.beginPath(); chX.arc(3.6 + ex, -2 + ey, 1.6, 0, 7); chX.fill();
    }
    chX.restore();
  }
  // ready text
  if (chFreezeT > 0){
    chX.fillStyle = "#ffd23e"; chX.font = "700 16px Orbitron"; chX.textAlign = "center";
    chX.shadowColor = "#ffd23e"; chX.shadowBlur = 12;
    chX.fillText("READY!", CH_W/2, 11*CH_T + 16);
    chX.shadowBlur = 0;
  }
}
function chTurn(x, y){ if (chRun) chPac.want = { x, y }; }
addEventListener("keydown", e => {
  if (!$("view-chomp").classList.contains("on")) return;
  const k = e.key.toLowerCase();
  if (["arrowup","arrowdown","arrowleft","arrowright"," "].includes(e.key.toLowerCase()) || ["w","a","s","d"].includes(k)) e.preventDefault();
  if (k === "arrowup" || k === "w") chTurn(0, -1);
  if (k === "arrowdown" || k === "s") chTurn(0, 1);
  if (k === "arrowleft" || k === "a") chTurn(-1, 0);
  if (k === "arrowright" || k === "d") chTurn(1, 0);
});
document.querySelectorAll("[data-ch]").forEach(b => b.addEventListener("click", () => {
  const [x, y] = b.dataset.ch.split(",").map(Number); chTurn(x, y);
}));
let chSwX = 0, chSwY = 0;
chCv.addEventListener("touchstart", e => { chSwX = e.touches[0].clientX; chSwY = e.touches[0].clientY; }, { passive: true });
chCv.addEventListener("touchend", e => {
  const dx = e.changedTouches[0].clientX - chSwX, dy = e.changedTouches[0].clientY - chSwY;
  if (Math.abs(dx) > Math.abs(dy)) chTurn(Math.sign(dx), 0); else chTurn(0, Math.sign(dy));
});

registerGame("chomp", { init: chStart, stop: chStop });
