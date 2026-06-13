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
/* the real European felt — same markup/classes as the casino game (js/games/roulette.js)
   so it looks identical, just wired to the room's escrowed budget */
function roomFeltHTML(){
  let h = `<div class="fcell grn" data-bet="n0" style="grid-row:1/4">0</div>`;
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 12; col++){
      const n = col*3 + (3-row);
      h += `<div class="fcell ${RM_REDS.has(n)?"red":"blk"}" data-bet="n${n}" style="grid-row:${row+1};grid-column:${col+2}">${n}</div>`;
    }
  for (let row = 0; row < 3; row++)
    h += `<div class="fcell outer" data-bet="col${3-row}" style="grid-row:${row+1};grid-column:14">2:1</div>`;
  ["1st 12","2nd 12","3rd 12"].forEach((d, i) => h += `<div class="fcell outer" data-bet="dz${i+1}" style="grid-row:4;grid-column:${2+i*4}/${6+i*4}">${d}</div>`);
  [["lo","1–18"],["even","EVEN"],["red","RED"],["blk","BLACK"],["odd","ODD"],["hi","19–36"]].forEach((o, i) =>
    h += `<div class="fcell outer" data-bet="${o[0]}" style="grid-row:5;grid-column:${2+i*2}/${4+i*2}">${o[1]}</div>`);
  return h;
}
function roomRenderBetting(d){
  if ($("roomstage").dataset.phase === "betting"){ roomPaintCountdown(d); roomPaintPlayers(d); return; }  // already drawn — just tick + refresh
  $("roomstage").dataset.phase = "betting";
  roomStake = d.stake;
  roomLocked = !!(d.bets && user && d.bets[user.uid]);
  $("roomstage").innerHTML = `
    <div class="roomtop"><h2 class="gametitle">Roulette · ⛁ ${fmt(d.stake)} ante</h2>
      <div class="rtimer" id="rtimer">--</div></div>
    <div class="rplayers" id="rplayers"></div>
    <canvas class="rwheel" id="rwheel" width="380" height="380"></canvas>
    <div class="rfeltwrap"><div class="feltgrid" id="rfelt">${roomFeltHTML()}</div></div>
    <div class="rbetbar">
      <div class="rbudget">Budget <b id="rbudget">${fmt(d.stake)}</b> · placed <b id="rplaced">0</b></div>
      <div class="rchips">${[10,50,100,500].map(v => `<button class="cbtn rchip${v===roomBetChip?" on":""}" onclick="roomPickChip(${v},this)">${v}</button>`).join("")}</div>
      <button class="actbtn ghost" onclick="roomClearBets()">Clear</button>
      <button class="actbtn primary" id="rlockbtn" onclick="roomLockBets()">Lock in bets</button>
    </div>
    <div class="roomhint" id="rhint">Place chips on the felt, then lock in before the wheel spins.</div>`;
  $("rfelt").addEventListener("click", e => {
    const cell = e.target.closest(".fcell"); if (!cell || roomLocked) return;
    roomBet(cell.dataset.bet); roomRenderFeltChips();
  });
  roomDrawWheelIdle();
  roomPaintPlayers(d);
  if (roomLocked) roomMarkLocked();
  roomRenderBet(); roomRenderFeltChips();
  roomPaintCountdown(d);
}
function roomDrawWheelIdle(){ const cv = $("rwheel"); if (cv && typeof roulDrawWheel === "function") roulDrawWheel(0, 0, -1, 0, null, cv, -1); }
function roomRenderFeltChips(){
  document.querySelectorAll("#rfelt .betchip").forEach(c => c.remove());
  for (const [k, v] of Object.entries(roomBets)){
    const cell = document.querySelector(`#rfelt [data-bet="${k}"]`);
    if (cell){ const c = document.createElement("div"); c.className = "betchip"; c.textContent = v >= 1000 ? (v/1000)+"k" : v; cell.appendChild(c); }
  }
  roomRenderBet();
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
function roomBet(key){
  if (roomLocked) return;
  const placed = Object.values(roomBets).reduce((a, b) => a + b, 0);
  if (placed + roomBetChip > roomStake){ toast("That's over your budget"); return; }
  roomBets[key] = (roomBets[key] || 0) + roomBetChip;
  if (typeof SND !== "undefined" && SND.tick) SND.tick();
  roomRenderBet();
}
function roomClearBets(){ if (roomLocked) return; roomBets = {}; roomRenderFeltChips(); }
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
  document.querySelectorAll(".rchip").forEach(x => x.disabled = true);
  const clr = document.querySelector('.rbetbar .actbtn.ghost'); if (clr) clr.disabled = true;
  const f = $("rfelt"); if (f) f.classList.add("locked");
  if ($("rhint")) $("rhint").textContent = "Bets locked — watch the wheel.";
}
/* ── result: the real wheel spins to the server's pocket (same for everyone), then the payout ── */
function roomRenderResult(d){
  const r = d.result, me = user && user.uid;
  const iWon = r.winners && r.winners.includes(me);
  const names = (r.winners || []).map(uid => (d.players[uid] || {}).name || "—");
  const colName = roomColor(r.pocket) === "grn" ? "GREEN" : roomColor(r.pocket) === "red" ? "RED" : "BLACK";
  $("roomstage").dataset.phase = "done";
  $("roomstage").innerHTML = `
    <div class="roomtop"><h2 class="gametitle">Roulette</h2></div>
    <div class="rresult">
      <canvas class="rwheel" id="rwheel" width="380" height="380"></canvas>
      <div class="rland" id="rland"></div>
      <div class="rpayout" id="rpayout" style="visibility:hidden">
        ${r.dead ? `<div class="rdead">No winning bet — the pot was returned.</div>`
          : `<div class="${iWon ? "rwin" : "rlose"}">${iWon ? `You take ${fmt(r.share)}! 🩸` : `${names.join(" & ")} take${names.length>1?"":"s"} the ${fmt(r.pot)} pot`}</div>`}
      </div>
      <button class="actbtn primary" id="ragain" style="visibility:hidden" onclick="roomBackToLobby()">Back to the lobby</button>
    </div>`;
  roomSpinWheelTo(r.pocket, () => {
    const l = $("rland"); if (l) l.textContent = `${r.pocket} ${colName}`;
    const p = $("rpayout"); if (p) p.style.visibility = "visible";
    const a = $("ragain"); if (a) a.style.visibility = "visible";
    if (iWon && typeof SND !== "undefined" && SND.win) SND.win();
    if (typeof refreshChips === "function") refreshChips();
  });
}
/* port of the casino spin animation, but it lands on a KNOWN pocket (the server's) and
   never settles locally — reuses roulDrawWheel() on the room's own canvas */
function roomSpinWheelTo(winNum, done){
  const cv = $("rwheel"); if (!cv || typeof roulDrawWheel !== "function"){ done(); return; }
  const winIdx = RWHEEL.indexOf(winNum), seg = Math.PI*2/37, pointerA = -Math.PI/2, TAU = Math.PI*2, spins = 6;
  const startW = 0, targW = pointerA - (winIdx+0.5)*seg, endW = startW - (((startW-targW)%TAU)+TAU)%TAU - TAU*spins;
  const R = cv.width/2 - 6, trackR = R - 11, ballStart = Math.random()*7, ballEnd = pointerA + Math.PI*2*(spins+3);
  const T = 5000, t0 = performance.now(), ease = t => 1 - Math.pow(1-t, 3), trail = []; let lastSeg = -1;
  (function frame(now){
    const t = Math.min(1, (now - t0)/T), e = ease(t), angle = startW + (endW-startW)*e, ba = ballStart + (ballEnd-ballStart)*e;
    const ts = Math.floor((ba - angle)/seg);
    if (ts !== lastSeg && t < 0.97){ lastSeg = ts; if (typeof SND !== "undefined" && SND.tick) SND.tick(); }
    let drop = 0;
    if (t > 0.78){ const dd = (t-0.78)/0.22; drop = (trackR-(R-40))*Math.min(1, dd) + Math.abs(Math.sin(dd*Math.PI*3))*(1-dd)*8; }
    if (t < 0.9){ trail.push({ a: ba, r: trackR-drop }); if (trail.length > 10) trail.shift(); } else trail.shift();
    roulDrawWheel(angle, t < 0.97 ? ba : angle + (winIdx+0.5)*seg, trackR, drop, trail, cv, winNum);
    if (t < 1) requestAnimationFrame(frame); else done();
  })(t0);
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
