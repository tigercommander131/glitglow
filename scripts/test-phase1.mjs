/* Phase-1 verification against the Firebase emulator suite.
   Run:  npx firebase emulators:exec --only auth,functions,database "node scripts/test-phase1.mjs"
   Covers: duel escrow/join race/cancel/settle/idempotency/anti-cheat,
   RR timeout, tournament enter/begin/replay/claim, and the database rules. */

const PROJECT = "giltglow-hub", REGION = "asia-southeast1", NS = "giltglow-hub-default-rtdb";
// emulators:exec injects the actual hosts — never hardcode (the DB emulator may auto-shift ports)
const AUTH = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || "localhost:9099"}`;
const DB = `http://${process.env.FIREBASE_DATABASE_EMULATOR_HOST || "localhost:9000"}`;
const FN = `http://localhost:5001/${PROJECT}/${REGION}`;
console.log("emulators:", { AUTH, DB, FN });

let pass = 0, failures = [];
const ok = (cond, label) => { if (cond) pass++; else failures.push(label); console.log((cond ? "  ✓ " : "  ✗ ") + label); };

/* ── deterministic kernel (mirror of functions/index.js) ── */
function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function hashStr(s){ let h=2166136261; for (let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); } return h>>>0; }
const SUITS=["♠","♥","♦","♣"], RANKS=["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
const seededCard = rng => { const r=RANKS[(rng()*13)|0], s=SUITS[(rng()*4)|0]; return { r, s, red: s==="♥"||s==="♦" }; };
function hvVal(h){ let t=0,a=0; for (const c of h){ t+=c.r==="A"?11:"JQK".includes(c.r)?10:+c.r; if (c.r==="A") a++; } while (t>21&&a){ t-=10;a--; } return t; }
const warRank = c => c.r==="A"?14:c.r==="K"?13:c.r==="Q"?12:c.r==="J"?11:+c.r;

/* ── emulator helpers ── */
async function signUp(email){
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "hunter22", returnSecureToken: true })
  });
  const j = await r.json();
  if (!j.idToken) throw new Error("signup failed: " + JSON.stringify(j));
  return { token: j.idToken, uid: j.localId };
}
const adminWrite = (path, val) => fetch(`${DB}/${path}.json?ns=${NS}`, {
  method: "PUT", headers: { Authorization: "Bearer owner" }, body: JSON.stringify(val) });
const adminRead = async path => (await fetch(`${DB}/${path}.json?ns=${NS}`, { headers: { Authorization: "Bearer owner" } })).json();
const userWrite = async (path, val, token) => {
  const r = await fetch(`${DB}/${path}.json?ns=${NS}&auth=${token}`, { method: "PUT", body: JSON.stringify(val) });
  return r.ok;
};
async function call(name, data, token){
  const r = await fetch(`${FN}/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ data: data || {} })
  });
  const j = await r.json();
  return j.error ? { error: j.error.message || j.error.status } : j.result;
}

const A = await signUp("alice@test.gg"), B = await signUp("bob@test.gg");
await adminWrite(`users/${A.uid}`, { name: "Alice", chips: 5000 });
await adminWrite(`users/${B.uid}`, { name: "Bob", chips: 5000 });
const chipsOf = async u => (await adminRead(`users/${u.uid}/chips`));

console.log("— duel create / escrow —");
let r = await call("duelCreate", { game: "war", stake: 500, name: "Alice" }, A.token);
ok(r.id && r.chips === 4500, `create escrows stake (chips ${r.chips})`);
const warId = r.id;
ok((await call("duelCreate", { game: "war", stake: 99999 }, A.token)).error, "create rejects stake > chips");
ok((await call("duelCreate", { game: "war", stake: 10 }, A.token)).error, "create rejects stake < 50");
ok((await call("duelCreate", { game: "war", stake: 500 })).error, "create rejects unauthenticated");

console.log("— duel join —");
ok((await call("duelJoin", { id: warId, name: "Alice" }, A.token)).error, "can't join own challenge");
ok(await chipsOf(A) === 4500, "failed self-join didn't eat chips");
r = await call("duelJoin", { id: warId, name: "Bob" }, B.token);
ok(r.chips === 4500, `join escrows stake (chips ${r.chips})`);
let live = await adminRead(`duels/live/${warId}`);
ok(typeof live.seed === "number" && live.state === "play", `server generated seed ${live.seed}`);
ok(await adminRead(`duels/open/${warId}`) === null, "open challenge consumed");
ok((await call("duelJoin", { id: warId }, B.token)).error, "second join rejected");

console.log("— war settle: replay + idempotency —");
const rng = mulberry32(live.seed);
let pc, hc, hands = 0;
do { pc = seededCard(rng); hc = seededCard(rng); hands++; } while (warRank(pc) === warRank(hc) && hands < 8);
const expectWinner = warRank(pc) === warRank(hc) ? "split" : (warRank(pc) > warRank(hc) ? A.uid : B.uid);
r = await call("duelSettle", { id: warId }, B.token);
ok(r.winner === expectWinner, `winner matches local replay (${r.winner === A.uid ? "host" : r.winner === B.uid ? "guest" : "split"})`);
const aAfter = await chipsOf(A), bAfter = await chipsOf(B);
if (expectWinner === "split") ok(aAfter === 5000 && bAfter === 5000, "split returned both stakes");
else ok((expectWinner === A.uid ? aAfter : bAfter) === 5500 && (expectWinner === A.uid ? bAfter : aAfter) === 4500, `pot paid once (${aAfter}/${bAfter})`);
ok((await call("duelSettle", { id: warId }, A.token)).error, "second settle rejected");
ok(await chipsOf(A) === aAfter && await chipsOf(B) === bAfter, "double-settle didn't move chips");
if (expectWinner !== "split")
  ok(await adminRead(`users/${expectWinner}/pub/duelWins`) === 1, "pub.duelWins written by server");

console.log("— duel cancel —");
r = await call("duelCreate", { game: "rr", stake: 200, name: "Alice" }, A.token);
const cancelId = r.id;
ok((await call("duelCancel", { id: cancelId }, B.token)).error, "can't cancel someone else's challenge");
r = await call("duelCancel", { id: cancelId }, A.token);
ok(r.chips === aAfter, `cancel refunds stake (chips ${r.chips})`);
ok((await call("duelCancel", { id: cancelId }, A.token)).error, "second cancel rejected");

console.log("— russian roulette: moves under rules, timeout, settle —");
r = await call("duelCreate", { game: "rr", stake: 100, name: "Alice" }, A.token);
const rrId = r.id;
await call("duelJoin", { id: rrId, name: "Bob" }, B.token);
live = await adminRead(`duels/live/${rrId}`);
const bullet = (mulberry32(live.seed)() * 6) | 0;
ok((await call("duelSettle", { id: rrId }, A.token)).error, "settle rejected before bullet reached");
// alternating pulls up to the bullet chamber, written as the players themselves
for (let i = 0; i <= bullet; i++){
  const mover = i % 2 === 0 ? A : B;
  const wrote = await userWrite(`duels/live/${rrId}/moves/m${String(i).padStart(2, "0")}`,
    { uid: mover.uid, t: Date.now() - (bullet - i) * 1000 }, mover.token);
  ok(wrote, `rules allow participant move ${i + 1}`);
}
const rrWinner = bullet % 2 === 0 ? B.uid : A.uid; // loser pulled the bullet chamber
const beforeRR = { a: await chipsOf(A), b: await chipsOf(B) };
r = await call("duelSettle", { id: rrId }, A.token);
ok(r.winner === rrWinner, `rr winner = non-puller of chamber ${bullet + 1}`);
ok((rrWinner === A.uid ? await chipsOf(A) - beforeRR.a : await chipsOf(B) - beforeRR.b) === 200, "rr pot paid");

console.log("— rules lockdown —");
ok(!(await userWrite(`duels/live/${rrId}/winner`, B.uid, B.token)), "client can't write duel winner");
ok(!(await userWrite(`users/${A.uid}/chips`, 999999, B.token)), "client can't write someone else's chips");
ok(await userWrite(`users/${A.uid}/chips`, await chipsOf(A), A.token), "client can write own chips (solo play)");
ok(!(await userWrite(`users/${A.uid}/pub/duelWins`, 999, A.token)), "client can't write own pub stats");
ok(!(await userWrite(`duels/open/fake`, { game: "war", stake: 1, host: { uid: A.uid, name: "x" }, at: 1 }, A.token)), "client can't post open challenges directly");
ok(!(await userWrite(`tourney/2026-06-13/scores/${A.uid}`, { score: 99999 }, A.token)), "client can't write tournament scores");

console.log("— bj duel: hand verification + forged-total forfeit —");
r = await call("duelCreate", { game: "bj", stake: 100, name: "Alice" }, A.token);
const bjId = r.id;
await call("duelJoin", { id: bjId, name: "Bob" }, B.token);
live = await adminRead(`duels/live/${bjId}`);
const handOf = (role, hits) => { const rg = mulberry32(live.seed ^ hashStr(role)); const cs = [seededCard(rg), seededCard(rg)]; for (let i = 0; i < hits; i++) cs.push(seededCard(rg)); return cs; };
const hostCards = handOf("host", 1), guestCards = handOf("guest", 0);
ok(await userWrite(`duels/live/${bjId}/moves/host`, { total: hvVal(hostCards), bust: hvVal(hostCards) > 21, n: 3, t: Date.now() }, A.token), "host locks hand");
ok(await userWrite(`duels/live/${bjId}/moves/guest`, { total: hvVal(guestCards) + 5, bust: false, n: 2, t: Date.now() }, B.token), "guest submits FORGED total");
r = await call("duelSettle", { id: bjId }, A.token);
ok(r.winner === A.uid && /mismatch/.test(r.how), `forged hand forfeits (${r.how})`);

console.log("— mines race duel (commit pattern) —");
r = await call("duelCreate", { game: "mines", stake: 100, name: "Alice" }, A.token);
const mnId = r.id;
await call("duelJoin", { id: mnId, name: "Bob" }, B.token);
live = await adminRead(`duels/live/${mnId}`);
const field = (() => { const g = mulberry32(live.seed), s = new Set(); while (s.size < 5) s.add((g()*25)|0); return s; })();
const safe = [...Array(25).keys()].filter(i => !field.has(i));
const mineTile = [...field][0];
ok(await userWrite(`duels/live/${mnId}/moves/host`, { picks: safe.slice(0, 4), t: Date.now() }, A.token), "host banks 4 gems");
ok(await userWrite(`duels/live/${mnId}/moves/guest`, { picks: [...safe.slice(0, 6), mineTile], t: Date.now() }, B.token), "guest greeds into a mine");
r = await call("duelSettle", { id: mnId }, A.token);
ok(r.winner === A.uid && r.how === "4 vs 0 gems", `boom scores zero, banker wins (${r.how})`);

console.log("— hi-lo ladder duel —");
r = await call("duelCreate", { game: "hilo", stake: 100, name: "Alice" }, A.token);
const hlId = r.id;
await call("duelJoin", { id: hlId, name: "Bob" }, B.token);
live = await adminRead(`duels/live/${hlId}`);
// derive a 3-streak of correct calls and one wrong call from the shared stream
const mkCalls = (n, sabotage) => {
  const g = mulberry32(live.seed);
  let cur = seededCard(g), out = "";
  for (let i = 0; i < n; i++){
    const next = seededCard(g);
    let c = warRank(next) >= warRank(cur) ? "h" : "l";
    if (sabotage && i === n - 1) c = c === "h" ? "l" : "h";
    if (sabotage && i === n - 1 && warRank(next) === warRank(cur)) c = "h"; // tie is correct either way — can't sabotage
    out += c; cur = next;
  }
  return out;
};
ok(await userWrite(`duels/live/${hlId}/moves/host`, { calls: mkCalls(3, false), t: Date.now() }, A.token), "host banks streak 3");
ok(await userWrite(`duels/live/${hlId}/moves/guest`, { calls: mkCalls(2, false), t: Date.now() }, B.token), "guest banks streak 2");
r = await call("duelSettle", { id: hlId }, A.token);
ok(r.winner === A.uid && r.how === "streak 3 vs 2", `longer streak wins (${r.how})`);

console.log("— crash duel —");
r = await call("duelCreate", { game: "crash", stake: 100, name: "Alice" }, A.token);
const crId = r.id;
await call("duelJoin", { id: crId, name: "Bob" }, B.token);
live = await adminRead(`duels/live/${crId}`);
const crPoint = Math.max(1.0, Math.floor((0.97 / (1 - mulberry32(live.seed)())) * 100) / 100);
const under = Math.max(1.01, Math.round((crPoint - 0.01) * 100) / 100), over = Math.round((crPoint + 1) * 100) / 100;
ok(await userWrite(`duels/live/${crId}/moves/host`, { target: under, t: Date.now() }, A.token), "host exits under the crash");
ok(await userWrite(`duels/live/${crId}/moves/guest`, { target: over, t: Date.now() }, B.token), "guest flies past it");
r = await call("duelSettle", { id: crId }, A.token);
ok(crPoint < 1.02 ? r.winner === "split" : r.winner === A.uid, `surviving exit beats the bust (point ${crPoint}, ${r.how})`);

console.log("— winners feed —");
const feed = Object.values(await adminRead("feed") || {});
ok(feed.length >= 3, `server wrote ${feed.length} feed events`);
ok(feed.some(e => e.type === "duel" && e.game === "mines" && e.win === "Alice"), "mines result in feed");
ok(!(await userWrite("feed/forged", { type: "duel", win: "Hacker", stake: 1e9 }, A.token)), "client can't write the feed");

console.log("— tournament —");
const beforeTn = await chipsOf(A);
r = await call("tnEnter", { name: "Alice" }, A.token);
ok(r.chips === beforeTn - 1000, "buy-in escrowed");
ok((await call("tnEnter", { name: "Alice" }, A.token)).error, "double entry rejected");
ok((await call("tnSubmit", { moves: [0, 0] }, A.token)).error, "submit before begin rejected");
ok(!(await call("tnBegin", { name: "Alice" }, A.token)).error, "begin locks attempt");
ok((await call("tnBegin", { name: "Alice" }, A.token)).error, "second begin rejected");
// local replay with the same kernel = expected score; game rotates by UTC day
const utcKey = d => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
const dayKey = utcKey(new Date());
const TN_ROT = ["bj", "hilo"];
const tnGameFor = dk => TN_ROT[Math.floor(Date.parse(dk + "T00:00:00Z") / 86400000) % TN_ROT.length];
const todayGame = tnGameFor(dayKey);
function gauntletReplay(dk, mv){
  const g = mulberry32(hashStr("gg-gauntlet-" + dk)); let stack = 500;
  if (tnGameFor(dk) === "hilo"){
    let cur = seededCard(g);
    for (const c of String(mv).slice(0, 10)){
      if (stack < 50 || (c !== "h" && c !== "l")) break;
      stack -= 50;
      const next = seededCard(g);
      const good = c === "h" ? warRank(next) >= warRank(cur) : warRank(next) <= warRank(cur);
      if (good) stack += 100;
      cur = next;
    }
    return stack;
  }
  for (let h = 0; h < 10; h++){
    if (stack < 50) break;
    stack -= 50;
    const me = [seededCard(g), seededCard(g)], dl = [seededCard(g), seededCard(g)];
    for (let i = 0; i < (mv[h] || 0); i++){ me.push(seededCard(g)); if (hvVal(me) > 21) break; }
    const p = hvVal(me); let dT = hvVal(dl);
    if (p <= 21) while (dT < 17){ dl.push(seededCard(g)); dT = hvVal(dl); }
    if (p > 21) continue;
    if (dT > 21 || p > dT) stack += 100; else if (p === dT) stack += 50;
  }
  return stack;
}
const moves = todayGame === "hilo" ? "hlhhllhlhh" : [1, 0, 2, 0, 0, 1, 0, 0, 0, 0];
r = await call("tnSubmit", { moves }, A.token);
ok(r.score === gauntletReplay(dayKey, moves), `server replay matches local for ${todayGame} (server ${r.score} vs local ${gauntletReplay(dayKey, moves)})`);
ok((await call("tnSubmit", { moves }, A.token)).error, "resubmit rejected");
ok((await adminRead(`tourney/${dayKey}/scores/${A.uid}`)).score === r.score, "server wrote the score");

console.log("— tournament auto-settlement (seeded yesterday) —");
const yKey = utcKey(new Date(Date.now() - 86400000));
await adminWrite(`tourney/${yKey}`, {
  players: { [A.uid]: { name: "Alice", at: 1 }, [B.uid]: { name: "Bob", at: 1 } },
  scores: { [A.uid]: { name: "Alice", score: 900, final: true }, [B.uid]: { name: "Bob", score: 700, final: true } }
});
const beforeSettle = { a: await chipsOf(A), b: await chipsOf(B) };
// 2 scored players → shares normalize 50/30 → 62.5% / 37.5% of the 2000 pot
r = await call("tnResults", {}, A.token);
ok(r.results && r.results.length === 2, "lazy settle returns podium");
ok(r.results[0].uid === A.uid && r.results[0].share === 1250, `rank 1 share normalized (${r.results[0] && r.results[0].share})`);
ok(r.results[1].share === 750, "rank 2 share normalized");
ok(await chipsOf(A) === beforeSettle.a + 1250 && await chipsOf(B) === beforeSettle.b + 750, "podium paid automatically");
r = await call("tnResults", {}, B.token);
ok(r.results.length === 2 && await chipsOf(A) === beforeSettle.a + 1250, "second settle call is a no-op (idempotent)");
ok(await adminRead(`users/${A.uid}/pub/tourneyCrowns`) === 1, "crown recorded server-side");
ok((await adminRead(`users/${A.uid}/tourneyMsg`)).rank === 1, "'you placed' banner queued for winner");
ok(Object.values(await adminRead("feed") || {}).some(e => e.type === "tourney" && e.win === "Alice"), "podium posted to feed");

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length){ console.log("FAILED:\n  " + failures.join("\n  ")); process.exit(1); }
