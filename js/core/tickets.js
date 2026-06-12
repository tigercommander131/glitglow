/* ════════════════ TICKETS — arcade currency ════════════════ */
let tickets = parseInt(localStorage.getItem("gg_tix") || "0", 10);
function paintTix(){ $("tixnum").textContent = fmt(tickets); }
function saveTix(){
  localStorage.setItem("gg_tix", String(tickets));
  if (fbReady && user) db.ref("users/"+user.uid+"/tickets").set(tickets);
  paintTix();
}
function addTix(n){ tickets += n; saveTix(); }
/* per-cabinet rates tuned so a decent run pays roughly 20–80 tickets */
const TK_RATE = { snake:2, breakout:1/20, tetris:1/125, invaders:1/25, flapwave:2, asteroids:1/60, chomp:1/50, missile:1/75 };

