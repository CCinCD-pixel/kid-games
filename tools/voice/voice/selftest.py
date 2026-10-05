"""Fast self-test (no model, no audio): python -m voice selftest"""
from __future__ import annotations


def run() -> int:
    from . import numbers, pinyin, qc, textnorm, timing
    from .content import Item

    sp = textnorm.spoken
    assert sp("发现了2块新晶体") == "发现了两块新晶体", sp("发现了2块新晶体")
    assert sp("200块") == "两百块" and sp("2019年") == "二零一九年" and sp("3.5米") == "三点五米"
    assert sp("第12关") == "第十二关" and sp("205") == "二百零五"
    r = list(numbers.readings(1000))
    assert len(r) == 1102 and ("num.205.liang", 205, "两百零五") in r and ("num.2.liang", 2, "两") in r
    assert ("num.1000", 1000, "一千") in r and ("num.10", 10, "十") in r

    ov = pinyin.resolve("我去银行还书", {"还书": "huán shū"}, {"银行": "yín háng"})
    assert ov == {2: "yin2", 3: "hang2", 4: "huan2", 5: "shu1"}, ov
    # lexicon locks: substituted only where context G2P disagrees; line locks: always (if polyphonic)
    assert pinyin.render("我去银行还书", ov, "homophone") == "我去银行还书", pinyin.render("我去银行还书", ov, "homophone")
    assert pinyin.render("我去银行还书", ov, "homophone", forced={4, 5}) == "我去银行环书"
    lk = pinyin.resolve("他长大了", {"长大": "zhǎng dà"})
    assert pinyin.render("他长大了", lk, "homophone") == "他长大了"
    assert pinyin.render("他长大了", lk, "homophone", forced=set(lk)) == "他掌大了"
    assert pinyin.render("这是长城", {2: "zhang3"}, "homophone") == "这是掌城"   # context says cháng
    assert pinyin.render("衔", {0: "xian2"}, "homophone", forced={0}) == "衔"      # monophonic: never
    assert 'ph="huan 2"' in pinyin.render("还书", {0: "huan2"}, "ssml")
    assert pinyin.to_tone3("lǜ") == "lv4" and pinyin.to_marked("huan2") == "huán"

    assert qc.fuzzy("xing1") == qc.fuzzy("xin1") and qc.fuzzy("la5") == qc.fuzzy("le5") and qc.fuzzy("xiang1") != "xin"
    it = Item(id="t", role="companion", text="下午好，星港的飞船", spoken="下午好，星港的飞船")
    q = qc.analyze(it, {"hyp": "下午好新港的飞船"}, {"speech_sec": 2.4, "max_pause": 0.2})
    assert q["flags"] == ["cer(asr-homophone)"] and not q["hard"], q
    q = qc.analyze(it, {"hyp": "下午好香港的飞船"}, {"speech_sec": 2.4, "max_pause": 0.2})
    assert q["hard"] == ["cer"], q
    h = Item(id="h", role="word", text="行", spoken="行", kind="word", overrides={0: "hang2"})
    assert qc.analyze(h, {"hyp": "行"}, {"speech_sec": 0.5, "max_pause": 0.0})["hard"] == []   # same char: unknowable
    c = Item(id="c", role="companion", text="滴滴，能量充满啦！三、二、一，发射！", spoken="滴滴，能量充满啦！三、二、一，发射！")
    assert "pace" not in qc.analyze(c, {"hyp": "滴滴能量充满啦三二一发射"},
                                    {"speech_sec": 4.3, "max_pause": 0.5, "pause_sec": 1.9})["flags"]
    b = Item(id="b", role="narrator", text="很久很久以前，炎帝有一个小女儿，名叫女娃。", spoken="很久很久以前，炎帝有一个小女儿，名叫女娃。")
    assert "pace" in qc.analyze(b, {"hyp": "很久很久以前炎帝有一个小女儿名叫女娃"},
                                {"speech_sec": 10.2, "max_pause": 0.86, "pause_sec": 1.6})["hard"]
    w = Item(id="w", role="word", text="衔", spoken="衔", kind="word")
    assert "dur" in qc.analyze(w, {"hyp": "咸"}, {"speech_sec": 1.98, "max_pause": 0.89})["hard"]
    assert qc.analyze(w, {"hyp": "咸"}, {"speech_sec": 0.5, "max_pause": 0.0})["hard"] == []

    u = timing.units("欢迎回来！发现了2块晶体。")
    assert [x for x, _ in u][:5] == ["欢", "迎", "回", "来", "！"] and ("2", 1.0) in u
    assert Item(id="story-box.w.长大", role="word", text="长大", spoken="长大").stem == "story-box.w.zhang3da4"
    print("selftest OK")
    return 0
