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
}
