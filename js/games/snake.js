
/* ════════════════ SNAKE ════════════════ */
const snCv = $("snakecv"), snCx = snCv.getContext("2d"), SN = 24, SNC = 20; // 20x20 grid, 24px cells
let snBody, snDir, snNext, snFood, snScore, snTimer = 0, snDead, snPulse = 0;
let snHigh = +localStorage.getItem("gg_snhigh") || 0;
$("snhigh").textContent = snHigh;
function snStop(){ clearInterval(snTimer); snTimer = 0; }
function snakeStart(){
  snStop();
  snBody = [{x:9,y:10},{x:8,y:10},{x:7,y:10}];
  snDir = {x:1,y:0}; snNext = snDir; snScore = 0; snDead = false;
  $("snscore").textContent = 0; $("snspeed").textContent = 1;
  $("snover").classList.remove("on");
  snSpawnFood();
  snTimer = setInterval(snTick, 140);
  snDrawLoop();
}
function snSpawnFood(){
  do { snFood = { x:(Math.random()*SNC)|0, y:(Math.random()*SNC)|0 }; }
  while (snBody.some(b => b.x===snFood.x && b.y===snFood.y));
}
function snTick(){
  snDir = snNext;
  const h = { x: snBody[0].x + snDir.x, y: snBody[0].y + snDir.y };
  if (h.x<0||h.y<0||h.x>=SNC||h.y>=SNC||snBody.some(b=>b.x===h.x&&b.y===h.y)){ snDie(); return; }
  snBody.unshift(h);
  if (h.x===snFood.x && h.y===snFood.y){
    snScore++; $("snscore").textContent = snScore;
    SND.blip(620 + Math.min(600, snScore*14), .12);
    const lvl = 1 + Math.floor(snScore/5);
    $("snspeed").textContent = lvl;
    clearInterval(snTimer);
    snTimer = setInterval(snTick, Math.max(60, 140 - (lvl-1)*12));
    snSpawnFood();
  } else snBody.pop();
}
function snDie(){
  snDead = true; snStop();
  SND.over(); stArc("snake", snScore);
  if (snScore > snHigh){ snHigh = snScore; localStorage.setItem("gg_snhigh", snHigh); $("snhigh").textContent = snHigh; }
  $("snoverscore").textContent = `SCORE ${snScore} · BEST ${snHigh}`;
  $("snover").classList.add("on");
}
function snDrawLoop(){
  if (!document.getElementById("view-snake").classList.contains("on")) return;
  snPulse += 0.12;
  const W = snCv.width;
  snCx.clearRect(0,0,W,W);
  // perspective floor hint + grid
  snCx.strokeStyle = "rgba(180,79,255,.12)"; snCx.lineWidth = 1;
  for (let i = 0; i <= SNC; i++){
    snCx.beginPath(); snCx.moveTo(i*SN,0); snCx.lineTo(i*SN,W); snCx.stroke();
    snCx.beginPath(); snCx.moveTo(0,i*SN); snCx.lineTo(W,i*SN); snCx.stroke();
  }
  // food pulsing glow
  const fr = 7 + Math.sin(snPulse)*2;
  const fx2 = snFood.x*SN+SN/2, fy2 = snFood.y*SN+SN/2;
  snCx.beginPath(); snCx.arc(fx2,fy2,fr,0,7);
  snCx.fillStyle = "#ff2d78"; snCx.shadowColor = "#ff2d78"; snCx.shadowBlur = 18 + Math.sin(snPulse)*6;
  snCx.fill(); snCx.shadowBlur = 0;
  // snake gradient head→tail, rounded
  const n = snBody.length;
  for (let i = n-1; i >= 0; i--){
    const b = snBody[i], t = i/Math.max(1,n-1);
    const r = Math.round(180 - 60*t), g = Math.round(79 + 100*(1-t)), bl = 255;
    snCx.fillStyle = i === 0 ? "#3ee8ff" : `rgb(${r},${g},${bl})`;
    snCx.shadowColor = i === 0 ? "#3ee8ff" : "#b44fff";
    snCx.shadowBlur = LOWFX ? (i === 0 ? 10 : 0) : (i === 0 ? 16 : 6);
    const pad = 2 + t*2;
    rounded(snCx, b.x*SN+pad, b.y*SN+pad, SN-pad*2, SN-pad*2, 7-t*3); snCx.fill();
  }
  snCx.shadowBlur = 0;
  requestAnimationFrame(snDrawLoop);
}
function rounded(c,x,y,w,h,r){ c.beginPath(); c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r); c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath(); }
function snTurn(x,y){ if (snTimer && !(x === -snDir.x && y === -snDir.y)) snNext = {x,y}; }
addEventListener("keydown", e => {
  if (!$("view-snake").classList.contains("on")) return;
  const k = e.key.toLowerCase();
  if (["arrowup","arrowdown","arrowleft","arrowright"," "].includes(e.key.toLowerCase()) || ["w","a","s","d"].includes(k)) e.preventDefault();
  if (k==="arrowup"||k==="w") snTurn(0,-1);
  if (k==="arrowdown"||k==="s") snTurn(0,1);
  if (k==="arrowleft"||k==="a") snTurn(-1,0);
  if (k==="arrowright"||k==="d") snTurn(1,0);
});
document.querySelectorAll("[data-sn]").forEach(b => b.addEventListener("click", () => { const [x,y] = b.dataset.sn.split(",").map(Number); snTurn(x,y); }));
// swipe
let swX=0, swY=0;
snCv.addEventListener("touchstart", e => { swX = e.touches[0].clientX; swY = e.touches[0].clientY; }, {passive:true});
snCv.addEventListener("touchend", e => {
  const dx = e.changedTouches[0].clientX - swX, dy = e.changedTouches[0].clientY - swY;
  if (Math.abs(dx) > Math.abs(dy)) snTurn(Math.sign(dx), 0); else snTurn(0, Math.sign(dy));
});

