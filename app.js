'use strict';
/* Cristo Domino — anotador de dominó.
   Vanilla JS, sin dependencias externas. Funciona sin conexión. */

var LS_KEY = 'cristo_domino_v1';
var TEAM_COLORS = ['#ffffff', '#2f9df0', '#ff5c5c', '#34c77b', '#ffb020', '#b16dff'];
var METAS = [100, 200, 300, 500];

/* ---------- Pullas (contenido sano, para amigos de la iglesia) ----------
   3 niveles por porcentaje de la meta; cada equipo desbloquea por sus
   propios puntos y todo queda desbloqueado antes de terminar la partida. */
var PULLAS = {
  nivel1: [
    { id: 'risa',    emoji: '😂', titulo: 'Risa buena',           sonido: 'risa' },
    { id: 'tortuga', emoji: '🐢', titulo: 'Sin prisa, con calma', sonido: 'tortuga' },
    { id: 'burro',   emoji: '🫏', titulo: 'Burro',                 sonido: 'burro' }
  ],
  nivel2: [
    { id: 'trompeta', emoji: '🎺', titulo: 'Suena la victoria',      sonido: 'trompeta' },
    { id: 'rayo',     emoji: '⚡', titulo: 'Más rápido que el tren', sonido: 'rayo' },
    { id: 'estrella', emoji: '⭐', titulo: 'Brilla, brilla',         sonido: 'estrella' }
  ],
  nivel3: [
    { id: 'corona',  emoji: '👑', titulo: 'Rey del dominó',       sonido: 'corona' },
    { id: 'copa',    emoji: '🏆', titulo: 'Campeón con humildad', sonido: 'copa' },
    { id: 'fiesta',  emoji: '🎆', titulo: 'Fiesta sana',          sonido: 'fiesta' },
    { id: 'aleluya', emoji: '🙌', titulo: 'Gloria a Dios',       sonido: 'aleluya' }
  ]
};
var NIVELES = [
  { id: 'nivel1', nombre: 'Nivel 1', pct: 15 },
  { id: 'nivel2', nombre: 'Nivel 2', pct: 50 },
  { id: 'nivel3', nombre: 'Épicas',  pct: 80 }
];
function umbralNivel(i) { return Math.ceil(state.meta * NIVELES[i].pct / 100); }
/* Nivel actual de un equipo (0..3) según su puntaje. */
function nivelDeEquipo(t) {
  var s = state.teams[t].score, n = 0;
  for (var i = 0; i < NIVELES.length; i++) if (s >= umbralNivel(i)) n = i + 1;
  return n;
}
function nombreNivel(id) {
  for (var i = 0; i < NIVELES.length; i++) if (NIVELES[i].id === id) return NIVELES[i].nombre;
  return id;
}

/* ---------- Estado ---------- */
function defaultState() {
  return {
    teams: [
      { name: 'Equipo 1', color: 0, score: 0, dominadas: 0 },
      { name: 'Equipo 2', color: 0, score: 0, dominadas: 0 }
    ],
    meta: 100,
    selected: 1,
    entry: '0',
    hands: [],        // {team, points, ts}
    history: [],      // {n, fecha, meta, ganador, hands}
    gameN: 1,
    theme: 'dark'
  };
}

var state = defaultState();

function load() {
  try {
    var raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    var s = JSON.parse(raw);
    if (!s || !s.teams || s.teams.length !== 2) return;
    var d = defaultState();
    state = Object.assign(d, s);
    delete state.pullas; // sistema viejo de desbloqueo: ahora es por nivel según puntaje
  } catch (e) { /* estado fresco si algo falla */ }
}
function save() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
}

/* ---------- Audio (WebAudio, todo sintetizado) ---------- */
var AC = null, master = null;
function ensureAudio() {
  if (!AC) {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    AC = new Ctx();
    master = AC.createGain();
    master.gain.value = 0.28;   // volumen moderado
    master.connect(AC.destination);
  }
  if (AC.state === 'suspended') AC.resume();
}
document.addEventListener('pointerdown', ensureAudio, { passive: true });

function tone(freq, t0, dur, type, vol) {
  var o = AC.createOscillator(), g = AC.createGain();
  o.type = type || 'sine';
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.9 * (vol || 1), t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + dur + 0.05);
}
function melody(notes, type, vol) {
  if (!AC) return;
  var t = AC.currentTime + 0.02;
  notes.forEach(function (n) { tone(n[0], t, n[1], type || 'triangle', vol || 1); t += n[1] + 0.02; });
}
var SFX = {
  key:    function () { melody([[520, .05]]); },
  back:   function () { melody([[320, .06]]); },
  sumar:   function () { melody([[660, .09], [880, .16]]); },
  deshacer:function () { melody([[440, .08], [330, .10]]); },
  unlock:  function () { melody([[523, .09], [659, .09], [784, .09], [1046, .24]]); },
  fanfarria:function () { melody([[392, .12], [392, .12], [392, .12], [523, .22], [659, .10], [784, .36]], 'sawtooth', 0.45); }
};

/* ----- Sonidos realistas de pullas (todo sintetizado en WebAudio) ----- */
var _noiseBuf = null;
function getNoiseBuf() {
  if (_noiseBuf) return _noiseBuf;
  var len = Math.floor(AC.sampleRate * 1.2);
  _noiseBuf = AC.createBuffer(1, len, AC.sampleRate);
  var d = _noiseBuf.getChannelData(0);
  for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return _noiseBuf;
}
function noiseHit(t0, dur, type, freq, q, vol) {
  var src = AC.createBufferSource();
  src.buffer = getNoiseBuf(); src.loop = true;
  var f = AC.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q || 1;
  var g = AC.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t0); src.stop(t0 + dur + 0.05);
}
function brassNote(freq, t0, dur, vol) {
  // Timbre de metal: sierra + filtro + ataque + vibrato
  var o = AC.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq;
  var f = AC.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 2100; f.Q.value = 0.8;
  var g = AC.createGain();
  var v = vol || 0.5;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(v, t0 + 0.055);
  g.gain.setValueAtTime(v, t0 + Math.max(0.056, dur - 0.09));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  var lfo = AC.createOscillator(); lfo.frequency.value = 5.6;
  var lg = AC.createGain(); lg.gain.value = freq * 0.014;
  lfo.connect(lg); lg.connect(o.frequency);
  o.connect(f); f.connect(g); g.connect(master);
  o.start(t0); lfo.start(t0);
  o.stop(t0 + dur + 0.05); lfo.stop(t0 + dur + 0.05);
}
function trumpetStab(freq, t0, dur, vol) {
  // Trompeta brillante y juguetona: onda cuadrada + pasa-altos + realce
  // de brillo, ataque rapidísimo y corte staccato. Sin vibrato.
  var o = AC.createOscillator(); o.type = 'square'; o.frequency.value = freq;
  var hp = AC.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 900;
  var pk = AC.createBiquadFilter();
  pk.type = 'peaking'; pk.frequency.value = 2800; pk.Q.value = 0.9; pk.gain.value = 7;
  var g = AC.createGain();
  var v = vol || 0.35;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(v, t0 + 0.008);
  g.gain.setValueAtTime(v, t0 + Math.max(0.009, dur - 0.03));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(hp); hp.connect(pk); pk.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + dur + 0.05);
}
function hornCall(freq, t0, dur, vol) {
  // Llamada solemne de corno: sierra oscura (pasa-bajos bajo), ataque lento
  // y majestuoso, sin vibrato.
  var o = AC.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq;
  var f = AC.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 850; f.Q.value = 0.6;
  var g = AC.createGain();
  var v = vol || 0.5;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(v, t0 + 0.09);
  g.gain.setValueAtTime(v, t0 + Math.max(0.091, dur - 0.14));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(f); f.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + dur + 0.05);
}
function timpano(t0, vol) {
  // Timbal: caída de seno grave + golpe de ruido.
  var v = vol || 0.5;
  var o = AC.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(110, t0);
  o.frequency.exponentialRampToValueAtTime(52, t0 + 0.26);
  var g = AC.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(v, t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.34);
  o.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + 0.4);
  noiseHit(t0, 0.09, 'lowpass', 320, 0.7, v * 0.6);
}
function softNote(freq, t0, dur, type, vol) {
  var o = AC.createOscillator(); o.type = type || 'sine'; o.frequency.value = freq;
  var g = AC.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol || 0.4, t0 + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + dur + 0.05);
}

var PULLA_SFX = {
  risa: function () {
    // Carcajada humana: "ja-ja-ja-ja" con timbre vocal (formantes de la "a"),
    // respiración, ritmo e intensidad naturales; nada de tono robótico.
    if (!AC) return;
    var t = AC.currentTime + 0.02;
    // Ruido compartido para la respiración de cada sílaba
    var nb = AC.createBuffer(1, Math.floor(AC.sampleRate * 1.5), AC.sampleRate);
    var nd = nb.getChannelData(0);
    for (var n = 0; n < nd.length; n++) nd[n] = Math.random() * 2 - 1;

    function ha(t0, f0, dur, vol) {
      // Cuerda vocal: sierra rica en armónicos -> formantes de "a" (730/1090 Hz)
      var o = AC.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0 * 1.12, t0);
      o.frequency.exponentialRampToValueAtTime(Math.max(90, f0 * 0.68), t0 + dur);
      var f1 = AC.createBiquadFilter(); f1.type = 'bandpass';
      f1.frequency.value = 730; f1.Q.value = 1.3;
      var f2 = AC.createBiquadFilter(); f2.type = 'bandpass';
      f2.frequency.value = 1090; f2.Q.value = 1.5;
      var g = AC.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.018);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); g.connect(master);
      o.start(t0); o.stop(t0 + dur + 0.05);
      // Aire de la risa: ruido filtrado mezclado bajo
      var ns = AC.createBufferSource(); ns.buffer = nb;
      var nf = AC.createBiquadFilter(); nf.type = 'bandpass';
      nf.frequency.value = 950; nf.Q.value = 0.8;
      var ng = AC.createGain();
      ng.gain.setValueAtTime(0.0001, t0);
      ng.gain.exponentialRampToValueAtTime(vol * 0.28, t0 + 0.02);
      ng.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      ns.connect(nf); nf.connect(ng); ng.connect(master);
      ns.start(t0); ns.stop(t0 + dur + 0.05);
    }

    // Inhalación previa (0.25 s)
    (function () {
      var ns = AC.createBufferSource(); ns.buffer = nb;
      var nf = AC.createBiquadFilter(); nf.type = 'bandpass';
      nf.frequency.value = 600; nf.Q.value = 0.7;
      var g = AC.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.10, t + 0.22);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.27);
      ns.connect(nf); nf.connect(g); g.connect(master);
      ns.start(t); ns.stop(t + 0.32);
    })();

    // Secuencia: [retardo, tono, duración, volumen] con arco natural
    // (arranca suave, crece, y se apaga riendo) + jitter de ritmo
    var seq = [
      [0.30, 296, 0.105, 0.30],
      [0.445, 318, 0.115, 0.42],
      [0.60, 306, 0.120, 0.50],
      [0.765, 288, 0.125, 0.55],
      [0.94, 268, 0.130, 0.52],
      [1.12, 248, 0.140, 0.44],
      [1.31, 226, 0.160, 0.33]
    ];
    for (var i = 0; i < seq.length; i++) {
      (function (s) {
        var jit = (Math.random() - 0.5) * 0.018; // ritmo humano, no metrónomo
        ha(t + s[0] + jit, s[1] * (1 + (Math.random() - 0.5) * 0.06), s[2], s[3]);
      })(seq[i]);
    }
  },
  corona: function () {
    // Fanfarria real solemne: línea ascendente majestuosa de corno + timbales.
    // Carácter totalmente distinto a la trompeta juguetona.
    if (!AC) return;
    var t = AC.currentTime + 0.02;
    [[261.6, 0, 0.38], [349.2, 0.42, 0.38], [440, 0.84, 0.38], [587.3, 1.26, 1.15]]
      .forEach(function (n) { hornCall(n[0], t + n[1], n[2], 0.5); });
    [0, 0.42, 0.84].forEach(function (dt) { timpano(t + dt, 0.4); });
    timpano(t + 1.26, 0.55);
  },
  rayo: function () {
    // Relámpago: zumbido eléctrico descendente + chasquido
    if (!AC) return;
    var t = AC.currentTime + 0.02;
    var o = AC.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(1900, t);
    o.frequency.exponentialRampToValueAtTime(85, t + 0.36);
    var g = AC.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.45, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.5);
    noiseHit(t, 0.1, 'highpass', 2800, 0.8, 0.3);
  },
  tortuga: function () {
    // Pesada y perezosa: notas graves con bamboleo lento + pisadas sordas.
    if (!AC) return;
    var t = AC.currentTime + 0.02;
    [[147, 0], [130.8, 0.42], [110, 0.84]].forEach(function (n) {
      var t0 = t + n[1];
      // Nota grave con vibrato muy lento (el bamboleo de la tortuga)
      var o = AC.createOscillator(); o.type = 'triangle'; o.frequency.value = n[0];
      var lfo = AC.createOscillator(); lfo.frequency.value = 2.2;
      var lg = AC.createGain(); lg.gain.value = n[0] * 0.03;
      lfo.connect(lg); lg.connect(o.frequency);
      var g = AC.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
      o.connect(g); g.connect(master);
      o.start(t0); lfo.start(t0);
      o.stop(t0 + 0.6); lfo.stop(t0 + 0.6);
      // Pisada sorda: golpe grave corto como paso pesado
      var th = AC.createOscillator(); th.type = 'sine';
      th.frequency.setValueAtTime(90, t0);
      th.frequency.exponentialRampToValueAtTime(45, t0 + 0.12);
      var tg = AC.createGain();
      tg.gain.setValueAtTime(0.0001, t0);
      tg.gain.exponentialRampToValueAtTime(0.5, t0 + 0.01);
      tg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
      th.connect(tg); tg.connect(master);
      th.start(t0); th.stop(t0 + 0.2);
    });
  },
  trompeta: function () {
    // Trompeta brillante y juguetona: ta-ta-taaa staccato en octava alta.
    if (!AC) return;
    var t = AC.currentTime + 0.02;
    trumpetStab(1046.5, t, 0.11, 0.34);
    trumpetStab(1318.5, t + 0.135, 0.11, 0.34);
    trumpetStab(1568, t + 0.27, 0.5, 0.36);
  },
  estrella: function () {
    // Destello: glissando ascendente + tintineos
    if (!AC) return;
    var t = AC.currentTime + 0.02;
    var o = AC.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(1500, t);
    o.frequency.exponentialRampToValueAtTime(3100, t + 0.28);
    var g = AC.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.4);
    [2093, 2637, 3520].forEach(function (fr, i) {
      softNote(fr, t + 0.30 + i * 0.11, 0.16, 'sine', 0.32);
    });
  },
  copa: function () {
    // Fanfarria épica + acorde final de campeón
    if (!AC) return;
    var t = AC.currentTime + 0.02;
    [[523, 0, 0.13], [659, 0.14, 0.13], [784, 0.28, 0.13], [1046, 0.42, 0.65]]
      .forEach(function (n) { brassNote(n[0], t + n[1], n[2], 0.44); });
    [523, 659, 784].forEach(function (fr) { brassNote(fr, t + 0.42, 0.75, 0.2); });
  },
  fiesta: function () {
    // Fuegos artificiales: silbido ascendente + estallidos
    if (!AC) return;
    var t = AC.currentTime + 0.02;
    var o = AC.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(700, t);
    o.frequency.exponentialRampToValueAtTime(2500, t + 0.45);
    var g = AC.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.55);
    [[0.5, 1800], [0.78, 1200], [1.05, 2400], [1.3, 900]]
      .forEach(function (p) { noiseHit(t + p[0], 0.22, 'bandpass', p[1], 1.4, 0.5); });
  },
  aleluya: function () {
    // Coro cálido: acorde con ataque lento y caída suave
    if (!AC) return;
    var t = AC.currentTime + 0.02;
    [261.6, 329.6, 392, 523.3].forEach(function (fr) {
      var o1 = AC.createOscillator(); o1.type = 'triangle'; o1.frequency.value = fr;
      var o2 = AC.createOscillator(); o2.type = 'sine'; o2.frequency.value = fr * 1.003;
      var g = AC.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.5);
      g.gain.setValueAtTime(0.16, t + 1.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
      o1.connect(g); o2.connect(g); g.connect(master);
      o1.start(t); o2.start(t);
      o1.stop(t + 2); o2.stop(t + 2);
    });
  }
};

/* ---------- Utilidades ---------- */
function $(id) { return document.getElementById(id); }
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function displayColor(team) {
  var c = TEAM_COLORS[team.color % TEAM_COLORS.length];
  if (state.theme === 'light' && c === '#ffffff') return '#1a1a1e';
  return c;
}
function fmtFecha(iso) {
  try {
    return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (e) { return ''; }
}

var toastTimer = null;
function toast(msg) {
  var t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
}

/* ---------- Render ---------- */
function renderCards() {
  for (var i = 0; i < 2; i++) {
    var team = state.teams[i];
    var num = $('num' + i);
    num.textContent = team.score;
    num.style.color = displayColor(team);
    $('name' + i).textContent = team.name;
    $('dom' + i).textContent = team.dominadas;
    var card = $('card' + i);
    card.classList.toggle('selected', state.selected === i);
    var gift = $('gift' + i);
    // El regalo solo está encendido en el equipo que va ganando en el momento.
    var s0 = state.teams[0].score, s1 = state.teams[1].score;
    var lider = s0 === s1 ? -1 : (s0 > s1 ? 0 : 1);
    var activo = lider === i;
    gift.classList.toggle('unlocked', activo);
    gift.classList.toggle('locked', !activo);
    gift.setAttribute('aria-label', 'Pullas de ' + team.name);
    // El regalo muestra el nivel de pullas desbloqueado por el equipo.
    var nv = nivelDeEquipo(i);
    var badge = $('giftLvl' + i);
    if (badge) {
      badge.textContent = nv > 0 ? nv : '';
      badge.hidden = nv === 0;
    }
  }
  $('panelTitle').textContent = 'Puntos para ' + state.teams[state.selected].name;
}

function renderMeta() {
  var seg = $('metaSeg');
  Array.prototype.forEach.call(seg.children, function (b) {
    b.classList.toggle('active', parseInt(b.dataset.meta, 10) === state.meta);
  });
}

function renderEntry() {
  var e = $('entryDisplay');
  e.textContent = state.entry;
  e.classList.toggle('shrink', state.entry.length >= 3);
}

function teamHands(hands, team) {
  return hands.filter(function (h) { return h.team === team; });
}

/* Color de un equipo para el historial: legible en ambos temas. */
function histColor(idx) {
  var c = TEAM_COLORS[(idx == null ? 0 : idx) % TEAM_COLORS.length];
  if (state.theme === 'light' && c === '#ffffff') return '#1a1a1e';
  return c;
}

function teamTotalHist(hands, team) {
  var t = 0;
  for (var i = 0; i < hands.length; i++) if (hands[i].team === team) t += hands[i].points;
  return t;
}

/* Un bloque de partida: "Partida N · Meta X" / "Ganó Equipo Y" (o "en curso"),
   dos columnas por equipo con total y manos numeradas POR EQUIPO desde 1
   (más recientes primero). */
function histMatchHTML(n, meta, winnerName, hands, nombres, colorIdx, enCurso) {
  var html = '<div class="hist-match">';
  html += '<div class="hist-match-head"><span class="hist-match-title">Partida ' + n +
          ' · Meta ' + meta + '</span><span class="hist-match-right">' +
          (enCurso ? 'en curso' : 'Ganó ' + esc(winnerName)) + '</span></div>';
  html += '<div class="hist-cols">';
  for (var i = 0; i < 2; i++) {
    html += '<div class="hist-col"><div class="hist-col-head"><span class="hist-team" style="color:' + histColor(colorIdx[i]) + '">' +
            esc(nombres[i]) + '</span><span class="hist-total">' +
            teamTotalHist(hands, i) + ' pts</span></div>';
    var rows = [];
    var num = teamHands(hands, i).length; // cada equipo numera sus propias manos desde 1
    for (var k = hands.length - 1; k >= 0; k--) {
      if (hands[k].team === i) {
        rows.push('<div class="hist-row"><span class="n">' + num + '</span>' +
                  '<span class="pts" style="color:' + histColor(colorIdx[i]) + '">+' +
                  hands[k].points + '</span></div>');
        num--;
      }
    }
    html += rows.length ? rows.join('') : '<p class="hist-empty">Sin manos todavía.</p>';
    html += '</div>';
  }
  html += '</div></div>';
  return html;
}

function renderHistory() {
  var html = '';
  // Partida en curso
  html += histMatchHTML(state.gameN, state.meta, null, state.hands,
    [state.teams[0].name, state.teams[1].name],
    [state.teams[0].color, state.teams[1].color], true);
  // Partidas archivadas
  state.history.forEach(function (g) {
    var winName = (g.nombres && g.ganador != null && g.nombres[g.ganador]) ? g.nombres[g.ganador] : '—';
    html += histMatchHTML(g.n, g.meta, winName, g.hands || [],
      g.nombres || ['Equipo 1', 'Equipo 2'],
      g.colores || [1, 1], false);
  });
  $('historyBody').innerHTML = html;
}

function renderTheme() {
  document.body.classList.toggle('light', state.theme === 'light');
  $('themeToggle').textContent = state.theme === 'dark' ? '☀️' : '🌙';
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', state.theme === 'dark' ? '#0b0b0e' : '#f1f2f4');
}

function render() {
  renderTheme();
  renderCards();
  renderMeta();
  renderEntry();
  renderHistory();
}

/* ---------- Teclado ---------- */
function pressKey(k) {
  ensureAudio();
  if (k === 'clear') {
    state.entry = '0';
    SFX.back();
  } else if (k === 'back') {
    state.entry = state.entry.length > 1 ? state.entry.slice(0, -1) : '0';
    SFX.back();
  } else {
    SFX.key();
    if (state.entry === '0') state.entry = k;
    else if (state.entry.length < 3) state.entry += k;
  }
  renderEntry();
}

/* ---------- Lógica del juego ---------- */
function sumarPuntos() {
  var pts = parseInt(state.entry, 10) || 0;
  if (pts <= 0) {
    var e = $('entryDisplay');
    e.classList.remove('shake');
    void e.offsetWidth;
    e.classList.add('shake');
    return;
  }
  var t = state.selected;
  var nivelAntes = nivelDeEquipo(t);
  state.teams[t].score += pts;
  state.teams[t].dominadas += 1;
  var hand = { team: t, points: pts, ts: Date.now() };
  state.hands.push(hand);
  SFX.sumar();

  var nivelDespues = nivelDeEquipo(t);
  if (nivelDespues > nivelAntes) {
    SFX.unlock();
    var nomN = NIVELES[nivelDespues - 1].nombre;
    toast('¡' + state.teams[t].name + ' desbloqueó ' +
          (nivelDespues === 3 ? 'las pullas épicas' : 'el ' + nomN) + '! 🎁');
  }

  state.entry = '0';
  save();
  render();
  publicarEstado();
  revisarGanador();
}

function revisarGanador() {
  var t = state.selected;
  if (state.teams[t].score < state.meta) return;
  SFX.fanfarria();
  confetti(displayColor(state.teams[t]));
  $('winnerTitle').textContent = '¡' + state.teams[t].name + ' ganó la partida!';
  $('winnerSub').textContent = 'Meta ' + state.meta + ' · ' + state.teams[t].score + ' puntos';
  $('winnerBackdrop').hidden = false;
  document.body.classList.add('modal-open');
  save();
  render();
  publicarEstado();
  publicarGanador(t);
  setTimeout(function () {
    try {
      if (salaActiva) salaActiva.mqtt.publicar(salaActiva.topico, { t: 'fin' }, true);
    } catch (e) {}
  }, 10000);
}

function aceptarGanador() {
  $('winnerBackdrop').hidden = true;
  document.body.classList.remove('modal-open');
  state.history.unshift({
    n: state.gameN++,
    fecha: new Date().toISOString(),
    meta: state.meta,
    ganador: state.selected,
    nombres: [state.teams[0].name, state.teams[1].name],
    colores: [state.teams[0].color, state.teams[1].color],
    hands: state.hands.map(function (h) { return { team: h.team, points: h.points, ts: h.ts }; })
  });
  state.hands = [];
  state.teams[0].score = 0;
  state.teams[1].score = 0;
  state.entry = '0';
  save();
  render();
  detenerSala();
  toast('Partida archivada en el historial 📜');
}

function deshacerUltima() {
  if (!state.hands.length) {
    toast('No hay manos para deshacer');
    return;
  }
  var h = state.hands.pop();
  var team = state.teams[h.team];
  team.score = Math.max(0, team.score - h.points);
  team.dominadas = Math.max(0, team.dominadas - 1);
  SFX.deshacer();
  save();
  render();
  publicarEstado();
  toast('Última mano deshecha');
}

function partidaNueva() {
  if (state.hands.length && !confirm('¿Empezar una partida nueva? Los puntajes y las dominadas se reinician.')) return;
  detenerSala(); // la sala anterior termina para los espectadores
  state.hands = [];
  state.teams[0].score = 0;
  state.teams[1].score = 0;
  state.teams[0].dominadas = 0;
  state.teams[1].dominadas = 0;
  state.entry = '0';
  save();
  render();
  toast('Partida nueva lista 🙌');
}

function reiniciarDominadas() {
  if (!confirm('¿Reiniciar las dominadas de ambos equipos?')) return;
  state.teams[0].dominadas = 0;
  state.teams[1].dominadas = 0;
  save();
  renderCards();
  toast('Dominadas reiniciadas');
}

function borrarHistorial() {
  if (!state.history.length) {
    toast('El historial ya está vacío');
    return;
  }
  if (!confirm('¿Borrar todo el historial de partidas? Esta acción no se puede deshacer.')) return;
  state.history = [];
  save();
  renderHistory();
  toast('Historial borrado');
}

/* ---------- Nombres y colores ---------- */
function editarNombre(i) {
  var nameEl = $('name' + i);
  var actual = state.teams[i].name;
  var input = document.createElement('input');
  input.className = 'edit-input';
  input.value = actual;
  input.maxLength = 16;
  nameEl.textContent = '';
  nameEl.appendChild(input);
  input.focus();
  input.select();
  var done = false;
  function finish(saveIt) {
    if (done) return;
    done = true;
    var v = input.value.trim().slice(0, 16);
    if (saveIt && v) state.teams[i].name = v;
    save();
    render();
    publicarEstado();
  }
  input.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter') finish(true);
    else if (ev.key === 'Escape') finish(false);
    ev.stopPropagation();
  });
  input.addEventListener('blur', function () { finish(true); });
  input.addEventListener('click', function (ev) { ev.stopPropagation(); });
}

function cambiarColor(i) {
  if (state.hands.length) {
    toast('El color se elige antes de la primera mano');
    return;
  }
  state.teams[i].color = (state.teams[i].color + 1) % TEAM_COLORS.length;
  ensureAudio();
  SFX.key();
  save();
  renderCards();
  publicarEstado();
}

function elegirMeta(m) {
  if (state.hands.length) {
    toast('La meta no se puede cambiar durante la partida');
    return;
  }
  state.meta = m;
  ensureAudio();
  SFX.key();
  save();
  renderMeta();
  publicarEstado();
}

/* ---------- Pullas ---------- */
function abrirPullas(team) {
  var nivel = nivelDeEquipo(team);
  if (nivel === 0) {
    var falta = umbralNivel(0) - state.teams[team].score;
    toast('Alcanza ' + umbralNivel(0) + ' pts (te faltan ' + falta + ') para desbloquear pullas 🎁');
    return;
  }
  ensureAudio();
  $('pullaTitle').textContent = 'Pullas de ' + state.teams[team].name;
  var cont = $('pullaGroups');
  cont.innerHTML = '';
  for (var i = 0; i < nivel; i++) {
    (function (ni) {
      var id = NIVELES[ni].id;
      var sec = document.createElement('div');
      var h = document.createElement('p');
      h.className = 'pulla-sec-title';
      h.textContent = NIVELES[ni].nombre;
      sec.appendChild(h);
      var row = document.createElement('div');
      row.className = 'pulla-row';
      PULLAS[id].forEach(function (p) {
        var b = document.createElement('button');
        b.className = 'pulla-item';
        b.innerHTML = '<span class="pulla-emoji">' + p.emoji + '</span>' +
                      '<span class="pulla-name">' + esc(p.titulo) + '</span>';
        b.addEventListener('click', function () { enviarPulla(team, p); });
        row.appendChild(b);
      });
      sec.appendChild(row);
      cont.appendChild(sec);
    })(i);
  }
  var hint = document.createElement('p');
  hint.className = 'pulla-hint';
  if (nivel < NIVELES.length) {
    var sig = NIVELES[nivel];
    hint.textContent = 'Te faltan ' + (umbralNivel(nivel) - state.teams[team].score) +
      ' pts para ' + (nivel === 2 ? 'las pullas épicas' : 'el ' + sig.nombre) + ' 😄';
  } else {
    hint.textContent = 'Toca una pulla para enviársela al otro equipo 😄';
  }
  cont.appendChild(hint);
  $('pullaBackdrop').hidden = false;
  document.body.classList.add('modal-open');
}

function cerrarPullas() {
  $('pullaBackdrop').hidden = true;
  document.body.classList.remove('modal-open');
}

function enviarPulla(fromTeam, pulla) {
  var other = 1 - fromTeam;
  cerrarPullas();
  publicarPulla(fromTeam, pulla.id);
  var gRect = $('gift' + fromTeam).getBoundingClientRect();
  var cRect = $('card' + other).getBoundingClientRect();
  var el = document.createElement('div');
  el.className = 'fly';
  el.textContent = pulla.emoji;
  el.style.left = (gRect.left + gRect.width / 2 - 17) + 'px';
  el.style.top = (gRect.top + gRect.height / 2 - 17) + 'px';
  document.body.appendChild(el);
  var dx = (cRect.left + cRect.width / 2) - (gRect.left + gRect.width / 2);
  var dy = (cRect.top + cRect.height / 2) - (gRect.top + gRect.height / 2);
  var anim = el.animate([
    { transform: 'translate(0,0) scale(1)', opacity: 1 },
    { transform: 'translate(' + dx * 0.5 + 'px,' + (dy - 110) + 'px) scale(1.35)', opacity: 1, offset: 0.55 },
    { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(0.6)', opacity: 0.9 }
  ], { duration: 750, easing: 'cubic-bezier(.3,.6,.4,1)' });
  anim.onfinish = function () {
    el.remove();
    mostrarPullaGrande(pulla);
  };
}

/* Grabaciones reales de pullas (todas CC0 / dominio público, vía Openverse/Freesound).
   Si un archivo no carga, se usa la síntesis anterior como respaldo silencioso.
   - risa:     "laughter-male_029-030 037-042" de Gerent (Freesound, CC0)
   - rayo:     "Thunder Storm" (Freesound, CC0)
   - fiesta:   "fireworks exploding 1" (Freesound, CC0)
   - trompeta: "Trumpet/Cornet Flourish" (Freesound, CC0)
   - corona:   "fasching fanfare - Karnevals Tusch [Tataa] (short)" (Freesound, CC0)
   - copa:     "Tada Fanfare A" (Freesound, CC0)
   - aleluya:  "hallelujah" (Freesound, CC0)
   - estrella: "Playing Glockenspiel" (Freesound, CC0)
   - burro:    "Donkey braying close to the market, in Morocco" (Freesound, CC0) */
var AUDIO_GRABACIONES = {
  risa: 'audio/risa.mp3', rayo: 'audio/rayo.mp3', fiesta: 'audio/fiesta.mp3',
  trompeta: 'audio/trompeta.mp3', corona: 'audio/corona.mp3', copa: 'audio/copa.mp3',
  aleluya: 'audio/aleluya.mp3', estrella: 'audio/estrella.mp3', burro: 'audio/burro.mp3'
};
var audioCache = {};
function reproducirGrabacion(id) {
  try {
    var a = audioCache[id];
    if (!a) {
      a = new Audio(AUDIO_GRABACIONES[id]);
      a.preload = 'auto';
      audioCache[id] = a;
    }
    a.currentTime = 0;
    var p = a.play();
    if (p && p.catch) {
      p.catch(function () { if (PULLA_SFX[id]) PULLA_SFX[id](); });
    }
  } catch (e) {
    if (PULLA_SFX[id]) PULLA_SFX[id]();
  }
}

function mostrarPullaGrande(pulla) {
  ensureAudio();
  var el = document.createElement('div');
  el.className = 'pulla-big';
  el.innerHTML = '<div class="pb-emoji">' + pulla.emoji + '</div>' +
                 '<div class="pb-title">' + esc(pulla.titulo) + '</div>';
  document.body.appendChild(el);
  if (AUDIO_GRABACIONES[pulla.sonido]) reproducirGrabacion(pulla.sonido);
  else if (PULLA_SFX[pulla.sonido]) PULLA_SFX[pulla.sonido]();
  else if (pulla.melodia) melody(pulla.melodia);
  requestAnimationFrame(function () { el.classList.add('show'); });
  setTimeout(function () {
    el.classList.remove('show');
    setTimeout(function () { el.remove(); }, 400);
  }, 1700);
}

/* ---------- Confeti ---------- */
function confetti(colorBase) {
  var c = $('confetti');
  var ctx = c.getContext('2d');
  c.width = window.innerWidth;
  c.height = window.innerHeight;
  var colores = [colorBase === '#ffffff' ? '#2f9df0' : colorBase, '#ffffff', '#ffd166', '#ff8fa3', '#7ee2a8'];
  var parts = [];
  for (var i = 0; i < 170; i++) {
    parts.push({
      x: Math.random() * c.width,
      y: -20 - Math.random() * c.height * 0.35,
      w: 6 + Math.random() * 7,
      h: 8 + Math.random() * 9,
      vy: 2.4 + Math.random() * 3.4,
      vx: -1.6 + Math.random() * 3.2,
      rot: Math.random() * Math.PI * 2,
      vr: -0.12 + Math.random() * 0.24,
      col: colores[(Math.random() * colores.length) | 0]
    });
  }
  var inicio = performance.now();
  var DUR = 3400;
  function frame(ahora) {
    var t = ahora - inicio;
    ctx.clearRect(0, 0, c.width, c.height);
    parts.forEach(function (p) {
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      p.vy += 0.045;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.col;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    if (t < DUR) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, c.width, c.height);
  }
  requestAnimationFrame(frame);
}

/* ---------- Tema ---------- */
function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  ensureAudio();
  SFX.key();
  save();
  render();
}

/* ===== MQTT-MINI puro: inicio ===== */
/* Cliente MQTT 3.1.1 mínimo sobre WebSocket. Sin librerías externas.
   Solo usa TextEncoder/Uint8Array: funciona en el navegador y en Node (pruebas). */
var MQTT_BROKERS = [
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://broker.emqx.io:8084/mqtt',
  'wss://test.mosquitto.org:8081/mqtt'
];
var MQTT_TOPICO_BASE = 'cristo-domino/sala/';
var CODIGO_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function mqttEncodeUtf8(str) {
  var bytes = new TextEncoder().encode(str);
  var out = new Uint8Array(2 + bytes.length);
  out[0] = (bytes.length >> 8) & 0xff;
  out[1] = bytes.length & 0xff;
  out.set(bytes, 2);
  return out;
}
function mqttEncodeLongitud(n) {
  var out = [];
  do {
    var b = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) b |= 0x80;
    out.push(b);
  } while (n > 0);
  return out;
}
function mqttPaquete(tipo, partes) {
  var len = 0, i;
  for (i = 0; i < partes.length; i++) len += partes[i].length;
  var rl = mqttEncodeLongitud(len);
  var out = new Uint8Array(1 + rl.length + len);
  out[0] = tipo;
  for (i = 0; i < rl.length; i++) out[1 + i] = rl[i];
  var o = 1 + rl.length;
  for (i = 0; i < partes.length; i++) { out.set(partes[i], o); o += partes[i].length; }
  return out;
}
function mqttPaqueteConnect(clientId) {
  // CONNECT: protocolo "MQTT" v4, clean session, keepalive 60s, sin usuario/clave
  var vh = new Uint8Array([0x00, 0x04, 0x4d, 0x51, 0x54, 0x54, 0x04, 0x02, 0x00, 0x3c]);
  return mqttPaquete(0x10, [vh, mqttEncodeUtf8(clientId)]);
}
function mqttPaqueteSubscribe(pid, topico) {
  var id = new Uint8Array([(pid >> 8) & 0xff, pid & 0xff]);
  return mqttPaquete(0x82, [id, mqttEncodeUtf8(topico), new Uint8Array([0x00])]);
}
function mqttPaquetePublish(topico, texto, retain) {
  return mqttPaquete(retain ? 0x31 : 0x30, [mqttEncodeUtf8(topico), new TextEncoder().encode(texto)]);
}
function mqttLeerLongitud(buf, pos) {
  var mult = 1, valor = 0, i = 0, b;
  do {
    b = buf[pos + i];
    valor += (b & 127) * mult;
    mult *= 128;
    i++;
    if (i > 4) return null;
  } while ((b & 128) !== 0);
  return { valor: valor, bytes: i };
}
function mqttExtraerPublicacion(buf) {
  // Extrae un PUBLISH QoS 0 de un mensaje WebSocket binario. -> {topico, texto} | null
  if (!buf || buf.length < 2 || (buf[0] & 0xf0) !== 0x30) return null;
  var rl = mqttLeerLongitud(buf, 1);
  if (!rl) return null;
  var p = 1 + rl.bytes;
  if (p + 2 > buf.length) return null;
  var tl = (buf[p] << 8) | buf[p + 1];
  p += 2;
  if (p + tl > buf.length) return null;
  var topico = new TextDecoder().decode(buf.slice(p, p + tl));
  p += tl;
  var texto = new TextDecoder().decode(buf.slice(p));
  return { topico: topico, texto: texto };
}
function esConnackOk(buf) {
  return !!buf && buf.length >= 4 && buf[0] === 0x20 && buf[1] === 0x02 && buf[2] === 0x00 && buf[3] === 0x00;
}
function generarCodigoSala() {
  var c = '';
  for (var i = 0; i < 6; i++) c += CODIGO_CHARS[(Math.random() * CODIGO_CHARS.length) | 0];
  return c;
}
function codigoDeURL() {
  try {
    var m = new URLSearchParams(location.search).get('mirar');
    if (m && /^[A-Za-z0-9]{6}$/.test(m)) return m.toUpperCase();
  } catch (e) {}
  return null;
}
function urlSala(codigo, broker) {
  var base = String(location.href).split('?')[0].split('#')[0];
  return base + '?mirar=' + codigo + (broker != null ? '&b=' + broker : '');
}
function brokerDeURL() {
  try {
    var m = new URLSearchParams(location.search).get('b');
    if (m != null && /^[0-9]+$/.test(m)) {
      var n = parseInt(m, 10);
      if (n >= 0 && n < MQTT_BROKERS.length) return n;
    }
  } catch (e) {}
  return null;
}
/* ===== MQTT-MINI puro: fin ===== */

/* Conexión MQTT: prueba los brokers en orden hasta que uno responda.
   cbs = { abierto(cliente), mensaje(topico, obj), cerrado(motivo) }
   cliente = { publicar(topico, obj), cerrar() } */
function mqttConectar(topicoSub, cbs, brokerPreferido) {
  var orden = [];
  for (var bi = 0; bi < MQTT_BROKERS.length; bi++) orden.push(bi);
  if (brokerPreferido != null && brokerPreferido >= 0 && brokerPreferido < MQTT_BROKERS.length) {
    orden = [brokerPreferido].concat(orden.filter(function (x) { return x !== brokerPreferido; }));
  }
  var oi = 0, ws = null, pingTimer = null, cerradoVoluntario = false;
  var cliente = {
    publicar: function (topico, obj, retain) {
      if (ws && ws.readyState === 1) {
        try { ws.send(mqttPaquetePublish(topico, JSON.stringify(obj), retain)); } catch (e) {}
      }
    },
    cerrar: function () {
      cerradoVoluntario = true;
      clearInterval(pingTimer);
      try { if (ws) ws.close(); } catch (e) {}
    },
    vivo: function () { return !!(ws && ws.readyState === 1); }
  };
  function procesarPaquete(pkt, conectoInfo) {
    if (!conectoInfo.conecto) {
      if (esConnackOk(pkt)) {
        conectoInfo.conecto = true;
        clearTimeout(conectoInfo.t);
        try { if (topicoSub) ws.send(mqttPaqueteSubscribe(1, topicoSub)); } catch (e) {}
        pingTimer = setInterval(function () {
          try { ws.send(new Uint8Array([0xc0, 0x00])); } catch (e) {}
        }, 45000);
        cbs.abierto(cliente, conectoInfo.brokerIdx);
      }
      return;
    }
    var pub = mqttExtraerPublicacion(pkt);
    if (pub && cbs.mensaje) {
      try { cbs.mensaje(pub.topico, JSON.parse(pub.texto)); } catch (e) {}
    }
  }
  function intentar() {
    if (cerradoVoluntario) return;
    if (oi >= orden.length) { cbs.cerrado('sin-broker'); return; }
    var brokerIdx = orden[oi++];
    var url = MQTT_BROKERS[brokerIdx];
    try { ws = new WebSocket(url, 'mqtt'); }
    catch (e) { intentar(); return; }
    ws.binaryType = 'arraybuffer';
    var info = { conecto: false, brokerIdx: brokerIdx, t: null };
    info.t = setTimeout(function () { try { ws.close(); } catch (e) {} }, 12000);
    ws.onopen = function () {
      try { ws.send(mqttPaqueteConnect('cd-' + Math.random().toString(36).slice(2, 10))); }
      catch (e) { try { ws.close(); } catch (e2) {} }
    };
    ws.onmessage = function (ev) {
      // Un mensaje WebSocket puede traer varios paquetes MQTT juntos: procesarlos todos.
      var buf = new Uint8Array(ev.data), off = 0;
      while (off < buf.length) {
        var rl = mqttLeerLongitud(buf, off + 1);
        if (!rl) break;
        var total = 1 + rl.bytes + rl.valor;
        if (off + total > buf.length) break;
        procesarPaquete(buf.slice(off, off + total), info);
        off += total;
      }
    };
    ws.onerror = function () { /* onclose se encarga */ };
    ws.onclose = function () {
      clearTimeout(info.t);
      clearInterval(pingTimer);
      if (cerradoVoluntario) return;
      if (!info.conecto) intentar();
      else cbs.cerrado('desconectado');
    };
  }
  intentar();
  return cliente;
}

/* ---------- Anfitrión: compartir partida ---------- */
var salaActiva = null;     // {codigo, topico, mqtt, intentos}
var salaPendiente = null;  // mientras conecta

function cbsSala(registro) {
  return {
    abierto: function (cli, brokerIdx) {
      if (salaPendiente !== registro) { try { cli.cerrar(); } catch (e) {} return; }
      salaPendiente = null;
      salaActiva = registro;
      registro.broker = brokerIdx;
      var btn = $('shareBtn');
      btn.classList.add('sharing');
      btn.setAttribute('aria-label', 'Compartiendo (toca para detener)');
      btn.title = 'Compartiendo (toca para detener)';
      publicarEstado();
      if (!registro.silencioso) {
        var url = urlSala(registro.codigo, registro.broker);
        var datos = { title: 'Cristo Domino en vivo', text: 'Mira nuestra partida de dominó en vivo', url: url };
        if (navigator.share) {
          navigator.share(datos).catch(function () {});
        } else if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(function () {
            toast('Enlace copiado, compártelo con tus amigos 🔗');
          }).catch(function () { toast('Comparte este enlace: ' + url); });
        } else {
          toast('Comparte este enlace: ' + url);
        }
      }
    },
    mensaje: function () {},
    cerrado: function (motivo) {
      if (salaPendiente === registro) {
        salaPendiente = null;
        if (motivo === 'sin-broker') toast('Sin conexión: no se pudo compartir la partida');
        return;
      }
      if (salaActiva === registro) {
        if (motivo === 'desconectado' && registro.intentos < 3) {
          registro.intentos++;
          setTimeout(function () {
            if (salaActiva === registro) registro.mqtt = mqttConectar(null, cbsSala(registro));
          }, 4000);
        } else {
          detenerSala();
          toast('Se perdió la conexión para compartir');
        }
      }
    }
  };
}

function compartirPartida() {
  if (salaActiva || salaPendiente) {
    detenerSala();
    toast('Dejaste de compartir la partida');
    return;
  }
  ensureAudio();
  var codigo = generarCodigoSala();
  var registro = { codigo: codigo, topico: MQTT_TOPICO_BASE + codigo, mqtt: null, intentos: 0 };
  salaPendiente = registro;
  toast('Conectando para compartir…');
  registro.mqtt = mqttConectar(null, cbsSala(registro));
}

/* Si la conexión de la sala se murió (p. ej. la app pasó a segundo plano),
   reconecta con el mismo código sin volver a abrir el diálogo de compartir. */
function asegurarSala() {
  if (!salaActiva || salaPendiente || MODO_ESPECTADOR) return;
  var cli = salaActiva.mqtt;
  if (cli && cli.vivo && cli.vivo()) return;
  try { if (cli) cli.cerrar(); } catch (e) {}
  salaActiva.intentos = 0;
  salaActiva.silencioso = true;
  salaPendiente = salaActiva;
  salaActiva.mqtt = mqttConectar(null, cbsSala(salaActiva));
}
document.addEventListener('visibilitychange', function () {
  if (!document.hidden) asegurarSala();
});

function detenerSala() {  var reg = salaActiva || salaPendiente;
  salaActiva = null;
  salaPendiente = null;
  if (reg) {
    try { reg.mqtt.publicar(reg.topico, { t: 'fin' }, true); } catch (e) {}
    try { reg.mqtt.cerrar(); } catch (e) {}
  }
  var btn = $('shareBtn');
  if (btn) {
    btn.classList.remove('sharing');
    btn.setAttribute('aria-label', 'Compartir partida');
    btn.title = 'Compartir partida';
  }
}

function publicarEstado() {
  if (!salaActiva) return;
  asegurarSala();
  if (!salaActiva.mqtt) return;
  try {
    salaActiva.mqtt.publicar(salaActiva.topico, {
      t: 'estado',
      v: 1,
      ts: Date.now(),
      meta: state.meta,
      teams: [
        { name: state.teams[0].name, color: state.teams[0].color, score: state.teams[0].score, dominadas: state.teams[0].dominadas },
        { name: state.teams[1].name, color: state.teams[1].color, score: state.teams[1].score, dominadas: state.teams[1].dominadas }
      ]
    }, true);
  } catch (e) {}
}
function publicarPulla(fromTeam, pullaId) {
  if (!salaActiva) return;
  try { salaActiva.mqtt.publicar(salaActiva.topico, { t: 'pulla', id: pullaId, de: fromTeam }); } catch (e) {}
}
function publicarGanador(t) {
  if (!salaActiva) return;
  try {
    salaActiva.mqtt.publicar(salaActiva.topico, { t: 'ganador', equipo: t, nombre: state.teams[t].name, meta: state.meta });
  } catch (e) {}
}

/* ---------- Invitado: mirar partida ---------- */
var MODO_ESPECTADOR = false;
var codigoSalaInvitado = null;
var mqttInvitado = null;
var invitadoTimer = null;
var invitadoEstado = false;
var invitadoFin = false;

function iniciarEspectador(codigo) {
  MODO_ESPECTADOR = true;
  codigoSalaInvitado = codigo;
  document.body.classList.add('espectador');
  document.title = 'Cristo Domino — partida en vivo';
  $('spectBar').hidden = false;
  $('spectWait').hidden = false;
  renderTheme();
  renderCards();
  conectarInvitado();
}

function conectarInvitado() {
  if (!MODO_ESPECTADOR || invitadoFin) return;
  var topico = MQTT_TOPICO_BASE + codigoSalaInvitado;
  try {
    mqttInvitado = mqttConectar(topico, {
      abierto: function () {
        clearTimeout(invitadoTimer);
        invitadoTimer = setTimeout(function () {
          if (MODO_ESPECTADOR && !invitadoEstado && !invitadoFin) {
            $('spectWait').textContent = 'No se encontró la partida. Revisa el enlace o pide uno nuevo…';
          }
        }, 25000);
      },
      mensaje: function (top, obj) {
        if (top === topico) recibirMensajeInvitado(obj);
      },
      cerrado: function () {
        if (!MODO_ESPECTADOR || invitadoFin) return;
        clearTimeout(invitadoTimer);
        invitadoTimer = setTimeout(conectarInvitado, 5000);
      }
    }, brokerDeURL());
  } catch (e) {
    clearTimeout(invitadoTimer);
    invitadoTimer = setTimeout(conectarInvitado, 8000);
  }
}

function recibirMensajeInvitado(m) {
  if (!m || typeof m.t !== 'string') return;
  if (m.t === 'estado') {
    var ts = m.ts | 0;
    if (ts && Date.now() - ts > 2 * 3600 * 1000) return; // estado retenido muy viejo: sala muerta
    invitadoEstado = true;
    $('spectWait').hidden = true;
    try {
      for (var i = 0; i < 2; i++) {
        var tm = m.teams[i] || {};
        state.teams[i].name = String(tm.name || ('Equipo ' + (i + 1))).slice(0, 16);
        state.teams[i].color = Math.abs(tm.color | 0) % TEAM_COLORS.length;
        state.teams[i].score = Math.max(0, tm.score | 0);
        state.teams[i].dominadas = Math.max(0, tm.dominadas | 0);
      }
      if (METAS.indexOf(m.meta) !== -1) state.meta = m.meta;
    } catch (e) {}
    renderCards();
  } else if (m.t === 'pulla') {
    var p = buscarPullaPorId(m.id);
    if (p) enviarPulla(m.de === 1 ? 1 : 0, p);
  } else if (m.t === 'ganador') {
    celebrarGanadorInvitado(m);
  } else if (m.t === 'fin') {
    terminarInvitado('Partida terminada', 'Pide a tu amigo el enlace de la próxima partida 🙌');
  }
}

function buscarPullaPorId(id) {
  var grupos = ['nivel1', 'nivel2', 'nivel3'];
  for (var g = 0; g < grupos.length; g++) {
    var arr = PULLAS[grupos[g]];
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
  }
  return null;
}

function celebrarGanadorInvitado(m) {
  var idx = m.equipo === 1 ? 1 : 0;
  var nombre = (m.nombre ? String(m.nombre).slice(0, 16) : state.teams[idx].name);
  ensureAudio();
  try { SFX.fanfarria(); } catch (e) {}
  try { confetti(displayColor(state.teams[idx])); } catch (e) {}
  $('spectWinTitle').textContent = '¡' + nombre + ' ganó la partida!';
  $('spectWinSub').textContent = 'Meta ' + (m.meta || state.meta) + ' · ' + state.teams[idx].score + ' puntos';
  $('spectWin').hidden = false;
  setTimeout(function () {
    terminarInvitado('Partida terminada', 'Pide a tu amigo el enlace de la próxima partida 🙌');
  }, 6000);
}

function terminarInvitado(titulo, sub) {
  invitadoFin = true;
  clearTimeout(invitadoTimer);
  try { if (mqttInvitado) mqttInvitado.cerrar(); } catch (e) {}
  $('spectWait').hidden = true;
  $('spectWinTitle').textContent = titulo;
  $('spectWinSub').textContent = sub;
  $('spectWin').hidden = false;
}

/* ---------- Eventos ---------- */
function init() {
  // Service worker (solo en http/https; en file:// no aplica)
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }

  // Modo espectador: ?mirar=CODIGO — solo pizarra en vivo, sin controles
  var codigo = codigoDeURL();
  if (codigo) {
    iniciarEspectador(codigo);
    return;
  }

  load();
  render();

  document.querySelectorAll('.keypad button').forEach(function (b) {
    b.addEventListener('click', function () { pressKey(b.dataset.key); });
  });

  $('sumBtn').addEventListener('click', sumarPuntos);

  for (var i = 0; i < 2; i++) {
    (function (i) {
      $('card' + i).addEventListener('click', function () {
        ensureAudio();
        state.selected = i;
        SFX.key();
        save();
        renderCards();
      });
      $('num' + i).addEventListener('click', function (ev) {
        ev.stopPropagation();
        cambiarColor(i);
      });
      $('name' + i).addEventListener('click', function (ev) {
        ev.stopPropagation();
        editarNombre(i);
      });
      $('gift' + i).addEventListener('click', function (ev) {
        ev.stopPropagation();
        abrirPullas(i);
      });
    })(i);
  }

  document.querySelectorAll('#metaSeg button').forEach(function (b) {
    b.addEventListener('click', function () { elegirMeta(parseInt(b.dataset.meta, 10)); });
  });

  $('undoBtn').addEventListener('click', deshacerUltima);
  $('newGameBtn').addEventListener('click', partidaNueva);
  $('shareBtn').addEventListener('click', compartirPartida);
  $('resetDomBtn').addEventListener('click', reiniciarDominadas);
  $('clearHistoryBtn').addEventListener('click', borrarHistorial);
  $('themeToggle').addEventListener('click', toggleTheme);

  $('pullaClose').addEventListener('click', cerrarPullas);
  $('pullaBackdrop').addEventListener('click', function (ev) {
    if (ev.target === $('pullaBackdrop')) cerrarPullas();
  });

  $('winnerOk').addEventListener('click', aceptarGanador);
}

document.addEventListener('DOMContentLoaded', init);
