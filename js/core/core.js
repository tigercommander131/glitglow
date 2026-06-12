
/* ═══════════════════════════════════════
   FIREBASE CONFIG — REPLACE THIS BLOCK
   ═══════════════════════════════════════ */
const firebaseConfig = {
  apiKey: "AIzaSyCRgVEaWgjDMdIyuuHkI6m0YTRNMZdpzyc",
  authDomain: "giltglow-hub.firebaseapp.com",
  databaseURL: "https://giltglow-hub-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "giltglow-hub",
  storageBucket: "giltglow-hub.firebasestorage.app",
  messagingSenderId: "150346282749",
  appId: "1:150346282749:web:80aa1d86694696e5863094"
};
/* ═══════════════════════════════════════ */

const $ = id => document.getElementById(id);
let fbReady = false, db = null, auth = null, user = null, fns = null;
try {
  if (firebaseConfig.apiKey !== "YOUR_API_KEY") {
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth(); db = firebase.database(); fbReady = true;
    fns = firebase.app().functions("asia-southeast1"); // callables live next to the RTDB instance
    if (new URLSearchParams(location.search).has("emu")){
      auth.useEmulator("http://localhost:9099", { disableWarnings: true });
      db.useEmulator("localhost", 9000);
      fns.useEmulator("localhost", 5001);
      console.warn("[emu] using local Firebase emulators");
    }
  }
} catch(e){ console.warn("Firebase init failed — guest mode.", e); }

/* ════════ SERVER CALLS ════════
   Competitive money (duels, tournament) moves only on the server. Callables
   that touch the balance return { chips: <new server balance> }; adopting it
   here keeps the local wallet from clobbering a server-side deduction. */
async function callFn(name, data){
  if (!fns) throw new Error("Server features need Firebase");
  const res = await fns.httpsCallable(name)(data || {});
  if (res.data && typeof res.data.chips === "number") applyServerChips(res.data.chips);
  return res.data;
}
function applyServerChips(v){
  chips = Math.max(0, Math.floor(v));
  localStorage.setItem("gg_chips", String(chips));
  renderChips(); paintBailout();
}
async function refreshChips(){
  if (!fbReady || !user) return;
  const v = (await db.ref("users/"+user.uid+"/chips").get()).val();
  if (typeof v === "number") applyServerChips(v);
}

/* ════════ STATE / CHIPS ════════ */
let chips = parseInt(localStorage.getItem("gg_chips") || "1000", 10);
let displayName = localStorage.getItem("gg_name") || "";
let bonusAt = parseInt(localStorage.getItem("gg_bonus") || "0", 10);

function fmt(n){
  n = Math.floor(n);
  // balances beyond 1e15 (cheated/overflowed accounts) render compact instead of 60-digit walls
  if (Math.abs(n) >= 1e15) return n.toExponential(2).replace("e+","e");
  return n.toLocaleString("en-US");
}

/* reduced-motion guard shared by all JS-driven animation */
const RMQ = matchMedia("(prefers-reduced-motion: reduce)");
let RM = RMQ.matches;
if (RMQ.addEventListener) RMQ.addEventListener("change", e => RM = e.matches);

/* low-fx mode: phones / small screens / weak CPUs skip the expensive canvas glow
   (shadowBlur is rasterized per draw call and is the #1 mobile frame killer) */
const LOWFX = matchMedia("(max-width:900px), (pointer:coarse)").matches || (navigator.hardwareConcurrency || 8) <= 4;

/* shared ~60fps frame gate: per-frame-stepped games call this with their slot name;
   returns false when the frame should be skipped (keeps 120Hz phones at design speed
   and stops double-stepping). window.__ggUncap=true bypasses it for tests. */
const _fGate = {};
function frameGate(slot){
  if (window.__ggUncap) return true;
  const n = performance.now();
  if (n - (_fGate[slot] || 0) < 14) return false;
  _fGate[slot] = n;
  return true;
}

/* chip odometer: rolls to the new balance, green up / red down, with floating delta */
let chipShown = chips, chipPrev = chips, chipTweenRaf = 0;
function spawnDelta(d){
  const el = document.createElement("div");
  el.className = "chipdelta " + (d > 0 ? "up" : "down");
  el.textContent = (d > 0 ? "+" : "−") + fmt(Math.abs(d));
  const r = $("chipbal").getBoundingClientRect();
  const stack = document.querySelectorAll(".chipdelta").length;
  el.style.left = (r.left + r.width/2) + "px";
  el.style.top = (r.bottom + 4 + stack*16) + "px";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1100);
}
function renderChips(){
  const target = chips, from = chipShown;
  const tx = target - chipPrev;  // true transaction amount for the floating delta
  const d = target - from;       // animated distance for the roll
  chipPrev = target;
  const el = $("chipnum");
  if (tx && !RM) spawnDelta(tx);
  if (!d || RM){ chipShown = target; el.textContent = fmt(target); el.style.color = ""; return; }
  cancelAnimationFrame(chipTweenRaf);
  el.style.color = d > 0 ? "#7be0a3" : "#ff7b7b";
  const t0 = performance.now(), dur = 400;
  (function step(now){
    const t = Math.min(1, (now - t0)/dur), e = 1 - Math.pow(1-t, 3);
    chipShown = from + d*e;
    el.textContent = fmt(chipShown);
    if (t < 1) chipTweenRaf = requestAnimationFrame(step);
    else { chipShown = target; el.textContent = fmt(target); el.style.color = ""; chipTweenRaf = 0; }
  })(t0);
}
function paintBailout(){ const b = $("bailoutbtn"); if (b) b.style.display = chips < 10 ? "" : "none"; }
function saveChips(){
  localStorage.setItem("gg_chips", String(chips));
  if (fbReady && user) {
    db.ref("users/"+user.uid).update({ chips: Math.floor(chips), name: displayName || "Player" });
  }
  renderChips();
  paintBailout();
}
function addChips(d){
  chips = Math.max(0, chips + d); saveChips();
  if (chips >= 5000) ach("chips5k");
  if (chips >= 25000) ach("chips25k");
  if (chips >= 100000) ach("chips100k");
}
/* ════════ PENDING-ESCROW LEDGER ════════
   Round-based games deduct (and persist) the bet at round start, so closing the
   tab mid-round used to eat the bet — the refund lived only in the abort path.
   Games hold the bet here at round start and settle it on any resolution;
   anything still held at next load is an orphan and gets refunded. */
function escrowMap(){ try { return JSON.parse(localStorage.getItem("gg_escrow") || "{}"); } catch(e){ return {}; } }
function escrowHold(k, amt){ const m = escrowMap(); m[k] = amt; localStorage.setItem("gg_escrow", JSON.stringify(m)); }
function escrowSettle(k){ const m = escrowMap(); if (k in m){ delete m[k]; localStorage.setItem("gg_escrow", JSON.stringify(m)); } }
function escrowSweep(){
  // skip rounds that are actually live right now (sweep can re-run on auth changes)
  const live = { crash: () => typeof crLive !== "undefined" && crLive,
                 mines: () => typeof mnLive !== "undefined" && mnLive };
  const m = escrowMap(); let tot = 0;
  for (const k of Object.keys(m)){
    if (live[k] && live[k]()) continue;
    tot += +m[k] || 0; delete m[k];
  }
  localStorage.setItem("gg_escrow", JSON.stringify(m));
  if (tot > 0){ addChips(tot); toast("Interrupted round — " + fmt(tot) + " in bets returned"); }
}
function takeBet(inputId){
  const v = Math.floor(Number($(inputId).value));
  if (!v || v < 1) { toast("Enter a bet"); return 0; }
  if (v > chips) { toast("Not enough chips"); return 0; }
  chips -= v; saveChips(); chipToss(); SND.chips(2); return v;
}
function bumpBet(id, d){ $(id).value = Math.min(chips, (Math.floor(Number($(id).value))||0) + d); }
function toast(t){
  const el = document.createElement("div"); el.className = "toast"; el.textContent = t;
  document.body.appendChild(el); setTimeout(()=>el.remove(), 2700);
}

/* ════════ DAILY BONUS — streak system ════════
   Consecutive daily claims pay more: 150, 200, 250 … capped at 500.
   The chain survives up to 48h between claims, then resets. */
let streak = null;
try { streak = JSON.parse(localStorage.getItem("gg_streak") || "null"); } catch(e){}
if (!streak) streak = { n: 0, last: 0 };
function bonusAmount(){
  const live = Date.now() - streak.last <= 48*3600*1000 ? streak.n : 0;
  return Math.min(500, 150 + live*50);
}
function saveStreak(){
  localStorage.setItem("gg_streak", JSON.stringify(streak));
  if (fbReady && user) db.ref("users/"+user.uid+"/streak").set(streak);
}
function claimBonus(){
  if (Date.now() < bonusAt) return;
  if (Date.now() - streak.last > 48*3600*1000) streak.n = 0;
  const amt = Math.min(500, 150 + streak.n*50);
  streak.n++; streak.last = Date.now();
  saveStreak();
  bonusAt = Date.now() + 24*3600*1000;
  localStorage.setItem("gg_bonus", String(bonusAt));
  if (fbReady && user) db.ref("users/"+user.uid+"/bonusAt").set(bonusAt);
  addChips(amt); confetti(innerWidth/2, 70, 60, true);
  toast("+" + amt + " daily chips · day " + streak.n + " streak");
  SND.bonus(); ach("daily1");
  tickBonus();
}
function tickBonus(){
  const b = $("bonusbtn"), left = bonusAt - Date.now();
  if (left <= 0){ b.disabled = false; b.textContent = "+" + bonusAmount() + " Bonus"; return; }
  b.disabled = true;
  const h = Math.floor(left/3600000), m = Math.floor(left%3600000/60000), s = Math.floor(left%60000/1000);
  b.textContent = String(h).padStart(2,"0")+":"+String(m).padStart(2,"0")+":"+String(s).padStart(2,"0");
}
setInterval(tickBonus, 1000);

/* ════════ HOURLY DRIP — small idle income, banked up to 8h ════════ */
const DRIP_PER_HR = 20, DRIP_CAP_HRS = 8;
let dripLast = parseInt(localStorage.getItem("gg_drip") || "0", 10);
if (!dripLast){ dripLast = Date.now(); localStorage.setItem("gg_drip", String(dripLast)); }
function checkDrip(){
  const hrs = Math.floor((Date.now() - dripLast)/3600000);
  if (hrs < 1) return;
  const paidHrs = Math.min(hrs, DRIP_CAP_HRS);
  const pay = paidHrs * DRIP_PER_HR;
  // keep the fractional-hour remainder ticking unless the bank was capped
  dripLast = hrs > DRIP_CAP_HRS ? Date.now() : dripLast + paidHrs*3600000;
  localStorage.setItem("gg_drip", String(dripLast));
  addChips(pay);
  toast("🕯 +" + pay + " house hospitality");
  SND.chips(2);
}
setInterval(checkDrip, 60000);
setTimeout(checkDrip, 2500); // after load settles

/* ════════ BAILOUT — house credit, offered only when broke ════════ */
function bailout(){
  if (chips >= 10) return;
  chips = 1000; saveChips();
  confetti(innerWidth/2, 70, 80, true);
  toast("The house staked you 1,000. Don't make it weird.");
  SND.bonus(); ach("rockBottom");
}

/* ════════ AUTH ════════ */
let authMode = "login";
function authBtnClick(){
  if (user){ auth.signOut(); return; }
  if (!fbReady){ toast("Firebase not configured — guest mode"); return openAuthInfoless(); }
  $("authmodal").classList.add("on"); $("autherr").textContent = "";
}
function openAuthInfoless(){ $("authmodal").classList.add("on"); $("autherr").textContent = "Add your Firebase config to enable accounts."; }
function closeAuth(){
  $("authmodal").classList.remove("on");
  const t = $("authtilt");
  t.style.setProperty("--tx", "0deg"); t.style.setProperty("--ty", "0deg");
}
function swapAuthMode(){
  authMode = authMode === "login" ? "signup" : "login";
  const s = authMode === "signup";
  $("namefield").style.display = s ? "block" : "none";
  $("authtitle").textContent = s ? "Join the house" : "Welcome back";
  $("authsub").textContent = s ? "1,000 chips on signup" : "sign in to the house";
  $("authsubmit").textContent = s ? "Create account" : "Sign in";
  $("authswap").textContent = s ? "Already a member? Sign in" : "New here? Create an account";
  $("autherr").textContent = "";
}
async function authSubmit(){
  if (!fbReady){ $("autherr").textContent = "Firebase config missing."; return; }
  const em = $("authemail").value.trim(), pw = $("authpass").value;
  try {
    if (authMode === "signup"){
      const name = $("authname").value.trim() || "Player";
      const cred = await auth.createUserWithEmailAndPassword(em, pw);
      await cred.user.updateProfile({ displayName: name });
      displayName = name;
      // update(), not set(): rules grant child-level writes only, and the server-owned pub/ subtree must survive
      await db.ref("users/"+cred.user.uid).update({ name, chips: 1000, bonusAt: 0, created: Date.now() });
      chips = 1000;
    } else {
      await auth.signInWithEmailAndPassword(em, pw);
    }
    closeAuth();
  } catch(e){ $("autherr").textContent = (e.message||"Auth failed").replace("Firebase: ",""); }
}
if (fbReady) auth.onAuthStateChanged(async u => {
  user = u;
  if (u){
    $("authbtn").textContent = "Sign out";
    const snap = await db.ref("users/"+u.uid).get();
    const d = snap.val() || {};
    displayName = d.name || u.displayName || "Player";
    if (typeof d.chips === "number") chips = d.chips;
    else await db.ref("users/"+u.uid).update({ name: displayName, chips: chips, bonusAt: bonusAt });
    if (typeof d.bonusAt === "number") bonusAt = Math.max(bonusAt, d.bonusAt);
    // guards: these live in a later <script> block — a very fast auth restore could land first
    if (typeof stMerge === "function") stMerge(d.stats);
    // server is authoritative for tickets, same as chips — Math.max here resurrected spent tickets
    if (typeof d.tickets === "number") tickets = d.tickets;
    if (d.streak && (d.streak.last || 0) > (streak.last || 0)) streak = d.streak;
    if (typeof przMerge === "function") przMerge(d.prizes);
    if (typeof saveTix === "function") saveTix();
    saveStreak();
    $("username").textContent = displayName;
    localStorage.setItem("gg_name", displayName);
    chipPrev = chipShown = chips; // account balance load is not a transaction — no delta/roll
    saveChips(); loadLeaderboard();
    escrowSweep(); // refund bets orphaned by a mid-round tab close — after server chips land, so the refund isn't clobbered
  } else {
    $("authbtn").textContent = "Sign in";
    $("username").textContent = "";
    displayName = "";
    renderChips(); loadLeaderboard();
    escrowSweep();
  }
  tickBonus();
});

/* ════════ LEADERBOARD ════════
   Requires public reads on users/ in Realtime Database rules (Firebase console → Realtime Database → Rules):
   {
     "rules": {
       "users": {
         ".read": true,
         ".indexOn": "chips",
         "$uid": { ".write": "auth != null && auth.uid === $uid" }
       }
     }
   }
   Reads stay public so guests see the board; writes stay locked to the owning account. */
async function loadLeaderboard(){
  const body = $("lbbody"), tease = $("teasestrip");
  if (!fbReady){
    body.innerHTML = ""; $("lblocked").style.display = "block";
    $("lblocked").textContent = "Connect Firebase to light up the leaderboard.";
    tease.innerHTML = '<div class="tease">Leaderboard offline — guest mode</div>'; return;
  }
  $("lblocked").style.display = user ? "none" : "block";
  try {
    const snap = await db.ref("users").orderByChild("chips").limitToLast(10).get();
    // NOTE: Firebase forEach cancels iteration when the callback returns truthy —
    // Array.push returns the new length, so the callback must not return it.
    const rows = []; snap.forEach(c => { rows.push({ uid: c.key, ...c.val() }); });
    console.log("[leaderboard] users/ query returned", rows.length, "rows");
    // sort client-side so render is correct even if .indexOn is missing and the SDK falls back unordered
    rows.sort((a,b)=>(b.chips||0)-(a.chips||0));
    body.innerHTML = rows.map((r,i) =>
      `<tr class="${user && r.uid===user.uid ? "me":""}"><td class="rk">#${i+1}</td><td>${esc(r.name||"Player")}</td><td>${fmt(r.chips||0)}</td><td>${(r.pub && r.pub.duelWins) || 0}</td></tr>`).join("");
    tease.innerHTML = rows.slice(0,6).map((r,i) => `<div class="tease">#${i+1} <b>${esc(r.name||"Player")}</b> · ${fmt(r.chips||0)}</div>`).join("") || '<div class="tease">No players yet — be the first.</div>';
    if (!rows.length) console.warn("[leaderboard] zero rows — users/ path empty or data shape mismatch");
  } catch(e){
    console.error("[leaderboard] read failed — Realtime Database rules are likely blocking guest reads on users/. Set users/.read to true (see comment above loadLeaderboard).", e);
    body.innerHTML = "";
    tease.innerHTML = '<div class="tease">Leaderboard unavailable</div>';
    $("lblocked").style.display = "block";
    $("lblocked").textContent = "Leaderboard blocked by database rules — allow public reads on users/.";
  }
}
function esc(s){ return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

/* ════════ GAME REGISTRY ════════
   Each game/view file self-registers instead of core enumerating everyone:
     registerGame("crash", { init: crashIdleDraw, stop: crashAbort });
   init  — run when the view is opened via openGame()
   stop  — run on every view change (cancel loops, abort/refund live rounds) */
const GG_GAMES = {};
function registerGame(name, def){ GG_GAMES[name] = def || {}; }

/* ════════ NAVIGATION ════════ */
function showView(name){
  const cur = document.querySelector(".view.on");
  if (cur && cur.id !== "view-"+name){
    cur.classList.add("vout");
    setTimeout(() => cur.classList.remove("vout"), 170);
  }
  document.querySelectorAll(".view").forEach(v => { v.classList.remove("on"); v.classList.remove("gzoom"); });
  $("view-"+name).classList.add("on");
  document.querySelectorAll("[data-nav]").forEach(p => p.classList.toggle("active", p.dataset.nav === name));
  stopArcadeLoops();
  if (name === "casino") dustStart(); else dustStop();
  if (name === "leaderboard" || name === "home") loadLeaderboard();
  if (name === "stats") statsRender();
  if (name === "prizes") prizeRender();
  if (name === "duel" && typeof duelLobby === "function") duelLobby();
  if (name === "tourney" && typeof tnInit === "function") tnInit();
  if (typeof updateBgScenes === "function") updateBgScenes(name);
  window.scrollTo({ top: 0 });
}
function openGame(name){
  showView(name);
  const v = $("view-"+name);
  if (v.classList.contains("tc")){ v.classList.add("gzoom"); setTimeout(()=>v.classList.remove("gzoom"), 480); }
  // CRT power-on: first arcade game of the session only
  if (v.classList.contains("ta") && !RM && !sessionStorage.getItem("gg_crtboot")){
    sessionStorage.setItem("gg_crtboot", "1");
    const w = v.querySelector(".arccvwrap");
    if (w){ w.classList.add("crtboot"); setTimeout(()=>w.classList.remove("crtboot"), 700); }
  }
  const g = GG_GAMES[name];
  if (g && g.init) g.init();
}
function stopArcadeLoops(){
  for (const g of Object.values(GG_GAMES)) if (g.stop) g.stop();
}

/* ════════ GOLD DUST AMBIENCE ════════ */
const dust = $("dustcv"), dustx = dust.getContext("2d");
let dustP = [], dustRaf = 0;
function dustSize(){
  const r = $("view-casino").getBoundingClientRect();
  dust.width = Math.max(320, r.width); dust.height = Math.max(400, $("view-casino").scrollHeight || r.height);
}
function dustStart(){
  if (RM) return;
  dustSize();
  if (!dustP.length){
    const n = Math.min(70, Math.floor(dust.width * dust.height / 16000));
    for (let i=0;i<n;i++) dustP.push({
      x: Math.random()*dust.width, y: Math.random()*dust.height,
      r: .6 + Math.random()*1.7, a: .04 + Math.random()*.22,
      vx: (Math.random()-.5)*.16, vy: -.05 - Math.random()*.14,
      tw: Math.random()*Math.PI*2, ts: .008 + Math.random()*.02
    });
  }
  if (!dustRaf) dustLoop();
}
function dustStop(){ cancelAnimationFrame(dustRaf); dustRaf = 0; }
function dustLoop(){
  if (!$("view-casino").classList.contains("on")){ dustRaf = 0; return; }
  dustx.clearRect(0,0,dust.width,dust.height);
  for (const p of dustP){
    p.x += p.vx + Math.sin(p.tw)*.06; p.y += p.vy; p.tw += p.ts;
    if (p.y < -6){ p.y = dust.height + 6; p.x = Math.random()*dust.width; }
    if (p.x < -6) p.x = dust.width + 6; if (p.x > dust.width + 6) p.x = -6;
    const tw = (Math.sin(p.tw*2.2)+1)/2;
    dustx.globalAlpha = p.a * (.4 + tw*.6);
    dustx.fillStyle = "#e8cf8a";
    dustx.shadowColor = "rgba(232,207,138,.8)"; dustx.shadowBlur = p.r*3;
    dustx.beginPath(); dustx.arc(p.x, p.y, p.r, 0, 7); dustx.fill();
  }
  dustx.globalAlpha = 1; dustx.shadowBlur = 0;
  dustRaf = requestAnimationFrame(dustLoop);
}
addEventListener("resize", ()=>{ if ($("view-casino").classList.contains("on")) dustSize(); });

/* ════════ CONFETTI ════════ */
const fx = $("fxcv"), fxc = fx.getContext("2d");
let fxP = [], fxRun = false;
function fxSize(){ fx.width = innerWidth; fx.height = innerHeight; }
addEventListener("resize", fxSize); fxSize();
function confetti(x, y, n = 90, gold = false){
  if (RM) return;
  const cols = (typeof przConfPal === "function" && przConfPal())
    || ["#c9a84c","#e8cf8a","#ff2d78","#b44fff","#3ee8ff","#7be0a3","#fff"];
  for (let i = 0; i < n; i++){
    const a = Math.random()*Math.PI*2, sp = 3+Math.random()*7;
    fxP.push({ x, y, vx: Math.cos(a)*sp, vy: Math.sin(a)*sp-4, g: .18+Math.random()*.1,
      s: 4+Math.random()*5, r: Math.random()*Math.PI, vr: (Math.random()-.5)*.3,
      coin: gold, c: cols[(Math.random()*cols.length)|0], life: 70+Math.random()*40 });
  }
  if (!fxRun){ fxRun = true; fxLoop(); }
}
/* chip arc toss: nav balance → active game panel, cosmetic only */
let fxT = [];
function chipToss(){
  if (RM) return;
  const panel = document.querySelector(".view.on .panel");
  if (!panel) return;
  const bal = $("chipbal").getBoundingClientRect(), pr = panel.getBoundingClientRect();
  fxT.push({ x0: bal.left + bal.width/2, y0: bal.bottom,
    x1: pr.left + pr.width/2, y1: Math.max(70, Math.min(pr.top + pr.height*.45, innerHeight*.7)),
    t0: performance.now(), dur: 520 });
  if (!fxRun){ fxRun = true; fxLoop(); }
}
/* shared gold coin sprite (confetti coins + arc toss) */
function drawCoin(x, y, r, sq, lw = 1, inner = false){
  fxc.save(); fxc.translate(x, y);
  fxc.fillStyle = sq > .6 ? "#ffe9a8" : "#e8cf8a";
  fxc.beginPath(); fxc.ellipse(0, 0, r, r*sq, 0, 0, 7); fxc.fill();
  fxc.strokeStyle = "#8b6a1e"; fxc.lineWidth = lw; fxc.stroke();
  if (inner){
    fxc.beginPath(); fxc.ellipse(0, 0, r*.61, r*.61*sq, 0, 0, 7);
    fxc.strokeStyle = "rgba(139,106,30,.6)"; fxc.lineWidth = 1; fxc.stroke();
  }
  fxc.restore();
}
function fxLoop(){
  fxc.clearRect(0,0,fx.width,fx.height);
  fxP = fxP.filter(p => p.life > 0 && p.y < fx.height+20);
  for (const p of fxP){
    p.x += p.vx; p.y += p.vy; p.vy += p.g; p.vx *= .99; p.r += p.vr; p.life--;
    fxc.globalAlpha = Math.min(1, p.life/30);
    if (p.coin){
      // spinning gold coin: ellipse squashes with rotation phase
      drawCoin(p.x, p.y, p.s*.62, Math.max(.14, Math.abs(Math.cos(p.r*2))));
    } else {
      fxc.save(); fxc.translate(p.x,p.y); fxc.rotate(p.r);
      fxc.fillStyle = p.c; fxc.fillRect(-p.s/2,-p.s/2,p.s,p.s*0.6);
      fxc.restore();
    }
  }
  const now = performance.now();
  for (let i = fxT.length-1; i >= 0; i--){
    const c = fxT[i], t = (now - c.t0)/c.dur;
    if (t >= 1){ fxT.splice(i,1); continue; }
    const x = c.x0 + (c.x1-c.x0)*t;
    const arcH = Math.min(140, Math.abs(c.x1-c.x0)*.25 + 60);
    const y = c.y0 + (c.y1-c.y0)*t - Math.sin(t*Math.PI)*arcH;
    const sq = .35 + .65*Math.abs(Math.cos(t*9));
    fxc.globalAlpha = t > .85 ? (1-t)/.15 : 1;
    drawCoin(x, y, 9, sq, 2, true);
  }
  fxc.globalAlpha = 1;
  if (fxP.length || fxT.length){ requestAnimationFrame(fxLoop); } else { fxRun = false; fxc.clearRect(0,0,fx.width,fx.height); }
}
function winFx(payout, bet){
  if (bet > 0 && payout >= bet*2)
    confetti(innerWidth/2, innerHeight*0.35, 110, !!document.querySelector(".view.on.tc"));
}
function screenShake(el){ el.classList.remove("shakeit"); void el.offsetWidth; el.classList.add("shakeit"); }
function screenFlash(){ const f=$("flashlay"); f.classList.remove("on"); void f.offsetWidth; f.classList.add("on"); SND.boom(); }

renderChips(); tickBonus(); loadLeaderboard();
if (!fbReady) escrowSweep(); // with Firebase, the auth callback runs the sweep once chips are authoritative

/* ════════ IDLE ATTRACT (casino hub, 30s idle) ════════ */
const attractTg = document.querySelector("#view-casino .tilegrid");
let lastAct = Date.now();
function bumpActivity(){
  lastAct = Date.now();
  if (attractTg.classList.contains("attract")) attractTg.classList.remove("attract");
}
["pointerdown","keydown","touchstart"].forEach(ev => addEventListener(ev, bumpActivity, { passive: true }));
setInterval(() => {
  if (!RM && Date.now() - lastAct > 30000 && $("view-casino").classList.contains("on"))
    attractTg.classList.add("attract");
}, 5000);

/* ════════ SHARED HOVER ATMOSPHERE (desktop pointer only) ════════
   One rAF-throttled mousemove listener feeds: casino tile spotlight,
   home zone-card parallax, auth-modal tilt, idle-attract activity.
   Inert on touch / <768px / reduced motion. */
if (matchMedia("(pointer:fine)").matches && innerWidth >= 768 && !RM){
  let mvEv = null;
  addEventListener("mousemove", e => {
    const had = !!mvEv; mvEv = e;
    if (!had) requestAnimationFrame(hoverFrame);
  }, { passive: true });
  function hoverFrame(){
    const e = mvEv; mvEv = null;
    if (!e) return;
    bumpActivity();
    // casino tile spotlight
    const tile = e.target.closest && e.target.closest(".tc .gtile");
    if (tile){
      const r = tile.getBoundingClientRect();
      tile.style.setProperty("--mx", ((e.clientX - r.left)/r.width*100).toFixed(1) + "%");
      tile.style.setProperty("--my", ((e.clientY - r.top)/r.height*100).toFixed(1) + "%");
    }
    // home zone cards: opposing parallax
    if ($("view-home").classList.contains("on")){
      const nx = e.clientX/innerWidth*2 - 1, ny = e.clientY/innerHeight*2 - 1;
      const zc = document.querySelector(".zc-casino"), za = document.querySelector(".zc-arcade");
      if (zc){ zc.style.setProperty("--px", (nx*7).toFixed(1)+"px"); zc.style.setProperty("--py", (ny*5).toFixed(1)+"px"); }
      if (za){ za.style.setProperty("--px", (-nx*7).toFixed(1)+"px"); za.style.setProperty("--py", (-ny*5).toFixed(1)+"px"); }
    }
    // auth modal tilt
    if ($("authmodal").classList.contains("on")){
      const r = $("authcard").getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width/2))/r.width;
      const dy = (e.clientY - (r.top + r.height/2))/r.height;
      const cl = v => Math.max(-4, Math.min(4, v));
      const t = $("authtilt");
      t.style.setProperty("--tx", cl(-dy*6).toFixed(2)+"deg");
      t.style.setProperty("--ty", cl(dx*6).toFixed(2)+"deg");
    }
  }
}
