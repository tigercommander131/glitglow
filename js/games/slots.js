
/* ════════════════ SLOTS ════════════════ */
const SL_SYMS = [
  { ch:"7", c:"#ff5a5a", glow:"rgba(255,90,90,.7)", w:2,  pay:250 },
  { ch:"♛", c:"#e8cf8a", glow:"rgba(232,207,138,.7)", w:3, pay:100 },
  { ch:"♦", c:"#7be0a3", glow:"rgba(123,224,163,.7)", w:4, pay:50 },
  { ch:"★", c:"#c9a84c", glow:"rgba(201,168,76,.7)", w:5,  pay:26 },
  { ch:"▬", c:"#d8cba0", glow:"rgba(216,203,160,.5)", w:6, pay:16 },
  { ch:"♠", c:"#9b8fa3", glow:"rgba(155,143,163,.4)", w:12, pay:7 }
];
const SL_BAG = []; SL_SYMS.forEach((s,i)=>{ for(let k=0;k<s.w;k++) SL_BAG.push(i); });
const SL_STRIP_LEN = 32;
let slStrips = [], slPos = [0,0,0], slVel = [0,0,0], slTarget = [0,0,0], slStopped = [false,false,false];
let slPhase = "idle", slRaf = 0, slBet = 0, slStopT = [0,0,0], slT = 0, slFlash = 0, slWinSyms = null;
const slcv = $("slotcv"), slx = slcv.getContext("2d");
const SL_CELL = 110, SL_RX = [45, 185, 325], SL_RW = SL_CELL, SL_WINY = 165;

function slBuildStrips(){
  slStrips = [];
  for (let r=0;r<3;r++){
    const st = [];
    for (let i=0;i<SL_STRIP_LEN;i++) st.push(SL_BAG[(Math.random()*SL_BAG.length)|0]);
    slStrips.push(st);
  }
}
function slInit(){
  if (!slStrips.length) slBuildStrips();
  slPhase = "idle"; slDraw();
}
function slStop(){ cancelAnimationFrame(slRaf); slRaf = 0; if (slPhase==="spin") slPhase="idle"; }
function slSymAt(reel, idx){ return slStrips[reel][((idx % SL_STRIP_LEN)+SL_STRIP_LEN)%SL_STRIP_LEN]; }
function slDraw(){
  const w = slcv.width, h = slcv.height;
  slx.clearRect(0,0,w,h);
  // cabinet bg
  const bg = slx.createLinearGradient(0,0,0,h);
  bg.addColorStop(0,"#170a02"); bg.addColorStop(1,"#0a0502");
  slx.fillStyle = bg; slx.fillRect(0,0,w,h);
  // reels
  for (let r=0;r<3;r++){
    const x = SL_RX[r];
    slx.save();
    slx.beginPath(); slx.roundRect(x, 40, SL_RW, 250, 10); slx.clip();
    const rg = slx.createLinearGradient(0,40,0,290);
    rg.addColorStop(0,"#05030a"); rg.addColorStop(.5,"#120a04"); rg.addColorStop(1,"#05030a");
    slx.fillStyle = rg; slx.fillRect(x,40,SL_RW,250);
    // symbols: pos is fractional strip index at window centre
    const base = Math.floor(slPos[r]) - 2;
    for (let i=0;i<6;i++){
      const idx = base + i;
      const sym = SL_SYMS[slSymAt(r, idx)];
      const y = SL_WINY + (idx - slPos[r]) * 92;
      if (y < 0 || y > 330) continue;
      const isWin = slPhase==="won" && slWinSyms && Math.round(slPos[r])===idx && slWinSyms.includes(r);
      slx.font = "700 52px 'JetBrains Mono', monospace";
      slx.textAlign = "center"; slx.textBaseline = "middle";
      if (isWin && (slFlash>>3)%2===0){
        slx.shadowColor = sym.glow; slx.shadowBlur = 26;
        slx.fillStyle = "#fff";
      } else {
        slx.shadowColor = sym.glow; slx.shadowBlur = 10;
        slx.fillStyle = sym.c;
      }
      slx.fillText(sym.ch, x + SL_RW/2, y);
      slx.shadowBlur = 0;
    }
    // window shading
    const sh = slx.createLinearGradient(0,40,0,290);
    sh.addColorStop(0,"rgba(0,0,0,.85)"); sh.addColorStop(.25,"rgba(0,0,0,0)");
    sh.addColorStop(.75,"rgba(0,0,0,0)"); sh.addColorStop(1,"rgba(0,0,0,.85)");
    slx.fillStyle = sh; slx.fillRect(x,40,SL_RW,250);
    slx.restore();
    slx.strokeStyle = "rgba(201,168,76,.45)"; slx.lineWidth = 1.5;
    slx.beginPath(); slx.roundRect(x, 40, SL_RW, 250, 10); slx.stroke();
  }
  // win line
  const lit = slPhase==="won" && (slFlash>>3)%2===0;
  slx.strokeStyle = lit ? "#ffe9a8" : "rgba(201,168,76,.55)";
  slx.lineWidth = lit ? 3 : 1.5;
  slx.shadowColor = lit ? "rgba(255,233,168,.9)" : "transparent"; slx.shadowBlur = lit ? 14 : 0;
  slx.beginPath(); slx.moveTo(20, SL_WINY); slx.lineTo(38, SL_WINY);
  slx.moveTo(w-38, SL_WINY); slx.lineTo(w-20, SL_WINY); slx.stroke();
  if (lit){ slx.beginPath(); slx.moveTo(38,SL_WINY); slx.lineTo(w-38,SL_WINY); slx.globalAlpha=.5; slx.stroke(); slx.globalAlpha=1; }
  slx.shadowBlur = 0;
}
function slSpin(){
  if (slPhase === "spin") return;
  slBet = takeBet("slbet"); if (!slBet) return;
  $("slmsg").textContent = ""; $("slmsg").className = "msg"; $("slotwinline").textContent = "";
  $("slspin").disabled = true;
  slWinSyms = null; slPhase = "spin"; slT = 0;
  // pick outcomes
  const out = [0,0,0].map(()=>SL_BAG[(Math.random()*SL_BAG.length)|0]);
  // near-miss drama: if first two reels match a top-3 symbol, third reel stops late
  const nearMiss = out[0]===out[1] && out[0] <= 2;
  slStopT = [70 + (Math.random()*10|0), 110 + (Math.random()*10|0), (nearMiss?185:150) + (Math.random()*12|0)];
  for (let r=0;r<3;r++){
    slVel[r] = 0.9 + Math.random()*0.15;
    slTarget[r] = -1; // planted when deceleration begins
    slStopped[r] = false;
  }
  slOut = out;
  cancelAnimationFrame(slRaf);
  slLoop();
}
let slOut = [0,0,0];
function slLoop(){
  if (!frameGate("sl")){ slRaf = requestAnimationFrame(slLoop); return; }
  slT++;
  let allStopped = true;
  for (let r=0;r<3;r++){
    if (slT < slStopT[r]){
      allStopped = false;
      // accelerate then cruise
      slPos[r] += slVel[r] * Math.min(1, slT/14);
    } else {
      if (slTarget[r] < 0){
        const land = Math.ceil(slPos[r]) + 3;
        slStrips[r][((land % SL_STRIP_LEN)+SL_STRIP_LEN)%SL_STRIP_LEN] = slOut[r];
        slTarget[r] = land;
      }
      // ease into target
      const d = slTarget[r] - slPos[r];
      if (Math.abs(d) > 0.004){
        allStopped = false;
        slPos[r] += d * 0.16;
        if (Math.abs(d) < 0.05) slPos[r] = slTarget[r];
      } else slPos[r] = slTarget[r];
      if (slPos[r] === slTarget[r] && !slStopped[r]){ slStopped[r] = true; SND.reelstop(); }
    }
  }
  slDraw();
  if (!allStopped){ slRaf = requestAnimationFrame(slLoop); return; }
  slResolve();
}
function slResolve(){
  const a = slOut[0], b = slOut[1], c = slOut[2];
  let mult = 0, label = "";
  if (a===b && b===c){ mult = SL_SYMS[a].pay; label = SL_SYMS[a].ch+" "+SL_SYMS[a].ch+" "+SL_SYMS[a].ch; slWinSyms=[0,1,2]; }
  else if (a<=2 && b<=2 && c<=2){ mult = 4; label = "Royal mix"; slWinSyms=[0,1,2]; }
  else {
    const sevens = [a,b,c].map((v,i)=>v===0?i:-1).filter(i=>i>=0);
    if (sevens.length===2){ mult = 6; label = "Pair of 7s"; slWinSyms = sevens; }
  }
  if (a === 0 && b === 0 && c === 0){ ach("slots777"); if (typeof jkWin === "function") jkWin("7·7·7"); }
  stRound("slots", slBet, mult > 0 ? slBet * mult : 0);
  if (mult > 0){
    const pay = slBet * mult;
    addChips(pay);
    slPhase = "won"; slFlash = 0;
    $("slmsg").textContent = "WIN +"+fmt(pay); $("slmsg").className = "msg win";
    $("slotwinline").textContent = label+" · "+mult+"×";
    winFx(pay, slBet);
    const flashLoop = ()=>{ slFlash++; slDraw(); if (slFlash<70 && slPhase==="won") slRaf=requestAnimationFrame(flashLoop); };
    flashLoop();
  } else {
    slPhase = "idle";
    $("slmsg").textContent = "No luck"; $("slmsg").className = "msg lose";
    slDraw();
  }
  $("slspin").disabled = false;
}


registerGame("slots", { init: slInit, stop: slStop });
