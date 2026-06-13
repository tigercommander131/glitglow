/* ════════════════════════════════════════════════════════════════════
   GILT & GLOW — server-authoritative competitive layer (Phase 1)

   Callables (region asia-southeast1, matching the RTDB instance):
     duelCreate / duelJoin / duelCancel  — transactional chip escrow,
                                           server-generated RNG seed
     duelSettle                          — replays the duel from seed+moves,
                                           pays the pot exactly once
     duelTimeout                         — server-validated forfeit claim
     tnEnter / tnBegin / tnSubmit        — buy-in escrow, attempt lock,
                                           full deterministic replay of the
                                           gauntlet from the day seed
     tnClaim                             — rank-validated, pay-once prize

   Trust model: solo games stay client-trusted by design; everything that
   feeds competition (duels, tournament, users/$uid/pub stats) is written
   only here. database.rules.json locks the corresponding paths.
   ════════════════════════════════════════════════════════════════════ */
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const crypto = require("crypto");

// in the emulator suite the RTDB lives at FIREBASE_DATABASE_EMULATOR_HOST; in prod it's the asia-southeast1 instance
const DB_URL = process.env.FIREBASE_DATABASE_EMULATOR_HOST
  ? `http://${process.env.FIREBASE_DATABASE_EMULATOR_HOST}/?ns=giltglow-hub-default-rtdb`
  : "https://giltglow-hub-default-rtdb.asia-southeast1.firebasedatabase.app";
console.log("[giltglow] database:", DB_URL);
admin.initializeApp({ databaseURL: DB_URL });
const db = admin.database();
const REGION = "asia-southeast1";
const callable = handler => functions.region(REGION).https.onCall(handler);
const fail = (code, msg) => { throw new functions.https.HttpsError(code, msg); };
const needAuth = ctx => { if (!ctx.auth) fail("unauthenticated", "Sign in first"); return ctx.auth.uid; };

/* ── deterministic game kernel — ported verbatim from js/core/rng.js ── */
function mulberry32(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hashStr(s){
  let h = 2166136261;
  for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const SUITS = ["♠","♥","♦","♣"], RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
function seededCard(rng){
  const r = RANKS[(rng()*13)|0], s = SUITS[(rng()*4)|0];
  return { r, s, red: s === "♥" || s === "♦" };
}
function hvVal(h){
  let t = 0, a = 0;
  for (const c of h){ t += c.r === "A" ? 11 : "JQK".includes(c.r) ? 10 : +c.r; if (c.r === "A") a++; }
  while (t > 21 && a){ t -= 10; a--; }
  return t;
}
const warRank = c => c.r === "A" ? 14 : c.r === "K" ? 13 : c.r === "Q" ? 12 : c.r === "J" ? 11 : +c.r;

/* ── chip movement: the only place competitive code touches balances ──
   RTDB transactions first run against an unprimed local cache (v === null);
   returning undefined there aborts instantly instead of consulting the server.
   So: read the server value first, use it as the null-fallback — the SDK
   re-runs the callback with the real value if the optimistic write loses. */
async function moveChips(uid, delta){
  const ref = db.ref(`users/${uid}/chips`);
  const first = (await ref.get()).val();
  if (typeof first !== "number") fail("failed-precondition", "No account balance");
  const res = await ref.transaction(v => {
    const cur = typeof v === "number" ? v : first;
    if (delta < 0 && cur + delta < 0) return; // abort — insufficient
    return Math.floor(cur + delta);
  });
  if (!res.committed) fail("failed-precondition", "Not enough chips");
  return res.snapshot.val();
}
async function bumpPub(uid, key, delta){
  await db.ref(`users/${uid}/pub/${key}`).transaction(v => (v || 0) + delta);
}

/* ════════ DUELS ════════ */
const DUEL_GAMES = new Set(["war", "rr", "bj", "mines", "hilo", "crash"]);
/* commit-pattern games: each player writes moves/{host|guest} once, server replays both */
const COMMIT_GAMES = new Set(["bj", "mines", "hilo", "crash"]);

exports.duelCreate = callable(async (data, ctx) => {
  const uid = needAuth(ctx);
  const game = String(data.game || ""), stake = Math.floor(Number(data.stake));
  const name = String(data.name || "Player").slice(0, 24);
  if (!DUEL_GAMES.has(game)) fail("invalid-argument", "Unknown duel game");
  if (!Number.isFinite(stake) || stake < 50 || stake > 1e9) fail("invalid-argument", "Stake must be at least 50");
  const chips = await moveChips(uid, -stake);
  const ref = db.ref("duels/open").push();
  await ref.set({ game, stake, host: { uid, name }, at: Date.now() });
  return { id: ref.key, chips };
});

/* atomically claim an open challenge via a claimedBy flag (null-safe pattern —
   the flag transaction creates no false aborts). Caller must release() on any
   bail-out path, or remove() the node once consumed. */
async function claimOpen(id, uid){
  const ref = db.ref(`duels/open/${id}`);
  if (!(await ref.get()).exists()) fail("not-found", "Challenge already taken");
  const res = await ref.child("claimedBy").transaction(v => v === null ? uid : undefined);
  if (!res.committed) fail("not-found", "Challenge already taken");
  const open = (await ref.get()).val();
  if (!open || !open.host){ await ref.remove(); fail("not-found", "Challenge already taken"); }
  return { open, release: () => ref.child("claimedBy").remove(), consume: () => ref.remove() };
}

exports.duelJoin = callable(async (data, ctx) => {
  const uid = needAuth(ctx);
  const id = String(data.id || "");
  const name = String(data.name || "Player").slice(0, 24);
  const { open, release, consume } = await claimOpen(id, uid);
  if (open.host.uid === uid){ await release(); fail("failed-precondition", "That's your own challenge"); }
  try {
    await moveChips(uid, -open.stake);
  } catch (e) {
    await release(); // give other joiners their shot back
    throw e;
  }
  const seed = crypto.randomInt(0, 2 ** 31); // server-chosen — neither player can pick their luck
  await db.ref(`duels/live/${id}`).set({
    game: open.game, stake: open.stake, host: open.host,
    guest: { uid, name }, seed, state: "play", started: Date.now()
  });
  await consume();
  const chips = (await db.ref(`users/${uid}/chips`).get()).val();
  return { id, chips };
});

exports.duelCancel = callable(async (data, ctx) => {
  const uid = needAuth(ctx);
  const id = String(data.id || "");
  const { open, release, consume } = await claimOpen(id, uid);
  if (open.host.uid !== uid){ await release(); fail("permission-denied", "Not your challenge"); }
  await consume();
  const chips = await moveChips(uid, +open.stake);
  return { chips };
});

/* replay a duel from its seed + moves; null = not finished yet */
function duelOutcome(d){
  const rng = mulberry32(d.seed);
  if (d.game === "war"){
    let pc, hc, hands = 0;
    do { pc = seededCard(rng); hc = seededCard(rng); hands++; }
    while (warRank(pc) === warRank(hc) && hands < 8);
    if (warRank(pc) === warRank(hc)) return { winner: "split", how: "dead heat" };
    return { winner: warRank(pc) > warRank(hc) ? d.host.uid : d.guest.uid,
             how: hands > 1 ? `after ${hands - 1} tie${hands > 2 ? "s" : ""}` : "" };
  }
  if (d.game === "rr"){
    const bullet = (rng() * 6) | 0;
    const moves = Object.entries(d.moves || {}).sort((a, b) => a[0] < b[0] ? -1 : 1).map(e => e[1]);
    // host pulls on even move indices — reject out-of-turn pulls
    for (let i = 0; i < moves.length; i++){
      const expect = i % 2 === 0 ? d.host.uid : d.guest.uid;
      if (moves[i].uid !== expect) return { winner: expect === d.host.uid ? d.guest.uid : d.host.uid, how: "out-of-turn pull" };
    }
    if (moves.length - 1 !== bullet) return null; // chamber not reached yet
    const loserHost = (moves.length - 1) % 2 === 0;
    return { winner: loserHost ? d.guest.uid : d.host.uid, how: `chamber ${moves.length}` };
  }
  if (d.game === "bj"){
    const m = d.moves || {};
    if (!m.host || !m.guest) return null;
    // recompute each hand from the seed — a forged total forfeits the duel
    const handFor = role => {
      const r = mulberry32(d.seed ^ hashStr(role));
      const cards = [];
      for (let i = 0; i < Math.min(Number(m[role].n) || 2, 12); i++) cards.push(seededCard(r));
      return hvVal(cards);
    };
    const tHost = handFor("host"), tGuest = handFor("guest");
    if (tHost !== Number(m.host.total)) return { winner: d.guest.uid, how: "host hand mismatch" };
    if (tGuest !== Number(m.guest.total)) return { winner: d.host.uid, how: "guest hand mismatch" };
    const dr = mulberry32(d.seed ^ 0xBEEF);
    const dCards = [seededCard(dr), seededCard(dr)];
    let dT = hvVal(dCards);
    while (dT < 17){ dCards.push(seededCard(dr)); dT = hvVal(dCards); }
    const res = t => t > 21 ? -1 : (dT > 21 ? 1 : Math.sign(t - dT));
    const rh = res(tHost), rg = res(tGuest);
    if (rh === rg) return { winner: "split", how: `${tHost} vs ${tGuest} · dealer ${dT}` };
    return { winner: rh > rg ? d.host.uid : d.guest.uid, how: `${tHost} vs ${tGuest} · dealer ${dT}` };
  }
  if (d.game === "mines"){
    const m = d.moves || {};
    if (!m.host || !m.guest) return null;
    // shared minefield from the seed; score = gems before stopping, 0 if you hit a mine
    const mines = new Set();
    while (mines.size < 5) mines.add((rng() * 25) | 0);
    const score = role => {
      const seen = new Set(); let gems = 0;
      for (const p of (Array.isArray(m[role].picks) ? m[role].picks : []).slice(0, 20)){
        const i = Math.floor(Number(p));
        if (!(i >= 0 && i < 25) || seen.has(i)) continue;
        seen.add(i);
        if (mines.has(i)) return 0; // boom
        gems++;
      }
      return gems;
    };
    const sh = score("host"), sg = score("guest");
    const how = `${sh} vs ${sg} gems`;
    if (sh === sg) return { winner: "split", how };
    return { winner: sh > sg ? d.host.uid : d.guest.uid, how };
  }
  if (d.game === "hilo"){
    const m = d.moves || {};
    if (!m.host || !m.guest) return null;
    // both replay the SAME card stream; streak = consecutive correct calls (ties count)
    const streak = role => {
      const r = mulberry32(d.seed);
      let cur = seededCard(r), n = 0;
      for (const call of String(m[role].calls || "").slice(0, 20)){
        const next = seededCard(r);
        const okCall = call === "h" ? warRank(next) >= warRank(cur) : warRank(next) <= warRank(cur);
        if (!okCall) return n;
        n++; cur = next;
      }
      return n;
    };
    const sh = streak("host"), sg = streak("guest");
    const how = `streak ${sh} vs ${sg}`;
    if (sh === sg) return { winner: "split", how };
    return { winner: sh > sg ? d.host.uid : d.guest.uid, how };
  }
  if (d.game === "crash"){
    const m = d.moves || {};
    if (!m.host || !m.guest) return null;
    // same curve for both: commit a target multiplier, bust if it's past the crash point
    const point = Math.max(1.0, Math.floor((0.97 / (1 - rng())) * 100) / 100);
    const score = role => {
      const t = Math.round(Math.min(Math.max(Number(m[role].target) || 0, 1.01), 1000) * 100) / 100;
      return t <= point ? t : 0;
    };
    const sh = score("host"), sg = score("guest");
    const how = `crashed at ${point.toFixed(2)}× · ${sh ? sh.toFixed(2) + "×" : "bust"} vs ${sg ? sg.toFixed(2) + "×" : "bust"}`;
    if (sh === sg) return { winner: "split", how };
    return { winner: sh > sg ? d.host.uid : d.guest.uid, how };
  }
  return null;
}

async function settleDuel(id, duel, outcome){
  // win the settled flag exactly once; payouts only follow a committed claim
  const res = await db.ref(`duels/live/${id}/settled`).transaction(v => v === null ? true : undefined);
  if (!res.committed) fail("failed-precondition", "Already settled");
  const stake = duel.stake;
  if (outcome.winner === "split"){
    await Promise.all([moveChips(duel.host.uid, +stake), moveChips(duel.guest.uid, +stake)]);
  } else {
    await moveChips(outcome.winner, stake * 2);
    await Promise.all([bumpPub(outcome.winner, "duelWins", 1), bumpPub(outcome.winner, "duelEarnings", stake)]);
  }
  await db.ref(`duels/live/${id}`).update({ state: "done", winner: outcome.winner, how: outcome.how || "" });
  const winName = outcome.winner === "split" ? null
    : (outcome.winner === duel.host.uid ? duel.host.name : duel.guest.name);
  const loseName = outcome.winner === "split" ? null
    : (outcome.winner === duel.host.uid ? duel.guest.name : duel.host.name);
  await pushFeed({ type: "duel", game: duel.game, win: winName, lose: loseName, stake, split: outcome.winner === "split" });
  return { winner: outcome.winner, how: outcome.how || "" };
}

/* ── winners feed: server-written, world-readable, last ~40 events ── */
async function pushFeed(ev){
  const ref = db.ref("feed").push();
  await ref.set({ ...ev, at: Date.now() });
  const all = (await db.ref("feed").orderByKey().get()).val() || {};
  const keys = Object.keys(all).sort();
  if (keys.length > 40) await db.ref("feed").update(Object.fromEntries(keys.slice(0, keys.length - 40).map(k => [k, null])));
}

exports.duelSettle = callable(async (data, ctx) => {
  const uid = needAuth(ctx);
  const id = String(data.id || "");
  const d = (await db.ref(`duels/live/${id}`).get()).val();
  if (!d || !d.guest) fail("not-found", "No such duel");
  if (uid !== d.host.uid && uid !== d.guest.uid) fail("permission-denied", "Not your duel");
  if (d.settled || d.state === "done") fail("failed-precondition", "Already settled");
  const outcome = duelOutcome(d);
  if (!outcome) fail("failed-precondition", "Duel not finished");
  return settleDuel(id, d, outcome);
});

exports.duelTimeout = callable(async (data, ctx) => {
  const uid = needAuth(ctx);
  const id = String(data.id || "");
  const d = (await db.ref(`duels/live/${id}`).get()).val();
  if (!d || !d.guest) fail("not-found", "No such duel");
  if (uid !== d.host.uid && uid !== d.guest.uid) fail("permission-denied", "Not your duel");
  if (d.settled || d.state === "done") fail("failed-precondition", "Already settled");
  if (duelOutcome(d)) fail("failed-precondition", "Duel is finished — settle it instead");
  // whose move is it? that player is the one who can time out
  let waitingOn, lastT;
  if (d.game === "rr"){
    const moves = Object.entries(d.moves || {}).sort((a, b) => a[0] < b[0] ? -1 : 1).map(e => e[1]);
    waitingOn = moves.length % 2 === 0 ? d.host.uid : d.guest.uid;
    lastT = moves.length ? moves[moves.length - 1].t : d.started;
  } else if (COMMIT_GAMES.has(d.game)){
    const m = d.moves || {};
    const mine = uid === d.host.uid ? "host" : "guest", theirs = mine === "host" ? "guest" : "host";
    if (!m[mine]) fail("failed-precondition", "Lock in your own play first");
    waitingOn = d[theirs].uid;
    lastT = m[mine].t || d.started;
  } else fail("failed-precondition", "This duel can't time out");
  if (waitingOn === uid) fail("failed-precondition", "It's your turn");
  if (Date.now() - lastT < 75000) fail("failed-precondition", "Opponent still has time");
  return settleDuel(id, d, { winner: uid, how: "opponent timed out" });
});

/* ════════ DAILY TOURNAMENT ════════ */
const TN_BUYIN = 1000, TN_HANDS = 10, TN_START = 500, TN_BET = 50;
// UTC everywhere — functions run in UTC and players span timezones; the day
// boundary (and therefore the shoe seed) must be the same for everyone
const dayKey = t => {
  const d = t || new Date();
  return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");
};

exports.tnEnter = callable(async (data, ctx) => {
  const uid = needAuth(ctx);
  const name = String(data.name || "Player").slice(0, 24);
  const day = dayKey();
  const pRef = db.ref(`tourney/${day}/players/${uid}`);
  if ((await pRef.get()).exists()) fail("already-exists", "Already entered today");
  const chips = await moveChips(uid, -TN_BUYIN);
  await pRef.set({ name, at: Date.now() });
  return { day, chips };
});

exports.tnBegin = callable(async (data, ctx) => {
  const uid = needAuth(ctx);
  const name = String(data.name || "Player").slice(0, 24);
  const day = dayKey();
  if (!(await db.ref(`tourney/${day}/players/${uid}`).get()).exists()) fail("failed-precondition", "Enter first");
  // placeholder locks the single attempt even if they bail mid-run
  const res = await db.ref(`tourney/${day}/scores/${uid}`).transaction(v =>
    v == null ? { name, score: 0, at: Date.now() } : undefined);
  if (!res.committed) fail("already-exists", "You already ran today's gauntlet");
  return { day };
});

/* the gauntlet game rotates on a fixed UTC-day schedule — deterministic on
   both sides, no server state, and the client can show what's coming up */
const TN_ROTATION = ["bj", "hilo"];
const tnGameFor = day => TN_ROTATION[Math.floor(Date.parse(day + "T00:00:00Z") / 86400000) % TN_ROTATION.length];

/* replay the gauntlet: same public day seed as the client.
   bj:   moves = array of hits per hand
   hilo: moves = string of h/l calls, one card stream, ties are kind */
function gauntletReplay(day, moves){
  const rng = mulberry32(hashStr("gg-gauntlet-" + day));
  const game = tnGameFor(day);
  let stack = TN_START;
  if (game === "hilo"){
    let cur = seededCard(rng);
    const calls = String(moves || "").slice(0, TN_HANDS);
    for (const c of calls){
      if (stack < TN_BET) break;
      if (c !== "h" && c !== "l") break;
      stack -= TN_BET;
      const next = seededCard(rng);
      const good = c === "h" ? warRank(next) >= warRank(cur) : warRank(next) <= warRank(cur);
      if (good) stack += TN_BET * 2;
      cur = next;
    }
    return stack;
  }
  // blackjack
  for (let hand = 0; hand < TN_HANDS; hand++){
    if (stack < TN_BET) break;
    stack -= TN_BET;
    const me = [seededCard(rng), seededCard(rng)];
    const dl = [seededCard(rng), seededCard(rng)];
    const hits = Math.min(Math.max(Number(moves[hand]) || 0, 0), 10);
    for (let i = 0; i < hits; i++){
      me.push(seededCard(rng));
      if (hvVal(me) > 21) break; // client auto-settles on bust; extra hits are ignored
    }
    const p = hvVal(me);
    let dT = hvVal(dl);
    if (p <= 21) while (dT < 17){ dl.push(seededCard(rng)); dT = hvVal(dl); }
    if (p > 21) continue;
    if (dT > 21 || p > dT) stack += TN_BET * 2;
    else if (p === dT) stack += TN_BET;
  }
  return stack;
}

exports.tnSubmit = callable(async (data, ctx) => {
  const uid = needAuth(ctx);
  const day = dayKey();
  const moves = tnGameFor(day) === "hilo"
    ? String(data.moves || "").slice(0, TN_HANDS)
    : (Array.isArray(data.moves) ? data.moves.slice(0, TN_HANDS) : []);
  const score = gauntletReplay(day, moves);
  // only overwrite the tnBegin placeholder — never a finalized score
  // (read first: the transaction's null-cache run needs a server-truth fallback)
  const pre = (await db.ref(`tourney/${day}/scores/${uid}`).get()).val();
  if (!pre || pre.final) fail("failed-precondition", "Run already submitted (or never started)");
  const res = await db.ref(`tourney/${day}/scores/${uid}`).transaction(v => {
    const cur = v === null ? pre : v;
    if (!cur || cur.final) return;
    return { name: cur.name || "Player", score, at: Date.now(), final: true };
  });
  if (!res.committed) fail("failed-precondition", "Run already submitted (or never started)");
  return { day, score };
});

/* ── AUTO-SETTLEMENT — the claim button is dead; the house pays at rollover ──
   Idempotent (transaction on tourney/$day/settled). Shares are normalized over
   however many players actually scored, so no chips are ever burned:
   3+ → 50/30/20 · 2 → 62.5/37.5 · 1 → 100% (their buy-in back). */
async function tnSettleDay(day){
  const ref = db.ref(`tourney/${day}`);
  const v = (await ref.get()).val();
  if (!v || !v.players || !v.scores) return { day, results: [], reason: "no event" };
  if (v.claims){ // claim-era day: prizes were (or could have been) claimed manually — never double-pay
    await ref.child("settled").set(true);
    return { day, results: [], reason: "claim-era day" };
  }
  const lock = await ref.child("settled").transaction(x => x === null ? true : undefined);
  if (!lock.committed) return { day, results: (v.results || []), reason: "already settled" };
  const rows = Object.entries(v.scores).map(([u, r]) => ({ uid: u, ...r })).sort((a, b) => b.score - a.score);
  const pot = Object.keys(v.players).length * TN_BUYIN;
  const base = [0.5, 0.3, 0.2].slice(0, Math.min(3, rows.length));
  const norm = base.reduce((a, b) => a + b, 0);
  const results = [];
  for (let i = 0; i < base.length; i++){
    const share = Math.floor(pot * base[i] / norm);
    const r = rows[i];
    try { await moveChips(r.uid, +share); } catch (e) { /* deleted account — skip payout, keep settling */ }
    results.push({ uid: r.uid, name: r.name || "Player", rank: i + 1, score: r.score, share });
    await db.ref(`users/${r.uid}/tourneyMsg`).set({ day, rank: i + 1, share }); // "you placed" banner, client clears it
    if (i === 0) await bumpPub(r.uid, "tourneyCrowns", 1);
    await pushFeed({ type: "tourney", win: r.name || "Player", rank: i + 1, stake: share });
  }
  await ref.child("results").set(results);
  return { day, results };
}

/* fires daily at 00:05 UTC, settles the day that just closed */
exports.tnRollover = functions.region(REGION).pubsub.schedule("5 0 * * *").timeZone("Etc/UTC")
  .onRun(() => tnSettleDay(dayKey(new Date(Date.now() - 86400000))));

/* yesterday's results for the client — also the lazy fallback if the scheduler
   ever misses: first viewer after midnight triggers the (idempotent) settle */
exports.tnResults = callable(async (data, ctx) => {
  needAuth(ctx);
  const yday = dayKey(new Date(Date.now() - 86400000));
  const settled = (await db.ref(`tourney/${yday}/settled`).get()).val();
  if (settled){
    const results = (await db.ref(`tourney/${yday}/results`).get()).val() || [];
    return { day: yday, game: tnGameFor(yday), results };
  }
  const r = await tnSettleDay(yday);
  return { day: yday, game: tnGameFor(yday), results: r.results || [] };
});

/* ════════════════════════════════════════════════════════════════════
   LIVE MULTIPLAYER ROOMS — real-time tables in the Arena

   rooms/open/$id      lobby listing (server-written; clients read only)
   rooms/live/$id      live table state; clients write only their own
                       presence flag + a one-shot bet during "betting"
   roomseeds/$id       server-only spin seed (commit-reveal — clients
                       must not see it before settle or they'd precompute)

   Money model (PvP on a shared draw): every seat antes `stake` into the
   pot; the player whose bets pay the most on the one shared result takes
   the pot (ties split; a dead round refunds everyone). The ante is also
   each player's betting budget — bets summing over it forfeit the round,
   so the open bet-write rule can't be abused to "buy" a win.
   ════════════════════════════════════════════════════════════════════ */
const ROOM_GAMES = new Set(["roulette"]);
const ROOM_MIN_STAKE = 50, ROOM_MAX_SEATS = 6, ROOM_BET_MS = 20000;
const RWHEEL = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const RREDS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
function spinPocket(seed){ const rng = mulberry32(hashStr("roulette|" + seed)); return RWHEEL[(rng() * RWHEEL.length) | 0]; }
function roulettePayout(board, n){
  let pay = 0;
  for (const [k, raw] of Object.entries(board || {})){
    const v = Math.max(0, Math.floor(Number(raw)) || 0);
    if (k === "n" + n) pay += v * 36;
    else if (k === "red" && n && RREDS.has(n)) pay += v * 2;
    else if (k === "blk" && n && !RREDS.has(n)) pay += v * 2;
    else if (k === "odd" && n && n % 2 === 1) pay += v * 2;
    else if (k === "even" && n && n % 2 === 0) pay += v * 2;
    else if (k === "lo" && n >= 1 && n <= 18) pay += v * 2;
    else if (k === "hi" && n >= 19) pay += v * 2;
    else if (k === "dz1" && n >= 1 && n <= 12) pay += v * 3;
    else if (k === "dz2" && n >= 13 && n <= 24) pay += v * 3;
    else if (k === "dz3" && n >= 25) pay += v * 3;
    else if (k.startsWith("col") && n && n % 3 === (+k[3]) % 3) pay += v * 3;
  }
  return pay;
}
function boardTotal(board){ return Object.values(board || {}).reduce((a, v) => a + (Math.max(0, Math.floor(Number(v)) || 0)), 0); }

exports.roomCreate = callable(async (data, ctx) => {
  const uid = needAuth(ctx);
  const game = String(data.game || ""), name = String(data.name || "Player").slice(0, 24);
  const seats = Math.min(ROOM_MAX_SEATS, Math.max(2, Math.floor(Number(data.seats) || 2)));
  const stake = Math.floor(Number(data.stake));
  if (!ROOM_GAMES.has(game)) fail("invalid-argument", "Unknown game");
  if (!Number.isFinite(stake) || stake < ROOM_MIN_STAKE || stake > 1e9) fail("invalid-argument", "Stake must be at least " + ROOM_MIN_STAKE);
  const chips = await moveChips(uid, -stake);
  const ref = db.ref("rooms/open").push();
  await ref.set({ game, seats, stake, host: { uid, name }, players: { [uid]: { name, seat: 0, at: Date.now() } }, taken: 1, status: "waiting", createdAt: Date.now() });
  return { id: ref.key, chips };
});

exports.roomJoin = callable(async (data, ctx) => {
  const uid = needAuth(ctx);
  const id = String(data.id || ""), name = String(data.name || "Player").slice(0, 24);
  const ref = db.ref(`rooms/open/${id}`);
  const snap = await ref.get();                          // read-first primes the cache (claimOpen pattern)
  if (!snap.exists()) fail("not-found", "Table is no longer open");
  const room = snap.val();
  if (room.status !== "waiting") fail("failed-precondition", "Table already started");
  if (room.players && room.players[uid]) fail("failed-precondition", "You're already seated");
  // atomic capacity gate: a scalar transaction on the seat count, aborting when full —
  // reliable under the admin SDK in a way that whole-object mutate transactions are not
  const claim = await ref.child("taken").transaction(t => { const cur = t || 0; return cur >= room.seats ? undefined : cur + 1; });
  if (!claim.committed) fail("failed-precondition", "Table is full");
  const seat = claim.snapshot.val() - 1;
  await ref.child(`players/${uid}`).set({ name, seat, at: Date.now() });
  try {
    const chips = await moveChips(uid, -room.stake);
    return { id, chips };
  } catch(e){                                            // broke — release the seat
    await ref.child(`players/${uid}`).remove();
    await ref.child("taken").transaction(v => Math.max(0, (v || 1) - 1));
    throw e;
  }
});

exports.roomLeave = callable(async (data, ctx) => {
  const uid = needAuth(ctx);
  const id = String(data.id || "");
  const ref = db.ref(`rooms/open/${id}`);
  const snap = await ref.get();
  if (!snap.exists()) return { ok: true };               // already started or gone
  const room = snap.val();
  if (room.status !== "waiting") fail("failed-precondition", "Table already started");
  if (!room.players || !room.players[uid]) fail("failed-precondition", "You're not at this table");
  if (room.host.uid === uid){                            // host bails → cancel, refund everyone
    await Promise.all(Object.keys(room.players).map(p => moveChips(p, +room.stake)));
    await ref.remove();
    return { ok: true, cancelled: true };
  }
  // remove-before-refund: if anything fails mid-way the seat is gone but no chips were minted,
  // and the read check above already rejects a stale double-leave
  await ref.child(`players/${uid}`).remove();
  await ref.child("taken").transaction(v => Math.max(0, (v || 1) - 1));  // returns a value on null → no abort-trap
  await moveChips(uid, +room.stake);
  return { ok: true };
});

exports.roomStart = callable(async (data, ctx) => {
  const uid = needAuth(ctx);
  const id = String(data.id || "");
  const ref = db.ref(`rooms/open/${id}`);
  const snap = await ref.get();
  if (!snap.exists()) fail("not-found", "Table is no longer open");
  const room = snap.val();
  if (room.host.uid !== uid) fail("permission-denied", "Only the host can start the table");
  if (Object.keys(room.players || {}).length < 2) fail("failed-precondition", "Need at least 2 players to start");
  // scalar gate so two start clicks can't double-fire the live table; prime the cold-null
  // first pass with the value we just read so it doesn't spuriously abort
  const claim = await ref.child("status").transaction(s => ((s === null ? room.status : s) === "waiting" ? "starting" : undefined));
  if (!claim.committed) fail("failed-precondition", "Table is already starting");
  const seed = crypto.randomBytes(8).toString("hex");
  const players = {};
  for (const [p, info] of Object.entries(room.players)) players[p] = { name: info.name, seat: info.seat, connected: false };
  await db.ref(`roomseeds/${id}`).set(seed);             // server-only until settle
  await db.ref(`rooms/live/${id}`).set({ game: room.game, stake: room.stake, seats: room.seats, host: room.host.uid, players, phase: "betting", deadline: Date.now() + ROOM_BET_MS, createdAt: Date.now(), settled: false });
  await ref.remove();                                    // out of the lobby
  return { id, deadline: Date.now() + ROOM_BET_MS };
});

exports.roomSettle = callable(async (data, ctx) => {
  const uid = needAuth(ctx);
  const id = String(data.id || "");
  const live = (await db.ref(`rooms/live/${id}`).get()).val();
  if (!live) fail("not-found", "No such table");
  if (!live.players || !live.players[uid]) fail("permission-denied", "Not at this table");
  if (live.settled) return { ...(live.result || {}), already: true };
  if (Date.now() < live.deadline - 1500 && uid !== live.host) fail("failed-precondition", "Betting is still open");
  const claim = await db.ref(`rooms/live/${id}/settled`).transaction(v => v ? undefined : true);
  if (!claim.committed){ const cur = (await db.ref(`rooms/live/${id}`).get()).val(); return { ...((cur && cur.result) || {}), already: true }; }
  const seed = (await db.ref(`roomseeds/${id}`).get()).val();
  const n = spinPocket(seed);
  const bets = (await db.ref(`rooms/live/${id}/bets`).get()).val() || {};
  const seated = Object.keys(live.players);
  const scores = {};
  let best = -1;
  for (const p of seated){
    const board = bets[p] && bets[p].board;
    const score = boardTotal(board) > live.stake ? 0 : roulettePayout(board, n);   // over-budget bets forfeit
    scores[p] = score;
    if (score > best) best = score;
  }
  const winners = seated.filter(p => scores[p] === best && best > 0);
  const pot = live.stake * seated.length;
  const payees = winners.length ? winners : seated;       // dead round → ante refunded to all
  const share = Math.floor(pot / payees.length);
  await Promise.all(payees.map(p => moveChips(p, +share)));
  if (winners.length){
    const profit = Math.max(0, share - live.stake);
    await Promise.all(winners.map(p => Promise.all([bumpPub(p, "roomWins", 1), bumpPub(p, "roomEarnings", profit)])));
  }
  const result = { pocket: n, seed, scores, winners: payees, share, pot, dead: winners.length === 0, at: Date.now() };
  await db.ref(`rooms/live/${id}`).update({ phase: "done", result });
  await db.ref(`roomseeds/${id}`).remove();
  await pushFeed({ type: "room", game: live.game, win: payees.map(p => live.players[p].name).join(", "), stake: live.stake, pot, seats: seated.length });
  return result;
});
