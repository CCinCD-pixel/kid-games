# 腾讯口语评测接入记录

## 当前结论

现有腾讯账号可签名并连到 SOE-N，但实际握手返回 `4003 / 账号未开通本服务，请在控制台开通服务`，一次响应约 436 ms。该耗时仅是拒绝响应耗时，不是评测延迟。服务开通、计费额度确认由账号持有人完成。没有新建子账号，也没有部署或上传孩子录音。

## 已实现与验证

- 官方协议：[拼音模式](https://cloud.tencent.com/document/product/1774/107402)、[句子模式](https://cloud.tencent.com/document/product/1774/107396)、[模式总表](https://cloud.tencent.com/document/product/1774/107338)、[官方 Python SDK](https://github.com/TencentCloud/tencentcloud-speech-sdk-python/blob/master/soe/speaking_assessment.py)。
- 签名：原始参数按键排序，`soe.cloud.tencent.com/soe/api/<appid>?...` 做 HMAC-SHA1，再编码 URL；有效期 60 秒。
- 单音节/非轻声词：`eval_mode=8`，数字调拼音；轻声词：`eval_mode=1` 加汉字、`F_TDET=true`。16k、单声道、16 位 PCM；握手确认后发音频，再发 end。
- 签名函数检查家庭口令、本站 Origin、4 KB 请求边界；Netlify Blobs 条件写把北京时间每天调用量限制在 600 次。超限、配置缺失和错误都降级为本地跟读。
- 音频使用既有唯一 AudioContext，AudioWorklet 静音输出，不监听麦克风；VAD 约 700 ms 尾静音、最多 8 秒。退出页面终止录音、流和网络请求。
- 三盏灯只显示已返回的有效维度。Tone.Valid 无效时不判声调；没有结果不当作孩子读错。AI 和自评一律不计掌握，家长可回听改判。
- `/pinyin-station/lab/?mute` 是不出现在孩子入口中的家长实验页，仍需共享 PIN。成人样本不计入孩子学习记录。可主动导出本机录音、原始结果、家长标注及校准摘要。

## 尚待真实评测确认

`ba1/de1/te1/lv2` 的接受情况、拼音模式 Tone.Valid 的有效比例、MatchTag 的实际分布、轻声的效果、score_coeff 的影响，以及真实评测 p50/p90 延迟，都尚无有效服务结果。归一化测试中的数据是明确标注的合成协议样本，不是服务实测证据。

当前使用 score_coeff=1，阈值为未经校准的试运行值。不要把本地测试通过解释为发音判断准确。开通后先运行 verify-soe.mjs，再用成人及自然日常录音核验，不使用 TTS 调阈值。

## 本地命令

在 worktree 根目录执行（只读现有 Loop Pool 的本机配置，不打印密钥）：

```sh
node site/pinyin-station/tools/verify-soe.mjs /本机路径/16k-mono-s16le.pcm ba1 8
node site/pinyin-station/tools/replay-soe.mjs /本机私有目录/pinyin-calibration-private.json /本机私有目录/replay-results.json
```

重放命令会主动把选定录音发往腾讯；没有执行自动重放。导出文件含个人语音，仅保存在仓库外。使用实验页的三档摘要扫描阈值；score_coeff 暂固定 1，待验证官方可用范围后再扩展扫描。
