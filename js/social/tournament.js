/* ════════════════ DAILY TOURNAMENT — race with countdown ════════════════
   Buy in (server escrows it) → play ONE run against the day's seeded deal —
   everyone gets the exact same cards → live standings all day → at midnight
   UTC a scheduled Cloud Function pays the top 3 automatically and posts the
   podium. The game rotates daily on a fixed UTC schedule (mirrors the server). */
const TN_BUYIN = 1000, TN_HANDS = 10, TN_START = 500, TN_BET = 50;
const TN_GAMES = {
  bj:   { name: "Blackjack Gauntlet", step: "10 hands of blackjack — everyone draws the same shoe" },
  hilo: { name: "Hi-Lo Gauntlet", step: "10 higher-or-lower calls — everyone rides the same cards" }
};
const TN_ROTATION = ["bj", "hilo"];
const tnGameFor = day => TN_ROTATION[Math.floor(Date.parse(day + "T00:00:00Z") / 86400000) % TN_ROTATION.length];
let tnPlayers = {}, tnScores = {}, tnRefP = null, tnRefS = null, tnDay = null, tnGame = "bj";
let tnRng = null, tnStack = 0, tnHandN = 0, tnMe = [], tnDl = [], tnLive = false;
let tnMoves = []; // bj: hits per hand — submitted to the server, which replays the run
let tnhl = null;  // hilo run state { calls, stack, cur, round }
let tnClock = 0;

function tnDayKey(t){
  // UTC, matching the server — the day boundary picks the shoe seed, so every
  // player (and the replay in Cloud Functions) must agree on what "today" is
  const d = t || new Date();
  return d.getUTCFullYear() + "-" + String(d.getUTCMonth()+1).padStart(2,"0") + "-" + String(d.getUTCDate()).padStart(2,"0");
}

function tnInit(){
  tnDay = tnDayKey();
  tnGame = tnGameFor(tnDay);
  $("tngamename").textContent = TN_GAMES[tnGame].name;
  $("tnstepgame").textContent = TN_GAMES[tnGame].step;
  const tomorrow = tnGameFor(tnDayKey(new Date(Date.now() + 86400000)));
  $("tntomorrow").textContent = "tomorrow: " + TN_GAMES[tomorrow].name;
  tnTickClock(true); // initial paint always; the interval skips hidden tabs
  if (!tnClock) tnClock = setInterval(() => tnTickClock(false), 1000);
  const ok = fbReady && user;
  if (!ok){
    $("tnpot").textContent = "Sign in to enter";
    $("tnprizes").textContent = "";
    $("tnenter").style.display = "none"; $("tnplay").style.display = "none";
    $("tnbody").innerHTML = ""; $("tnyest").innerHTML = "";
    return;
  }
  if (tnRefP){ tnRefP.off(); tnRefS.off(); }
  tnRefP = db.ref("tourney/"+tnDay+"/players");
  tnRefS = db.ref("tourney/"+tnDay+"/scores");
  tnRefP.on("value", s => {
    tnPlayers = s.val() || {};
    tnRenderPot(); tnRenderBoard(); tnButtons();
  });
  tnRefS.on("value", s => {
    tnScores = s.val() || {};
    tnRenderBoard(); tnButtons();
  });
  tnYesterday();
  tnBannerCheck();
}
function tnTickClock(force){
  const el = $("tnclock");
  if (!el) return;
  if (!force && (document.hidden || !$("view-tourney").classList.contains("on"))) return;
  if (tnDay !== tnDayKey()){ tnInit(); return; } // day flipped while watching
  const n = new Date();
  const ms = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1) - Date.now();
  const h = Math.floor(ms/3600000), m = Math.floor(ms%3600000/60000), s = Math.floor(ms%60000/1000);
  el.textContent = h + "h " + String(m).padStart(2,"0") + "m " + String(s).padStart(2,"0") + "s";
}
/* shares normalized over however many players scored — mirrors the server */
function tnShares(nScored){
  const base = [0.5, 0.3, 0.2].slice(0, Math.min(3, Math.max(nScored, 1)));
  const norm = base.reduce((a, b) => a + b, 0);
  return base.map(x => x / norm);
}
function tnRenderPot(){
  const n = Object.keys(tnPlayers).length, pot = n * TN_BUYIN;
  $("tnpot").textContent = "POT ⛁ " + fmt(pot) + " · " + n + " entered";
  const sh = tnShares(Math.max(Object.keys(tnScores).length, Math.min(n, 3)));
  $("tnprizes").textContent = n
    ? sh.map((s, i) => "#" + (i+1) + " +" + fmt(Math.floor(pot * s))).join("   ·   ")
    : "";
}
function tnRenderBoard(){
  const n = Object.keys(tnPlayers).length, pot = n * TN_BUYIN;
  const rows = Object.entries(tnScores).map(([uid, r]) => ({ uid, ...r })).sort((a, b) => b.score - a.score);
  const sh = tnShares(rows.length);
  $("tnbody").innerHTML = rows.length ? rows.map((r, i) =>
    `<tr class="${user && r.uid === user.uid ? "me" : ""}"><td>#${i+1}</td><td>${esc(r.name || "Player")}</td><td>${r.final ? fmt(r.score) : '<i style="color:#a89878">running…</i>'}</td><td>${i < sh.length ? '<b style="color:#ffe9a8">+' + fmt(Math.floor(pot * sh[i])) + "</b>" : ""}</td></tr>`).join("")
    : '<tr><td colspan="4" style="font-style:italic;color:#a89878">Nobody has run the gauntlet yet today — first stack on the board sets the bar.</td></tr>';
  tnRenderPot();
}
function tnButtons(){
  if (!user) return;
  const entered = !!tnPlayers[user.uid], played = !!tnScores[user.uid];
  $("tnenter").style.display = entered ? "none" : "";
  $("tnplay").style.display = entered && !played && !tnLive ? "" : "none";
}
async function tnEnter(){
  if (!fbReady || !user){ toast("Sign in first"); return; }
  if (tnPlayers[user.uid]) return;
  if (chips < TN_BUYIN){ toast("Need " + fmt(TN_BUYIN) + " chips to enter"); return; }
  try {
    await callFn("tnEnter", { name: displayName || "Player" }); // server escrows the buy-in
    chipToss(); SND.chips(3);
    toast("🏆 You're in — play your run any time before midnight UTC");
  } catch(e){ toast(e.message || "Couldn't enter"); }
}
async function tnPlay(){
  if (tnLive || !user || tnScores[user.uid]) return;
  try {
    await callFn("tnBegin", { name: displayName || "Player" }); // server locks the single attempt
  } catch(e){ toast(e.message || "Couldn't start run"); return; }
  tnLive = true;
  // everyone draws from the same seeded shoe — same luck for all
  tnRng = mulberry32(hashStr("gg-gauntlet-" + tnDay));
  $("tnplay").style.display = "none";
  if (tnGame === "hilo"){
    tnhl = { calls: "", stack: TN_START, cur: seededCard(tnRng), round: 0 };
    $("tnrunhl").style.display = "";
    tnHiloPaint();
  } else {
    tnStack = TN_START; tnHandN = 0; tnMoves = [];
    $("tnrun").style.display = "";
    tnNextHand();
  }
}

/* — blackjack gauntlet run — */
function tnNextHand(){
  tnHandN++;
  if (tnHandN > TN_HANDS || tnStack < TN_BET){ tnFinish(); return; }
  tnMoves.push(0);
  tnStack -= TN_BET;
  tnMe = [seededCard(tnRng), seededCard(tnRng)];
  tnDl = [seededCard(tnRng), seededCard(tnRng)];
  tnPaint(false);
  $("tnhit").disabled = false; $("tnstand").disabled = false;
  $("tnmsg").textContent = ""; $("tnmsg").className = "msg";
}
function tnPaint(showHole){
  $("tnhand").textContent = tnHandN; $("tnstack").textContent = fmt(tnStack);
  $("tnme").innerHTML = ""; $("tndealer").innerHTML = "";
  tnMe.forEach(c => $("tnme").appendChild(cardEl(c)));
  tnDl.forEach((c, i) => $("tndealer").appendChild(cardEl(c, !showHole && i === 1)));
}
function tnHit(){
  tnMoves[tnMoves.length-1]++;
  tnMe.push(seededCard(tnRng));
  tnPaint(false);
  if (hvVal(tnMe) > 21) tnSettle();
}
function tnStand(){ tnSettle(); }
function tnSettle(){
  $("tnhit").disabled = true; $("tnstand").disabled = true;
  const p = hvVal(tnMe);
  let dT = hvVal(tnDl);
  if (p <= 21) while (dT < 17){ tnDl.push(seededCard(tnRng)); dT = hvVal(tnDl); }
  tnPaint(true);
  let m = $("tnmsg");
  if (p > 21){ m.textContent = "Bust."; m.className = "msg lose"; SND.lose(); }
  else if (dT > 21 || p > dT){ tnStack += TN_BET*2; m.textContent = "Win — +" + TN_BET; m.className = "msg win"; SND.cash(); }
  else if (p === dT){ tnStack += TN_BET; m.textContent = "Push."; m.className = "msg push"; SND.push(); }
  else { m.textContent = "Dealer takes it."; m.className = "msg lose"; SND.lose(); }
  $("tnstack").textContent = fmt(tnStack);
  setTimeout(tnNextHand, 1300);
}
async function tnFinish(){
  tnLive = false;
  $("tnrun").style.display = "none";
  try {
    // the server replays the run from the day seed + our moves and writes the score itself
    const r = await callFn("tnSubmit", { moves: tnMoves });
    toast("🏆 Gauntlet done — final stack " + fmt(r.score));
    SND.win(r.score > TN_START);
  } catch(e){ toast(e.message || "Couldn't submit run"); }
}

/* — hi-lo gauntlet run — */
function tnHiloPaint(msg, cls){
  $("tnhlround").textContent = Math.min(tnhl.round + 1, TN_HANDS);
  $("tnhlstack").textContent = fmt(tnhl.stack);
  $("tnhlcard").innerHTML = ""; $("tnhlcard").appendChild(cardEl(tnhl.cur));
  $("tnhlmsg").textContent = msg || ""; $("tnhlmsg").className = "msg " + (cls || "");
}
function tnHiloCall(c){
  if (!tnhl || !tnLive || tnhl.round >= TN_HANDS || tnhl.stack < TN_BET) return;
  tnhl.calls += c; tnhl.round++; tnhl.stack -= TN_BET;
  const next = seededCard(tnRng);
  const good = c === "h" ? warRank(next) >= warRank(tnhl.cur) : warRank(next) <= warRank(tnhl.cur);
  if (good){ tnhl.stack += TN_BET * 2; SND.cash(); } else SND.lose();
  tnhl.cur = next;
  tnHiloPaint(good ? "Called it — +" + TN_BET : "Wrong — −" + TN_BET, good ? "win" : "lose");
  if (tnhl.round >= TN_HANDS || tnhl.stack < TN_BET) setTimeout(tnHiloFinish, 1000);
}
async function tnHiloFinish(){
  if (!tnLive) return;
  tnLive = false;
  $("tnrunhl").style.display = "none";
  try {
    const r = await callFn("tnSubmit", { moves: tnhl.calls });
    toast("🏆 Gauntlet done — final stack " + fmt(r.score));
    SND.win(r.score > TN_START);
  } catch(e){ toast(e.message || "Couldn't submit run"); }
}

/* — yesterday's podium (server settles lazily if the scheduler hasn't yet) — */
async function tnYesterday(){
  try {
    const r = await callFn("tnResults", {});
    $("tnyest").innerHTML = r.results && r.results.length
      ? r.results.map(x =>
          `<div class="duelrow"><div class="dl">${["🥇","🥈","🥉"][x.rank-1] || "·"} <b>${esc(x.name)}</b> · stack ${fmt(x.score)}</div><span class="ds">+${fmt(x.share)}</span></div>`).join("")
      : '<div style="color:#a89878;font-style:italic;font-family:\'Playfair Display\',serif">No tournament ran yesterday — today could be the first.</div>';
  } catch(e){ $("tnyest").innerHTML = ""; }
}
/* "you placed" banner — the rollover wrote users/$uid/tourneyMsg; show once, clear it */
async function tnBannerCheck(){
  if (!fbReady || !user) return;
  try {
    const ref = db.ref("users/"+user.uid+"/tourneyMsg");
    const v = (await ref.get()).val();
    if (!v) return;
    ref.remove();
    const b = $("tnbanner");
    b.style.display = "";
    b.innerHTML = `🏆 You placed <b>#${v.rank}</b> in the ${esc(v.day)} gauntlet — <b>+${fmt(v.share)}</b> chips, already in your balance.`;
    confetti(innerWidth/2, innerHeight*0.3, 180, true); SND.win(true);
    refreshChips();
  } catch(e){}
}
