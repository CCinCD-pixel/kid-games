/**
 * Automation mute — every page that loads the kit is completely silent when it runs under browser
 * automation (Playwright/WebDriver set `navigator.webdriver`), or when the URL contains `?mute` /
 * `#mute`. The audio graph keeps running (tests still get `ended` events and real timings); only
 * the output is silenced:
 *  - Web Audio: any connection to an AudioDestinationNode is routed through a zero-gain node
 *    (covers the kit engine, legacy pages and game code that builds its own nodes);
 *  - <audio>/<video>: forced muted before play();
 *  - speechSynthesis: utterances get volume 0 (the kit's speech fallback also skips speaking).
 *
 * Why: QA agents play the games on the family Mac; sound through the speakers woke the dad up at
 * night. Real players (iPad home-screen app, no automation) are unaffected.
 */

function detect(): boolean {
  try {
    const nav = globalThis.navigator as (Navigator & { webdriver?: boolean }) | undefined;
    if (nav && nav.webdriver === true) return true;
    const loc = globalThis.location;
    if (loc && /(?:^|[?&#])mute(?:=1|=true)?(?:[&#]|$)/.test(`${loc.search}${loc.hash}`)) return true;
  } catch {
    /* not a browser */
  }
  return false;
}

export const AUTOMATION_MUTE: boolean = detect();

let installed = false;

export function installAutomationMute(): void {
  if (installed || !AUTOMATION_MUTE) return;
  installed = true;
  const g = globalThis as unknown as {
    AudioNode?: { prototype: AudioNode };
    AudioDestinationNode?: abstract new (...a: never[]) => AudioDestinationNode;
    HTMLMediaElement?: { prototype: HTMLMediaElement };
    speechSynthesis?: SpeechSynthesis;
  };

  // Web Audio: reroute every connection that targets a destination through a silent sink.
  const nodeProto = g.AudioNode?.prototype as (AudioNode & { connect: (...a: unknown[]) => unknown }) | undefined;
  const Dest = g.AudioDestinationNode;
  if (nodeProto && Dest && typeof nodeProto.connect === 'function') {
    const original = nodeProto.connect;
    const sinks = new WeakMap<BaseAudioContext, GainNode>();
    nodeProto.connect = function patchedConnect(this: AudioNode, target: unknown, ...rest: unknown[]) {
      if (target instanceof Dest) {
        const c = (target as AudioDestinationNode).context;
        let sink = sinks.get(c);
        if (!sink) {
          sink = c.createGain();
          sink.gain.value = 0;
          original.call(sink, target);
          sinks.set(c, sink);
        }
        return original.call(this, sink, ...rest);
      }
      return original.call(this, target, ...rest);
    } as typeof nodeProto.connect;
  }

  // Media elements: muted before they start.
  const mediaProto = g.HTMLMediaElement?.prototype;
  if (mediaProto && typeof mediaProto.play === 'function') {
    const play = mediaProto.play;
    mediaProto.play = function patchedPlay(this: HTMLMediaElement) {
      try {
        this.muted = true;
        this.volume = 0;
      } catch {
        /* iOS: volume is read-only; muted is enough */
      }
      return play.call(this);
    };
  }

  // Speech synthesis: silent utterances (events still fire).
  const synth = g.speechSynthesis;
  if (synth && typeof synth.speak === 'function') {
    const speak = synth.speak.bind(synth);
    synth.speak = (u: SpeechSynthesisUtterance) => {
      try {
        u.volume = 0;
      } catch {
        /* ignore */
      }
      speak(u);
    };
  }
}

installAutomationMute();
