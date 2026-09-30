// Text-to-speech with word highlighting.
//
// Each spoken block is an element with data-say (the exact text to speak)
// and child .w spans carrying data-start / data-end offsets into that text.
// Browsers that report word boundaries drive the highlight directly; for
// voices that don't (some network voices), we estimate timing instead.

const CHARS_PER_SECOND = 14;

export class Speaker {
  constructor() {
    this.synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
    this.rate = 0.9;
    this.voiceURI = null;
    this.run = 0;
    this.timers = [];
    this.current = null; // keep a reference so Chrome doesn't drop the utterance mid-sentence
  }

  get supported() {
    return !!this.synth;
  }

  voices() {
    if (!this.synth) return [];
    return this.synth.getVoices().filter((v) => /^en(-|_|$)/i.test(v.lang));
  }

  pickVoice() {
    const vs = this.voices();
    return (
      vs.find((v) => v.voiceURI === this.voiceURI) ||
      vs.find((v) => v.localService && /en-US/i.test(v.lang) && v.default) ||
      vs.find((v) => v.localService && /en-US/i.test(v.lang)) ||
      vs.find((v) => v.localService) ||
      vs[0] ||
      null
    );
  }

  stop() {
    this.run += 1;
    this.clearTimers();
    this.synth?.cancel();
    document.querySelectorAll('.w.on').forEach((el) => el.classList.remove('on'));
    document.querySelectorAll('.say.reading').forEach((el) => el.classList.remove('reading'));
  }

  // Read blocks one after another. Starting a new play() stops the old one.
  async play(elements) {
    this.stop();
    if (!this.synth) return;
    const run = this.run;
    // Chrome can swallow an utterance queued in the same tick as cancel().
    await new Promise((r) => setTimeout(r, 60));
    for (const el of elements) {
      if (run !== this.run) return;
      await this.speakOne(el, run);
    }
  }

  speakOne(el, run) {
    return new Promise((resolve) => {
      const text = el?.dataset.say;
      if (!text) return resolve();
      const spans = [...el.querySelectorAll('.w')];
      const msPerChar = 1000 / (CHARS_PER_SECOND * this.rate);
      const mark = (i) => {
        for (const s of spans) s.classList.toggle('on', i >= Number(s.dataset.start) && i < Number(s.dataset.end));
      };

      const u = new SpeechSynthesisUtterance(text);
      u.rate = this.rate;
      const voice = this.pickVoice();
      if (voice) {
        u.voice = voice;
        u.lang = voice.lang;
      } else {
        u.lang = 'en-US';
      }
      this.current = u;

      let sawBoundary = false;
      let finished = false;
      let safety = null;
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(safety);
        // A stale run was already cleaned up by stop(); don't touch the new run's timers or highlights.
        if (run === this.run) {
          this.clearTimers();
          spans.forEach((s) => s.classList.remove('on'));
          el.classList.remove('reading');
        }
        resolve();
      };

      u.onboundary = (e) => {
        if (run !== this.run || (e.name && e.name !== 'word')) return;
        if (!sawBoundary) this.clearTimers();
        sawBoundary = true;
        mark(e.charIndex);
      };
      u.onstart = () => {
        if (run !== this.run) return;
        el.classList.add('reading');
        this.later(400, () => {
          if (!sawBoundary && run === this.run) this.estimate(spans, msPerChar, 400, mark);
        });
      };
      u.onend = finish;
      u.onerror = finish;
      // Some browsers never fire onend; don't let the queue hang.
      safety = setTimeout(finish, text.length * msPerChar * 2 + 4000);

      this.synth.speak(u);
    });
  }

  estimate(spans, msPerChar, elapsed, mark) {
    for (const s of spans) {
      const at = Number(s.dataset.start) * msPerChar - elapsed;
      this.later(Math.max(0, at), () => mark(Number(s.dataset.start)));
    }
  }

  later(ms, fn) {
    this.timers.push(setTimeout(fn, ms));
  }

  clearTimers() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }
}
