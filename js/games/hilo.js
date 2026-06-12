/* ════════════════ HI-LO ════════════════ */
const HLLADDER = [1.2,1.5,1.9,2.4,3.1,4.0,5.2,6.8,9.0,12.0];
let hlLive = false, hlBet = 0, hlCard = null, hlStep = 0, hlBusy = false;
function hiloLadderInit(){
  const l = $("hiloladder");
  l.innerHTML = HLLADDER.map((m,i) => `<div class="lrung" id="lr${i}">${m.toFixed(1)}×</div>`).join("");
}
function hlRand(){ return { r: (Math.random()*13)|0, s: SUITS[(Math.random()*4)|0] }; } // r: 0=A..12=K
function hlShow(c){
  const el = $("hilocard"), face = el.querySelector(".face");
  el.classList.add("facedown");
  setTimeout(() => {
    const red = c.s === "♥" || c.s === "♦";
    face.className = "face " + (red ? "red" : "blk");
    const label = RANKS[c.r] + c.s;
    face.children[0].textContent = label;
    face.children[1].textContent = c.s;
    face.children[2].textContent = label;
    el.classList.remove("facedown");
  }, 260);
}
function hlButtons(on){ $("hilohi").disabled = !on; $("hilolo").disabled = !on; }
function hiloStart(){
  if (hlLive) return;
  hlBet = takeBet("hilobet"); if (!hlBet) return;
  hlLive = true; hlStep = 0;
  $("hilogo").disabled = true; $("hilocash").disabled = true;
  $("hilomsg").textContent = ""; $("hilomsg").className = "msg";
  document.querySelectorAll(".lrung").forEach(r => r.classList.remove("lit"));
  hlCard = hlRand(); hlShow(hlCard); hlButtons(true);
}
function hiloGuess(dir){
  if (!hlLive || hlBusy) return;
  hlBusy = true; hlButtons(false);
  let next = hlRand();
  while (next.r === hlCard.r) next = hlRand(); // ties redrawn
  hlShow(next);
  setTimeout(() => {
    const ok = dir === 1 ? next.r > hlCard.r : next.r < hlCard.r;
    hlCard = next;
    if (!ok){
      hlLive = false; hlBusy = false;
      $("hilogo").disabled = false; $("hilocash").disabled = true;
      $("hilomsg").textContent = "Wrong call — bet lost."; $("hilomsg").className = "msg lose";
      stRound("hilo", hlBet, 0);
      return;
    }
    $("lr"+hlStep).classList.add("lit");
    SND.gem();
    hlStep++;
    $("hilocash").disabled = false;
    $("hilomsg").textContent = `Correct — ${HLLADDER[hlStep-1].toFixed(1)}× locked if you cash.`;
    $("hilomsg").className = "msg win";
    hlBusy = false;
    if (hlStep >= HLLADDER.length){ hiloCash(); return; }
    hlButtons(true);
  }, 620);
}
function hiloCash(){
  if (!hlLive || hlStep === 0) return;
  hlLive = false; hlButtons(false);
  const m = HLLADDER[hlStep-1], pay = Math.floor(hlBet*m);
  if (hlStep >= HLLADDER.length) ach("hiloTop");
  stRound("hilo", hlBet, pay);
  addChips(pay); winFx(pay, hlBet);
  $("hilogo").disabled = false; $("hilocash").disabled = true;
  $("hilomsg").textContent = `Cashed out at ${m.toFixed(1)}× — +${fmt(pay-hlBet)}`;
  $("hilomsg").className = "msg win";
}

registerGame("hilo", { init: hiloLadderInit });
