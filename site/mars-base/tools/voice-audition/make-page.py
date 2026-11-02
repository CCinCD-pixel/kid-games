#!/usr/bin/env python3
"""Static audition page for dad (no network, nothing plays by itself). usage: make-page.py WORKDIR OUTDIR -> OUTDIR/index.html + OUTDIR/audio/"""
import html, json, shutil, sys
from pathlib import Path
w = Path(sys.argv[1]); out = Path(sys.argv[2]); shutil.rmtree(out, ignore_errors=True); (out / "audio").mkdir(parents=True)
cands = json.loads((w / "candidates.json").read_text()); choice = json.loads((w / "choice.json").read_text()); T = dict(json.loads((w / "texts.json").read_text()))
files = {}
for eng, sub in (("qwen3", "voice-audition"), ("kokoro", "voice-audition"), ("alt", "voice-audition-alt")):
    d = w / f"out-{eng}/public/audio/{sub}"
    for cid, c in json.loads((d / "audio-manifest.json").read_text()).items(): files[cid] = d / c["src"].split("/")[-1]
def clip(k, t):
    cid = choice.get(f"vo.{k}.{t}", {}).get("id", f"vo.{k}.{t}")
    f = files.get(cid)
    if not f: return None
    dst = f"audio/{k}_{t}.m4a"; shutil.copy(f, out / dst); return dst
def player(label, path, note=""):
    if not path: return f'<div class="row"><div class="lab">{label}</div><div class="none">（这个引擎读不了）</div></div>'
    return f'<div class="row"><div class="lab">{label}{(" <small>" + note + "</small>") if note else ""}</div><audio controls preload="none" src="{path}"></audio></div>'
def seq(label, paths):
    if not all(paths): return f'<div class="row"><div class="lab">{label}</div><div class="none">（这个引擎读不了单个词，没法拼接）</div></div>'
    return f'<div class="row"><div class="lab">{label}</div><button onclick=\'play({json.dumps(paths)})\'>▶ 连起来听</button></div>'
cards = []
for c in cands:
    k = c["key"]; p = {t: clip(k, t) for t, _ in T.items()} if True else {}
    p = {t: clip(k, t) for t in T}
    st = choice.get(f"vo.{k}.t01")
    jnote = "" if not st else (f"试了 6 次，其中 {st['stable'].split('/')[0]} 次是清楚的“几”，这里放的是其中一次" if st["usable"] else "试了 6 次都没读成清楚的“几”，这里放的是第 1 次")
    main = [player("几（单独一个字）", p["t01"], jnote), player("等于几？", p["t05"]),
            seq("五乘二等于几？（五·乘·二·等于几？拼接）", [p["t07"], p["t03"], p["t08"], p["t05"]]),
            seq("几乘五等于六十五（几·乘·五·等于·六十五 拼接，现在的做法）", [p["t01"], p["t03"], p["t07"], p["t02"], p["t10"]]),
            seq("方框乘五等于六十五（方框·乘·五·等于·六十五 拼接，建议的做法）", [p["t12"], p["t03"], p["t07"], p["t02"], p["t10"]]),
            player("提示句：先算十乘五，再算三乘五，最后把两个数合起来。", p["t13"]), player("结算句：八道题做完了，下一阶已经开启。", p["t14"]),
            seq("数字：七 · 十三 · 三百四十七", [p["t15"], p["t16"], p["t17"]])]
    more = [player("乘", p["t03"]), player("除以", p["t04"]), player("等于", p["t02"]), player("五乘二等于几？（整句合成）", p["t06"]), player("几乘五等于六十五（整句合成）", p["t09"]), player("方框乘五等于六十五（整句合成）", p["t11"])]
    cards.append(f'<section class="card"><h2>{html.escape(c["label"])}</h2><p class="note">{html.escape(c["note"])}</p>{"".join(main)}<details><summary>更多对照（单词、整句合成）</summary>{"".join(more)}</details></section>')
css = '''<style>:root{--bg:#f6f4ef;--fg:#1c1b19;--card:#fff;--mut:#666;--ac:#1b5fd1}@media (prefers-color-scheme:dark){:root{--bg:#16181c;--fg:#f0eee9;--card:#22252b;--mut:#a5a39d;--ac:#8ab4ff}}
body{margin:0;background:var(--bg);color:var(--fg);font:20px/1.55 -apple-system,"PingFang SC","Noto Sans SC",sans-serif;padding:16px 16px 60px}h1{font-size:30px;margin:8px 0}h2{font-size:23px;margin:0 0 4px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(380px,1fr));gap:14px}.card{background:var(--card);border-radius:14px;padding:14px 16px;box-shadow:0 1px 4px rgba(0,0,0,.15)}.note{font-size:17px;color:var(--mut);margin:0 0 8px}
.row{margin:9px 0}.lab{font-size:17px}small{color:var(--mut)}audio{width:100%;height:42px}.none{color:var(--mut);font-size:16px}.top{background:var(--card);border-radius:14px;padding:14px 18px;margin:12px 0}button{font-size:19px;padding:7px 14px;border-radius:10px;border:1px solid var(--ac);background:transparent;color:var(--ac)}
details{margin-top:10px}summary{font-size:18px;cursor:pointer;color:var(--mut)}</style>'''
top = '<div class="top"><b>这是试音，还不是正式配音。</b>请选一个你能接受的声音，或者告诉我都不行。<br>每个声音放同样的句子、同样的顺序（共 10 个，约 5 分钟）。<b>X 就是现在的旁白（你不喜欢的那个），放在最前面做对照。</b>按键才会出声，不会自动播放。<br>注意：单独的一个字（几、五、乘）在所有声线上都不稳定，所以“几”这一条里放的是多试几次后读清楚的那一次；正式做的话会改写台词，尽量不再出现单独的“几”。<br>“拼接”按钮把几个小片段首尾相接，和游戏里数字、词语拼起来的效果接近（游戏里的停顿可能略不同）。每个声音下面的“更多对照”默认折叠。</div>'
js = '<script>let cur=null;function play(list){if(cur){cur.pause();cur=null}let k=0;const next=()=>{if(k>=list.length)return;cur=new Audio(list[k++]);cur.onended=next;cur.play()};next()}</script>'
(out / "index.html").write_text('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>算术站 · 试音</title>' + css + '</head><body><h1>算术站 · 试音（选一个声音）</h1>' + top + '<div class="grid">' + "".join(cards) + "</div>" + js + "</body></html>", encoding="utf-8")
n = len(list((out / "audio").glob("*.m4a"))); print("candidates", len(cands), "audio files", n, "KB", sum(f.stat().st_size for f in (out / "audio").iterdir()) // 1024)
