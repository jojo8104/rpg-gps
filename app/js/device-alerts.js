export class DeviceAlerts {
  constructor() { this.audio = null; }

  async enable() {
    const AudioContext = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContext) return false;
    this.audio ??= new AudioContext();
    if (this.audio.state === "suspended") await this.audio.resume();
    return this.audio.state === "running";
  }

  notify(kind = "warning") {
    const vibration = kind === "danger" ? [180, 80, 180] : [120];
    if (typeof navigator.vibrate === "function") navigator.vibrate(vibration);
    if (!this.audio || this.audio.state !== "running") return false;
    const oscillator = this.audio.createOscillator();
    const gain = this.audio.createGain();
    oscillator.frequency.value = kind === "danger" ? 330 : 520;
    gain.gain.setValueAtTime(.0001, this.audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(.16, this.audio.currentTime + .02);
    gain.gain.exponentialRampToValueAtTime(.0001, this.audio.currentTime + .28);
    oscillator.connect(gain).connect(this.audio.destination);
    oscillator.start(); oscillator.stop(this.audio.currentTime + .3);
    return true;
  }

  reward({ kilometer = false, kind = "travel" } = {}) {
    if (!this.audio || this.audio.state !== "running") return false;
    const melodies = { travel: kilometer ? [523.25, 659.25, 783.99] : [523.25, 659.25], hero: [523.25, 659.25, 783.99, 1046.5], unit: [392, 523.25, 659.25] };
    const start = this.audio.currentTime; const frequencies = melodies[kind] ?? melodies.travel;
    frequencies.forEach((frequency, index) => {
      const oscillator = this.audio.createOscillator(); const gain = this.audio.createGain(); const noteStart = start + index * .1;
      oscillator.type = "sine"; oscillator.frequency.setValueAtTime(frequency, noteStart);
      gain.gain.setValueAtTime(.0001, noteStart); gain.gain.exponentialRampToValueAtTime(.11, noteStart + .018); gain.gain.exponentialRampToValueAtTime(.0001, noteStart + .24);
      oscillator.connect(gain).connect(this.audio.destination); oscillator.start(noteStart); oscillator.stop(noteStart + .25);
    });
    return true;
  }
}
