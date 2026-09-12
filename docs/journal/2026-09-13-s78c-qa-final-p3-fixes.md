# s78c-fix QA 终轮 P3 两应修（2026-09-13）

上游 913b726，报告 tmp/s78c-qa-final.md §二。工程师实施，最小 diff 4 文件 +34/-10。

## 修1 P3-1 lastModelOverride 与 GOOSE_MODEL env 双源不同步
- `effectiveModel(act)` 单一真相源：override∈活跃池?override:池首→secrets 链。三处消费同源：spawnAcp env（原恒池首=实跑错模型）、healthTargets 探锚（原 s78b 内联读法上收）、env0Model（provider_switched 告知）。
- providers 面板 activate/save/delete 的 needRestart 触发处补 `lastModelOverride=''`：换档清除生效模型随档回落池首，防同名模型跨家碰撞时假锚（报告缺口 b）。
- :3497 注释修正为实际语义（单源消费/∉池自愈/面板换档清除）。rescueSession 缺口 c 经 spawn env 同链顺带覆盖，未单独加码（报告列为可选）。
- 验证 tmp/s78c-p3-fix-verify.js（桩 goose=node 硬链伪装 goose.exe、启动即落 spawn env 日志；假 provider /models 回 [a1,b1,a2] 排除 b2）：13/13——跨家选 B 非首位 b2 → 重启 env=b2+provider_switched 告知 b2+探锚 b2 stale-model；面板 activate A → env 回落 a1+探锚 ok；同档切碰撞模型 a2 后面板 activate B → env=b1 不假锚；同档 set_config_option 路径回归钉。
- 判别力双负对照：修前模板（git show HEAD 快照）S4/S5 红（env=b1、告知 b1）；NOCLEAR 变体（仅撤清除行）S11/S12 红（env=a2 假锚）——两修各自必要。

## 修2 P3-2 maskKeys JSON 引号形态绕过
- chat.tpl.html 两正则键尾/值首各加 `["']?`：覆盖 `{"X-API-Key":"faucet_…"}`、`{"Authorization":"Bearer sk-…"}` 与 rawInput 对象经 JSON.stringify 渲染的主真实形态。引号归前缀组原样保留，token 组吃尽尾引号前密钥全串——掩码直抵结构位尾引号，无残段；shell/裸头形态输出逐字不变。
- toolcard-frames-probe §7b 31→39ck：报告泄漏矩阵 5 形态全钉（JSON 单行两族含掩码直抵尾引号+JSON.parse 结构完好回读掩码值、stringify 对象形态+_inp 原文、shell[§7 既有]、裸头对照）。修前模板对 JSON 两族 LEAK 实证（tmp/s78c-p3-prefix.tpl.html 提取实测）。
- QA 建议 2（阈值 ≤12→≤16 或前4后4）与建议级 3 形态（x_api_key=/URL query api_key/Authorization: token）维持范围裁决不纳入。

## 回归与物化
- 全量顺序：e2e-chat **57/57**（tmp/e2e-final-s78d.log）→ fuzz **150/150**（tmp/fuzz-final-s78d.log）。签名教训遵守：spawnAcp env 链公共读法改动后全量必跑。
- 物化 cp tpl→bin + cmp 逐位一致；仅 pc restart chat-bridge；dev 栈 10 进程健康；假路由 :20129/pg 未触碰。
