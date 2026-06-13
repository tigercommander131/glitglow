/* ════════════════ LIVE MULTIPLAYER ROOMS — real-time Arena tables ════════════════
   Companion to the server lifecycle in functions/index.js (roomCreate/Join/Leave/
   Start/Settle). Everyone at a table antes the stake; the best result on one shared,
   server-seeded spin takes the pot. The client only renders state, writes its own
   presence flag, and locks in its own bet once — the server owns money and the seed. */

const ROOM_GAMES = { roulette: "Roulette" };
const RM_REDS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

let roomId = null, roomHost = false, roomOpenOn = false;
let roomOpenRef = null, roomLiveRef = null, roomConnRef = null;
let roomStake = 0, roomBets = {}, roomBetChip = 50, roomLocked = false;
let roomTick = 0, roomSettleTried = false, roomLivePhase = null;

const roomColor = n => n === 0 ? "grn" : (RM_REDS.has(n) ? "red" : "blk");

/* ── lobby: list open tables, plus the create form ── */
function roomsLobby(){
  const ok = fbReady && user;
  $("roomauthmsg").style.display = ok ? "none" : "";
  $("roomcreate").style.display = ok ? "" : "none";
  $("roomlobby").style.display = "";
  $("roomstage").style.display = "none";
  if (!ok){ $("roomlist").innerHTML = ""; return; }
  if (!roomOpenOn){
    roomOpenOn = true;
    db.ref("rooms/open").on("value", s => {
      const v = s.val() || {}, rows = [];
      for (const [id, r] of Object.entries(v)){
        if (!r || !r.host || r.status !== "waiting") continue;
        rows.push([id, r]);
      }
      rows.sort((a, b) => b[1].createdAt - a[1].createdAt);
      $("roomlist").innerHTML = rows.length ? rows.map(([id, r]) => {
        const taken = r.taken || Object.keys(r.players || {}).length, mine = user && r.host.uid === user.uid;
        const full = taken >= r.seats;
        return `<div class="roomrow">
          <div class="rrL"><span class="rrgame">${ROOM_GAMES[r.game] || r.game}</span>
            <span class="rrhost">${esc(r.host.name)}'s table</span></div>
          <div class="rrM"><span class="rrseats">${taken}/${r.seats} seated</span><span class="rrstake">⛁ ${fmt(r.stake)} ante</span></div>
          ${mine ? `<button class="actbtn primary" onclick="roomEnter('${id}',true)">Rejoin</button>`
                 : full ? `<button class="actbtn ghost" disabled>Full</button>`
                        : `<button class="actbtn primary" onclick="roomJoin('${id}')">Sit down</button>`}</div>`;
      }).join("") : '<div class="roomempty">No live tables yet — open one and wait for players to sit down.</div>';
    });
  }
}
function roomsLeave(){ if (roomOpenOn){ db.ref("rooms/open").off(); roomOpenOn = false; } roomTeardown(); }

/* ── create / join → enter the room ── */
async function roomCreate(){
  if (!fbReady || !user){ toast("Sign in to play live"); return; }
  if (roomId){ toast("You're already at a table"); return; }
  const stake = Math.floor(Number($("roomstakein").value));
  const seats = Math.floor(Number($("roomseatsin").value));
  if (!stake || stake < 50){ toast("Minimum ante is 50"); return; }
  if (stake > chips){ toast("Not enough chips"); return; }
  try {
    const r = await callFn("roomCreate", { game: "roulette", seats, stake, name: displayName || "Player" });
    SND && SND.chips && SND.chips(2);
    roomEnter(r.id, true);
  } catch(e){ toast(e.message || "Couldn't open the table"); }
}
async function roomJoin(id){
  if (!fbReady || !user || roomId) return;
  try {
    await callFn("roomJoin", { id, name: displayName || "Player" });
    SND && SND.chips && SND.chips(2);
    roomEnter(id, false);
  } catch(e){ toast(e.message || "Couldn't take a seat"); }
}
function roomEnter(id, host){
  roomId = id; roomHost = host; roomBets = {}; roomLocked = false; roomSettleTried = false; roomLivePhase = null;
  $("roomlobby").style.display = "none";
  $("roomstage").style.display = "";
  roomOpenRef = db.ref("rooms/open/" + id); roomOpenRef.on("value", roomOnOpen);
  roomLiveRef = db.ref("rooms/live/" + id); roomLiveRef.on("value", roomOnLive);
}

/* ── waiting room (still in rooms/open, host hasn't started) ── */
function roomOnOpen(snap){
  const r = snap.val();
  if (roomLivePhase) return;                 // already live — ignore the open node going away
  if (!r){ toast("Table closed"); roomBackToLobby(); return; }
  const players = Object.values(r.players || {}).sort((a, b) => a.seat - b.seat);
  const canStart = roomHost && players.length >= 2;
  $("roomstage").innerHTML = `
    <div class="roomtop"><button class="backbtn" onclick="roomLeaveTable()">← Leave</button>
      <h2 class="gametitle">${ROOM_GAMES[r.game] || r.game} · ⛁ ${fmt(r.stake)}</h2></div>
    <div class="roomwait">
      <div class="sthead">At the table<small>${players.length}/${r.seats} seated · winner takes the ${fmt(r.stake * players.length)} pot</small></div>
      <div class="seatlist">${players.map(p => `<div class="seatchip${user && r.players[user.uid] && p.name === r.players[user.uid].name ? " me" : ""}">${esc(p.name)}</div>`).join("")}
        ${Array.from({ length: r.seats - players.length }).map(() => '<div class="seatchip empty">empty</div>').join("")}</div>
      ${canStart ? `<button class="actbtn primary big" onclick="roomStart()">Deal it — start the round</button>`
        : roomHost ? `<div class="roomhint">Waiting for one more player to sit down…</div>`
                   : `<div class="roomhint">Waiting for ${esc(r.host.name)} to start the round…</div>`}
    </div>`;
}
async function roomStart(){
  try { await callFn("roomStart", { id: roomId }); }
  catch(e){ toast(e.message || "Couldn't start"); }
}
async function roomLeaveTable(){
  const id = roomId;
  if (!id) return roomBackToLobby();
  try { await callFn("roomLeave", { id }); } catch(e){ /* already started or gone */ }
  roomBackToLobby();
}
function roomBackToLobby(){ roomTeardown(); showView("rooms"); }

/* ── live table (rooms/live) ── */
function roomOnLive(snap){
  const d = snap.val();
  if (!d) return;
  roomLivePhase = d.phase;
  if (d.phase === "betting"){
    roomConnect(d);
    roomRenderBetting(d);
  } else if (d.phase === "done" && d.result){
    if (roomTick){ clearInterval(roomTick); roomTick = 0; }
    roomRenderResult(d);
  }
}
/* presence: flag myself connected and drop it on disconnect */
function roomConnect(d){
  if (!user || !d.players || !d.players[user.uid] || roomConnRef) return;
  roomConnRef = db.ref(`rooms/live/${roomId}/players/${user.uid}/connected`);
  roomConnRef.onDisconnect().set(false);
  roomConnRef.set(true);
}
function roomRenderBetting(d){
  if ($("roomstage").dataset.phase === "betting") { roomPaintCountdown(d); return; }  // already drawn — just tick
  $("roomstage").dataset.phase = "betting";
  roomStake = d.stake;
  const mine = user && d.players[user.uid];
  roomLocked = !!(d.bets && user && d.bets[user.uid]);
  const nums = Array.from({ length: 37 }, (_, n) => `<button class="rnum ${roomColor(n)}" onclick="roomBet('n${n}',this)">${n}</button>`).join("");
  const outs = [["red","RED"],["blk","BLACK"],["odd","ODD"],["even","EVEN"],["lo","1–18"],["hi","19–36"],["dz1","1st 12"],["dz2","2nd 12"],["dz3","3rd 12"]];
  $("roomstage").innerHTML = `
    <div class="roomtop"><h2 class="gametitle">Roulette · ⛁ ${fmt(d.stake)} ante</h2>
      <div class="rtimer" id="rtimer">--</div></div>
    <div class="rplayers" id="rplayers"></div>
    <div class="rfelt">
      <div class="rnums">${nums}</div>
      <div class="routs">${outs.map(o => `<button class="rout" onclick="roomBet('${o[0]}',this)">${o[1]}</button>`).join("")}</div>
    </div>
    <div class="rbetbar">
      <div class="rbudget">Budget <b id="rbudget">${fmt(d.stake)}</b> · placed <b id="rplaced">0</b></div>
      <div class="rchips">${[10,50,100].map(v => `<button class="rchip${v===roomBetChip?" on":""}" onclick="roomPickChip(${v},this)">${v}</button>`).join("")}</div>
      <button class="actbtn ghost" onclick="roomClearBets()">Clear</button>
      <button class="actbtn primary" id="rlockbtn" onclick="roomLockBets()">Lock in bets</button>
    </div>
    <div class="roomhint" id="rhint">Spread your ${fmt(d.stake)} across the felt, then lock in before the wheel.</div>`;
  roomPaintPlayers(d);
  if (roomLocked) roomMarkLocked();
  roomRenderBet();
  roomPaintCountdown(d);
}
function roomPaintPlayers(d){
  const el = $("rplayers"); if (!el) return;
  el.innerHTML = Object.entries(d.players || {}).sort((a, b) => a[1].seat - b[1].seat).map(([uid, p]) => {
    const locked = d.bets && d.bets[uid];
    return `<span class="rpl ${p.connected ? "on" : ""} ${locked ? "ready" : ""}">${esc(p.name)}${locked ? " ✓" : ""}</span>`;
  }).join("");
}
function roomPaintCountdown(d){
  if (roomTick) return;
  const tickFn = () => {
    const left = Math.max(0, (d.deadline - Date.now()) / 1000);
    const t = $("rtimer"); if (t) t.textContent = left > 0 ? left.toFixed(0) + "s" : "spinning…";
    if (left <= 0){
      clearInterval(roomTick); roomTick = 0;
      if (!roomSettleTried){ roomSettleTried = true; callFn("roomSettle", { id: roomId }).catch(() => {}); }
    }
  };
  tickFn(); roomTick = setInterval(tickFn, 250);
}
/* ── bet building (local until locked) ── */
function roomPickChip(v, btn){ roomBetChip = v; document.querySelectorAll(".rchip").forEach(c => c.classList.remove("on")); btn.classList.add("on"); }
function roomBet(key, btn){
  if (roomLocked) return;
  const placed = Object.values(roomBets).reduce((a, b) => a + b, 0);
  if (placed + roomBetChip > roomStake){ toast("That's over your budget"); return; }
  roomBets[key] = (roomBets[key] || 0) + roomBetChip;
  if (btn){ btn.classList.add("staked"); btn.dataset.amt = roomBets[key]; }
  roomRenderBet();
}
function roomClearBets(){ if (roomLocked) return; roomBets = {}; document.querySelectorAll(".rnum,.rout").forEach(b => { b.classList.remove("staked"); delete b.dataset.amt; }); roomRenderBet(); }
function roomRenderBet(){
  const placed = Object.values(roomBets).reduce((a, b) => a + b, 0);
  if ($("rplaced")) $("rplaced").textContent = fmt(placed);
  if ($("rbudget")) $("rbudget").textContent = fmt(roomStake - placed);
}
async function roomLockBets(){
  if (roomLocked) return;
  const placed = Object.values(roomBets).reduce((a, b) => a + b, 0);
  if (!placed){ toast("Place at least one bet"); return; }
  try {
    await db.ref(`rooms/live/${roomId}/bets/${user.uid}`).set({ board: roomBets, total: placed });
    roomLocked = true; roomMarkLocked(); SND && SND.chips && SND.chips(1);
  } catch(e){ toast("Couldn't lock bets — round may have closed"); }
}
function roomMarkLocked(){
  const b = $("rlockbtn"); if (b){ b.textContent = "Bets locked ✓"; b.disabled = true; }
  document.querySelectorAll(".rnum,.rout,.rchip").forEach(x => x.disabled = true);
  if ($("rhint")) $("rhint").textContent = "Bets locked — watch the wheel.";
}
/* ── result: a quick shared spin reveal, then the payout ── */
function roomRenderResult(d){
  const r = d.result, me = user && user.uid;
  const iWon = r.winners && r.winners.includes(me);
  const names = (r.winners || []).map(uid => (d.players[uid] || {}).name || "—");
  $("roomstage").dataset.phase = "done";
  $("roomstage").innerHTML = `
    <div class="roomtop"><h2 class="gametitle">Roulette</h2></div>
    <div class="rresult">
      <div class="rball ${roomColor(r.pocket)}" id="rball">--</div>
      <div class="rland" id="rland"></div>
      <div class="rpayout" id="rpayout" style="visibility:hidden">
        ${r.dead ? `<div class="rdead">No winning bet — the pot was returned.</div>`
          : `<div class="${iWon ? "rwin" : "rlose"}">${iWon ? `You take ${fmt(r.share)}! 🩸` : `${names.join(" & ")} take${names.length>1?"":"s"} the ${fmt(r.pot)} pot`}</div>`}
      </div>
      <button class="actbtn primary" id="ragain" style="visibility:hidden" onclick="roomBackToLobby()">Back to the lobby</button>
    </div>`;
  // brief cycling spin that lands on the server's pocket (same for everyone)
  const ball = $("rball"); let spins = 0;
  const spin = setInterval(() => {
    const n = (Math.random() * 37) | 0;
    ball.textContent = n; ball.className = "rball " + roomColor(n);
    if (++spins > 18){
      clearInterval(spin);
      ball.textContent = r.pocket; ball.className = "rball land " + roomColor(r.pocket);
      $("rland").textContent = `${r.pocket} ${roomColor(r.pocket) === "grn" ? "GREEN" : roomColor(r.pocket) === "red" ? "RED" : "BLACK"}`;
      $("rpayout").style.visibility = "visible";
      $("ragain").style.visibility = "visible";
      if (iWon){ SND && SND.win && SND.win(); if (typeof refreshChips === "function") refreshChips(); }
      else if (typeof refreshChips === "function") refreshChips();
    }
  }, 90);
}

/* ── teardown ── */
function roomTeardown(){
  if (roomOpenRef){ roomOpenRef.off(); roomOpenRef = null; }
  if (roomLiveRef){ roomLiveRef.off(); roomLiveRef = null; }
  if (roomConnRef){ roomConnRef.onDisconnect().cancel(); roomConnRef.set(false).catch(() => {}); roomConnRef = null; }
  if (roomTick){ clearInterval(roomTick); roomTick = 0; }
  roomId = null; roomHost = false; roomBets = {}; roomLocked = false; roomLivePhase = null;
  const st = $("roomstage"); if (st) st.dataset.phase = "";
}

registerGame("rooms", { stop: roomsLeave });
