import type { Page } from '@playwright/test';
/** Open the parent page: answers the grown-up question on a first visit, then sets / enters the PIN. */
export async function parentPin(page: Page, pin = '2468') {
  await page.locator('.pin-gate').waitFor();
  const question = page.locator('.adult-question');
  if (await question.count()) {
    const [, a, b] = /(\d+)\s*×\s*(\d+)/.exec(await question.innerText())!;
    await page.getByLabel('算术答案').fill(String(Number(a) * Number(b)));
    await page.getByRole('button', { name: '继续', exact: true }).click();
  }
  for (let i = 0; i < 2; i++) {
    const field = page.getByLabel(/家长 PIN/);
    if (!(await field.count())) break;
    await field.fill(pin);
    await page.getByRole('button', { name: '进入家长页' }).click();
  }
}

/** A microphone that "hears" 125 ms of a tone, then silence (WebKit cannot fake audio input). AI/cloud scoring stays off. */
export async function stubMicrophone(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => undefined }] }) },
      configurable: true,
    });
    AudioContext.prototype.createMediaStreamSource = function () {
      return this.createGain() as any;
    };
    (window as any).AudioWorkletNode = class extends GainNode {
      port: { onmessage: ((event: { data: Float32Array }) => void) | null } = { onmessage: null };
      timer: number;
      constructor(context: AudioContext) {
        super(context);
        let n = 0;
        this.timer = window.setInterval(() => {
          const input = Float32Array.from({ length: Math.round(context.sampleRate / 5) }, (_, i) =>
            n < 5 ? Math.sin(i / 17) * 0.12 : 0,
          );
          n++;
          this.port.onmessage?.({ data: input });
        }, 25);
      }
      disconnect() {
        clearInterval(this.timer);
        super.disconnect();
      }
    };
  });
}
