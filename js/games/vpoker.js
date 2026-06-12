/* ════════════════ VIDEO POKER ════════════════ */
const VP_PAYS = { royal:800, sflush:50, quads:25, boat:9, flush:6, straight:4, trips:3, twopair:2, jacks:1 };
const VP_NAMES = { royal:"Royal Flush", sflush:"Straight Flush", quads:"Four of a Kind", boat:"Full House",
  flush:"Flush", straight:"Straight", trips:"Three of a Kind", twopair:"Two Pair", jacks:"Jacks or Better" };
let vpDeckA = [], vpHand = [], vpHeld = [false,false,false,false,false], vpPhase = "idle", vpBetV = 0;
function vpRankN(c){ return c.r==="A"?14:c.r==="K"?13:c.r==="Q"?12:c.r==="J"?11:+c.r; }
function vpEval(h){
  const rs = h.map(vpRankN).sort((a,b)=>a-b);
  const suits = new Set(h.map(c=>c.s));
  const flush = suits.size === 1;
  const uniq = [...new Set(rs)];
  let straight = false, hiStraight = false;
  if (uniq.length === 5){
    if (rs[4]-rs[0] === 4) { straight = true; hiStraight = rs[0]===10; }
    else if (rs.join()==="2,3,4,5,14") straight = true; // wheel
  }
  const counts = {};
  rs.forEach(r=>counts[r]=(counts[r]||0)+1);
  const cv = Object.values(counts).sort((a,b)=>b-a);
  if (flush && hiStraight) return "royal";
  if (flush && straight) return "sflush";
  if (cv[0] === 4) return "quads";
  if (cv[0] === 3 && cv[1] === 2) return "boat";
  if (flush) return "flush";
  if (straight) return "straight";
  if (cv[0] === 3) return "trips";
  if (cv[0] === 2 && cv[1] === 2) return "twopair";
  if (cv[0] === 2){
    const pr = +Object.keys(counts).find(k=>counts[k]===2);
    if (pr >= 11 || pr === 14) return "jacks";
  }
  return null;
}
function vpRender(faceup){
  const w = $("vphand"); w.innerHTML = "";
  vpHand.forEach((c,i)=>{
    const slot = document.createElement("div");
    slot.className = "vpcardw" + (vpHeld[i] ? " held" : "");
    slot.onclick = ()=>vpToggle(i);
    const card = cardEl(c, !faceup[i]);
    slot.appendChild(card);
    const tag = document.createElement("div");
    tag.className = "holdtag"; tag.textContent = "HOLD";
    slot.appendChild(tag);
    w.appendChild(slot);
  });
}
function vpToggle(i){
  if (vpPhase !== "hold") return;
  vpHeld[i] = !vpHeld[i];
  $("vphand").children[i].classList.toggle("held", vpHeld[i]);
}
function vpFlip(i){
  const card = $("vphand").children[i].querySelector(".pcard");
  if (card) card.classList.remove("facedown");
}
function vpInit(){
  if (vpPhase === "idle"){
    $("vphand").innerHTML = "";
    $("vpmsg").textContent = "";
  }
}
function vpDeal(){
  if (vpPhase === "hold") return;
  vpBetV = takeBet("vpbet"); if (!vpBetV) return;
  document.querySelectorAll("#vppay .vrow").forEach(r=>r.classList.remove("hit"));
  $("vpmsg").textContent = ""; $("vpmsg").className = "msg";
  vpDeckA = freshDeck();
  vpHand = [0,0,0,0,0].map(()=>vpDeckA.pop());
  vpHeld = [false,false,false,false,false];
  vpPhase = "deal";
  $("vpdeal").disabled = true;
  vpRender([false,false,false,false,false]);
  vpHand.forEach((_,i)=> setTimeout(()=>vpFlip(i), 240 + i*170));
  setTimeout(()=>{ vpPhase = "hold"; $("vpdraw").disabled = false;
    $("vpmsg").textContent = "Hold what you trust, then draw"; }, 240 + 5*170);
}
function vpDraw(){
  if (vpPhase !== "hold") return;
  vpPhase = "draw"; $("vpdraw").disabled = true;
  const swap = [];
  vpHand.forEach((_,i)=>{ if (!vpHeld[i]){ vpHand[i] = vpDeckA.pop(); swap.push(i); } });
  // re-render: held stay up, swapped come in face down then flip
  vpRender(vpHand.map((_,i)=>vpHeld[i]));
  swap.forEach((i,k)=> setTimeout(()=>vpFlip(i), 220 + k*190));
  setTimeout(()=>{
    const hand = vpEval(vpHand);
    if (hand){
      const pay = vpBetV * VP_PAYS[hand];
      if (hand === "royal") ach("vpRoyal");
      stRound("vpoker", vpBetV, pay);
      addChips(pay); winFx(pay, vpBetV);
      $("vpmsg").textContent = VP_NAMES[hand] + " · +" + fmt(pay);
      $("vpmsg").className = "msg win";
      const row = document.querySelector(`#vppay .vrow[data-h="${hand}"]`);
      if (row){ $("vppay").classList.remove("closed"); row.classList.add("hit"); }
    } else {
      stRound("vpoker", vpBetV, 0);
      $("vpmsg").textContent = "Nothing this time";
      $("vpmsg").className = "msg lose";
    }
    vpPhase = "idle"; $("vpdeal").disabled = false;
  }, 220 + swap.length*190 + 420);
}

