/* ════════════════ DUEL ARENA — 1v1 over Firebase ════════════════ */
const DUEL_GAMES = { war:"Card War", rr:"Russian Roulette", bj:"Blackjack" };
let duelId = null, duelMy = null, duelMyStake = 0, duelData = null;
let duelOpenOn = false, duelLiveRef = null, duelPaidFor = null, duelWarShown = null, duelTick = 0;
/* Server-authoritative since Phase 1: stakes are escrowed, the RNG seed is
   generated, and the pot is paid out by Cloud Functions (functions/index.js).
   The client only renders state and writes its own moves. */
function duelLobby(){
  const ok = fbReady && user;
  $("duelauthmsg").style.display = ok ? "none" : "";
  $("duelcreate").style.display = ok ? "" : "none";
  if (!ok){ $("duellist").innerHTML = ""; return; }
  $("duellobby").style.display = ""; $("duelgame").style.display = "none";
  if (!duelOpenOn){
    duelOpenOn = true;
    db.ref("duels/open").on("value", s => {
      const v = s.val() || {}, now = Date.now(), rows = [];
      for (const [id, o] of Object.entries(v)){
        if (!o || !o.host) continue;
        // stale challenges: hide other people's, keep mine visible so Cancel can reclaim the stake
        if (o.at < now - 3600000 && !(user && o.host.uid === user.uid)) continue;
        rows.push([id, o]);
      }
      rows.sort((a,b) => b[1].at - a[1].at);
      $("duellist").innerHTML = rows.length ? rows.map(([id, o]) => {
        const mine = user && o.host.uid === user.uid;
        return `<div class="duelrow"><div class="dl"><span class="dueltag ${o.game}">${DUEL_GAMES[o.game]}</span><span class="dh">${esc(o.host.name)}</span></div>
          <span class="ds">⛁ ${fmt(o.stake)}</span>
          ${mine ? `<button class="actbtn ghost" onclick="duelCancel('${id}')">Cancel</button>`
                 : `<button class="actbtn primary" onclick="duelJoin('${id}')">Join</button>`}</div>`;
      }).join("") : '<div style="color:#a89878;font-style:italic;font-family:\'Playfair Display\',serif">No open challenges — post one and wait for a taker.</div>';
    });
  }
}
function duelLeave(){ clearInterval(duelTick); duelTick = 0; }
function duelWatch(id){
  duelLiveRef = db.ref("duels/live/"+id);
  duelLiveRef.on("value", duelOnLive);
}
async function duelCreate(){
  if (!fbReady || !user){ toast("Sign in to duel"); return; }
  if (duelId){ toast("Already in a duel"); return; }
  const stake = Math.floor(Number($("duelstake").value));
  if (!stake || stake < 50){ toast("Minimum stake is 50"); return; }
  if (stake > chips){ toast("Not enough chips"); return; }
  const game = $("duelgamepick").value;
  try {
    const r = await callFn("duelCreate", { game, stake, name: displayName || "Player" });
    duelId = r.id; duelMy = "host"; duelMyStake = stake; duelPaidFor = null;
    chipToss(); SND.chips(2);
    duelWatch(duelId);
    toast("Challenge posted — waiting for a taker");
  } catch(e){ toast(e.message || "Couldn't post challenge"); }
}
async function duelJoin(id){
  if (!fbReady || !user || duelId) return;
  try {
    await callFn("duelJoin", { id, name: displayName || "Player" });
    duelId = id; duelMy = "guest"; duelPaidFor = null;
    chipToss(); SND.chips(2);
    duelWatch(id);
  } catch(e){ toast(e.message || "Challenge already taken"); }
}
async function duelCancel(id){
  try {
    await callFn("duelCancel", { id });
    toast("Challenge withdrawn — stake returned");
  } catch(e){ toast(e.message || "Couldn't cancel"); }
  if (duelId === id) duelReset();
}
function duelReset(){
  if (duelLiveRef){ duelLiveRef.off(); duelLiveRef = null; }
  clearInterval(duelTick); duelTick = 0;
  duelId = null; duelMy = null; duelData = null; duelWarShown = null; duelSettling = null;
  $("duellobby").style.display = ""; $("duelgame").style.display = "none";
}
function duelOnLive(s){
  const d = s.val();
  if (!d || !d.guest) return;
  duelData = d;
  if ($("view-duel").classList.contains("on")){
    $("duellobby").style.display = "none"; $("duelgame").style.display = "";
  }
  if (d.state === "done" && d.winner){ duelFinish(d, d.winner, d.how || ""); return; }
  if (d.game === "war") duelWar(d);
  if (d.game === "rr") duelRR(d);
  if (d.game === "bj") duelBJ(d);
}
function duelNames(d){
  return `<div class="bigstat"><span>${esc(d.host.name)} <b>⛁${fmt(d.stake)}</b></span><span style="color:#a89878">vs</span><span>${esc(d.guest.name)} <b>⛁${fmt(d.stake)}</b></span></div>`;
}
function duelFinish(d, winnerUid, how){
  if (duelPaidFor === duelId) return;
  duelPaidFor = duelId;
  clearInterval(duelTick); duelTick = 0;
  const me = user.uid, stake = d.stake;
  // the pot is paid server-side — here we only narrate and re-sync the wallet
  let line;
  if (winnerUid === "split"){
    stRound("duel", stake, stake);
    line = "Dead heat — stakes returned.";
  } else if (winnerUid === me){
    winFx(stake*2, stake); stRound("duel", stake, stake*2);
    line = "You take the pot — +" + fmt(stake) + (how ? " · " + how : "");
  } else {
    stRound("duel", stake, 0);
    line = (winnerUid === d.host.uid ? d.host.name : d.guest.name) + " takes the pot" + (how ? " · " + how : "");
  }
  refreshChips(); setTimeout(refreshChips, 2500); // again after settlement fully lands
  const div = document.createElement("div");
  div.className = "msg " + (winnerUid === "split" ? "push" : winnerUid === me ? "win" : "lose");
  div.textContent = line;
  $("duelgame").appendChild(div);
  if (duelMy === "host") setTimeout(() => db.ref("duels/live/"+duelId).remove().catch(()=>{}), 25000);
  setTimeout(duelReset, 6000);
}
/* ask the server to settle — it replays the duel from seed+moves and pays the
   pot; args from old call sites are ignored (the server computes the winner) */
let duelSettling = null;
function duelSetDone(){
  if (!duelId || !duelData || duelData.state === "done" || duelSettling === duelId) return;
  duelSettling = duelId;
  callFn("duelSettle", { id: duelId }).catch(() => { duelSettling = null; }); // opponent may settle first — fine
}
function duelClaimTimeout(){
  if (!duelId) return;
  callFn("duelTimeout", { id: duelId })
    .catch(e => toast(e.message || "Can't claim yet"));
}
/* timeout claim: opponent silent for 75s on their turn → take the pot */
function duelClaimBtn(lastT, myTurn){
  if (myTurn || !lastT) return "";
  const left = 75 - Math.floor((Date.now() - lastT)/1000);
  return left <= 0
    ? `<div style="display:flex;justify-content:center;margin-top:10px"><button class="actbtn danger" onclick="duelClaimTimeout()">Claim Win · Opponent Gone</button></div>`
    : `<p style="text-align:center;color:#6e6250;font-size:.78rem;margin-top:8px">opponent has ${left}s before forfeit</p>`;
}
function duelEnsureTick(){
  if (!duelTick) duelTick = setInterval(() => { if (duelData && duelData.state === "play") duelOnLive({ val: () => duelData }); }, 5000);
}
/* — Card War duel: pure seed, no moves, both clients replay the same script — */
function duelWar(d){
  if (duelWarShown === duelId) return;
  duelWarShown = duelId;
  const rng = mulberry32(d.seed);
  const hands = [];
  let pc, hc;
  do { pc = seededCard(rng); hc = seededCard(rng); hands.push([pc, hc]); }
  while (warRank(pc) === warRank(hc) && hands.length < 8);
  const iWin = (warRank(pc) > warRank(hc)) === (duelMy === "host");
  const winnerUid = warRank(pc) === warRank(hc) ? "split" : (warRank(pc) > warRank(hc) ? d.host.uid : d.guest.uid);
  $("duelgame").innerHTML = duelNames(d) + `
    <div class="warhands">
      <div><div class="baclbl">${esc(d.host.name)}</div><div class="hand warburn" id="dwhost"></div></div>
      <div class="vs" id="dwvs">vs</div>
      <div><div class="baclbl">${esc(d.guest.name)}</div><div class="hand warburn" id="dwguest"></div></div>
    </div>`;
  let t = 400;
  hands.forEach(([a, b], i) => {
    const last = i === hands.length - 1;
    setTimeout(() => { $("dwhost").appendChild(cardEl(a)); }, t);
    setTimeout(() => { $("dwguest").appendChild(cardEl(b)); if (!last) $("dwvs").textContent = "TIE"; if (!last) SND.alarm(); }, t + 350);
    t += 1100;
  });
  setTimeout(() => {
    if (duelMy === "host") duelSetDone(winnerUid, hands.length > 1 ? "after " + (hands.length-1) + " tie" + (hands.length > 2 ? "s" : "") : "");
    else if (duelData && duelData.state !== "done") duelFinish(d, winnerUid, "");
  }, t + 500);
}
/* — Russian Roulette duel: alternating pulls, bullet position from seed — */
function duelRR(d){
  const rng = mulberry32(d.seed);
  const bullet = (rng()*6)|0;
  const moves = Object.entries(d.moves || {}).sort((a,b) => a[0] < b[0] ? -1 : 1).map(e => e[1]);
  const n = moves.length;
  const dead = n > 0 && (n - 1) === bullet;
  const turnHost = n % 2 === 0;
  const myTurn = !dead && ((turnHost && duelMy === "host") || (!turnHost && duelMy === "guest"));
  const lastT = n ? moves[n-1].t : d.started;
  let ch = "";
  for (let i = 0; i < 6; i++)
    ch += `<i class="${i < n ? (i === bullet ? "bang" : "spent") : ""}"></i>`;
  $("duelgame").innerHTML = duelNames(d) + `
    <div class="rrchambers">${ch}</div>
    <p style="text-align:center;color:#a89878;font-family:'Orbitron',sans-serif;font-size:1rem">
      ${dead ? "BANG." : (turnHost ? esc(d.host.name) : esc(d.guest.name)) + " holds the revolver"}</p>
    ${!dead && myTurn ? `<div style="display:flex;justify-content:center;margin-top:10px"><button class="actbtn danger" onclick="duelRRPull()">PULL</button></div>` : ""}
    ${!dead ? duelClaimBtn(lastT, myTurn) : ""}`;
  if (!dead){ duelEnsureTick(); if (n > 0) SND.tick(); return; }
  SND.boom(); screenShake($("duelgame"));
  const loserHost = (n - 1) % 2 === 0;
  const winnerUid = loserHost ? d.guest.uid : d.host.uid;
  setTimeout(() => { if (duelMy === "host") duelSetDone(winnerUid, "chamber " + n); else if (duelData && duelData.state !== "done") duelFinish(d, winnerUid, ""); }, 900);
}
function duelRRPull(){
  if (!duelLiveRef) return;
  duelLiveRef.child("moves").push({ uid: user.uid, t: Date.now() });
}
/* — Blackjack duel: both play the same dealer, better result takes the pot — */
let dbjHand = null, dbjDone = false;
function duelBJDeal(d, role){
  const rng = mulberry32(d.seed ^ hashStr(role));
  return { rng, cards: [seededCard(rng), seededCard(rng)] };
}
function duelBJDealer(d){
  const rng = mulberry32(d.seed ^ 0xBEEF);
  return { rng, cards: [seededCard(rng), seededCard(rng)] };
}
function duelBJ(d){
  const myRole = duelMy, oppRole = duelMy === "host" ? "guest" : "host";
  const moves = d.moves || {};
  if (!dbjHand || dbjHand.id !== duelId){
    const deal = duelBJDeal(d, myRole);
    dbjHand = { id: duelId, rng: deal.rng, cards: deal.cards };
    dbjDone = false;
  }
  const dealer = duelBJDealer(d);
  const myMove = moves[myRole], oppMove = moves[oppRole];
  const bothDone = myMove && oppMove;
  const myT = hvVal(dbjHand.cards);
  // dealer plays out only when both players are locked in
  let dCards = dealer.cards.slice(), dT = hvVal(dCards);
  if (bothDone){ while (dT < 17){ dCards.push(seededCard(dealer.rng)); dT = hvVal(dCards); } }
  $("duelgame").innerHTML = duelNames(d) + `
    <div class="bjtable">
      <div><div class="baclbl">Dealer ${bothDone ? "· " + dT : ""}</div><div class="hand" id="dbjd"></div></div>
      <div style="margin-top:10px"><div class="baclbl">You · ${myT}${myT > 21 ? " · BUST" : ""}</div><div class="hand" id="dbjme"></div></div>
      <div style="margin-top:10px"><div class="baclbl">${esc(d[oppRole].name)} · ${oppMove ? oppMove.total + (oppMove.bust ? " · BUST" : "") : "playing…"}</div><div class="hand" id="dbjopp"></div></div>
    </div>
    ${!myMove && myT <= 21 ? `<div style="display:flex;justify-content:center;gap:10px;margin-top:12px">
      <button class="actbtn primary" onclick="duelBJHit()">Hit</button>
      <button class="actbtn ghost" onclick="duelBJStand()">Stand</button></div>` : ""}
    ${myMove && !oppMove ? duelClaimBtn(myMove.t, false) : ""}`;
  dealer.cards.forEach((c, i) => $("dbjd").appendChild(cardEl(c, !bothDone && i === 1)));
  if (bothDone) dCards.slice(2).forEach(c => $("dbjd").appendChild(cardEl(c)));
  dbjHand.cards.forEach(c => $("dbjme").appendChild(cardEl(c)));
  if (oppMove && oppMove.n){
    const orng = mulberry32(d.seed ^ hashStr(oppRole));
    for (let i = 0; i < oppMove.n; i++) $("dbjopp").appendChild(cardEl(seededCard(orng)));
  } else $("dbjopp").innerHTML = '<div class="pcard facedown"><div class="inner"><div class="face"></div><div class="back"></div></div></div>';
  if (!myMove && myT > 21) duelBJLock(true);
  if (bothDone && duelMy === "host"){
    const res = m => m.bust ? -1 : (dT > 21 ? 1 : Math.sign(m.total - dT));
    const rh = res(moves.host), rg = res(moves.guest);
    duelSetDone(rh === rg ? "split" : (rh > rg ? d.host.uid : d.guest.uid),
      moves.host.total + " vs " + moves.guest.total + " · dealer " + dT);
  }
  duelEnsureTick();
}
function duelBJHit(){
  if (!dbjHand || dbjDone) return;
  dbjHand.cards.push(seededCard(dbjHand.rng));
  SND.card();
  duelOnLive({ val: () => duelData });
  if (hvVal(dbjHand.cards) > 21) duelBJLock(true);
}
function duelBJStand(){ duelBJLock(false); }
function duelBJLock(bust){
  if (dbjDone || !duelLiveRef) return;
  dbjDone = true;
  const t = hvVal(dbjHand.cards);
  duelLiveRef.child("moves/"+duelMy).set({ total: t, bust: t > 21, n: dbjHand.cards.length, t: Date.now() });
}


registerGame("duel", { stop: duelLeave });
