'use strict';
/* Cristo Domino — anotador de dominó.
   Vanilla JS, sin dependencias externas. Funciona sin conexión. */

var LS_KEY = 'cristo_domino_v1';
var TEAM_COLORS = ['#ffffff', '#2f9df0', '#ff5c5c', '#34c77b', '#ffb020', '#b16dff'];
var METAS = [100, 200, 300, 500];

/* ---------- Pullas (contenido sano, para amigos de la iglesia) ---------- */
var PULLAS = {
  basicas: [
    { id: 'risa',     emoji: '😂', titulo: 'Risa buena',            sonido: 'risa' },
    { id: 'corona',   emoji: '👑', titulo: 'Rey del dominó',        sonido: 'corona' },
    { id: 'rayo',     emoji: '⚡', titulo: 'Más rápido que el tren', sonido: 'rayo' },
    { id: 'tortuga',  emoji: '🐢', titulo: 'Sin prisa, con calma',  sonido: 'tortuga' },
    { id: 'trompeta', emoji: '🎺', titulo: 'Suena la victoria',     sonido: 'trompeta' },
    { id: 'estrella', emoji: '⭐', titulo: 'Brilla, brilla',        sonido: 'estrella' }
  ],
  epicas: [
    { id: 'copa',    emoji: '🏆', titulo: 'Campeón con humildad', sonido: 'copa' },
    { id: 'fiesta',  emoji: '🎆', titulo: 'Fiesta sana',          sonido: 'fiesta' },
    { id: 'aleluya', emoji: '🙌', titulo: 'Gloria a Dios',       sonido: 'aleluya' }
  ]
};
var GROUP_NAMES = { basicas: 'Básicas', epicas: 'Épicas' };

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
    hands: [],        // {team, points, ts, unlockedBasic}
    history: [],      // {n, fecha, meta, ganador, hands}
    gameN: 1,
    pullas: { 0: [], 1: [] },   // grupos desbloqueados por equipo: 'basicas' | 'epicas'
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
    state.pullas = s.pullas && s.pullas[0] ? s.pullas : { 0: [], 1: [] };
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
    // Llamada real: Sol-Do-Mi-Sol sostenido
    if (!AC) return;
    var t = AC.currentTime + 0.02;
    [[392, 0, 0.14], [523, 0.15, 0.14], [659, 0.30, 0.14], [784, 0.45, 0.55]]
      .forEach(function (n) { brassNote(n[0], t + n[1], n[2], 0.42); });
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
    // Lenta y grave: tres notas bajas descendentes
    if (!AC) return;
    var t = AC.currentTime + 0.02;
    [[196, 0], [174, 0.34], [147, 0.68]]
      .forEach(function (n) { softNote(n[0], t + n[1], 0.34, 'sine', 0.42); });
  },
  trompeta: function () {
    // Trompeta de verdad: ta-ta-taaa con vibrato
    if (!AC) return;
    var t = AC.currentTime + 0.02;
    brassNote(523, t, 0.13, 0.45);
    brassNote(523, t + 0.15, 0.13, 0.45);
    brassNote(784, t + 0.30, 0.55, 0.48);
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

function renderHistory() {
  var body = $('historyBody');
  var html = '';

  // Partida en curso: dividida por partida y por equipo.
  // Cada equipo numera SUS propias manos desde 1 (más recientes primero).
  html += '<div class="hist-match"><p class="hist-match-title">Partida #' + state.gameN + ' · en curso</p>';
  for (var i = 0; i < 2; i++) {
    var th = teamHands(state.hands, i);
    html += '<div class="hist-group"><p class="hist-group-title">' + esc(state.teams[i].name) + '</p>';
    if (!th.length) {
      html += '<p class="hist-empty">Sin manos todavía.</p>';
    } else {
      for (var k = th.length - 1; k >= 0; k--) {
        html += '<div class="hist-row"><span class="n">' + (k + 1) + '</span>' +
                '<span class="nm">Mano</span>' +
                '<span class="pts">+' + th[k].points + '</span></div>';
      }
    }
    html += '</div>';
  }
  html += '</div>';

  // Partidas archivadas
  state.history.forEach(function (g) {
    var winName = (g.nombres && g.ganador != null && g.nombres[g.ganador]) ? g.nombres[g.ganador] : '—';
    var inner = '';
    for (var i = 0; i < 2; i++) {
      var th = teamHands(g.hands || [], i);
      if (!th.length) continue;
      var nombre = (g.nombres && g.nombres[i]) ? g.nombres[i] : ('Equipo ' + (i + 1));
      inner += '<div class="row"><b>' + esc(nombre) + '</b><span>' +
               th.map(function (h, k) { return 'M' + (k + 1) + ': +' + h.points; }).join(' · ') +
               '</span></div>';
    }
    html += '<details class="arch"><summary>Partida #' + g.n +
            ' · ' + fmtFecha(g.fecha) +
            ' · Meta ' + g.meta +
            ' · 🏆 ' + esc(winName) + '</summary>' +
            '<div class="arch-hands">' + (inner || '<div class="row">Sin manos.</div>') + '</div></details>';
  });

  body.innerHTML = html;
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
  state.teams[t].score += pts;
  state.teams[t].dominadas += 1;
  var hand = { team: t, points: pts, ts: Date.now(), unlockedBasic: false };
  state.hands.push(hand);
  SFX.sumar();

  if (pts >= 25 && state.pullas[t].indexOf('basicas') === -1) {
    state.pullas[t].push('basicas');
    hand.unlockedBasic = true;
    SFX.unlock();
    toast('¡' + state.teams[t].name + ' desbloqueó las pullas básicas! 🎁');
  }

  state.entry = '0';
  save();
  render();
  revisarGanador();
}

function revisarGanador() {
  var t = state.selected;
  if (state.teams[t].score < state.meta) return;
  var epicNueva = false;
  if (state.pullas[t].indexOf('epicas') === -1) {
    state.pullas[t].push('epicas');
    epicNueva = true;
  }
  SFX.fanfarria();
  confetti(displayColor(state.teams[t]));
  $('winnerTitle').textContent = '¡' + state.teams[t].name + ' ganó la partida!';
  $('winnerSub').textContent = 'Meta ' + state.meta + ' · ' + state.teams[t].score + ' puntos';
  $('winnerUnlock').hidden = !epicNueva;
  $('winnerBackdrop').hidden = false;
  document.body.classList.add('modal-open');
  save();
  render();
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
    hands: state.hands.map(function (h) { return { team: h.team, points: h.points, ts: h.ts }; })
  });
  state.hands = [];
  state.teams[0].score = 0;
  state.teams[1].score = 0;
  state.entry = '0';
  save();
  render();
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
  if (h.unlockedBasic) {
    var aun = state.hands.some(function (x) { return x.team === h.team && x.points >= 25; });
    if (!aun) {
      state.pullas[h.team] = state.pullas[h.team].filter(function (g) { return g !== 'basicas'; });
    }
  }
  SFX.deshacer();
  save();
  render();
  toast('Última mano deshecha');
}

function partidaNueva() {
  if (state.hands.length && !confirm('¿Empezar una partida nueva? Los puntajes actuales se reinician.')) return;
  state.hands = [];
  state.teams[0].score = 0;
  state.teams[1].score = 0;
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
}

/* ---------- Pullas ---------- */
function abrirPullas(team) {
  var grupos = state.pullas[team];
  if (!grupos.length) {
    toast('Gana una mano de 25+ puntos para desbloquear pullas 🎁');
    return;
  }
  ensureAudio();
  $('pullaTitle').textContent = 'Pullas de ' + state.teams[team].name;
  var cont = $('pullaGroups');
  cont.innerHTML = '';
  grupos.forEach(function (g) {
    var sec = document.createElement('div');
    var h = document.createElement('p');
    h.className = 'pulla-sec-title';
    h.textContent = GROUP_NAMES[g] || g;
    sec.appendChild(h);
    var row = document.createElement('div');
    row.className = 'pulla-row';
    PULLAS[g].forEach(function (p) {
      var b = document.createElement('button');
      b.className = 'pulla-item';
      b.innerHTML = '<span class="pulla-emoji">' + p.emoji + '</span>' +
                    '<span class="pulla-name">' + esc(p.titulo) + '</span>';
      b.addEventListener('click', function () { enviarPulla(team, p); });
      row.appendChild(b);
    });
    sec.appendChild(row);
    cont.appendChild(sec);
  });
  var hint = document.createElement('p');
  hint.className = 'pulla-hint';
  hint.textContent = 'Toca una pulla para enviársela al otro equipo 😄';
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

function mostrarPullaGrande(pulla) {
  ensureAudio();
  var el = document.createElement('div');
  el.className = 'pulla-big';
  el.innerHTML = '<div class="pb-emoji">' + pulla.emoji + '</div>' +
                 '<div class="pb-title">' + esc(pulla.titulo) + '</div>';
  document.body.appendChild(el);
  if (PULLA_SFX[pulla.sonido]) PULLA_SFX[pulla.sonido]();
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

/* ---------- Eventos ---------- */
function init() {
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
  $('resetDomBtn').addEventListener('click', reiniciarDominadas);
  $('clearHistoryBtn').addEventListener('click', borrarHistorial);
  $('themeToggle').addEventListener('click', toggleTheme);

  $('pullaClose').addEventListener('click', cerrarPullas);
  $('pullaBackdrop').addEventListener('click', function (ev) {
    if (ev.target === $('pullaBackdrop')) cerrarPullas();
  });

  $('winnerOk').addEventListener('click', aceptarGanador);

  // Service worker (solo en http/https; en file:// no aplica)
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
}

document.addEventListener('DOMContentLoaded', init);
