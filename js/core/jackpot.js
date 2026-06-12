/* ════════════════ PROGRESSIVE JACKPOT — one pool for everyone ════════════════ */
const JK_SEED = 5000;
let jkPool = parseInt(localStorage.getItem("gg_jackpot") || String(JK_SEED), 10) || JK_SEED;
function jkPaint(){
  const el = $("jacknum"); if (!el) return;
  el.textContent = fmt(jkPool);
  const b = $("jackbal"); b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop");
}
if (fbReady){
  db.ref("jackpot/pool").on("value", s => {
    const v = s.val();
    if (typeof v === "number"){ jkPool = v; jkPaint(); }
    else {
      // missing pool: show the seed locally; only a signed-in client may seed the
      // DB (rules), and a guest's denied set would loop via optimistic-revert
      jkPool = JK_SEED; jkPaint();
      if (user) db.ref("jackpot/pool").set(JK_SEED);
    }
  });
}
function jkFeed(n){
  if (n <= 0) return;
  // guests feed a local pool — shared pool writes only when signed in (DB rules want auth)
  if (fbReady && user) db.ref("jackpot/pool").transaction(v => (typeof v === "number" ? v : JK_SEED) + n);
  else { jkPool += n; localStorage.setItem("gg_jackpot", String(jkPool)); jkPaint(); }
}
function jkWin(how){
  const payout = Math.max(jkPool, JK_SEED);
  jkPool = JK_SEED;
  if (fbReady && user){
    db.ref("jackpot/pool").set(JK_SEED);
    db.ref("jackpot/last").set({ name: displayName || "Player", amt: payout, at: Date.now(), how });
  } else localStorage.setItem("gg_jackpot", String(jkPool));
  jkPaint();
  addChips(payout);
  confetti(innerWidth/2, innerHeight*0.3, 240, true);
  SND.win(true);
  toast("💰 JACKPOT · " + how + " · +" + fmt(payout));
}
jkPaint();

