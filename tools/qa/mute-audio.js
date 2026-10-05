// Playwright init script (context.addInitScript({ path: "tools/qa/mute-audio.js" })): silences ALL page audio
// (Web Audio, <audio>/<video>, speechSynthesis) for pages that do not load the kit. Generated from kit/automute.ts.

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
function detect() {
    try {
        const nav = globalThis.navigator;
        if (nav && nav.webdriver === true)
            return true;
        const loc = globalThis.location;
        if (loc && /(?:^|[?&#])mute(?:=1|=true)?(?:[&#]|$)/.test(`${loc.search}${loc.hash}`))
            return true;
    }
    catch {
        /* not a browser */
    }
    return false;
}
const AUTOMATION_MUTE = detect();
let installed = false;
function installAutomationMute() {
    if (installed || !AUTOMATION_MUTE)
        return;
    installed = true;
    const g = globalThis;
    // Web Audio: reroute every connection that targets a destination through a silent sink.
    const nodeProto = g.AudioNode?.prototype;
    const Dest = g.AudioDestinationNode;
    if (nodeProto && Dest && typeof nodeProto.connect === 'function') {
        const original = nodeProto.connect;
        const sinks = new WeakMap();
        nodeProto.connect = function patchedConnect(target, ...rest) {
            if (target instanceof Dest) {
                const c = target.context;
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
        };
    }
    // Media elements: muted before they start.
    const mediaProto = g.HTMLMediaElement?.prototype;
    if (mediaProto && typeof mediaProto.play === 'function') {
        const play = mediaProto.play;
        mediaProto.play = function patchedPlay() {
            try {
                this.muted = true;
                this.volume = 0;
            }
            catch {
                /* iOS: volume is read-only; muted is enough */
            }
            return play.call(this);
        };
    }
    // Speech synthesis: silent utterances (events still fire).
    const synth = g.speechSynthesis;
    if (synth && typeof synth.speak === 'function') {
        const speak = synth.speak.bind(synth);
        synth.speak = (u) => {
            try {
                u.volume = 0;
            }
            catch {
                /* ignore */
            }
            speak(u);
        };
    }
}
installAutomationMute();
