
/* ════════════════ SOUND — all WebAudio synthesis, zero asset files ════════════════ */
let AC = null, AMaster = null, sndNoiseBuf = null;
let muted = localStorage.getItem("gg_mute") === "1";
function audioCtx(){
  if (!AC){
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    AC = new C();
    AMaster = AC.createGain(); AMaster.gain.value = muted ? 0 : 0.45;
    const comp = AC.createDynamicsCompressor();
    AMaster.connect(comp); comp.connect(AC.destination);
  }
  if (AC.state === "suspended") AC.resume();
  return AC;
}
["pointerdown","keydown"].forEach(ev => addEventListener(ev, () => audioCtx(), { capture: true, passive: true }));
function toggleMute(){
  muted = !muted; localStorage.setItem("gg_mute", muted ? "1" : "0");
  if (AMaster) AMaster.gain.value = muted ? 0 : 0.45;
  paintMute();
  if (!muted){ audioCtx(); SND.chip(); }
}
function paintMute(){ const b = $("mutebtn"); b.textContent = muted ? "🔇" : "🔊"; b.classList.toggle("off", muted); }
paintMute();
function sndEnv(g, t0, v, a, d){
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(v, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
}
function sndTone(o){ // {f, f2?, t?, v?, a?, d?, at?}
  if (muted || !audioCtx()) return;
  const a = o.a || .005, d = o.d || .15, t0 = AC.currentTime + (o.at || 0);
  const osc = AC.createOscillator(), g = AC.createGain();
  osc.type = o.t || "sine";
  osc.frequency.setValueAtTime(o.f, t0);
  if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t0 + a + d);
  sndEnv(g, t0, o.v || .2, a, d);
  osc.connect(g); g.connect(AMaster);
  osc.start(t0); osc.stop(t0 + a + d + .05);
}
function sndNoise(o){ // {d?, v?, f?, f2?, q?, type?, at?}
  if (muted || !audioCtx()) return;
  if (!sndNoiseBuf){
    sndNoiseBuf = AC.createBuffer(1, AC.sampleRate * 1.2, AC.sampleRate);
    const ch = sndNoiseBuf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random()*2 - 1;
  }
  const d = o.d || .2, t0 = AC.currentTime + (o.at || 0);
  const src = AC.createBufferSource(); src.buffer = sndNoiseBuf; src.loop = true;
  src.playbackRate.value = .8 + Math.random()*.4;
  const fl = AC.createBiquadFilter(); fl.type = o.type || "lowpass"; fl.Q.value = o.q || 1;
  fl.frequency.setValueAtTime(o.f || 1200, t0);
  if (o.f2) fl.frequency.exponentialRampToValueAtTime(Math.max(30, o.f2), t0 + d);
  const g = AC.createGain(); sndEnv(g, t0, o.v || .25, .003, d);
  src.connect(fl); fl.connect(g); g.connect(AMaster);
  src.start(t0); src.stop(t0 + d + .1);
}
const SND = {
  chip(){ // ceramic clink: two high pings + bright noise snap
    sndTone({ f: 2300 + Math.random()*500, v: .12, d: .05 });
    sndTone({ f: 3100 + Math.random()*600, v: .07, d: .04, at: .02 });
    sndNoise({ f: 5200, type: "bandpass", q: 6, v: .1, d: .05 });
  },
  chips(n = 3){ for (let i = 0; i < n; i++) setTimeout(() => SND.chip(), i*70); },
  card(){ sndNoise({ f: 2600, f2: 900, type: "bandpass", q: 2.5, v: .18, d: .07 }); },
  flipw(){ sndNoise({ f: 600, f2: 2400, type: "bandpass", q: 3, v: .1, d: .25 }); },
  tick(){ sndTone({ f: 1900, t: "square", v: .035, d: .018 }); },
  dice(){ sndNoise({ f: 3200, type: "highpass", v: .12, d: .05 }); sndTone({ f: 300 + Math.random()*250, t: "triangle", v: .08, d: .05 }); },
  reelstop(){ sndTone({ f: 170, f2: 110, t: "triangle", v: .25, d: .1 }); sndNoise({ f: 800, f2: 300, v: .15, d: .08 }); },
  peg(){ sndTone({ f: 900 + Math.random()*900, v: .05, d: .04 }); },
  gem(){ sndTone({ f: 880, f2: 1660, v: .14, d: .18 }); sndTone({ f: 1320, f2: 2200, v: .08, d: .2, at: .05 }); },
  push(){ sndTone({ f: 520, t: "triangle", v: .1, d: .1 }); },
  cash(){ // register ding + chip shower
    sndTone({ f: 1318, t: "triangle", v: .16, d: .3 });
    sndTone({ f: 1760, t: "triangle", v: .13, d: .4, at: .07 });
    SND.chips(3);
  },
  win(big){
    const seq = big ? [523,659,784,1047,1319,1568] : [523,659,784,1047];
    seq.forEach((f,i) => sndTone({ f, t: "triangle", v: .16, d: .22, at: i*.085 }));
    if (big) seq.forEach((f,i) => sndTone({ f: f*2, v: .05, d: .2, at: i*.085 + .02 }));
  },
  lose(){ sndTone({ f: 200, f2: 92, t: "sawtooth", v: .12, d: .4 }); sndTone({ f: 99, f2: 50, v: .16, d: .45, at: .02 }); },
  boom(){ sndNoise({ f: 2800, f2: 60, v: .5, d: .7 }); sndTone({ f: 110, f2: 34, v: .45, d: .65 }); },
  bonus(){ [659,784,988,1319].forEach((f,i) => sndTone({ f, t: "triangle", v: .15, d: .25, at: i*.1 })); },
  ach(){ [784,988,1175,1568,1976].forEach((f,i) => sndTone({ f, v: .12, d: .5, at: i*.06 })); },
  /* arcade voices */
  blip(f = 440, v = .1){ sndTone({ f, t: "square", v, d: .06 }); },
  zap(){ sndTone({ f: 1300, f2: 140, t: "square", v: .1, d: .13 }); },
  zap2(){ sndTone({ f: 700, f2: 90, t: "sawtooth", v: .09, d: .2 }); },
  boomA(sm){ sndNoise({ f: sm ? 1800 : 2600, f2: 80, v: sm ? .2 : .32, d: sm ? .25 : .45 }); },
  eat(){ sndTone({ f: 330, f2: 560, t: "square", v: .07, d: .05 }); sndTone({ f: 560, f2: 330, t: "square", v: .07, d: .05, at: .05 }); },
  power(){ [392,523,659,784].forEach((f,i) => sndTone({ f, t: "square", v: .08, d: .08, at: i*.05 })); },
  ghosteat(){ sndTone({ f: 220, f2: 1100, t: "square", v: .12, d: .25 }); },
  flap(){ sndNoise({ f: 900, f2: 2600, type: "bandpass", q: 2, v: .1, d: .12 }); },
  point(){ sndTone({ f: 1175, t: "square", v: .08, d: .06 }); sndTone({ f: 1568, t: "square", v: .08, d: .08, at: .06 }); },
  lock(){ sndTone({ f: 240, f2: 160, t: "triangle", v: .14, d: .08 }); },
  line(n){ [523,659,784,1047].slice(0, Math.max(2, n+1)).forEach((f,i) => sndTone({ f, t: "square", v: .1, d: .12, at: i*.06 })); },
  over(){ [392,330,262,196].forEach((f,i) => sndTone({ f, t: "square", v: .1, d: .22, at: i*.14 })); },
  _thT: 0,
  thrust(){ const now = performance.now(); if (now - SND._thT < 90) return; SND._thT = now; sndNoise({ f: 300, v: .06, d: .1 }); },
  launch(){ sndTone({ f: 200, f2: 900, t: "sawtooth", v: .07, d: .18 }); sndNoise({ f: 1500, f2: 4000, type: "bandpass", q: 2, v: .08, d: .2 }); },
  alarm(){ sndTone({ f: 520, f2: 380, t: "square", v: .09, d: .3 }); }
};

