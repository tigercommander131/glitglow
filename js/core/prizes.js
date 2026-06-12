/* ════════════════ PRIZE COUNTER ════════════════ */
const PRIZES = [
  { id:"token_continue", token:"continue", icon:"▶", name:"Continue Token", desc:"Cheat death once in any cabinet — an INSERT TOKEN button appears on the game-over screen.", cost:200 },
  { id:"token_doubler", token:"doubler", icon:"🎟", name:"Ticket Doubler", desc:"Your next arcade ticket payout pays double. Stacks in your pocket, spent automatically.", cost:150 },
  { id:"cardback_crimson", slot:"cardback", cls:"cb-crimson", icon:"🂠", name:"Crimson Weave", desc:"Deep-red lattice card backs. The classic, sharpened.", cost:200 },
  { id:"cardback_navy", slot:"cardback", cls:"cb-navy", icon:"🂠", name:"Midnight Deck", desc:"Navy pinstripe card backs on every casino table.", cost:250 },
  { id:"cardback_emerald", slot:"cardback", cls:"cb-emerald", icon:"🂠", name:"Emerald Lattice", desc:"Green-felt weave with a soft inner glow.", cost:300 },
  { id:"cardback_carbon", slot:"cardback", cls:"cb-carbon", icon:"🂠", name:"Carbon Black", desc:"Matte carbon-fiber backs. Murdered out.", cost:350 },
  { id:"cardback_circuit", slot:"cardback", cls:"cb-circuit", icon:"🂠", name:"Circuit Neon", desc:"Cyan traces on dark silicon — the arcade leaks into the casino.", cost:400 },
  { id:"cardback_ornate", slot:"cardback", cls:"cb-ornate", icon:"🂠", name:"Vintage Ornate", desc:"Engraved rings and old-gold filigree, like grandfather's riverboat deck.", cost:500 },
  { id:"cardback_gold", slot:"cardback", cls:"cb-gold", icon:"🃏", name:"Gilded Deck", desc:"Filigree gold card backs. Pure ostentation.", cost:700 },
  { id:"cardback_prism", slot:"cardback", cls:"cb-prism", icon:"🃏", name:"Holo Prism", desc:"Animated holographic shimmer rolls across every card back.", cost:900 },
  { id:"felt_royal", slot:"felt", cls:"felt-royal", icon:"▦", name:"Royal Blue Felt", desc:"Re-cover every table in royal blue.", cost:350 },
  { id:"felt_burgundy", slot:"felt", cls:"felt-burgundy", icon:"▦", name:"Burgundy Felt", desc:"Deep wine-red felt for the tables.", cost:350 },
  { id:"felt_noir", slot:"felt", cls:"felt-noir", icon:"▦", name:"Noir Felt", desc:"Black-on-black. The pit boss special.", cost:500 },
  { id:"dice_gold", slot:"dice", icon:"⚄", name:"Gilded Bones", desc:"Sic Bo rolls solid-gold dice with onyx pips.", cost:350 },
  { id:"ball_gold", slot:"ball", icon:"◉", name:"Golden Pill", desc:"The roulette ball, cast in gold.", cost:350 },
  { id:"bricks_sunset", slot:"bricks", icon:"▬", name:"Sunset Bricks", desc:"Breakout walls in molten reds and oranges.", cost:300 },
  { id:"tet_gold", slot:"tetro", icon:"▣", name:"Gilded Tetrominoes", desc:"Every Tetris piece drops in shades of casino gold.", cost:400 },
  { id:"pac_cyan", slot:"pac", icon:"ᗧ", name:"Cyan Chomper", desc:"Chomp glows arcade cyan.", cost:300 },
  { id:"pac_prism", slot:"pac", icon:"ᗧ", name:"Prism Chomper", desc:"Chomp cycles the entire spectrum as it eats.", cost:600 },
  { id:"ship_gold", slot:"ship", icon:"◬", name:"Gilded Fighter", desc:"A casino-gold Asteroids ship. Old money meets deep space.", cost:450 },
  { id:"conf_neon", slot:"confetti", icon:"✦", name:"Neon Confetti", desc:"Casino wins burst in arcade neon instead of gold.", cost:250 }
];
let PRZ = null;
try { PRZ = JSON.parse(localStorage.getItem("gg_prizes") || "null"); } catch(e){}
if (!PRZ || !PRZ.tokens) PRZ = { owned:{}, eq:{}, tokens:{ continue:0, doubler:0 } };
function przSave(){
  localStorage.setItem("gg_prizes", JSON.stringify(PRZ));
  if (fbReady && user) db.ref("users/"+user.uid+"/prizes").set(PRZ);
  applyCosmetics();
}
function przMerge(srv){
  if (!srv){ przSave(); return; }
  for (const k in (srv.owned || {})) PRZ.owned[k] = true;
  // server is authoritative for tokens — Math.max here resurrected spent ones
  for (const k in (srv.tokens || {})) PRZ.tokens[k] = srv.tokens[k] || 0;
  PRZ.eq = Object.assign({}, PRZ.eq, srv.eq || {});
  przSave();
}
function applyCosmetics(){
  for (const p of PRIZES){
    if (!p.cls) continue;
    document.body.classList.toggle(p.cls, PRZ.eq[p.slot] === p.id);
  }
}
function przPacColor(){
  if (PRZ.eq.pac === "pac_prism") return `hsl(${(chFrame*4)%360},100%,65%)`;
  if (PRZ.eq.pac === "pac_cyan") return "#3ee8ff";
  return "#ffd23e";
}
function przShipColor(){ return PRZ.eq.ship === "ship_gold" ? "#ffd23e" : "#3ee8ff"; }
function przConfPal(){
  return PRZ.eq.confetti === "conf_neon" ? ["#ff2d78","#3ee8ff","#b44fff","#7bff8e","#fff"] : null;
}
function przDiceGold(){ return PRZ.eq.dice === "dice_gold"; }
function przBallGold(){ return PRZ.eq.ball === "ball_gold"; }
function przBrickPal(){
  return PRZ.eq.bricks === "bricks_sunset" ? ["#ff3b1f","#ff9b2d","#ffd23e","#ff2d78","#ff6e6e"] : null;
}
function przTetPal(){
  return PRZ.eq.tetro === "tet_gold"
    ? { I:"#ffe9a8", O:"#ffd23e", T:"#c9a84c", S:"#e8cf8a", Z:"#b8860b", J:"#8b6a1e", L:"#ff9b2d" }
    : null;
}
function buyPrize(id){
  const p = PRIZES.find(x => x.id === id);
  if (!p) return;
  if (!p.token && PRZ.owned[id]){ equipPrize(id); return; }
  if (tickets < p.cost){ toast("Not enough tickets — go earn some"); SND.lose(); return; }
  tickets -= p.cost; saveTix();
  if (p.token) PRZ.tokens[p.token] = (PRZ.tokens[p.token] || 0) + 1;
  else { PRZ.owned[id] = true; PRZ.eq[p.slot] = id; }
  przSave();
  ach("firstPrize");
  SND.cash(); toast(p.icon + " " + p.name + (p.token ? " — pocketed" : " — equipped"));
  prizeRender();
}
function equipPrize(id){
  const p = PRIZES.find(x => x.id === id);
  if (!p || !PRZ.owned[id]) return;
  PRZ.eq[p.slot] = PRZ.eq[p.slot] === id ? null : id;
  przSave(); SND.gem();
  prizeRender();
}
function prizeRender(){
  $("tixhero").textContent = "🎟 " + fmt(tickets) + " tickets";
  $("prizegrid").innerHTML = PRIZES.map(p => {
    let btn, extra = "";
    const afford = tickets >= p.cost;
    if (p.token){
      const n = PRZ.tokens[p.token] || 0;
      extra = `<div class="ptokens">${n ? "× " + n + " in pocket" : "&nbsp;"}</div>`;
      btn = `<button class="pbuy ${afford ? "can" : "cant"}" onclick="buyPrize('${p.id}')">Buy</button>`;
    } else if (PRZ.owned[p.id]){
      btn = PRZ.eq[p.slot] === p.id
        ? `<button class="pbuy equipped" onclick="equipPrize('${p.id}')">Equipped ✓</button>`
        : `<button class="pbuy equip" onclick="equipPrize('${p.id}')">Equip</button>`;
    } else {
      btn = `<button class="pbuy ${afford ? "can" : "cant"}" onclick="buyPrize('${p.id}')">Buy</button>`;
    }
    const cost = (!p.token && PRZ.owned[p.id])
      ? `<span class="pcost" style="color:#7bff8e">owned</span>`
      : `<span class="pcost">🎟 ${fmt(p.cost)}</span>`;
    return `<div class="prize${PRZ.owned[p.id] ? " ownedcard" : ""}">
      <div class="pico">${p.icon}</div><h3>${p.name}</h3><p>${p.desc}</p>${extra}
      <div class="prow2">${cost}${btn}</div></div>`;
  }).join("");
}
applyCosmetics(); paintTix();

