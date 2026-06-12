/* ════════════════ STATS · MILESTONES · ACHIEVEMENTS ════════════════ */
const GAME_NAMES = { blackjack:"Blackjack", roulette:"Roulette", crash:"Crash", mines:"Mines", russian:"Russian Roulette",
  spinner:"Spinner Wheel", hilo:"Hi-Lo", slots:"Slots", plinko:"Plinko", coinflip:"Coin Flip", baccarat:"Baccarat",
  vpoker:"Video Poker", sicbo:"Sic Bo", war:"Card War", horses:"Horse Race", scratch:"Scratchers", duel:"Duels", tourney:"Gauntlet" };
const ARC_NAMES = { snake:"Snake", breakout:"Breakout", tetris:"Tetris", invaders:"Space Invaders", flapwave:"Flapwave",
  asteroids:"Asteroids", chomp:"Chomp", missile:"Missile Command" };
const ACH = {
  firstRound:{ i:"♠", n:"First Blood", d:"Settle your first casino round" },
  grinder100:{ i:"⏳", n:"Regular", d:"Play 100 casino rounds" },
  grinder500:{ i:"♖", n:"Fixture", d:"Play 500 casino rounds" },
  highroller:{ i:"⚜", n:"High Roller", d:"Stake 1,000+ chips on a single round" },
  bigwin10x:{ i:"◈", n:"Jackpot", d:"Win 10× your stake in one round" },
  streak5:{ i:"♨", n:"Heater", d:"Win 5 rounds in a row" },
  comeback:{ i:"⚖", n:"The Comeback", d:"Win right after a 4-loss skid" },
  daily1:{ i:"☀", n:"Regular Hours", d:"Claim a daily bonus" },
  chips5k:{ i:"⛁", n:"Five Large", d:"Hold 5,000 chips" },
  chips25k:{ i:"⛃", n:"Pit Boss Money", d:"Hold 25,000 chips" },
  chips100k:{ i:"♛", n:"House Threat", d:"Hold 100,000 chips" },
  bjNatural:{ i:"♠", n:"Natural", d:"Land a blackjack" },
  crash10x:{ i:"⌁", n:"Nerves of Steel", d:"Cash out at 10× or higher in Crash" },
  minesClear:{ i:"◆", n:"Sweeper", d:"Clear every safe tile in Mines" },
  rrLegend:{ i:"⬡", n:"Six Chambers", d:"Survive five pulls in Russian Roulette" },
  slots777:{ i:"➐", n:"Triple Seven", d:"Hit 7 7 7 on the slots" },
  vpRoyal:{ i:"♦", n:"Royal Court", d:"Draw a royal flush in Video Poker" },
  plinko100x:{ i:"∴", n:"Golden Funnel", d:"Land a 100×+ Plinko bucket" },
  cfMax:{ i:"◉", n:"Eight in a Row", d:"Ride the coin-flip ladder to the top" },
  hiloTop:{ i:"⇅", n:"Ladder Lord", d:"Climb the full Hi-Lo ladder" },
  warWin:{ i:"⚔", n:"War Hero", d:"Win a war after a tie in Card War" },
  sbTriple:{ i:"⚄", n:"Bone Reader", d:"Win an Any Triple bet in Sic Bo" },
  snake25:{ i:"▰", n:"Garden Snake", d:"Score 25 in Snake" },
  breakout3:{ i:"▬", n:"Demolition", d:"Reach level 3 in Breakout" },
  tetris4:{ i:"▣", n:"TETRIS!", d:"Clear four lines at once" },
  invadersW5:{ i:"▼", n:"Wave Rider", d:"Reach wave 5 in Space Invaders" },
  flap20:{ i:"◇", n:"Smooth Operator", d:"Score 20 in Flapwave" },
  asteroids10k:{ i:"◬", n:"Rock Hound", d:"Score 10,000 in Asteroids" },
  chompClear:{ i:"ᗧ", n:"Clean Plate", d:"Clear a full maze in Chomp" },
  missileW5:{ i:"⌖", n:"City Keeper", d:"Reach wave 5 in Missile Command" },
  arcadeAll:{ i:"★", n:"Token Master", d:"Play all eight arcade cabinets" },
  rockBottom:{ i:"🆘", n:"Rock Bottom", d:"Take the house's pity credit" },
  firstPrize:{ i:"🎁", n:"Window Shopper No More", d:"Buy anything at the Prize Counter" },
  tk1000:{ i:"🎟", n:"Ticket Magnate", d:"Earn 1,000 lifetime tickets" }
};
let ST = null;
try { ST = JSON.parse(localStorage.getItem("gg_stats") || "null"); } catch(e){}
if (!ST || !ST.tot) ST = { games:{}, arc:{}, ach:{}, tot:{ plays:0, wagered:0, returned:0, biggestWin:0, curStreak:0, bestStreak:0 } };
let stFbT = 0;
function stSave(){
  localStorage.setItem("gg_stats", JSON.stringify(ST));
  if (fbReady && user){
    clearTimeout(stFbT);
    stFbT = setTimeout(() => { if (user) db.ref("users/"+user.uid+"/stats").set(ST); }, 2000);
  }
}
function stMerge(srv){
  if (!srv) { stSave(); return; }
  for (const k in (srv.ach || {})) if (!ST.ach[k]) ST.ach[k] = srv.ach[k];
  for (const k in (srv.arc || {})){
    const a = ST.arc[k] = ST.arc[k] || { plays: 0, best: 0 };
    a.plays = Math.max(a.plays, srv.arc[k].plays || 0);
    a.best = Math.max(a.best, srv.arc[k].best || 0);
  }
  for (const k in (srv.games || {})){
    const l = ST.games[k];
    if (!l || (srv.games[k].plays || 0) > l.plays) ST.games[k] = srv.games[k];
  }
  if (((srv.tot && srv.tot.plays) || 0) > ST.tot.plays) ST.tot = srv.tot;
  stSave();
}
/* achievements pay tickets — hard ones pay more, everything else 25 */
const ACH_PAY = { grinder100:75, grinder500:150, chips25k:75, chips100k:150, bigwin10x:75, streak5:75,
  crash10x:75, minesClear:75, rrLegend:100, slots777:150, vpRoyal:200, cfMax:100, hiloTop:75, warWin:50,
  invadersW5:75, missileW5:75, tetris4:100, asteroids10k:100, chompClear:100, arcadeAll:150, tk1000:100 };
function achToast(id, pay){
  const a = ACH[id];
  const el = document.createElement("div");
  el.className = "toast ach";
  el.textContent = a.i + "  Achievement · " + a.n + "  ·  +" + pay + " 🎟";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4300);
}
function ach(id){
  if (!ACH[id] || ST.ach[id]) return;
  ST.ach[id] = Date.now();
  const pay = ACH_PAY[id] || 25;
  addTix(pay);
  stSave(); achToast(id, pay); SND.ach();
  confetti(innerWidth/2, 80, 50, true);
}
/* one settle call per casino round: staked chips in, returned chips out.
   Result audio lives here so every game gets win/lose/push sounds for free. */
function stRound(game, staked, returned){
  const g = ST.games[game] = ST.games[game] || { plays:0, wagered:0, returned:0, big:0, wins:0 };
  const net = returned - staked;
  g.plays++; g.wagered += staked; g.returned += returned;
  if (net > 0) g.wins++;
  if (net > (g.big || 0)) g.big = net;
  const t = ST.tot;
  t.plays++; t.wagered += staked; t.returned += returned;
  if (net > (t.biggestWin || 0)) t.biggestWin = net;
  const wasSkid = t.curStreak <= -4;
  if (net > 0) t.curStreak = Math.max(0, t.curStreak) + 1;
  else if (net < 0) t.curStreak = Math.min(0, t.curStreak) - 1;
  if (t.curStreak > (t.bestStreak || 0)) t.bestStreak = t.curStreak;
  // progressive jackpot: 1% of every net loss feeds the shared pool;
  // any bet of 100+ has a 1-in-4000 shot at popping it (777 pays it too, see slResolve)
  if (typeof jkFeed === "function"){
    if (net < 0) jkFeed(Math.max(1, Math.floor(-net * 0.01)));
    if (staked >= 100 && Math.random() < 1/4000) jkWin("lucky drop");
  }
  // result audio
  if (returned === 0) SND.lose();
  else if (returned >= staked*2) SND.win(returned >= staked*5);
  else if (returned >= staked) SND.cash();
  else SND.push();
  // achievements
  ach("firstRound");
  if (t.plays >= 100) ach("grinder100");
  if (t.plays >= 500) ach("grinder500");
  if (staked >= 1000) ach("highroller");
  if (staked >= 25 && returned >= staked*10) ach("bigwin10x");
  if (t.curStreak >= 5) ach("streak5");
  if (wasSkid && net > 0) ach("comeback");
  stSave();
}
/* continue-token bookkeeping: a revived run hits stArc twice, so remember what the
   first death already paid and settle only the delta on the next one */
const _arcCont = {}, _arcLastTk = {};
function stArc(game, score){
  const a = ST.arc[game] = ST.arc[game] || { plays: 0, best: 0 };
  const cont = _arcCont[game]; delete _arcCont[game];
  if (!cont) a.plays++;
  if (score > a.best) a.best = score;
  // arcade ticket payout: score-based, capped per run, doubler token applies
  let tk = Math.min(120, Math.floor(score * (TK_RATE[game] || 0)));
  _arcLastTk[game] = tk;
  tk = Math.max(0, tk - (cont ? cont.paid : 0));
  if (tk > 0 && PRZ.tokens.doubler > 0){
    PRZ.tokens.doubler--; tk *= 2; przSave();
    setTimeout(() => toast("🎟 Doubler consumed"), 1300);
  }
  if (tk > 0){
    addTix(tk);
    ST.tot.tix = (ST.tot.tix || 0) + tk;
    setTimeout(() => toast("🎟 +" + tk + " tickets"), 500);
    if (ST.tot.tix >= 1000) ach("tk1000");
  }
  if (game === "snake" && score >= 25) ach("snake25");
  if (game === "flapwave" && score >= 20) ach("flap20");
  if (game === "asteroids" && score >= 10000) ach("asteroids10k");
  if (Object.keys(ST.arc).length >= 8) ach("arcadeAll");
  stSave();
}
function statsRender(){
  const t = ST.tot, net = t.returned - t.wagered;
  const achN = Object.keys(ST.ach).length, achT = Object.keys(ACH).length;
  $("statcards").innerHTML = `
    <div class="statcard"><small>Net Profit</small><b class="${net>=0?"pos":"neg"}">${net>=0?"+":""}${fmt(net)}</b></div>
    <div class="statcard"><small>Total Wagered</small><b>${fmt(t.wagered)}</b></div>
    <div class="statcard"><small>Biggest Win</small><b>${fmt(t.biggestWin||0)}</b></div>
    <div class="statcard"><small>Rounds Played</small><b>${fmt(t.plays)}</b></div>
    <div class="statcard"><small>Best Streak</small><b>${t.bestStreak||0} wins</b></div>
    <div class="statcard"><small>Achievements</small><b>${achN} / ${achT}</b></div>`;
  const msbar = (lbl, cur, goals, unit) => {
    const goal = goals.find(g => cur < g) || goals[goals.length-1];
    const pct = Math.min(100, cur/goal*100);
    return `<div class="msrow"><div class="mslbl"><span>${lbl}</span><span>${fmt(cur)} / ${fmt(goal)} ${unit}</span></div>
      <div class="msbar"><i style="width:${pct.toFixed(1)}%"></i></div></div>`;
  };
  $("msrows").innerHTML =
    msbar("Bankroll", chips, [5000, 25000, 100000, 1000000], "chips") +
    msbar("Casino rounds", t.plays, [100, 500, 1000, 5000], "rounds") +
    msbar("Achievements", achN, [achT], "unlocked");
  $("achcount").textContent = achN + " of " + achT + " unlocked";
  $("achgrid").innerHTML = Object.entries(ACH).map(([id, a]) =>
    `<div class="achv ${ST.ach[id] ? "unlocked" : "locked"}"><div class="aicon">${a.i}</div><div><h4>${a.n}</h4><p>${a.d}</p></div></div>`).join("");
  const rows = Object.entries(ST.games).sort((a,b) => b[1].plays - a[1].plays);
  $("pgbody").innerHTML = rows.length ? rows.map(([k, g]) => {
    const n = g.returned - g.wagered;
    return `<tr><td>${GAME_NAMES[k]||k}</td><td>${fmt(g.plays)}</td><td>${fmt(g.wagered)}</td>
      <td class="${n>=0?"pos":"neg"}">${n>=0?"+":""}${fmt(n)}</td><td>${fmt(g.big||0)}</td></tr>`;
  }).join("") : `<tr><td colspan="5" style="font-style:italic;color:#a89878">No rounds settled yet — the floor awaits.</td></tr>`;
  const arows = Object.entries(ST.arc).sort((a,b) => b[1].best - a[1].best);
  $("arcbody").innerHTML = arows.length ? arows.map(([k, a]) =>
    `<tr><td style="padding:9px 12px;border-bottom:1px solid rgba(255,255,255,.06);font-family:'JetBrains Mono',monospace;font-size:.85rem;color:#d8cba0">${ARC_NAMES[k]||k}</td>
     <td style="padding:9px 12px;border-bottom:1px solid rgba(255,255,255,.06);font-family:'JetBrains Mono',monospace;font-size:.85rem;color:#e8cf8a">BEST ${fmt(a.best)}</td>
     <td style="padding:9px 12px;border-bottom:1px solid rgba(255,255,255,.06);font-family:'JetBrains Mono',monospace;font-size:.85rem;color:#a89878">${fmt(a.plays)} plays</td></tr>`).join("")
    : `<tr><td style="padding:9px 12px;font-style:italic;color:#a89878">No cabinets played yet.</td></tr>`;
}

