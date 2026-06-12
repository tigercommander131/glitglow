
/* ════════════════ BLACKJACK ════════════════ */
const SUITS = ["♠","♥","♦","♣"], RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
function freshDeck(){
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ r, s, red: s==="♥"||s==="♦" });
  for (let i = d.length-1; i > 0; i--){ const j = (Math.random()*(i+1))|0; [d[i],d[j]] = [d[j],d[i]]; }
  return d;
}
let _cardSndT = 0;
function cardEl(c, facedown){
  // card snap, throttled so batch re-renders (video poker) fire once
  const _n = performance.now();
  if (_n - _cardSndT > 45){ _cardSndT = _n; SND.card(); }
  const el = document.createElement("div");
  el.className = "pcard" + (facedown ? " facedown" : "");
  el.innerHTML = `<div class="inner"><div class="face ${c.red?"red":"blk"}"><div>${c.r}${c.s}</div><div class="mid">${c.s}</div><div class="tr">${c.r}${c.s}</div></div><div class="back"></div></div>`;
  return el;
}
function handVal(h){
  let v = 0, aces = 0;
  for (const c of h){ if (c.r === "A"){ v += 11; aces++; } else if ("JQK".includes(c.r)) v += 10; else v += +c.r; }
  while (v > 21 && aces){ v -= 10; aces--; }
  return v;
}
let bjDeck, bjP, bjD, bjBet = 0, bjLive = false, bjHole;
function bjSet(on){ ["bjhit","bjstand","bjdouble"].forEach(i => $(i).disabled = !on); $("bjdeal").disabled = on; }
function bjDeal(){
  if (bjLive) return;
  bjBet = takeBet("bjbet"); if (!bjBet) return;
  bjLive = true; bjDeck = freshDeck(); bjP = []; bjD = [];
  $("bjplayer").innerHTML = ""; $("bjdealer").innerHTML = ""; $("bjmsg").textContent = ""; $("bjmsg").className = "msg";
  const deal = (hand, host, fd) => { const c = bjDeck.pop(); hand.push(c); const el = cardEl(c, fd); host.appendChild(el); return el; };
  setTimeout(()=>deal(bjP, $("bjplayer")), 0);
  setTimeout(()=>{ bjHole = deal(bjD, $("bjdealer"), true); }, 220);
  setTimeout(()=>deal(bjP, $("bjplayer")), 440);
  setTimeout(()=>{ deal(bjD, $("bjdealer")); bjScores(true); bjSet(true);
    $("bjdouble").disabled = chips < bjBet;
    if (handVal(bjP) === 21) bjStand();
  }, 660);
}
function bjScores(hideHole){
  $("bjpscore").textContent = handVal(bjP);
  $("bjdscore").textContent = hideHole ? "?" : handVal(bjD);
}
function bjDraw(hand, host){ const c = bjDeck.pop(); hand.push(c); host.appendChild(cardEl(c)); }
function bjHit(){
  if (!bjLive) return;
  bjDraw(bjP, $("bjplayer")); bjScores(true); $("bjdouble").disabled = true;
  if (handVal(bjP) > 21) bjEnd();
}
function bjDouble(){
  if (!bjLive || chips < bjBet) return;
  chips -= bjBet; bjBet *= 2; saveChips(); chipToss();
  bjDraw(bjP, $("bjplayer")); bjScores(true);
  handVal(bjP) > 21 ? bjEnd() : bjStand();
}
function bjStand(){
  if (!bjLive) return;
  bjSet(false); $("bjdeal").disabled = true;
  bjHole.classList.remove("facedown"); bjScores(false);
  const step = () => {
    if (handVal(bjD) < 17){ bjDraw(bjD, $("bjdealer")); bjScores(false); setTimeout(step, 550); }
    else bjEnd();
  };
  setTimeout(step, 600);
}
function bjEnd(){
  bjLive = false; bjSet(false); $("bjdeal").disabled = false;
  bjHole.classList.remove("facedown"); bjScores(false);
  const p = handVal(bjP), d = handVal(bjD), m = $("bjmsg");
  let pay = 0;
  if (p > 21){ m.textContent = "Bust — house takes it."; m.className = "msg lose"; }
  else if (p === 21 && bjP.length === 2 && !(d === 21 && bjD.length === 2)){ pay = Math.floor(bjBet*2.5); m.textContent = "Blackjack! Paid 3:2 — +"+fmt(pay-bjBet); m.className = "msg win"; }
  else if (d > 21){ pay = bjBet*2; m.textContent = "Dealer busts — +"+fmt(bjBet); m.className = "msg win"; }
  else if (p > d){ pay = bjBet*2; m.textContent = "You win — +"+fmt(bjBet); m.className = "msg win"; }
  else if (p < d){ m.textContent = "Dealer wins."; m.className = "msg lose"; }
  else { pay = bjBet; m.textContent = "Push — bet returned."; m.className = "msg push"; }
  if (p === 21 && bjP.length === 2 && !(d === 21 && bjD.length === 2)) ach("bjNatural");
  stRound("blackjack", bjBet, pay);
  if (pay){ addChips(pay); winFx(pay, bjBet); }
}

