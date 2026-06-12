/* ════════════════ MINES ════════════════ */
let mnLive = false, mnBet = 0, mnMines = new Set(), mnSafe = 0, mnMult = 1, mnCount = 5, mnLast = 12;
function minesDrawIdle(){
  const g = $("minegrid"); g.innerHTML = "";
  for (let i = 0; i < 25; i++){
    const t = document.createElement("div");
    t.className = "mtile"; t.dataset.i = i;
    t.innerHTML = `<div class="inner"><div class="ff"></div><div class="bb"></div></div>`;
    t.onclick = () => minesPick(t);
    g.appendChild(t);
  }
}
function minesStart(){
  if (mnLive) return;
  mnBet = takeBet("minesbet"); if (!mnBet) return;
  escrowHold("mines", mnBet);
  mnCount = +$("minescount").value;
  mnLive = true; mnSafe = 0; mnMult = 1;
  $("minesgo").disabled = true; $("minescash").disabled = true;
  $("minesmsg").textContent = ""; $("minesmsg").className = "msg";
  $("minesmult").textContent = "1.00×";
  minesDrawIdle();
  mnMines = new Set();
  while (mnMines.size < mnCount) mnMines.add((Math.random()*25)|0);
}
function minesPick(tile){
  if (!mnLive || tile.classList.contains("open")) return;
  const i = +tile.dataset.i, back = tile.querySelector(".bb");
  mnLast = i;
  tile.classList.add("open");
  if (mnMines.has(i)){
    back.classList.add("boom"); back.textContent = "✸";
    screenShake(tile.closest(".panel")); screenFlash();
    mnLive = false; escrowSettle("mines"); $("minesgo").disabled = false; $("minescash").disabled = true;
    $("minesmsg").textContent = "Boom — bet lost."; $("minesmsg").className = "msg lose";
    stRound("mines", mnBet, 0);
    minesRevealAll();
    return;
  }
  back.classList.add("gem"); back.textContent = "◆";
  SND.gem();
  mnSafe++;
  const tilesLeft = 25 - (mnSafe - 1), safeLeft = tilesLeft - mnCount;
  mnMult *= (tilesLeft / safeLeft) * 0.97;
  $("minesmult").textContent = mnMult.toFixed(2) + "×";
  $("minescash").disabled = false;
  if (mnSafe === 25 - mnCount) minesCash();
}
function minesRevealAll(){
  // flip remaining mines with a stagger radiating from the last clicked tile
  const fr = (mnLast/5)|0, fc = mnLast%5;
  document.querySelectorAll("#minegrid .mtile:not(.open)").forEach(t => {
    const i = +t.dataset.i;
    if (!mnMines.has(i)) return;
    const d = Math.abs(((i/5)|0) - fr) + Math.abs(i%5 - fc);
    setTimeout(() => {
      t.classList.add("open");
      const b = t.querySelector(".bb");
      b.style.background = "#241204"; b.style.borderColor = "#5c2a2a"; b.style.color = "#b87a7a"; b.textContent = "✸";
    }, RM ? 0 : d*45);
  });
}
function minesCash(){
  if (!mnLive || mnSafe === 0) return;
  mnLive = false; escrowSettle("mines");
  const pay = Math.floor(mnBet * mnMult);
  if (mnSafe === 25 - mnCount) ach("minesClear");
  stRound("mines", mnBet, pay);
  addChips(pay); winFx(pay, mnBet);
  $("minesgo").disabled = false; $("minescash").disabled = true;
  $("minesmsg").textContent = `Cashed out at ${mnMult.toFixed(2)}× — +${fmt(pay-mnBet)}`;
  $("minesmsg").className = "msg win";
  minesRevealAll();
}


registerGame("mines", { init: minesDrawIdle });
