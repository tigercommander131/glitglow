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

/* replay the gauntlet: same public day seed as the client, moves = hits per hand */
function gauntletReplay(day, moves){
  const rng = mulberry32(hashStr("gg-gauntlet-" + day));
  let stack = TN_START;
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
  const moves = Array.isArray(data.moves) ? data.moves.slice(0, TN_HANDS) : [];
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

exports.tnClaim = callable(async (data, ctx) => {
  const uid = needAuth(ctx);
  const yday = dayKey(new Date(Date.now() - 86400000));
  const v = (await db.ref(`tourney/${yday}`).get()).val();
  if (!v || !v.scores || !v.players) fail("not-found", "No tournament yesterday");
  const rows = Object.entries(v.scores).map(([u, r]) => ({ uid: u, ...r })).sort((a, b) => b.score - a.score);
  const rank = rows.findIndex(r => r.uid === uid);
  if (rank < 0 || rank > 2) fail("failed-precondition", "You didn't place top 3");
  const pot = Object.keys(v.players).length * TN_BUYIN;
  const share = Math.floor(pot * [0.5, 0.3, 0.2][rank]);
  const res = await db.ref(`tourney/${yday}/claims/${uid}`).transaction(c => c == null ? share : undefined);
  if (!res.committed) fail("already-exists", "Prize already claimed");
  const chips = await moveChips(uid, +share);
  if (rank === 0) await bumpPub(uid, "tourneyCrowns", 1);
  await pushFeed({ type: "tourney", win: rows[rank].name || "Player", rank: rank + 1, stake: share });
  return { share, rank: rank + 1, chips };
});
