
/* ════════════════ BACCARAT ════════════════ */
let bacSide = "P", bacLive = false, bacRoad = JSON.parse(localStorage.getItem("gg_bacroad")||"[]");
function bacVal(h){ let v=0; for(const c of h){ v += c.r==="A"?1:("JQK".includes(c.r)||c.r==="10")?0:+c.r; } return v%10; }
function bacPick(s){
  if (bacLive) return;
  bacSide = s;
  $("bacp").classList.toggle("sel", s==="P");
  $("bacb").classList.toggle("sel", s==="B");
  $("bact").classList.toggle("sel", s==="T");
}
function bacRoadPaint(){
  const r = $("bacroad");
  r.innerHTML = '<span class="rlbl">ROAD</span>' + bacRoad.slice(-10).map(x=>`<div class="bead ${x}"></div>`).join("");
}
function bacInit(){
  $("bacphand").innerHTML = ""; $("bacbhand").innerHTML = "";
  $("bacpscore").textContent = "—"; $("bacbscore").textContent = "—";
  bacRoadPaint();
}
function bacDeal(){
  if (bacLive) return;
  const bet = takeBet("bacbet"); if (!bet) return;
  bacLive = true; $("bacdeal").disabled = true;
  $("bacmsg").textContent = ""; $("bacmsg").className = "msg";
  $("bacphand").innerHTML = ""; $("bacbhand").innerHTML = "";
  $("bacpscore").textContent = "—"; $("bacbscore").textContent = "—";
  const deck = freshDeck();
  const P = [], B = [];
  // build full sequence of reveals: P1 B1 P2 B2 (+ thirds per rules)
  P.push(deck.pop()); B.push(deck.pop()); P.push(deck.pop()); B.push(deck.pop());
  let pv = bacVal(P), bv = bacVal(B);
  const natural = pv >= 8 || bv >= 8;
  let p3 = null;
  if (!natural){
    if (pv <= 5){ p3 = deck.pop(); P.push(p3); }
    const p3v = p3 ? (p3.r==="A"?1:("JQK".includes(p3.r)||p3.r==="10")?0:+p3.r) : null;
    let bankerDraws;
    if (p3 === null) bankerDraws = bv <= 5;
    else if (bv <= 2) bankerDraws = true;
    else if (bv === 3) bankerDraws = p3v !== 8;
    else if (bv === 4) bankerDraws = p3v >= 2 && p3v <= 7;
    else if (bv === 5) bankerDraws = p3v >= 4 && p3v <= 7;
    else if (bv === 6) bankerDraws = p3v === 6 || p3v === 7;
    else bankerDraws = false;
    if (bankerDraws) B.push(deck.pop());
  }
  pv = bacVal(P); bv = bacVal(B);
  // staged reveal: alternate first four, then thirds
  const seq = [
    {h:"bacphand", c:P[0], s:"bacpscore", hand:P, n:1},
    {h:"bacbhand", c:B[0], s:"bacbscore", hand:B, n:1},
    {h:"bacphand", c:P[1], s:"bacpscore", hand:P, n:2},
    {h:"bacbhand", c:B[1], s:"bacbscore", hand:B, n:2}
  ];
  if (P[2]) seq.push({h:"bacphand", c:P[2], s:"bacpscore", hand:P, n:3});
  if (B[2]) seq.push({h:"bacbhand", c:B[2], s:"bacbscore", hand:B, n:3});
  seq.forEach((st,i)=>{
    setTimeout(()=>{
      $(st.h).appendChild(cardEl(st.c));
      $(st.s).textContent = bacVal(st.hand.slice(0, st.n));
    }, 420*i + 80);
  });
  const doneAt = 420*seq.length + 480;
  setTimeout(()=>{
    if (natural){
      $("bactable").classList.remove("bacgold"); void $("bactable").offsetWidth;
      $("bactable").classList.add("bacgold");
      toast("Natural " + Math.max(pv,bv));
    }
    const res = pv > bv ? "P" : bv > pv ? "B" : "T";
    bacRoad.push(res); if (bacRoad.length > 30) bacRoad = bacRoad.slice(-30);
    localStorage.setItem("gg_bacroad", JSON.stringify(bacRoad));
    bacRoadPaint();
    let pay = 0, txt = "";
    const who = res==="P" ? "Player wins "+pv+"–"+bv : res==="B" ? "Banker wins "+bv+"–"+pv : "Tie at "+pv;
    if (bacSide === res){
      pay = res==="P" ? bet*2 : res==="B" ? Math.floor(bet*1.95) : bet*9;
      txt = who + " · +" + fmt(pay - bet);
      $("bacmsg").className = "msg win";
    } else if (res === "T" && (bacSide==="P" || bacSide==="B")){
      pay = bet; txt = who + " · push, bet returned";
      $("bacmsg").className = "msg push";
    } else {
      txt = who + " · house takes it";
      $("bacmsg").className = "msg lose";
    }
    stRound("baccarat", bet, pay);
    if (pay > 0) addChips(pay);
    winFx(pay, bet);
    $("bacmsg").textContent = txt;
    bacLive = false; $("bacdeal").disabled = false;
  }, doneAt + (natural ? 500 : 0));
}

