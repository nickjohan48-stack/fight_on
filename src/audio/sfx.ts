/* ============================================================
   NEONCLASH — synthesized sound engine (WebAudio, zero assets)
   Replace any synth with sample playback later via play().
   ============================================================ */

let ctx: AudioContext | null = null;
let master: GainNode;
let musicGain: GainNode;
let sfxGain: GainNode;
let sfxVol = 0.8, musicVol = 0.5, muted = false;
let musicTimer: number | null = null;
let step = 0;

export function initAudio() {
  if (ctx) { if (ctx.state === "suspended") ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  } catch { return; }
  master = ctx.createGain(); master.gain.value = muted ? 0 : 1; master.connect(ctx.destination);
  sfxGain = ctx.createGain(); sfxGain.gain.value = sfxVol; sfxGain.connect(master);
  musicGain = ctx.createGain(); musicGain.gain.value = musicVol * 0.5; musicGain.connect(master);
}

export function setVolumes(s: number, m: number, mute: boolean) {
  sfxVol = s; musicVol = m; muted = mute;
  if (ctx) {
    sfxGain.gain.value = s;
    musicGain.gain.value = m * 0.5;
    master.gain.value = mute ? 0 : 1;
  }
}

function now() { return ctx!.currentTime; }

function tone(freq: number, end: number, dur: number, type: OscillatorType, vol: number, when = 0, dest?: GainNode) {
  if (!ctx) return;
  const t0 = now() + when;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, end), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(dest ?? sfxGain);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

function noise(dur: number, vol: number, freq: number, q = 1, when = 0, type: BiquadFilterType = "bandpass") {
  if (!ctx) return;
  const t0 = now() + when;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f); f.connect(g); g.connect(sfxGain);
  src.start(t0);
}

export const SFX = {
  click() { tone(660, 990, 0.06, "square", 0.12); tone(1320, 1800, 0.05, "sine", 0.08, 0.01); },
  back() { tone(440, 220, 0.09, "square", 0.1); },
  hover() { tone(880, 900, 0.03, "sine", 0.04); },
  swing() { noise(0.09, 0.14, 2400, 2); },
  swingHeavy() { noise(0.16, 0.2, 900, 1.5); tone(160, 90, 0.14, "sawtooth", 0.1); },
  hitLight() { tone(300, 90, 0.09, "square", 0.22); noise(0.07, 0.26, 3200, 1); },
  hitHeavy() { tone(180, 46, 0.2, "sawtooth", 0.3); noise(0.16, 0.34, 700, 0.8); tone(90, 40, 0.24, "sine", 0.3); },
  hitSpecial() { tone(520, 60, 0.3, "sawtooth", 0.26); noise(0.24, 0.3, 1600, 1); tone(1040, 120, 0.28, "square", 0.14); },
  block() { tone(1400, 900, 0.07, "square", 0.14); noise(0.05, 0.16, 5200, 3); },
  jump() { tone(240, 520, 0.12, "sine", 0.12); },
  land() { noise(0.08, 0.14, 400, 0.8); },
  dash() { noise(0.14, 0.2, 3000, 0.7); tone(300, 700, 0.1, "sine", 0.08); },
  special() { tone(140, 900, 0.22, "sawtooth", 0.2); noise(0.2, 0.2, 2000, 1.2); },
  ko() {
    tone(120, 28, 0.7, "sawtooth", 0.4); noise(0.5, 0.4, 300, 0.6);
    tone(60, 24, 0.9, "sine", 0.42, 0.05); noise(0.3, 0.3, 1200, 1, 0.1);
  },
  bell() { tone(1180, 1150, 0.5, "triangle", 0.24); tone(2360, 2300, 0.34, "sine", 0.12, 0.01); },
  fight() { tone(196, 392, 0.16, "sawtooth", 0.2); tone(392, 784, 0.22, "square", 0.14, 0.12); },
  countTick() { tone(700, 700, 0.05, "square", 0.08); },
  win() {
    const seq = [523, 659, 784, 1046];
    seq.forEach((f, i) => tone(f, f, 0.18, "square", 0.16, i * 0.13));
    tone(1568, 1568, 0.4, "triangle", 0.14, 0.52);
  },
  lose() { [392, 330, 262, 196].forEach((f, i) => tone(f, f * 0.97, 0.24, "sawtooth", 0.13, i * 0.17)); },
  levelUp() { [660, 880, 990, 1320, 1760].forEach((f, i) => tone(f, f, 0.12, "square", 0.13, i * 0.07)); },
  matchFound() { tone(440, 440, 0.1, "square", 0.16); tone(660, 660, 0.14, "square", 0.16, 0.1); tone(880, 880, 0.24, "square", 0.16, 0.2); },
};

/* ------------------- music sequencer ------------------- */
const BASS = [55, 55, 65.4, 55, 73.4, 55, 82.4, 73.4]; // A minor drive
const ARP = [220, 261.6, 329.6, 440, 329.6, 261.6];

export function startMusic() {
  if (!ctx || musicTimer !== null) return;
  step = 0;
  const spb = 60 / 138 / 2; // 138bpm 8ths
  musicTimer = window.setInterval(() => {
    if (!ctx) return;
    const s = step % 16;
    const t0 = now();
    // kick
    if (s % 4 === 0) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(140, t0); o.frequency.exponentialRampToValueAtTime(38, t0 + 0.12);
      g.gain.setValueAtTime(0.5, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.14);
      o.connect(g); g.connect(musicGain); o.start(t0); o.stop(t0 + 0.16);
    }
    // hat
    if (s % 2 === 1) {
      const len = Math.floor(ctx.sampleRate * 0.03);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 7000;
      const g = ctx.createGain(); g.gain.value = 0.16;
      src.connect(f); f.connect(g); g.connect(musicGain); src.start(t0);
    }
    // bass
    const b = BASS[s % 8];
    {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sawtooth"; o.frequency.value = b;
      const flt = ctx.createBiquadFilter(); flt.type = "lowpass"; flt.frequency.value = 320;
      g.gain.setValueAtTime(0.3, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + spb * 0.95);
      o.connect(flt); flt.connect(g); g.connect(musicGain); o.start(t0); o.stop(t0 + spb);
    }
    // arp sparkle
    if (s % 2 === 0) {
      const a = ARP[(step / 2 | 0) % ARP.length];
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "triangle"; o.frequency.value = a * 2;
      g.gain.setValueAtTime(0.07, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + spb * 1.8);
      o.connect(g); g.connect(musicGain); o.start(t0); o.stop(t0 + spb * 2);
    }
    step++;
  }, spb * 1000);
}

export function stopMusic() {
  if (musicTimer !== null) { clearInterval(musicTimer); musicTimer = null; }
}
