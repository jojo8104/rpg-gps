export class ScreenAwake {
  constructor({ onChange = () => {} } = {}) {
    this.lock = null;
    this.enabled = false;
    this.onChange = onChange;
    this.onVisibility = () => {
      if (this.enabled && document.visibilityState === "visible")
        this.acquire();
    };
  }
  async start() {
    this.enabled = true;
    document.addEventListener("visibilitychange", this.onVisibility);
    return this.acquire();
  }
  async acquire() {
    if (!("wakeLock" in navigator) || document.visibilityState !== "visible") {
      this.onChange(false);
      return false;
    }
    try {
      this.lock = await navigator.wakeLock.request("screen");
      this.lock.addEventListener("release", () => this.onChange(false), {
        once: true,
      });
      this.onChange(true);
      return true;
    } catch {
      this.onChange(false);
      return false;
    }
  }
  async stop() {
    this.enabled = false;
    document.removeEventListener("visibilitychange", this.onVisibility);
    if (this.lock) await this.lock.release().catch(() => {});
    this.lock = null;
    this.onChange(false);
  }
}
