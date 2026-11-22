// Synthesized sound for SOLARA — engine hum, sirens, radio, gunshots,
// pickups and mission stings. Everything is WebAudio; no audio files load.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.radioTimer = 0;
    this.radioStep = 0;
    this.muted = false;
    this.station = 0;
    this.stations = ['SOLARA FM 92.1', 'PALM WAVE 99.5', 'SUNSET RADIO 104.3'];
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(this.ctx.destination);
    // Engine loop: two detuned saws through a lowpass filter.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineOsc2 = this.ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc2.frequency.value = 27.5;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 420;
    this.engineOsc.connect(filt);
    this.engineOsc2.connect(filt);
    filt.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    this.engineOsc2.start();
    // Siren loop: a triangle sweeping up and down.
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 700;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0.0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
  }

  setEngine(speed01, driving) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(driving ? 0.05 + speed01 * 0.09 : 0.0, t, 0.1);
    this.engineOsc.frequency.setTargetAtTime(50 + speed01 * 160, t, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(25 + speed01 * 80, t, 0.08);
  }

  setSiren(on, time) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sirenGain.gain.setTargetAtTime(on ? 0.045 : 0.0, t, 0.2);
    if (on) this.sirenOsc.frequency.setTargetAtTime(650 + Math.sin(time * 2.4) * 260, t, 0.05);
  }

  blip(freq, dur, type, vol) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  shot() {
    this.blip(180, 0.12, 'square', 0.25);
    this.blip(90, 0.18, 'sawtooth', 0.2);
  }

  punch() {
    this.blip(120, 0.08, 'square', 0.18);
  }

  pickup() {
    this.blip(880, 0.12, 'sine', 0.22);
    setTimeout(() => this.blip(1320, 0.18, 'sine', 0.2), 90);
  }

  crash() {
    this.blip(70, 0.3, 'sawtooth', 0.3);
  }

  missionStart() {
    [523, 659, 784].forEach((f, i) => setTimeout(() => this.blip(f, 0.22, 'triangle', 0.22), i * 110));
  }

  missionDone() {
    [784, 988, 1175, 1568].forEach((f, i) => setTimeout(() => this.blip(f, 0.25, 'triangle', 0.22), i * 100));
  }

  wantedUp() {
    this.blip(440, 0.15, 'square', 0.2);
    setTimeout(() => this.blip(440, 0.15, 'square', 0.2), 160);
  }

  fail() {
    [392, 330, 262].forEach((f, i) => setTimeout(() => this.blip(f, 0.3, 'sawtooth', 0.18), i * 130));
  }

  cycleStation() {
    this.station = (this.station + 1) % this.stations.length;
    this.blip(660, 0.08, 'sine', 0.15);
    return this.stations[this.station];
  }

  currentStation() {
    return this.stations[this.station];
  }

  // Tiny chiptune radio: a looping bass + lead pattern, different per station.
  updateRadio(dt, driving) {
    if (!this.ctx || !driving) return;
    this.radioTimer -= dt;
    if (this.radioTimer > 0) return;
    this.radioTimer = 0.22;
    const scales = [
      [110, 130.8, 164.8, 196, 220, 261.6],
      [98, 123.5, 146.8, 196, 246.9, 293.7],
      [116.5, 138.6, 174.6, 207.7, 233.1, 277.2],
    ];
    const scale = scales[this.station];
    this.radioStep += 1;
    const bass = scale[this.radioStep % 3];
    const lead = scale[(this.radioStep * 5 + 2) % scale.length] * 2;
    if (this.radioStep % 2 === 0) this.blip(bass, 0.2, 'triangle', 0.07);
    if (this.radioStep % 4 === 1) this.blip(lead, 0.16, 'square', 0.035);
  }
}
