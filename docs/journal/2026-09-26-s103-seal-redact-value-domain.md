# s103 收尾安全小批（seal）：NEW-1 值域脱敏 + NEW-2 黑名单补口

- 背景：QA 复验（tmp/qa-s103-recheck/）边界测绘发现 P2-1 形态黑名单的结构性盲区——恶意/故障中继在 401 错误体里**原样回显收到的 key 值**（无 Bearer/api_key= 标记）→ sanErr 形态正则不命中 → events.log/llmproxy.log 行内原文 → 📮 报告直读。三臂两层全漏（裸值/X-Api-Key:/apiKey=）。QA 判「建议下批应修」，主控裁决趁热本批修。
- NEW-1 修法（QA 根治方案）：sanErr(s, key) 增参——err 组装点传入该请求真实 key，≥8 字符才生效（空/短跳过防误杀可读性），key 出现即整体替换 `<已脱敏>`。split/join 纯字面替换：key 含正则元字符/`$&` 替换模式符不炸不漏（replaceAll/RegExp 形态会被替换模式符反噬，有意不用）。三组装点：test_model/list_models=回落链最终使用值（各 3 err 位），llmproxy llmDone=req.headers.authorization 剥 Bearer 的转发凭据原值（比活跃档 key 更准：桥实际发出上游的就是这串；goose 正常流量两者相等）。
- NEW-2 纵深：sanErr+reportSanitize 两层黑名单补 x-api-key:/api-key:/apiKey[=:]（Anthropic 式翻译头回显）；x-api-key 列 api-key 前防半吃残段。
- 保持：请求方 key 永不落盘；sk- 写侧不吃（报告层整行脱敏责任保持）；既有四形态黑名单行为保持。
- 红绿（tmp/s103-e6-red/ + s103-e6-green/）：红=QA p1 探针 6 泄漏臂+e6 探针 5/14；绿=QA 探针 13 PASS/0 泄漏臂（C1 FAIL=探针自清记账怪癖：全脱敏后攻击行失去 MARKER 摘不动，红绿同形非闭合判据）+e6 探针 19/0（V1-V5 值域/B1-B2 空/短 key 边界/N1-N4 三形态两层/K1-K4 既有控制/W1-W4 接线静态钉）+llmproxy 活体臂 7/0（沙盒桥 forge/tmp/e6-llm-sb：FORGE_ROOT 隔离+bin/goose junction〔GOOSE_PATH_ROOT 隔离状态〕+假上游回显凭据原值→llmproxy.log err=`relay 401 your key <已脱敏> is denied` 零原文；自清先摘 junction 防 rmSync 穿透真树）。
- 回归：fuzz 225/0+ui-logic 92/0+rescue-guard 46/0+report-probe-static 39/0（黑名单正则从源码活提取，3 新形态零迁移）。
- 自清：events.log 攻击行 11 行手术摘除（红 4+绿 7；JSON 0 坏行，rc* 标记零残留）；报告文件探针自删；沙盒树已删。
- 物化链：tpl→bin cp 逐位一致+node --check 双过+`pc process restart chat-bridge`+healthz 200。diff 22+/16-。
- 教训沿用：llmDone 若引用后置 const headers 有 TDZ 杀进程风险（no-host 早退先于 headers 构造）——取 req.headers（入参恒在）。
