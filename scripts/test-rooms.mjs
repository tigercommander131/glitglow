/* Live-rooms (Arena multiplayer) verification against the emulator suite.
   Run:  JAVA_HOME=/opt/homebrew/opt/openjdk@21 npx firebase emulators:exec --only auth,functions,database "node scripts/test-rooms.mjs"
   Covers: room create/join escrow, seat-claim race, full-table reject,
   host-cancel refunds, host-only start, server-only seed (commit-reveal),
   bet-write rules, deterministic roulette settle, pot payout, idempotency,
   over-budget forfeit, and dead-round refunds. */

const PROJECT = "giltglow-hub", REGION = "asia-southeast1", NS = "giltglow-hub-default-rtdb";
const AUTH = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || "localhost:9099"}`;
const DB = `http://${process.env.FIREBASE_DATABASE_EMULATOR_HOST || "localhost:9000"}`;
const FN = `http://localhost:5001/${PROJECT}/${REGION}`;
console.log("emulators:", { AUTH, DB, FN });

let pass = 0, failures = [];
const ok = (cond, label) => { if (cond) pass++; else failures.push(label); console.log((cond ? "  ✓ " : "  ✗ ") + label); };

/* ── mirror of the server roulette kernel ── */
function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function hashStr(s){ let h=2166136261; for (let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); } return h>>>0; }
const RWHEEL=[0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const RREDS=new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const spinPocket = seed => RWHEEL[(mulberry32(hashStr("roulette|"+seed))()*RWHEEL.length)|0];
const diceRoll = seed => { const rng=mulberry32(hashStr("dice|"+seed)); return [0,0,0].map(()=>1+(rng()*6|0)); };
const SUITS=["♠","♥","♦","♣"], RANKS=["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
const seededCard = rng => { const r=RANKS[(rng()*13)|0], s=SUITS[(rng()*4)|0]; return { r, s }; };
const bacCardV = c => c.r==="A"?1:("JQK".includes(c.r)||c.r==="10")?0:+c.r;
const bacVal = h => { let v=0; for (const c of h) v+=bacCardV(c); return v%10; };
function baccaratDeal(seed){
  const rng=mulberry32(hashStr("baccarat|"+seed)), draw=()=>seededCard(rng);
  const P=[draw()],B=[draw()];P.push(draw());B.push(draw());
  let pv=bacVal(P),bv=bacVal(B); const natural=pv>=8||bv>=8; let p3=null;
  if(!natural){ if(pv<=5){p3=draw();P.push(p3);} const p3v=p3?bacCardV(p3):null; let bd;
    if(p3===null)bd=bv<=5; else if(bv<=2)bd=true; else if(bv===3)bd=p3v!==8; else if(bv===4)bd=p3v>=2&&p3v<=7;
    else if(bv===5)bd=p3v>=4&&p3v<=7; else if(bv===6)bd=p3v===6||p3v===7; else bd=false; if(bd)B.push(draw()); }
  pv=bacVal(P);bv=bacVal(B); return { result: pv>bv?"P":bv>pv?"B":"T" };
}

/* ── emulator helpers ── */
async function signUp(email){
  const r = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "hunter22", returnSecureToken: true }) });
  const j = await r.json();
  if (!j.idToken) throw new Error("signup failed: " + JSON.stringify(j));
  return { token: j.idToken, uid: j.localId };
}
const adminWrite = (path, val) => fetch(`${DB}/${path}.json?ns=${NS}`, { method: "PUT", headers: { Authorization: "Bearer owner" }, body: JSON.stringify(val) });
const adminRead = async path => (await fetch(`${DB}/${path}.json?ns=${NS}`, { headers: { Authorization: "Bearer owner" } })).json();
const userRead = async (path, token) => { const r = await fetch(`${DB}/${path}.json?ns=${NS}&auth=${token}`); return { ok: r.ok, val: r.ok ? await r.json() : null }; };
const userWrite = async (path, val, token) => (await fetch(`${DB}/${path}.json?ns=${NS}&auth=${token}`, { method: "PUT", body: JSON.stringify(val) })).ok;
async function call(name, data, token){
  const r = await fetch(`${FN}/${name}`, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ data: data || {} }) });
  const j = await r.json();
  return j.error ? { error: j.error.message || j.error.status } : j.result;
}

const A = await signUp("alice@rooms.gg"), B = await signUp("bob@rooms.gg"), C = await signUp("carol@rooms.gg");
await adminWrite(`users/${A.uid}`, { name: "Alice", chips: 5000 });
await adminWrite(`users/${B.uid}`, { name: "Bob", chips: 5000 });
await adminWrite(`users/${C.uid}`, { name: "Carol", chips: 5000 });
const chipsOf = async u => (await adminRead(`users/${u.uid}/chips`));

console.log("— create / escrow —");
let r = await call("roomCreate", { game: "roulette", seats: 3, stake: 500, name: "Alice" }, A.token);
ok(r.id && r.chips === 4500, `create escrows host ante (chips ${r.chips})`);
const id = r.id;
ok((await call("roomCreate", { game: "roulette", stake: 10 }, A.token)).error, "rejects stake < min");
ok((await call("roomCreate", { game: "poker", stake: 500 }, A.token)).error, "rejects unknown game");
ok((await call("roomCreate", { game: "roulette", stake: 500 })).error, "rejects unauthenticated");

console.log("— join / seat claim —");
ok((await call("roomJoin", { id, name: "Alice" }, A.token)).error, "host can't double-join");
ok(await chipsOf(A) === 4500, "failed self-join didn't eat chips");
r = await call("roomJoin", { id, name: "Bob" }, B.token);
ok(r.chips === 4500, `join escrows ante (Bob chips ${r.chips})`);
let open = await adminRead(`rooms/open/${id}`);
ok(open.taken === 2 && open.players[B.uid].seat === 1, "Bob took seat 1");

console.log("— full table —");
r = await call("roomJoin", { id, name: "Carol" }, C.token);
ok(r.id && open && await chipsOf(C) === 4500, "Carol fills last seat");
const D = await signUp("dave@rooms.gg"); await adminWrite(`users/${D.uid}`, { name: "Dave", chips: 5000 });
ok((await call("roomJoin", { id, name: "Dave" }, D.token)).error, "4th join rejected (table full)");
ok(await chipsOf(D) === 5000, "rejected joiner keeps chips (no escrow leak)");

console.log("— leave / refund —");
ok((await call("roomLeave", { id }, C.token)).ok && await chipsOf(C) === 5000, "Carol leaves, ante refunded");
open = await adminRead(`rooms/open/${id}`);
ok(open.taken === 2 && !open.players[C.uid], "seat freed after leave");
await call("roomJoin", { id, name: "Carol" }, C.token); // rejoin for the rest

console.log("— start: host-only, 2+ , server-only seed —");
ok((await call("roomStart", { id }, B.token)).error, "non-host can't start");
r = await call("roomStart", { id }, A.token);
ok(r.id && r.deadline, "host starts the table");
ok(!(await adminRead(`rooms/open/${id}`)), "room left the lobby");
let live = await adminRead(`rooms/live/${id}`);
ok(live.phase === "betting" && live.seed === undefined, "live has no seed exposed");
ok((await userRead(`roomseeds/${id}`, A.token)).val === null, "clients CANNOT read the spin seed");
const seed = await adminRead(`roomseeds/${id}`);
const pocket = spinPocket(seed);
console.log("    (server seed →) winning pocket:", pocket);

console.log("— bet-write rules —");
ok(await userWrite(`rooms/live/${id}/bets/${A.uid}`, { board: { ["n"+pocket]: 500 } }, A.token), "player writes own bet during betting");
ok(!(await userWrite(`rooms/live/${id}/bets/${B.uid}`, { board: { red: 500 } }, A.token)), "can't write another player's bet");
// Bob bets on a guaranteed-losing single number, Carol skips
const losing = (pocket + 1) % 37;
await userWrite(`rooms/live/${id}/bets/${B.uid}`, { board: { ["n"+losing]: 500 } }, B.token);
ok(!(await userWrite(`rooms/live/${id}/bets/${A.uid}`, { board: { red: 1 } }, A.token)), "can't overwrite a placed bet (one-shot)");

console.log("— settle: payout, idempotency —");
const beforeA = await chipsOf(A);
r = await call("roomSettle", { id }, A.token);
ok(r.outcome === pocket, `server spun pocket ${r.outcome} (matches)`);
ok(r.winners.length === 1 && r.winners[0] === A.uid, "Alice (straight-up hit) wins the pot");
ok(r.pot === 1500 && r.share === 1500, `pot = stake × 3 = ${r.pot}`);
ok(await chipsOf(A) === beforeA + 1500, "winner paid the whole pot");
const settleAgain = await call("roomSettle", { id }, B.token);
ok(settleAgain.already === true && await chipsOf(A) === beforeA + 1500, "settle is idempotent (no double pay)");
ok((await adminRead(`users/${A.uid}/pub/roomWins`)) === 1, "winner's public roomWins bumped");
ok(!(await adminRead(`roomseeds/${id}`)), "seed cleaned up after settle");

console.log("— over-budget bet forfeits —");
const id2 = (await call("roomCreate", { game: "roulette", seats: 2, stake: 200, name: "Alice" }, A.token)).id;
await call("roomJoin", { id: id2, name: "Bob" }, B.token);
await call("roomStart", { id: id2 }, A.token);
const seed2 = await adminRead(`roomseeds/${id2}`), pocket2 = spinPocket(seed2);
await userWrite(`rooms/live/${id2}/bets/${A.uid}`, { board: { ["n"+pocket2]: 999999 } }, A.token); // hits but over budget
await userWrite(`rooms/live/${id2}/bets/${B.uid}`, { board: { red: 200 } }, B.token);
r = await call("roomSettle", { id: id2 }, A.token);
ok(r.scores && r.scores[A.uid] === 0, "over-budget bet scored 0 (forfeit)");
ok(!(RREDS.has(pocket2)) ? r.dead === true : r.winners[0] === B.uid, "cheating host doesn't steal the pot");

console.log("— dice (sic bo) round —");
{
  const id = (await call("roomCreate", { game: "dice", seats: 2, stake: 200, name: "Alice" }, A.token)).id;
  await call("roomJoin", { id, name: "Bob" }, B.token);
  await call("roomStart", { id }, A.token);
  const seed = await adminRead(`roomseeds/${id}`), dice = diceRoll(seed), sum = dice[0]+dice[1]+dice[2];
  const aliceBoard = (sum < 4 || sum > 17) ? { triple: 200 } : { ["tot"+sum]: 200 };  // exact total (or triple at the extremes) always pays
  const loseTot = sum === 4 ? 5 : 4;
  await userWrite(`rooms/live/${id}/bets/${A.uid}`, { board: aliceBoard, total: 200 }, A.token);
  await userWrite(`rooms/live/${id}/bets/${B.uid}`, { board: { ["tot"+loseTot]: 200 }, total: 200 }, B.token);
  r = await call("roomSettle", { id }, A.token);
  ok(JSON.stringify(r.outcome) === JSON.stringify(dice), `dice rolled ${dice.join("·")} = ${sum} (matches)`);
  ok(r.winners.length === 1 && r.winners[0] === A.uid && r.pot === 400, "Alice (winning total) takes the dice pot");
}

console.log("— baccarat round —");
{
  const id = (await call("roomCreate", { game: "baccarat", seats: 2, stake: 200, name: "Alice" }, A.token)).id;
  await call("roomJoin", { id, name: "Bob" }, B.token);
  await call("roomStart", { id }, A.token);
  const seed = await adminRead(`roomseeds/${id}`), deal = baccaratDeal(seed), win = deal.result, lose = win === "P" ? "B" : "P";
  await userWrite(`rooms/live/${id}/bets/${A.uid}`, { side: win }, A.token);
  await userWrite(`rooms/live/${id}/bets/${B.uid}`, { side: lose }, B.token);
  r = await call("roomSettle", { id }, A.token);
  ok(r.outcome.result === win, `baccarat dealt ${win} (matches)`);
  ok(r.winners.length === 1 && r.winners[0] === A.uid, "Alice (winning side) takes the baccarat pot");
}

console.log("— host-cancel refunds everyone —");
const id3 = (await call("roomCreate", { game: "roulette", seats: 3, stake: 300, name: "Alice" }, A.token)).id;
await call("roomJoin", { id: id3, name: "Bob" }, B.token);
const preA = await chipsOf(A), preB = await chipsOf(B);
r = await call("roomLeave", { id: id3 }, A.token);
ok(r.cancelled === true, "host leave cancels the table");
ok(await chipsOf(A) === preA + 300 && await chipsOf(B) === preB + 300, "all antes refunded on cancel");
ok(!(await adminRead(`rooms/open/${id3}`)), "cancelled room removed from lobby");

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length){ console.log("FAILURES:\n  " + failures.join("\n  ")); process.exit(1); }
