
/* ════════════════ CARD WAR ════════════════ */
let warPhase = "idle", warBetV = 0, warDeckA = [];
function warRank(c){ return c.r === "A" ? 14 : c.r === "K" ? 13 : c.r === "Q" ? 12 : c.r === "J" ? 11 : +c.r; }
function warDraw1(){ if (warDeckA.length < 12) warDeckA = freshDeck(); return warDeckA.pop(); }
function warInit(){
  if (warPhase !== "idle") return;
  $("warhouse").innerHTML = ""; $("warplayer").innerHTML = "";
  $("warmsg").textContent = ""; $("warmsg").className = "msg";
  $("warrow").classList.remove("on"); $("warvs").textContent = "vs";
}
function warEnd(){ warPhase = "idle"; $("wardeal").disabled = false; $("warrow").classList.remove("on"); }
function warDeal(){
  if (warPhase !== "idle") return;
  warBetV = takeBet("warbet"); if (!warBetV) return;
  warPhase = "busy"; $("wardeal").disabled = true;
  $("warmsg").textContent = ""; $("warmsg").className = "msg";
  $("warhouse").innerHTML = ""; $("warplayer").innerHTML = ""; $("warvs").textContent = "vs";
  const p = warDraw1(), h = warDraw1();
  $("warplayer").appendChild(cardEl(p));
  setTimeout(() => $("warhouse").appendChild(cardEl(h)), 320);
  setTimeout(() => {
    const pr = warRank(p), hr = warRank(h);
    if (pr > hr){
      const pay = warBetV * 2;
      stRound("war", warBetV, pay); addChips(pay); winFx(pay, warBetV);
      $("warmsg").textContent = p.r + p.s + " over " + h.r + h.s + " · +" + fmt(warBetV);
      $("warmsg").className = "msg win";
      warEnd();
    } else if (pr < hr){
      stRound("war", warBetV, 0);
      $("warmsg").textContent = "House takes it · " + h.r + h.s + " over " + p.r + p.s;
      $("warmsg").className = "msg lose";
      warEnd();
    } else {
      warPhase = "tie";
      $("warvs").textContent = "TIE";
      $("warrow").classList.add("on");
      $("wargo").disabled = chips < warBetV;
      $("warmsg").textContent = "Tied at " + p.r + " — go to war or surrender";
      $("warmsg").className = "msg push";
      SND.alarm();
    }
  }, 900);
}
function warFold(){
  if (warPhase !== "tie") return;
  const back = Math.floor(warBetV / 2);
  stRound("war", warBetV, back); addChips(back);
  $("warmsg").textContent = "Surrendered — " + fmt(back) + " returned";
  $("warmsg").className = "msg push";
  warEnd();
}
function warGo(){
  if (warPhase !== "tie" || chips < warBetV) return;
  warPhase = "busy"; $("warrow").classList.remove("on");
  chips -= warBetV; saveChips(); chipToss(); SND.chips(2);
  let dly = 0;
  for (let i = 0; i < 3; i++){ // three burn cards each, face down
    setTimeout(() => $("warplayer").appendChild(cardEl(warDraw1(), true)), dly += 150);
    setTimeout(() => $("warhouse").appendChild(cardEl(warDraw1(), true)), dly += 70);
  }
  const p = warDraw1(), h = warDraw1();
  setTimeout(() => $("warplayer").appendChild(cardEl(p)), dly + 320);
  setTimeout(() => $("warhouse").appendChild(cardEl(h)), dly + 620);
  setTimeout(() => {
    const pr = warRank(p), hr = warRank(h), staked = warBetV * 2;
    if (pr > hr){
      const pay = warBetV * 3; // raise pays even, original pushes
      ach("warWin");
      stRound("war", staked, pay); addChips(pay); winFx(pay, staked);
      $("warmsg").textContent = "War won · " + p.r + p.s + " over " + h.r + h.s + " · +" + fmt(pay - staked);
      $("warmsg").className = "msg win";
    } else if (pr === hr){
      const pay = warBetV * 4; // tie the war: 2:1 on the raise
      ach("warWin");
      stRound("war", staked, pay); addChips(pay);
      confetti(innerWidth/2, innerHeight*.3, 120, true);
      $("warmsg").textContent = "DOUBLE TIE · raise paid 2:1 · +" + fmt(pay - staked);
      $("warmsg").className = "msg win";
    } else {
      stRound("war", staked, 0);
      $("warmsg").textContent = "War lost · " + h.r + h.s + " over " + p.r + p.s;
      $("warmsg").className = "msg lose";
      screenShake($("warplayer").closest(".panel"));
    }
    warEnd();
  }, dly + 1150);
}
