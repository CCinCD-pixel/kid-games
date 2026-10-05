"""Build the 星港 SFX library.

  sources: Kenney CC0 packs (downloaded to _src/sfx/) + original synth (sfx_synth.py)
  pipeline: decode -> mono 44.1k -> trim leading/trailing silence -> short-term
            loudness normalise (BS.1770 K-weighting, max 100 ms window) -> peak
            guard -1 dBFS -> AAC (AudioToolbox) .m4a -> manifest.json

Run:  ../.venv-ds/bin/python _src/build_sfx.py
"""
import glob, json, os, subprocess, sys, hashlib
import numpy as np
from scipy.signal import lfilter
from scipy.io import wavfile

sys.path.insert(0, os.path.dirname(__file__))
import sfx_synth as S

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, '_src', 'sfx')
OUT = os.path.join(ROOT, 'sfx')
TMP = os.path.join(ROOT, '_src', 'tmpwav')
SR = 44100

# Loudness targets (LUFS, short-term max over 100 ms). Taps sit well under feedback;
# celebrations are the loudest thing the kit ever plays.
TARGET = {'ui': -21.0, 'ui-soft': -25.0, 'game': -18.0, 'feedback': -16.0, 'companion': -20.0, 'jingle': -16.0}

K = 'kenney'
# name, category, source ('synth:<id>' or path relative to _src/sfx), description, usage
LIB = [
    # ---- UI --------------------------------------------------------------
    ('ui-tap', 'ui-soft', 'kenney_interface-sounds/Audio/select_001.ogg', '轻点：通用按钮/卡片 tap', 'Button.secondary, IconButton, cards'),
    ('ui-press', 'ui', 'kenney_interface-sounds/Audio/drop_002.ogg', '主按钮按下：上扬“啵”', 'Button.primary pointerdown'),
    ('ui-select', 'ui', 'kenney_interface-sounds/Audio/glass_002.ogg', '选中一个格子/节点：玻璃轻敲', 'level node, tile select'),
    ('ui-tick', 'ui-soft', 'kenney_interface-sounds/Audio/tick_002.ogg', '分段切换/拨动刻度', 'Segmented, stepper'),
    ('ui-toggle-on', 'ui', 'kenney_interface-sounds/Audio/toggle_002.ogg', '开关打开', 'Toggle on'),
    ('ui-toggle-off', 'ui', 'kenney_interface-sounds/Audio/toggle_001.ogg', '开关关闭', 'Toggle off'),
    ('ui-open', 'ui', 'kenney_interface-sounds/Audio/maximize_009.ogg', '面板弹出', 'Modal open'),
    ('ui-close', 'ui', 'kenney_interface-sounds/Audio/minimize_009.ogg', '面板收起', 'Modal close'),
    ('ui-back', 'ui', 'kenney_interface-sounds/Audio/back_002.ogg', '返回', 'Back / home'),
    ('ui-key', 'ui', 'kenney_interface-sounds/Audio/glass_006.ogg', '数字键盘按键（可按数字微调音高）', 'Keypad digits'),
    ('ui-key-delete', 'ui', 'kenney_interface-sounds/Audio/back_004.ogg', '键盘退格', 'Keypad ⌫'),
    ('ui-locked', 'ui-soft', 'kenney_interface-sounds/Audio/bong_001.ogg', '点到未解锁的东西：低沉轻“嘣”', 'locked node/card'),
    ('ui-notify', 'ui', 'kenney_interface-sounds/Audio/pluck_001.ogg', '提示条/气泡出现', 'Toast, bubble'),
    ('ui-confirm', 'ui', 'kenney_interface-sounds/Audio/confirmation_001.ogg', '确认（四度上行）', 'confirm dialogs'),
    ('ui-pop', 'ui', 'kenney_interface-sounds/Audio/drop_003.ogg', '泡泡“啵”', 'small reveal, badge'),
    ('ui-pop-big', 'ui', 'kenney_interface-sounds/Audio/drop_004.ogg', '上扬大泡泡', 'card enter, reward pop'),
    ('ui-slide', 'ui-soft', 'kenney_casino-audio/Audio/card-slide-1.ogg', '纸片滑动', 'drawer, page slide'),
    ('ui-snap', 'ui', 'kenney_casino-audio/Audio/card-place-1.ogg', '拖拽吸附落位', 'drag drop snap'),
    ('ui-pick', 'ui-soft', 'synth:pick', '拾起（开始拖拽）：柔和上扬“啵”', 'drag start'),
    ('whoosh-up', 'ui-soft', 'synth:whoosh-up', '上扫风声', 'screen enter, launch UI'),
    ('whoosh-down', 'ui-soft', 'synth:whoosh-down', '下扫风声', 'screen exit'),
    # ---- feedback (original synth, pentatonic) -----------------------------
    ('chime', 'feedback', 'synth:chime', '五声音阶单音（C6），运行时用 playbackRate 升调做连击阶梯', 'combo ladders: snake eat, match chain'),
    ('correct', 'feedback', 'synth:correct', '答对：do-mi-sol 上行', 'learning games correct'),
    ('correct-big', 'feedback', 'synth:correct-big', '连对/大成功：五声音阶上行跑句', 'streak, puzzle solved'),
    ('try-again', 'feedback', 'synth:try-again', '没对：柔和的木质“咚”，不是蜂鸣', 'wrong answer (never a buzzer)'),
    ('hint', 'feedback', 'synth:hint', '提示出现：两声亮晶晶', 'HintButton, ghost hand'),
    ('star-1', 'feedback', 'synth:star-1', '第 1 颗星', 'result star reveal'),
    ('star-2', 'feedback', 'synth:star-2', '第 2 颗星', 'result star reveal'),
    ('star-3', 'feedback', 'synth:star-3', '第 3 颗星（更亮，带低音）', 'result star reveal'),
    ('unlock', 'feedback', 'synth:unlock', '解锁：上行闪光 + 钟声', 'new level / chapter unlocked'),
    ('coin', 'feedback', 'synth:coin', '收集小物件：叮-叮', 'collectible, energy cell'),
    ('match-clear', 'feedback', 'synth:match-clear', '消除：啵 + 闪光', '消消乐 clear'),
    # ---- game ---------------------------------------------------------------
    ('step', 'game', 'kenney_impact-sounds/Audio/footstep_concrete_000.ogg', '机器人走一步', 'sokoban move'),
    ('push-crate', 'game', 'kenney_impact-sounds/Audio/impactPlank_medium_000.ogg', '推箱子：木箱摩擦', 'sokoban push'),
    ('push-metal', 'game', 'kenney_impact-sounds/Audio/impactMetal_light_002.ogg', '推金属货柜', 'sokoban push (metal)'),
    ('bump', 'game', 'kenney_impact-sounds/Audio/impactSoft_medium_001.ogg', '撞墙/走不动：软闷', 'blocked move'),
    ('lock-in', 'game', 'kenney_interface-sounds/Audio/switch_003.ogg', '到位锁定：低沉“咔哒”', 'crate on target, part attached'),
    ('place-piece', 'game', 'kenney_impact-sounds/Audio/impactWood_light_002.ogg', '落子（木）', 'chess / 陆战棋 move'),
    ('capture', 'game', 'kenney_impact-sounds/Audio/impactWood_medium_001.ogg', '吃子', 'chess capture'),
    ('flip', 'game', 'kenney_casino-audio/Audio/card-place-2.ogg', '翻开棋子', '陆战棋 flip / card reveal'),
    ('shuffle', 'game', 'kenney_casino-audio/Audio/card-shuffle.ogg', '洗牌/重排', 'reshuffle board'),
    ('build', 'game', 'kenney_impact-sounds/Audio/impactPlank_medium_002.ogg', '放下积木', '月宫建造师 place block'),
    ('bell', 'game', 'kenney_impact-sounds/Audio/impactBell_heavy_000.ogg', '钟声（里程碑，编钟感）', 'milestone, story chapter'),
    ('eat', 'game', 'synth:eat', '吃到能量：圆润“咕嘟”+ 小木琴（运行时按连击升调）', 'snake eat, collect'),
    ('powerup', 'game', 'kenney_digital-audio/Audio/powerUp7.ogg', '获得能力', 'power-up'),
    ('level-up', 'game', 'kenney_digital-audio/Audio/phaserUp7.ogg', '升级上扫', 'grow / evolve'),
    ('jump', 'game', 'kenney_digital-audio/Audio/phaseJump2.ogg', '弹跳', 'hop'),
    ('shoot-soft', 'game', 'synth:shoot-soft', '柔和“咻”（光弹/种子）', 'lane-defense projectile'),
    ('hit-soft', 'game', 'kenney_impact-sounds/Audio/impactSoft_heavy_000.ogg', '柔和命中', 'lane-defense hit'),
    ('launch', 'game', 'synth:launch', '火箭发射：低频轰鸣 + 上扫', '火星基地 launch, chapter finale'),
    # ---- companion voice blips --------------------------------------------
    ('blip-happy', 'companion', 'synth:blip-happy', '伙伴：开心', 'Companion mood happy/celebrating'),
    ('blip-question', 'companion', 'synth:blip-question', '伙伴：疑问', 'Companion asks'),
    ('blip-think', 'companion', 'synth:blip-think', '伙伴：思考', 'Companion thinking'),
    ('blip-surprised', 'companion', 'synth:blip-surprised', '伙伴：惊讶', 'Companion surprised'),
    ('blip-sleepy', 'companion', 'synth:blip-sleepy', '伙伴：困了（不是难过）', 'Companion sleepy'),
    ('blip-talk', 'companion', 'synth:blip-talk', '伙伴：说话起句', 'Companion say() start'),
    # ---- jingles ----------------------------------------------------------
    ('level-complete', 'jingle', 'synth:level-complete', '过关：C-E-G-C 上行 + 和弦', 'Result panel'),
    ('chapter-complete', 'jingle', 'synth:chapter-complete', '章节完成：完整五声乐句', 'chapter / milestone'),
    ('jingle-win', 'jingle', 'kenney_music-jingles/Audio/Pizzicato jingles/jingles_PIZZI10.ogg', '拨弦上行小胜利', 'rest-area round won'),
    ('jingle-steel', 'jingle', 'kenney_music-jingles/Audio/Steel jingles/jingles_STEEL10.ogg', '钢鼓上行小胜利', 'rest-area alt win'),
    ('jingle-magic', 'jingle', 'kenney_music-jingles/Audio/Pizzicato jingles/jingles_PIZZI02.ogg', '全音阶上行：神奇的事发生了', 'story reveal'),
    ('jingle-round-over', 'jingle', 'kenney_music-jingles/Audio/Pizzicato jingles/jingles_PIZZI11.ogg', '回合结束：轻柔下行（不悲伤）', 'snake round over'),
]

# ---------------------------------------------------------------- loudness

def k_weight(x, sr):
    # ITU-R BS.1770-4 pre-filter + RLB, coefficients derived for arbitrary sr (pyloudnorm formulas)
    import math
    G, Q, fc = 3.999843853973347, 0.7071752369554196, 1681.974450955533
    A = 10 ** (G / 40); w0 = 2 * math.pi * fc / sr; alpha = math.sin(w0) / (2 * Q)
    b0 = A * ((A + 1) + (A - 1) * math.cos(w0) + 2 * math.sqrt(A) * alpha)
    b1 = -2 * A * ((A - 1) + (A + 1) * math.cos(w0))
    b2 = A * ((A + 1) + (A - 1) * math.cos(w0) - 2 * math.sqrt(A) * alpha)
    a0 = (A + 1) - (A - 1) * math.cos(w0) + 2 * math.sqrt(A) * alpha
    a1 = 2 * ((A - 1) - (A + 1) * math.cos(w0))
    a2 = (A + 1) - (A - 1) * math.cos(w0) - 2 * math.sqrt(A) * alpha
    y = lfilter([b0 / a0, b1 / a0, b2 / a0], [1, a1 / a0, a2 / a0], x)
    fc, Q = 38.13547087602444, 0.5003270373238773
    w0 = 2 * math.pi * fc / sr; alpha = math.sin(w0) / (2 * Q)
    b = [1, -2, 1]; a0 = 1 + alpha
    a = [1, -2 * math.cos(w0) / a0, (1 - alpha) / a0]
    return lfilter([v / a0 for v in b], a, y)


def short_term_lufs(x, sr, win=0.1):
    y = k_weight(x, sr)
    n = int(sr * win)
    if len(y) < n:
        y = np.concatenate([y, np.zeros(n - len(y))])
    p = np.convolve(y ** 2, np.ones(n) / n, 'valid')
    return -0.691 + 10 * np.log10(p.max() + 1e-12)


def decode(path):
    raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(np.float64)


def trim(x, lead_db=-48, tail_db=-60):
    a = np.abs(x); pk = a.max() + 1e-12
    on = np.where(a > pk * 10 ** (lead_db / 20))[0]
    s = max(0, on[0] - int(SR * 0.002))
    off = np.where(a > pk * 10 ** (tail_db / 20))[0][-1]
    y = x[s: off + 1].copy()
    f = min(len(y) // 4, int(SR * 0.02))
    if f > 0:
        y[-f:] *= np.linspace(1, 0, f)
    return y


def main():
    os.makedirs(OUT, exist_ok=True); os.makedirs(TMP, exist_ok=True)
    manifest = {'version': 1, 'format': 'm4a (AAC-LC, mono, 44.1 kHz)', 'loudness': 'short-term (100 ms, K-weighted) max normalised per category; peak <= -1 dBFS', 'targets': TARGET, 'sounds': {}}
    for name, cat, src, desc, usage in LIB:
        if src.startswith('synth:'):
            x = S.SYNTH[src[6:]]().astype(np.float64)
            origin = {'source': 'original synth (_src/sfx_synth.py)', 'license': 'CC0-1.0 (project-owned, dedicated)'}
        else:
            x = decode(os.path.join(SRC, src))
            pack = src.split('/')[0].replace('kenney_', '')
            origin = {'source': f'Kenney {pack} — {os.path.basename(src)}', 'license': 'CC0-1.0 (kenney.nl)'}
        x = trim(x)
        lu = short_term_lufs(x, SR)
        g = 10 ** ((TARGET[cat] - lu) / 20)
        y = x * g
        pk = np.abs(y).max()
        lim = 10 ** (-1 / 20)
        if pk > lim:
            y *= lim / pk
        wav = os.path.join(TMP, name + '.wav')
        wavfile.write(wav, SR, (y * 32767).clip(-32768, 32767).astype(np.int16))
        out = os.path.join(OUT, name + '.m4a')
        br = '96k' if cat == 'jingle' else '64k'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-c:a', 'aac_at', '-b:a', br, '-ac', '1', '-ar', str(SR), '-movflags', '+faststart', out], check=True)
        final_lu = short_term_lufs(y, SR)
        manifest['sounds'][name] = {
            'file': f'{name}.m4a', 'category': cat, 'duration': round(len(y) / SR, 3),
            'loudness': round(final_lu, 1), 'peak_db': round(20 * np.log10(np.abs(y).max() + 1e-12), 1),
            'bytes': os.path.getsize(out), 'zh': desc, 'use': usage, **origin,
        }
        print(f'{name:18s} {cat:9s} {len(y)/SR:5.2f}s  {final_lu:6.1f} LUFS-st  pk {20*np.log10(np.abs(y).max()+1e-12):5.1f}  {os.path.getsize(out)//1024:3d} KB  <- {src}')
    json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'), ensure_ascii=False, indent=1)
    tot = sum(v['bytes'] for v in manifest['sounds'].values())
    print(len(manifest['sounds']), 'sounds,', tot // 1024, 'KB total')


if __name__ == '__main__':
    main()
