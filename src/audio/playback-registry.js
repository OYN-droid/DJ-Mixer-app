(function initializePlaybackRegistry(global) {
  class PlaybackRegistry {
    constructor() {
      this.sources = new Map();
      this.lastPlaybackEvent = "Registry initialized";
      this.lastStopEvent = "None";
      this.lastError = "None";
    }

    register(descriptor) {
      if (!descriptor || !descriptor.id || typeof descriptor.stop !== "function") {
        this.lastError = "A playback source was rejected because it had no ID or stop callback.";
        return false;
      }
      this.sources.set(descriptor.id, { ...descriptor });
      return true;
    }

    state(source) {
      try {
        return { playing: false, paused: false, looping: false, automated: false, metadata: {}, ...(source.getState ? source.getState() : {}) };
      } catch (error) {
        this.lastError = `${source.id}: ${error.message || "state lookup failed"}`;
        return { playing: false, paused: false, looping: false, automated: false, metadata: {} };
      }
    }

    snapshot() {
      return [...this.sources.values()].map((source) => ({ ...source, ...this.state(source) }));
    }

    active() {
      return this.snapshot().filter((source) => source.playing || source.paused);
    }

    primary() {
      return this.active().find((source) => source.playing) || this.active()[0] || null;
    }

    async invoke(source, action) {
      if (!source || typeof source[action] !== "function") return false;
      try {
        await source[action]();
        this.lastPlaybackEvent = `${action}: ${source.id}`;
        return true;
      } catch (error) {
        this.lastError = `${source.id} ${action} failed: ${error.message || "unknown error"}`;
        return false;
      }
    }

    async pauseActive() {
      const active = this.snapshot().filter((source) => source.playing && typeof source.pause === "function");
      await Promise.all(active.map((source) => this.invoke(source, "pause")));
    }

    async resumePrimary() {
      const source = this.snapshot().find((item) => item.paused && typeof item.resume === "function") || this.primary();
      return this.invoke(source, "resume");
    }

    async restartPrimary() {
      return this.invoke(this.primary(), "restart");
    }

    async stopSource(id) {
      const source = this.sources.get(id);
      const stopped = await this.invoke(source, "stop");
      if (stopped) this.lastStopEvent = `Stopped ${id}`;
      return stopped;
    }

    async stopAll() {
      const sources = [...this.sources.values()];
      const results = await Promise.allSettled(sources.map((source) => this.invoke(source, "stop")));
      this.lastStopEvent = `Global Stop attempted ${sources.length} registered sources`;
      return results;
    }
  }

  global.AudioPlaybackRegistry = new PlaybackRegistry();
})(window);
