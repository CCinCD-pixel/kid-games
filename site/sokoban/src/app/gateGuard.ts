/**
 * Start-gate click-through guard (QA r1 blocker). The kit gate starts on `pointerup` and turns its
 * own hit-testing off while it fades, so the `click` that the browser synthesises after that very
 * same tap lands on whatever the first screen put under the 开始 button (a map node → a level the
 * child never picked). Rules, installed the moment the gate resolves:
 *  - while the gate fades (`fadeMs`) every pointerdown / pointerup / click is swallowed in the
 *    capture phase (a double tap on 开始 must not walk the robot, skip the opening or open a node);
 *  - after that, clicks stay swallowed until the child presses down again: a real new tap always
 *    has its own `pointerdown` after the gate, the gate tap's echo never does;
 *  - a hard cap (`capMs`) removes the guard in any case (keyboard clicks keep working).
 * Kit request: the gate should swallow its own click; this guard stays harmless once it does.
 */
export function guardGateClickThrough(fadeMs = 500, capMs = 1500): () => void {
  const t0 = performance.now();
  let done = false;
  const early = () => performance.now() - t0 < fadeMs;
  const swallow = (e: Event) => {
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  const onDown = (e: Event) => {
    if (early()) swallow(e);
    else off();
  };
  const onUp = (e: Event) => {
    if (early()) swallow(e);
  };
  const onClick = (e: Event) => swallow(e);
  const timer = setTimeout(() => off(), capMs);
  function off(): void {
    if (done) return;
    done = true;
    clearTimeout(timer);
    window.removeEventListener('pointerdown', onDown, true);
    window.removeEventListener('pointerup', onUp, true);
    window.removeEventListener('click', onClick, true);
  }
  window.addEventListener('pointerdown', onDown, true);
  window.addEventListener('pointerup', onUp, true);
  window.addEventListener('click', onClick, true);
  return off;
}
