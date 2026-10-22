import { familyToken } from '../speech/family';
import { h } from '@kit/ui';
import { Microphone } from '../speech/mic';
import { assess } from '../speech/client';
import { syllablePlan } from '../speech/reference';
import { recordings, saveRecording, type Recording } from '../speech/recordings';
import { calibration } from '../speech/calibration';
import { button, type Context } from './common';

// Only mounted after the shared parent PIN, at the unlinked /pinyin-station/lab/ URL.
export function labPanel(ctx: Context) {
  const host = h('section', { class: 'parent-card recording-list' }, h('h3', null, '家长实验室'));
  const mic = new Microphone();
  let abort: AbortController | null = null,
    alive = true;
  const cleanup = () => {
    alive = false;
    abort?.abort();
    mic.dispose();
    observer.disconnect();
    window.removeEventListener('pagehide', cleanup);
  };
  const observer = new MutationObserver(() => {
    if (!host.isConnected) cleanup();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('pagehide', cleanup, { once: true });
  const reference = h(
    'select',
    { 'aria-label': '实验目标' },
    ['ba1', 'ba2', 'de1', 'te1', 'lv2'].map((id) => h('option', { value: id }, id)),
  );
  const expected = h(
    'select',
    { 'aria-label': '预期读法' },
    [
      ['correct', '按目标读'],
      ['initial', '故意换声母'],
      ['final', '故意换韵母'],
      ['tone', '故意换声调'],
    ].map(([value, text]) => h('option', { value }, text)),
  );
  const status = h('p', { 'aria-live': 'polite' }),
    summary = h('pre', { class: 'calibration-summary' });
  const refresh = async () => {
    summary.textContent = JSON.stringify(calibration(await recordings()), null, 2);
  };
  void refresh();
  const record = button(
    '录一条成人样本',
    async () => {
      if (record.disabled) return;
      const token =
        familyToken();
      if (!ctx.save.settings.ai || !token) {
        status.textContent = '先在上方允许腾讯评测并填写家庭口令。';
        return;
      }
      record.disabled = true;
      abort = new AbortController();
      ctx.stopAudio();
      status.textContent = '正在录音，读完停顿即可。';
      try {
        const ref = reference.value,
          label = expected.value as Recording['expected'],
          capture = await mic.record(() => {});
        if (!alive || !capture.heard) {
          if (alive) status.textContent = '没有收集到语音，请准备好后重试。';
          return;
        }
        const plan = syllablePlan(ref, ctx.bank);
        const verdict = await assess(
          capture.pcm,
          plan.mode,
          plan.ref,
          token,
          ctx.save.settings.strictness,
          abort.signal,
          plan,
        );
        if (!alive) return;
        await saveRecording({
          id: crypto.randomUUID(),
          at: Date.now(),
          blob: capture.blob,
          wordId: ref,
          skill: `lab:${ref}:say`,
          session: ctx.save.sessions,
          kind: 'D',
          mode: plan.mode,
          ref: plan.ref,
          assessment: plan,
          lab: true,
          expected: label,
          verdict,
        });
        status.textContent = '成人样本已留在本机。回听确认后，在改判列表标注；不计入孩子进度。';
        await refresh();
      } catch {
        if (alive) status.textContent = '评测暂不可用，检查服务开通、网络和家庭口令后再试。';
      } finally {
        mic.dispose();
        record.disabled = false;
      }
    },
    'primary',
    'mic',
  );
  const exportLocal = button(
    '导出本机校准包',
    async () => {
      const rows = await recordings();
      const exported = await Promise.all(
        rows.map(async ({ blob, ...r }) => {
          const bytes = new Uint8Array(await blob.arrayBuffer());
          let binary = '';
          for (let i = 0; i < bytes.length; i += 8192)
            binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
          return { ...r, wavBase64: btoa(binary) };
        }),
      );
      const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        profiles: ['gentle', 'balanced', 'precise'].map((p) => calibration(rows, p as 'gentle')),
        rows: exported,
      };
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload)], { type: 'application/json' }));
      const link = h('a', { href: url, download: 'pinyin-calibration-private.json' });
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status.textContent = '导出包含录音和标注，只在本机保管，不要提交仓库。';
    },
    'secondary',
  );
  host.append(
    h('p', null, '只给大人用，不要求孩子额外录音。预期读法是实验计划，必须回听后再做家长标注。'),
    reference,
    expected,
    record,
    button('结束本条录音', () => mic.stop(), 'secondary'),
    status,
    exportLocal,
    h(
      'p',
      null,
      '约 100 条日常录音、至少 30 条家长标注后，再看各维度的错判率和检出率。导出和重放均需主动操作；本页不会自动启用 AI 掌握判定。',
    ),
    summary,
  );
  return host;
}
