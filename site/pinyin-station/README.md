# 拼音电台 · 本地试用

工作目录 `/Users/ccincd/kid-games-work/pinyin-station`，分支 `pinyin-station`。只在本地提交，尚未 push 或部署。

```sh
npm run build
node site/pinyin-station/tools/local-preview.mjs
```

默认预览 `http://localhost:4188/pinyin-station/?mute`。也可以使用已有的 `tools/本地预览.command`。Mac 开发测试使用静音地址；关闭服务按 Ctrl-C。不要直接打开 HTML。

课程以拼音能力为线索，试卷只用于识别薄弱点。当前有两阶段、8 个档位：a o e → i u ü / y w → b p m f → d t n l → g k h → j q x → z c s → zh ch sh r。家长按老师进度选择档位；后一档保留前面内容的到期复习。复韵母、鼻韵母的后续课程尚未开放。

当前为 103 个词、8 句连词成句、2 道汉字框架填空、41 个生活场景。题型包含听辨、拼合、读词找图、分步拼写、跟读与组句。场景题有早餐、整理衣柜、买菜、厨房、农场、图书角等，会按已学范围逐步扩展。自由场景中的额外重复练习不提前增加掌握。

单音节使用许可清楚的真人音频；词句、场景和提示使用本地语音管线预生成的合成语音。不能把它们称为真人词句录音。多音字与轻声需要家长复核。家长补充词没有现成示范时使用设备语音，不用 TTS 示范孤立音节。

腾讯服务已开通。AI 默认关闭、处于试运行，不计入掌握。声调存在上游误放行，详见 [腾讯复核记录](../../../docs/specs/pinyin-station-soe-notes.md)。现有账号只用于本机签名，没有创建子账号。家庭口令保存在本机；腾讯密钥不进前端或仓库。自检只检查签名，不上传音频，不代表腾讯评测准确率已达标。

家长核对页 `/pinyin-station/review/` 有 PIN，可标记词图与读音问题并导出 Markdown；实验页 `/pinyin-station/lab/` 只用于家长校准。音频和图片留在本机，清除站点数据会一起删除。

验收只跑拼音单测、拼音浏览器测试和平台 smoke；平台音频变更另跑 audio 单测。自动化 WebKit 的 iPad 尺寸通过不等于 iPad 真机通过。真机仍须核对主屏权限、连续两次录音、回听和延迟。iPad 麦克风需要 HTTPS，使用私有 Tailscale Serve，不需要推送 GitHub。

不再制作源码 ZIP、校验包或成品副本，以本分支、私有试用地址和一页清单为准。

长期存档：共享存储保留进度快照和最近 60 场；较旧明细归档到本机 IndexedDB。家长改判旧录音会从归档重算。清除站点数据也会删除归档；导出录音校准资料后再清理设备。

## 本地评分（试用，默认关闭）

家长页“本地评分 · 试用”开关打开后，孩子读完单个音节会在设备上用音高曲线比较声调，画出“我的声音 / 示范”两条曲线；声音不上传，结果不计入掌握。代码在 `src/score/`（音高 pitch、曲线 contour、端点 vad、麦克风 capture、评分接口 scorer、Worker）。声调只在孩子已读约 8 条之后、且把握 ≥ 0.9 时才给出“相似/不同”，其余一律“再试一次，我听得更清楚”。每条录音连同目标音节、音高特征、质量标志、设备信息一起存在本机，家长页“快速点评”可逐条盲标，“导出标注集”得到 ZIP（manifest.json + wav，仅本机下载），用 `node site/pinyin-station/tools/export-to-lab.mjs <zip>` 转成 pinyin-lab 脚本可读的目录。

测试：`npx vitest run site/pinyin-station`（含音高、曲线、VAD、capture、评分、导出）；浏览器：`npx playwright test -c site/pinyin-station/tests/playwright.score.config.ts`（Vite 开发服务器，WebKit 用桩麦克风，Chromium 用真实的 fake-device 音频文件）。

## 导航、续玩与语音规则（玩家 QA 第 1 轮后）

- 一次“返回”只退一步：练习 / 卡册 / 家长 / 本台播出 都只有一层，套件左上“返回”、页内“回电台”、Escape、浏览器或 iPad 侧滑返回行为一致（`main.ts` 的 `open()` / `back()`，历史记录只比首页多一条）。首页再按“返回”才回游戏大厅。
- 离开练习（回电台、打开卡册/家长、锁屏、切应用、刷新）不丢进度：当前节目的题目队列和位置存在 `save.resume`（12 小时内有效），首页出现“接着上次的节目”。锁屏/切应用只静音、不换屏。
- 语音只有一个声道：新的一句话会打断旧的一句；串联的语音（场景旁白 → 指令 → 声音）一旦被孩子的点击打断就不再继续（`Practice.play()`）。听字母/听辨/拼合的声音不显示字幕，免得把答案印出来。
- 屏幕指令、字幕、语音是同一句话，来源 `src/views/lines.ts`，`lines.test.ts` 保证与 `content/narration/pinyin-station.yaml` 一致。新增台词清单见 `~/kid-games-work/state/pinyin-lab/fix-pinyin-new-lines.md`（音频待配音步骤生成，之前只显示字幕）。
- 一图一词：`bank.json` 的 `pictureOwners` 指定每幅共用图片的出题词，其余词（别名）不出题但保留在家长核对页。夸奖按孩子真正做的事挑选（点图 ≠ 说话），本台播出页没有录音就不说“声音收到啦”。

## 第 2 轮 QA 之后的待办与说明

- **三张待重画的图（已暂时下架）**：`bank.json` 里 `mali`（马蹄，像靴子/墨水瓶）、`dabo`（大伯，只是戴帽子的普通男人）、`eight-pears`（填空句“桌子上有＿个＿”，8 个梨像一排葫芦）带 `hold` 字段，说明原因；`eligibleWords` / 组句池 / 干扰项池都跳过它们，所以任何题型、任何课次都不会再出现这三张图。词仍留在词库里（家长核对页、旧进度不受影响）。**重画后：删掉这三条的 `hold` 字段即可放回**，并重跑 `npx vitest run site/pinyin-station`（`fix-r1.test.ts` 的 “held-out pictures” 会提醒同步更新 HELD 清单）。`dabo-papati`（大伯爬爬梯）有自己的图，不受影响。
- **废弃但仍留在 yaml 里的 6 条台词**（代码不再引用，先不删，免得动 manifest）：`py.E` `py.F` `py.C` `py.recording` `py.follow` `py.scene.family`。另外 `py.praise.16`（“你把这幅图说给拼音听了”）也不再被任何题型使用。
- **开放课 9–13 之前要补的音频**：18 条字母口诀 `py.mnemonic.{ai ei ui ao ou iu ie ve er an en in un vn ang eng ing ong}`（`ye yue yin yun yuan ying` 是整体认读，不进卡册，暂不需要口诀）；8 个轻声音节 `py.syl.{pa0 ba0 ma0 di0 le0 ge0 gu0 zi0}`（目前词用整词音，单独点轻声音节触不到）。家长页按课本课次开放到第 13 课（游戏第 12 站），第 14 课灰显“等第 14 课”（见下“课本对齐”）。
- 首页、信号卡册、本台播出三个屏幕在底部给字幕条留了一条车道（`#app[data-view]`，字幕条出现时不会盖住任何按钮）；信号卡册的卡片区自己滚动，“去当小播音员”固定在卡片区下方。

## 发音与音频原则（2026-11-01，爸爸耳朵验收之后）

- 机器人（Qwen3-TTS）**只说普通中文句子**。任何需要孩子听了模仿的声音（字母名、声母、韵母、呼读音、口诀里重复的音）一律用**真人录音**（`py.syl.*`），不得由 TTS 朗读；朗读文本（`norm ?? text`）里不得有拉丁字母、带声调符号的拼音，也不得有“单字用逗号隔开”的裸声音。自动检查：`site/pinyin-station/tools/spoken-text.mjs` + `spoken-text.test.ts`（接在 `npm run check` 的 vitest 里）。**待改写清单已清空**：17 条（口诀 a o e i u v y w，提示 b-p d-t b-d l-n p-f g-k j-q z-c zh-ch）已由界面改写成普通句子（第 3 轮），文本在 yaml 和 `bank.json` 里一致；它们的**音频还是旧录音，等配音步骤重新合成**（清单 `~/kid-games-work/state/pinyin-lab/lines-to-voice-r3.json`），合成后重跑 `tools/audit/run-audit.sh`。
- 课 9–13 的呼读音全部是真人录音（同一公有领域库、固定提交 `aa25ecce…`，经 `tools/normalize-syllables.mjs` 归一到 −16 LUFS）。卡片 call-sound id → 真人文件：ai1→ai1，ei1→ei1，ui1→wei1，ao1→ao1，ou1→ou1，iu1→you1，ie1→ye1，ve1→yue1，**er1→er2（真人是二声 ér，卡片标注应改为 ér，界面文字待界面 agent 改；清单里 `py.syl.er1` 的字幕已是 ér）**，an1→an1，en1→en1，in1→yin1，un1→wen1，vn1→yun1，ang1→ang1，ing1→ying1，ye1/yue1/yin1/yun1/yuan1/ying1 同名。manifest 的 key 仍是 `py.syl.<卡片id>`，没有 `synthetic` 标记；合成呼读音已删除（备份在 `~/kid-games-work/pinyin-audit/originals-r3/`）。
- **需要真人补录：`py.syl.ong1`**（ōng，读音接近“翁”，注意不要带 w 的 wēng）：2026-11-01 爸爸听了库里的 weng1 觉得不对（ASR 也听成“温”），已撤下，现在和 eng1 一样无声；补录后在 `import-human-audio.mjs` 的 `CALL_SOURCE`/`CALL_MISSING` 里改回，并把 `REGISTERED_MISSING` 里的 `py.syl.ong1` 去掉。
- **需要真人补录：`py.syl.eng1`**（ēng）。上游库没有 eng1，Wikimedia Commons / Lingua Libre（CC0）也没有单字“鞥”或单独 ēng 的录音；暂缺。课 9–13 目前家长页不开放，不可达。点到缺失 clip 时 `syllable()` 因 `narrator.has` 守卫直接返回 `'skipped'`、隐藏字幕，不会崩，也**不会退化到设备语音**（`spoken-text.test.ts` 有断言）。补录后：放进 `~/kid-games-work/pinyin-audit/originals/human/`，在 `import-human-audio.mjs` 的 `CALL_MISSING` 里去掉 eng1，再跑导入 + `normalize-syllables.mjs`，并把测试里的 `REGISTERED_MISSING` 清空。
- 合成呼读音例外：无。
- 可复跑的发音审计：`site/pinyin-station/tools/audit/run-audit.sh`（音高追踪器判声调 + 混淆矩阵 + F0 图、ASR→pinyin-pro 带声调对比、机器人台词与词音逐音节对比；ASR 只是线索，不能判断声调和口音，结论以耳朵为准）。报告：`~/kid-games-work/state/pinyin-lab/audio-audit-r3.md`。

## 第 3 轮（爸爸 ear-check 之后，界面这一半）

- **口诀卡**：机器人只描述嘴型/样子（“张大嘴巴”“小树分杈，认一认它的样子”），不念字母和声音；卡片上的小字、字幕、朗读是同一句话（`bank.json` 的 `mnemonic` = yaml 文本，`voice-r3.test.ts` 检查）。点卡片的顺序不变：先口诀，再真人呼读音（`py.syl.*`）。
- **易混淆提示**：提示句只用“左边这个/右边这个”，并在屏幕上画出那两个字母（要指的那个高亮，`bank.json` 的 `confusions[].focus`）；说完以后，按顺序播放两个字母的**真人呼读音**，播到哪个字母哪个亮，字幕栏同时显示普通句“听一听：先听左边，再听右边。”（`Context.listen()`，字幕里不印拼音），最后静默重放题目的声音。机器人不再念任何声音。
- **没有录音的东西不会被设备语音念出来**：口诀/提示/场景在没有录音时只显示字幕（`explain()` 不再退回设备语音，设备语音会把字母按英语读）。
- **er 的呼读音是真人 er2**：卡片的读音标注写 **ér**（`Letter.callDisplay`，`callLabel()`），字幕也是 ér；`voice-r3.test.ts` 保证所有卡片的标注/字幕声调与真人文件名里的声调一致（ui→wei1 一声 等）。
- **eng、ong 暂无录音**（`py.syl.eng1`、`py.syl.ong1`，需要真人补录，见上）：卡片不会显示成可播放的样子（状态行写“点一点，看看样子”），点它只播口诀字幕（课 9–13 目前也没有口诀音频）、不崩、不出声。课 9–13 家长页不开放，所以孩子够不到。
- **窃听器测试**：`tests/voice-r3.spec.ts` 用只记录不播放的 Web Audio 探针，逐张口诀卡、逐条提示核对：实际开始的 clip 序列、当时的字幕、当时亮着的字母，并断言除口诀/提示这一句外没有任何机器人的 clip。因为这 17 条的音频文件还是旧的，测试把 manifest 里它们的文字换成 yaml 的新文字再核对（配音步骤会做同样的事）。

## 拼音城堡对齐 · 阶段 1：音频导入（2026-11-06）

背景：学校练习册《汉语拼音》第 10–13 课 = 游戏第 9–12 站，这几站原先没有音节音频。审计文档（`pinyin-castle-alignment.md` §3.3 P1，不入库）列出 81 个库内真人音节；**导入了 80 个**（`import-human-audio.mjs --stage1`，固定提交 `aa25ecce…`，Unlicense；再经 `normalize-syllables.mjs` 归一到 −16 ± 0.5 LUFS、真峰值 ≤ −1.5 dBTP、AAC m4a）。
- id 约定：清单 key = `py.syl.<游戏音节 id>`；库文件名 = 游戏 id，只有 ü 不同（库叫 `uu`，游戏叫 `v`：`luue4` → `lve4`，与 bank 里 `nv3`、`lv4` 一致）。零声母 `wei you ye yue yin yun yuan` 直接用库名。
- **`er1` 没有导入**：`py.syl.er1` 已经是卡片呼读音（别名到真人 er2 = ér，见上文），库里的 er1.mp3（ēr）若也叫 `py.syl.er1` 会把卡片读音改掉；没有任何词用到 ēr（二月 er4、耳朵 er3 都已导入）。需要的话由 UI 同事另定 id。
- 22 个“只有韵母”的 bank 音节（`ui2–4 iu2–4 ie2–4 ve2–4 er2 in2–4 un2–4 vn2–4`）是清单别名，指向同一个归一后的文件（ui2→wei2、iu2→you2、ie2→ye2、ve2→yue2、in2→yin2、un2→wen2、vn2→yun2、er2→真人 er2），字幕用 bank 的 display；规则在导入脚本的 `ALIAS_BASE`。
- **`ao4` 已撤下（2026-11-06）**：音高追踪器判成一声（几乎平，0.8 半音），与文件名声调 4 不符，源录音就是平调。清单里没有 `py.syl.ao4`，导入脚本 `WITHHELD = ['ao4']`，`ao` 系列跳过第 4 声（四声排排队只出三个声调，练读表不含 ào）。需要补录一条真正的第四声 ào 后，去掉 WITHHELD 并重新导入。`wei4`：追踪器判三声是文件末尾一段杂音造成的假象，主体是 10 半音的降调（四声），见审计报告。
- 轻声候选 `ma5 le5 zi ne5 de5` **没有导入**：它们和一声 `ma1 le1 zi1 ne1 de1` 是**同一段录音**（逐样本相关 1.0000，长度、峰值相同），不是真轻声，不要当轻声音节用；带轻声的词用整词合成（`py.word.*`，词语声线）。
- 审计与数字：`~/kid-games-work/state/pinyin-lab/castle-audio-stage1.md`。

## 课本对齐 第一阶段（学校练习册《汉语拼音》，站 9–12）

- **课次标签（A0）**：内部仍是游戏“站”1–13（存档、测试、间隔复习不变）；`bank.lessons[].book = {lesson, pages}` 记课本课次和页码，`domain/book.ts` 提供映射（课本 1–8 = 站 1–8，课本 9 = y w = 站 8，课本 10–13 = 站 9–12，课本 14 = 站 13）。家长页“老师讲到这里”按课本课次选（存 `settings.book` + `settings.lesson`），第 14 课灰显并写“等第 14 课”；首页写“课本第 13 课 · 第 16 页 · 第 12 站”，练习页角标写课本课次和页码。
- **新课加权（A1）**：`schedule()` 的 today / listen / read 里，当前站和前一站的内容占 ≥ 60% 的题（热身段和两个“读一读”位置回看旧内容）。新站还没有词语时，图画/拼写位会换成新音节的听辨、拼合、四声排排队。
- **课本音节表（A2）**：`content/pinyin-station/textbook.json` 只含通用拼音表（每课带调拼读结果、韵母/整体认读音节的四声行，不含练习册版面、插图、原文、词表），由 `tools/castle-data.mjs`（`build <对照表.json>` 读只读的审计产物，`apply` 合进 `bank.json`）生成；`bank.syllables` 增加站 9–12 的 112 个音节、`bank.tone4` 记 19 个四声系列。**不要重跑 `seed-content.mjs`**（会覆盖 bank.json 里后来审过的内容）。零声母 ie ui iu in un üe ün ing ong 已加进 `parseSyllable`。音节 id 约定：ü 写 v（`lve4`、`vn2`），jqx 后的 ü 写 u（`jue2`），零声母 ui/iu/ie/in/un/üe/ün 的真人文件是 wei/you/ye/yin/wen/yue/yun（清单里有同名别名）。
- **四声排排队（A3，题型 H）**：听一个真人音节，在 āi ái ǎi ài 四个里选；覆盖 14 个韵母 + ye yue yin yun yuan 四声（o 的 2–4 声库里没有，er 的一声暂缺——`er1` 播的是 ér，所以 er 只有 3 张卡）。声音不出字幕；答错：“差一点点，再听一听。”（`py.H.near`）→ 第二次答错点亮正确卡并（相邻声调）说声调口诀 → 第三次示范。技能点 `tone4:<系列>:hear` 进间隔复习。新台词 `py.H`、`py.H.near`、`py.praise.25` 在 yaml 里，**音频待配音**（配音前只显示字幕）。
- **三拼介音（A12）**：`medialSplit()`：u/i + a o ai ao an ang 拆成独立介音方块（g + u + āi → guāi）；ie ui iu in un üe ün 不拆。ü：jqxy 后去点（id 已写 u），n l 后保留（nǚ、lüè）。`blendRivals` 的对手要求同声母、同声调、同介音。

## 课本对齐 第二阶段 2b（汉字卡与阶段复习）

- **汉字卡**（`picture: 'text:<汉字>'`，`views/art.ts` 的 `textCard`）：用代码画的大字纸卡，系统中文字体，字号随字数缩放（不会被裁切），不是图画的样子。E（读词找图）→ 看拼音选汉字，四个选项都是汉字卡（汉字卡从不和图画混在一起），干扰项是**读音相近的真实词**（同首音/同韵母，按相似度排序）——取舍：孩子可能靠识字猜，所以干扰项尽量读音接近，逼他读拼音；点击后不再加汉字标签（卡上已有）。F（看图拼音）→ 先静默听整词（不印拼音），再拼，沿用原有提示与回显，“听听图画”改叫“听听这个词”。D → 卡片 + 拼音，进题先自动播示范，再读。G 不用。
- **汉字卡题不连续出现、占比 ≤ 40%**（`schedule()`：15 题里最多 6 个；新站的词全是汉字卡时，多出来的位置换成新音节的听辨/拼合/四声）。
- **词的放开由生成器判断**：`node tools/castle-data.mjs words` 读 manifest，只有 `py.word.<id>` 词语音已在、且所有非轻声音节都有录音的词才不带 `hold`；否则保留 hold（所以没有词语音的词不会被出题，`castle-words.test.ts` 检查）。音频到位后重跑即可（只在有变化时才写 yaml，避免和配音步骤撞车）。
- **阶段复习**（`mode: 'review'`，首页“阶段复习”，课本第 9 课起出现）：先是“记一记”一屏（单韵母 6、声母 23、整体认读音节 10，点哪个播哪个真人音），再是固定编排的 20 题（14 道拼读 + 6 道读词，`CCD` 循环，拼读覆盖 ≥ 9 个不同声母、只用第 1–8 站的音节和词），不惩罚，结果页沿用现有星星。

## 拼音城堡对齐 · 阶段 2、3：音频（2026-11-06 / 07）
- 词语声线统一为机器人 A（`companion`，Vivian + 机器人音效）：全部 `py.word.*` 与新口诀/规则/提示都是这个声线，普通中文整词整句；不朗读任何要模仿的声音。轻声词整词合成（库里的“5/无调号”文件是一声的副本，不能用）。
- 阶段 2：导入 25 个词语音节；阶段 3：导入 94 个音节（`import-human-audio.mjs --stage3`），i2–i4、u2–u4 是 yi、wu 的别名，wei1 wen1 you1 指向已有文件。F0 声调形状 94/94 与文件名一致（弱上升的 fang2 hua2 jia2 jie2 qin2 za2 与 si3 把握较低，待耳朵确认）。
- 台词的 `norm`（朗读文本与字幕不同，只换同音字）：`py.tip.ie-ve`、`py.tip.in-un` 的“地”读成“的”，`py.tip.in-un` 的“噘”读成同音的“撅”（模型读不准“噘”）；`py.local.loud` 同理。字幕不变。
- 报告：`~/kid-games-work/state/pinyin-lab/castle-audio-stage3.md`。ASR 只是线索，不是证据；所有新声音都要爸爸耳检。
