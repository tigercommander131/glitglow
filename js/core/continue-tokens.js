/* ════════════════ CONTINUE TOKENS — one revive per cabinet run ════════════════ */
const GOVER_MAP = { snover:"snake", brover:"breakout", ttover:"tetris", siover:"invaders",
  fwover:"flapwave", astover:"asteroids", chover:"chomp", mcover:"missile" };
const CONTINUES = {
  snake(){
    snDead = false; $("snover").classList.remove("on");
    snBody = [{x:9,y:10},{x:8,y:10},{x:7,y:10}];
    snDir = {x:1,y:0}; snNext = snDir;
    snSpawnFood();
    snTimer = setInterval(snTick, Math.max(60, 140 - Math.floor(snScore/5)*12));
    snDrawLoop();
  },
  breakout(){
    brLives = 1; brLivesUI(); $("brover").classList.remove("on");
    brResetBall();
    brRaf = requestAnimationFrame(brLoop);
  },
  tetris(){
    ttGrid = Array.from({length:TTH}, () => Array(TTW).fill(null));
    ttOver = false; ttFlash = []; $("ttover").classList.remove("on");
    ttSpawn(); ttRestartTimer(); ttDraw();
  },
  invaders(){
    siLives = 1; siDead = 0; siEBullets = []; siBullet = null;
    // if death came from invaders reaching the bottom, pull the wave back up
    // or the maxY check re-kills on the very next frame and eats the token
    siInvY = Math.min(siInvY, 180);
    $("siover").classList.remove("on"); siPaintHud();
    siRun = true; cancelAnimationFrame(siRaf); siLoop();
  },
  flapwave(){
    fwDying = false;
    fwBird = { y: FW_H/2, v: 0, rot: 0, trail: [] };
    fwPipes = fwPipes.filter(p => p.x > 300);
    $("fwover").classList.remove("on");
    fwRun = true; cancelAnimationFrame(fwRaf); fwLoop();
  },
  asteroids(){
    astLives = 1; astDeadT = 0;
    astShip = { x: AST_W/2, y: AST_H/2, a: -Math.PI/2, vx: 0, vy: 0, inv: 180 };
    $("astover").classList.remove("on"); astHud();
    astRun = true; cancelAnimationFrame(astRaf); astLoop();
  },
  chomp(){
    chLives = 1; chHud(); chResetActors();
    $("chover").classList.remove("on");
    chRun = true; cancelAnimationFrame(chRaf); chLoop();
  },
  missile(){
    mcCities.filter(c => !c.alive).slice(0, 3).forEach(c => c.alive = true);
    mcSilos.forEach(s => s.ammo = 10);
    mcNewWave(); mcHud();
    $("mcover").classList.remove("on");
    mcRun = true; cancelAnimationFrame(mcRaf); mcLoop();
  }
};
function useContinue(game){
  if ((PRZ.tokens.continue || 0) <= 0){
    toast("No continue tokens — visit the Prize Counter");
    SND.lose();
    return;
  }
  PRZ.tokens.continue--; przSave();
  // the death that showed this screen already ran stArc — credit what it paid
  _arcCont[game] = { paid: _arcLastTk[game] || 0 };
  SND.power();
  toast("▶ Token inserted · " + PRZ.tokens.continue + " left");
  CONTINUES[game]();
}
for (const [ov, game] of Object.entries(GOVER_MAP)){
  const b = document.createElement("button");
  b.className = "actbtn ghost contbtn";
  b.textContent = "▶ INSERT TOKEN";
  b.onclick = () => useContinue(game);
  $(ov).appendChild(b);
}
