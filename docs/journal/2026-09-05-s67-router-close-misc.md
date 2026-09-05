# 2026-09-05 s67 — 9router 缺陷结案 + dev 栈宕机事故复盘（同日续）

## 9router 大工具集缺陷结案（22bbb67）
- 复测：deepseek-v4-flash，N=1..50 阈值曲线（含 s19 事发区间 40+）28/28 采样全部正常 tool_calls、零 502。真实 goose 栈 40-45 工具在已验证安全域内。
- 溯源：s19 当夜归因在 journal s20/s22 已撤回（真因=IE 系统代理劫持 + glm-5.2 账号锁定），research/04 s19-4 漏同步——本日补齐，结案。
- 9router 现为 0.5.65（09-03 更新）。哨兵：glm-5.2 用前单发 N=40 探针。铁律重申：手工探针必须 NO_PROXY 或直连 TCP。
- 方法论亮点：研究员先证伪自己的探针（prompt 目标工具不在场导致假信号），再采信数据；遵守主控纠偏全程未用 curl 打本地端点。

## dev 栈宕机事故（见 s66 journal 事故记录）
- 沙盒轮后 runas 重拉静默失败 → 栈宕 → Bash curl 沙盒代理假 200 骗过全部后续验证 → 主控收尾核查用 node/netstat/IAB 三方见真相 → runas 重拉恢复（node 实证）。
- 教训已入 STATE 观察项与记忆 pitfalls：验服务生死用 node 直连/浏览器/netstat，禁采信 Bash curl 本机 200。

## 真实检索基线
2038 条消息 LIKE 0-3ms（冷扫 149ms）——阶段三触发器"近 1 万条"维持不变。

## v0.9.9 候选包沙盒冷启冒烟（全过）
- 制品自检：sha256 一致/28977 文件 unzip -t 无错/forge-backup 含 fc948e9 守卫/pg 4 exe/VERSION=v0.9.9。
- 冷启：pg Ready restarts=0、pg-init Completed、bridge 200/4ms（node 计时）；**fc948e9 真实事故路径直证**——冷启 daily-backup exit 0、空 pg-dumps 被挡、zip 完整（修复前此路径 Compress-Archive 删 zip 必崩）；冷启首备份天然无 dump（daily-backup 由 faucet-rawsql 触发不依赖 pg，设计内失败面），pg Ready 后与第二轮启动均产出 dump（kept=2 新 zip 含 pg-dumps）。
- 重启幂等（PG_VERSION mtime 逐位一致）/报告豁免口径外零 PG 字节/停止无 postgres 残留；dev 栈 node 实证恢复（10 进程全绿，pg Ready）。

## 四皮肤×昼夜视觉 sweep（令牌计算样式客观审计，8 组合全过）
- 方法：IAB 真页面逐组合切换（skin × light/dark），读 .quickchip 边框/底色、#send 底色、侧栏底色、截断提示行色、消息边框的 computed style，与 --acc 令牌比对。**方法论坑：后台标签页 transition 节流会把 computed 值冻结在起始值——审计前必须注入 `*{transition:none!important}`**（首跑"芯片边框恒绿"即此伪影，注入后消失，非产品缺陷）。
- 结果：8 组合全部正确——--acc 四皮肤昼/夜值逐一命中（绿 #0e7a43/#2ea36b、靛青 #1a6fd4/#4d94e8、暮紫 #6d48b8/#a184e8、石墨 #3d4a54/#8fa3b0）；芯片边框/底色、发送键、侧栏、消息边框、弱色提示全部跟随令牌。结合 s65 未定义引用审计（0），设计令牌体系完整性双重验证通过。

## goose v1.50 监控检查点
2026-09-05 14:xx：latest 仍为 v1.49.0（09-03）。下次检查点 09-06+；若 v1.50 发布→按 research/goose-upgrade-playbook.md 启动升级窗口。

## s66 遗留三件收口（8054c40）
- 停止脚本"确已停"校验（轮询 pc API+人话警告）；**顺带根治：cmd 内 UTF-8 中文 rem 在 GBK 代码页吃掉下一行行首**（pc.port 读取行已被静默废掉多日，靠默认端口侥幸命中）——.cmd ASCII 化升级为硬规则（记忆 pitfalls #15）。
- checksums.txt 统一为机器单一真相源（downloads 七归档+fetch.sh 管辖六目录 exe 全量重算，regen 幂等不丢行，16/16 等价验证）。
- e2e.sh 重拉栈走降权包装（runas+清旧 wrapper+sleep 波动容忍）；事实勘误：重拉点在 e2e.sh 第 5 节，e2e-chat.sh 本无拉起分支（前置 bridge up 断言兜底）。
- 验证：e2e-chat 45/45 + 停止脚本负/正双路径（负路径假 pc API 触发 WARNING+exit 1；正路径 2.4s all stopped）+ node 实证恢复（bridge 200/pg Ready）。

## 诊断规则实弹演习（R1 真实故障触发）
- 停 faucet（pc process stop）→ 生成报告 →「小forge自己看到的毛病」节精确命中 R1 全文（含 67b871d 补的出口短语），R5（代理开+连接错）按预期并存；faucet 拉回 Ready、bridge 200 恢复。
- 规则链至此三重验证：单测正反例（s64 探针）+ qa 对抗证伪 + 真实故障实弹。R2/R4 待真机自然故障顺带观察（人为造钥匙失效/端口占用风险大于收益）。

## pg.log 慢性膨胀治理（b0d78bd）
- 机理：探针裸 process.exit(0) 带开 socket 死亡 → postgres 每 5s 收 RST 记 COMMERROR；PG17 backend_startup 对客户端优雅 EOF 有静默分支——修复=探针连通后 s.end() 优雅半关（close 事件为退出同步点）。实测 pg.log 增速 4.5MB/天 → **0**；readiness Ready 语义保持；e2e 45/45。
- pc 能力核实（源码级）：per-process log_rotation 受支持但不继承顶层；per-process writer O_TRUNC——pg 每次重启 pg.log 清零（噪音只在单次存活期累积）。轮换留作备用能力。
- max_restarts:3 预算会真实烧尽（调试期实证两次自动重启）——维持"阶段二首个消费者复核"触发。

## v0.9.8→v0.9.9 升级路径演练 + 终版复验（dfe46b0，发布前最后一块拼图）
- **前提修正**：dist 里名为 v0.9.8 的 zip 实为开发树构建（含 bin/pg），非真老版；真老版从 tag v0.9.8+19（77ca5d9）git 重建（tmp/wt-v098，已清）。
- **缺陷 1（发布阻断，已修 dfe46b0）**：/api/update/upload 被 50MB 全局预检拦死（413+destroy）——325MB 发布包永远传不进离线升级通道。修复=预检豁免该端点（流式落盘零积压）；51MB 实测 200 落盘逐字节一致；其他端点 s50c 保护不回归。
- **缺陷 2（真实事故路径，发布说明级）**：v0.9.8 升级引擎死词 shutdown → 升级"假成功"：老 pc 未停、桥被旧 pc 用新代码拉起（healthz 误判）、PG"在盘上不在栈上"。自愈路径验证：v0.9.9 停止脚本（真 down）一次停净 → 重启后 9 进程含 pg 全绿。发布说明明示"升级后若数据库面板未变绿，停一次再启动"。
- **缺陷 3（pm 裁决挂 backlog）**：离线升级 UI 不收 .sha256 上传（端点白名单拒），runner 却硬性要求——小白离线升级会卡。
- **升级后断言全过**：VERSION=v0.9.9/用户数据三态完好（会话搜索双命中、文件 sha256 逐位、secrets 不变、绑定原样）/bin/pg 4 exe+pg Ready/停止脚本对照成立/冒烟全过。
- **终版聚焦复验**（e02e661c 重建包）：包自检/冷启全绿/fc948e9 守卫真实路径直证/51MB 上传 200 落盘逐字节一致/s50c 不回归/停止无残留/dev 栈 node 实证恢复。
- 观察项：升级窗口期孤儿绑定 ws-0905-162919→20260905_4（无目录，留档待查）；s50c 预检 413 被 RST 吞掉客户端不可观测（独立小改候选）。
- **勘误**：发布说明草稿旧 sha256（a31b77…）与大小（325,752,371B）失真 → 已定格终版 e02e661c/325,753,996B（5eb3d70）。

## 验收
9router 复测 28/28；dev 栈 node 实证恢复（healthz 14ms/pg probe READY）；仓库树净。
