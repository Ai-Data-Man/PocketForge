# 2026-08-29 s50e — P31-④ 多线路韧性（收窄版）+ BOM 缺陷

## P31-④ 裁决（pf-pm，主控采纳）
- 三场景拆解：A 无 key 401=首次配置缺失（归 P31-② 向导领地）；B 429/超时/5xx 偶发=已有 UI 可救，剩痛点仅多两步手动；C 中转整体挂=无数据。
- 401 自动降级**永久裁掉**：换线路大概率还 401，且把「该修的配置」伪装成「临时故障」=债务自动化。知情权>顺滑：任何换线必须带人话说明。
- 半自动（N 次失败自动切+重发）**裁掉挂准入**：turn 失败时工具可能执行一半，自动重发=副作用重复（正确性问题非 UI 问题）。全自动 failover 链裁掉（与护栏档位气质冲突）。
- 采纳 (a)：错误分类+401 人话指引+「换备用线路再试」一键（零自动）。(b) 准入：护航≥2 周且 upstream 类错误≥10 次 且 (a) 换线成功率≥50%。
- 技术底座取证：hotRestartProvider 已存在（切档案热重启+会话保留+session/load 恢复），但底座便宜不等于该上。

## 实现（commit 0c9a91a，+93/−9）
- 桥：classifyUpstream 纯函数（unauthorized/rate/timeout/server 四类正则取首中）；两处错误点加 statsBump('errorsByType.upstreamByKind.<kind>')（原 upstream 计数保持兼容）；stats 默认+跨天重置+旧文件兜底三处补结构。
- 前端：401 →「Key 没配上或不对，到 ⚙️ 设置→服务商档案填好再回来点重发」（无按钮）；其余上游错→追加「换备用线路再试」按钮（providers activate 既有通道+pendingRetry 一次性消费+submit 重发，单档案不渲染）；全 DOM/textContent 零 innerHTML 拼接。
- fuzz +1（upstreamByKind 形状）→ 16/16；classifyUpstream 断言 13/13；e2e 21/21。
- UNVERIFIED（待护航）：真实 401 计数实景、GUI 401 文案+换线按钮实景（需坏 key+双档案环境；dev 中转不校验 key 制造不出来）。

## BOM 缺陷修复（commit 73a3fda）
- readProviders 对带 UTF-8 BOM 的 providers.json JSON.parse 抛错→静默回空→档案全部消失（Windows 记事本默认存 BOM，真实触发场景）。修：readJson 统一 strip \uFEFF，同文件 4 个自有状态读点收编（migrateJsonAt/wsMap/forgeMeta/arch），行为不变断言 3/3。重启后桥正常读「公司中转」档案。

## 事故记录（跟进项）
1. 17:01 dev 栈全倒一次（pc/桥/goose/faucet 全灭），紧跟一次 process restart chat-bridge，根因未取证（实验环境污染，单变量难隔离）；engineer 按 README 纪律 dev-stack-up 拉回。与 journal 02:55「勿手工 Stop+起 bridge」可能同族。**规程提醒：桥生命周期归 pc 管，勿手工 kill。**
2. providers.json 事故链：坏模型实验→BOM 写入→静默失效暴露（本缺陷的发现路径，算是因祸得福）。

## 遗留状态
- v0.9.6 包（tag=fbc6031）不含 s50e/73a3fda——两改动待护航数据/GUI 复核后随 v0.9.7。STATE 路线区 P31-④ 条目主控已按裁决改写。

## GUI 全链路终验（主控，fced41e 后）
- 坏 host 实验（providers.json 公司中转→127.0.0.1:9）：发「你好」→ 人话提示 + 「换备用线路再试」按钮出现（fced41e 正则修复生效）→ 点击 → 顶栏切「备用线路 · kimi-k2.7-code」+ hotRestart 新会话 → 重发「你好」真实落库（sessions.db 20260829_16，17:33，含工作区备注）→ providers.json 还原+桥重启 → e2e 21/21 + fuzz 16/16。
- 行为注记：换线重发落在新会话（hotRestart 语义），原对话历史保留在旧会话；符合「切线路重试」预期。
- s25 时代死代码根因（fced41e 取证）：goose ACP 从不发流内 stop 错误形态，prompt 正常 resolve、错误文本走 session/update——统计触发点改在 prompt resolve 处。
