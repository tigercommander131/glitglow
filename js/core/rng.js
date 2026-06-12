
/* ════════════════ SHARED SEEDED RNG ════════════════ */
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
function seededCard(rng){
  const r = RANKS[(rng()*13)|0], s = SUITS[(rng()*4)|0];
  return { r, s, red: s === "♥" || s === "♦" };
}
/* hand value with soft aces — shared by gauntlet + blackjack duel */
function hvVal(h){
  let t = 0, a = 0;
  for (const c of h){ t += c.r === "A" ? 11 : "JQK".includes(c.r) ? 10 : +c.r; if (c.r === "A") a++; }
  while (t > 21 && a){ t -= 10; a--; }
  return t;
}

