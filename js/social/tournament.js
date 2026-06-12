/* ════════════════ DAILY TOURNAMENT — Dealer's Gauntlet ════════════════ */
const TN_BUYIN = 1000, TN_HANDS = 10, TN_START = 500, TN_BET = 50;
let tnPlayers = {}, tnScores = {}, tnRefP = null, tnRefS = null, tnDay = null;
let tnRng = null, tnStack = 0, tnHandN = 0, tnMe = [], tnDl = [], tnLive = false;
function tnDayKey(t){
  const d = t || new Date();
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
}
function tnInit(){
  tnDay = tnDayKey();
  const ok = fbReady && user;
  if (!ok){
    $("tnpot").textContent = "Sign in to enter";
    $("tnenter").style.display = "none"; $("tnplay").style.display = "none"; $("tnclaim").style.display = "none";
    $("tnbody").innerHTML = "";
    return;
  }
  if (tnRefP){ tnRefP.off(); tnRefS.off(); }
  tnRefP = db.ref("tourney/"+tnDay+"/players");
  tnRefS = db.ref("tourney/"+tnDay+"/scores");
  tnRefP.on("value", s => {
    tnPlayers = s.val() || {};
    const n = Object.keys(tnPlayers).length;
    $("tnpot").textContent = "POT ⛁ " + fmt(n*TN_BUYIN) + " · " + n + " entered";
    tnButtons();
  });
  tnRefS.on("value", s => {
    tnScores = s.val() || {};
    const rows = Object.entries(tnScores).map(([uid, r]) => ({ uid, ...r })).sort((a,b) => b.score - a.score);
    $("tnbody").innerHTML = rows.length ? rows.map((r,i) =>
      `<tr class="${user && r.uid === user.uid ? "me" : ""}"><td>#${i+1}</td><td>${esc(r.name || "Player")}</td><td>${fmt(r.score)}</td></tr>`).join("")
      : '<tr><td colspan="3" style="font-style:italic;color:#a89878">Nobody has run the gauntlet yet today.</td></tr>';
    tnButtons();
  });
  tnCheckClaim();
}
function tnButtons(){
  if (!user) return;
  const entered = !!tnPlayers[user.uid], played = !!tnScores[user.uid];
  $("tnenter").style.display = entered ? "none" : "";
  $("tnplay").style.display = entered && !played && !tnLive ? "" : "none";
}
function tnEnter(){
  if (!fbReady || !user){ toast("Sign in first"); return; }
  if (tnPlayers[user.uid]) return;
  if (chips < TN_BUYIN){ toast("Need " + fmt(TN_BUYIN) + " chips to enter"); return; }
  chips -= TN_BUYIN; saveChips(); chipToss(); SND.chips(3);
  db.ref("tourney/"+tnDay+"/players/"+user.uid).set({ name: displayName || "Player", at: Date.now() });
  toast("🏆 You're in — play your run any time today");
}
function tnPlay(){
  if (tnLive || !user || tnScores[user.uid]) return;
  tnLive = true;
  // everyone draws from the same seeded shoe — same luck for all
  tnRng = mulberry32(hashStr("gg-gauntlet-" + tnDay));
  tnStack = TN_START; tnHandN = 0;
  // placeholder score locks the single attempt even if they bail mid-run
  db.ref("tourney/"+tnDay+"/scores/"+user.uid).set({ name: displayName || "Player", score: 0, at: Date.now() });
  $("tnrun").style.display = ""; $("tnplay").style.display = "none";
  tnNextHand();
}
function tnNextHand(){
  tnHandN++;
  if (tnHandN > TN_HANDS || tnStack < TN_BET){ tnFinish(); return; }
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
function tnFinish(){
  tnLive = false;
  $("tnrun").style.display = "none";
  db.ref("tourney/"+tnDay+"/scores/"+user.uid).set({ name: displayName || "Player", score: tnStack, at: Date.now() });
  toast("🏆 Gauntlet done — final stack " + fmt(tnStack));
  SND.win(tnStack > TN_START);
}
async function tnCheckClaim(){
  if (!fbReady || !user) return;
  const yday = tnDayKey(new Date(Date.now() - 86400000));
  try {
    const snap = await db.ref("tourney/"+yday).get();
    const v = snap.val();
    if (!v || !v.scores || !v.players) return;
    if (v.claims && v.claims[user.uid]) return;
    const rows = Object.entries(v.scores).map(([uid, r]) => ({ uid, ...r })).sort((a,b) => b.score - a.score);
    const rank = rows.findIndex(r => r.uid === user.uid);
    if (rank < 0 || rank > 2) return;
    const pot = Object.keys(v.players).length * TN_BUYIN;
    const share = Math.floor(pot * [0.5, 0.3, 0.2][rank]);
    const btn = $("tnclaim");
    btn.style.display = "";
    btn.textContent = "Claim Yesterday's #" + (rank+1) + " · +" + fmt(share);
    btn.dataset.day = yday; btn.dataset.share = share;
  } catch(e){}
}
async function tnClaim(){
  const btn = $("tnclaim"), share = +btn.dataset.share, day = btn.dataset.day;
  if (!share || !day || !user) return;
  btn.style.display = "none";
  // claims/$uid is the idempotency record — a transaction makes sure a double-click,
  // a re-render, or a second device can only ever pay the prize once
  let res;
  try {
    res = await db.ref("tourney/"+day+"/claims/"+user.uid).transaction(v => v == null ? share : undefined);
  } catch(e){ btn.style.display = ""; toast("Claim failed — try again"); return; }
  if (!res.committed){ toast("Prize already claimed"); return; }
  addChips(share);
  confetti(innerWidth/2, innerHeight*0.3, 160, true); SND.win(true);
  toast("🏆 Tournament prize — +" + fmt(share));
}
