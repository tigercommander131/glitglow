/* ════════════════ COIN FLIP ════════════════ */
const CF_LADDER = [2, 4, 8, 15, 28, 50, 85, 128];
let cfLive = false, cfBet = 0, cfStepN = 0, cfBusy = false, cfRot = 0;
function cfInit(){
  const l = $("cfladder");
  l.innerHTML = CF_LADDER.map((m,i)=>`<div class="lrung" id="cfr${i}">${m}×</div>`).join("");
  cfPaint();
}
function cfPaint(){
  CF_LADDER.forEach((_,i)=>{ const r=$("cfr"+i); if(r) r.classList.toggle("lit", cfLive && i < cfStepN); });
}
function cfButtons(on){ $("cfheads").disabled = !on; $("cftails").disabled = !on; }
function cfStart(){
  if (cfLive) return;
  cfBet = takeBet("cfbet"); if (!cfBet) return;
  cfLive = true; cfStepN = 0;
  $("cfstart").disabled = true; $("cfcash").disabled = true;
  $("cfmsg").textContent = "Call it — heads or tails"; $("cfmsg").className = "msg";
  cfPaint(); cfButtons(true);
}
function cfFlip(pick){
  if (!cfLive || cfBusy) return;
  cfBusy = true; cfButtons(false); $("cfcash").disabled = true;
  document.querySelectorAll(".cfpick .actbtn").forEach((b,i)=>b.classList.toggle("picked", i===pick));
  const result = Math.random() < 0.5 ? 0 : 1; // 0 heads, 1 tails
  SND.flipw();
  // spin: several full turns, land flat on result face
  const turns = 4 + (Math.random()*2|0);
  cfRot = Math.ceil(cfRot/360)*360 + turns*360 + (result===1 ? 180 : 0);
  $("cfcoin").style.transform = `rotateY(${cfRot}deg) translateZ(0)`;
  setTimeout(()=>{
    document.querySelectorAll(".cfpick .actbtn").forEach(b=>b.classList.remove("picked"));
    if (pick === result){
      cfStepN++;
      cfPaint();
      if (cfStepN >= CF_LADDER.length){
        const pay = cfBet * CF_LADDER[CF_LADDER.length-1];
        ach("cfMax");
        stRound("coinflip", cfBet, pay);
        addChips(pay); confetti(innerWidth/2, innerHeight*0.3, 140, true);
        $("cfmsg").textContent = "MAX LADDER · +"+fmt(pay); $("cfmsg").className = "msg win";
        cfEnd();
      } else {
        SND.gem();
        $("cfmsg").textContent = (result?"Tails":"Heads")+" · rung "+cfStepN+" · "+CF_LADDER[cfStepN-1]+"× locked if you cash";
        $("cfmsg").className = "msg win";
        cfButtons(true); $("cfcash").disabled = false;
      }
    } else {
      $("cfmsg").textContent = (result?"Tails":"Heads")+" · the house takes it";
      $("cfmsg").className = "msg lose";
      stRound("coinflip", cfBet, 0);
      screenShake($("cfcoin").closest(".panel"));
      cfEnd();
    }
    cfBusy = false;
  }, 1550);
}
function cfCash(){
  if (!cfLive || cfBusy || cfStepN < 1) return;
  const pay = Math.floor(cfBet * CF_LADDER[cfStepN-1]);
  stRound("coinflip", cfBet, pay);
  addChips(pay); winFx(pay, cfBet);
  $("cfmsg").textContent = "Cashed at "+CF_LADDER[cfStepN-1]+"× · +"+fmt(pay);
  $("cfmsg").className = "msg win";
  cfEnd();
}
function cfEnd(){
  cfLive = false; cfButtons(false);
  $("cfcash").disabled = true; $("cfstart").disabled = false;
  cfPaint();
}
