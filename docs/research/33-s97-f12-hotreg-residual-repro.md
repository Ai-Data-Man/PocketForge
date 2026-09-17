# F-12 复现配方（s97 会话遗留，下次会话首活）

## 现象（三次实录：s97b 03:14:32 / s97d 04:24:35 / s97g 05:33:37）

agent 在冷启后 2-4 分钟窗口跑富 yaml（readiness_probe http_get + availability + forge-meta）注册：
1. wrapper 的 pc project update 在注册秒触发全表重启（chat-bridge ACP initialized +1、faucet/nats 启动日志、daily-backup oneshot 重跑=新生成 backup zip 时间戳=注册秒）
2. 桥重启 → 在飞回合孤儿化（无终态回复）
3. 客户端随进程树被杀 → errorlevel 1（s97g 形态=wrapper 打出真失败行；s97c 形态="(no output)"）
4. 注册实际成功（应用入表+服务）

## 已证伪/已修复的邻近根因（勿重复）

- F-9 ROOT 脏串：已修（2a07ecc），修后 s97e 净化 env 新栈注册 ACP 零增长。
- F-11 FORGE_AGENT 漂移：已修（9e4420d），三点恒同（secrets 哈希物证）。
- 受控态不复现：沉降栈上 wrapper（净化 env/全 env）× 真变更（probe-n/o）全部 exit 0+ACP 零增长——env 与 yaml 极简形态都不是充分条件。

## 确定性复现（2026-09-18 06:0x s97g 实录）

**配方 A（挂起+桥双重启）**：apps/rich-probe.yaml 的 readiness_probe.port（8123）≠ command 实听端口（8105）→ wrapper 挂起 >10 分钟；挂起期间 ACP +2（桥二次重启，ring 日志无错误=外因）；daily-backup 未重跑。杀 wrapper 后栈恢复。
- 复制：`sed 's/<名>/rich-probe-web/g; s/port: <真>/<假>/' apps/<任一agent风格yaml>` → 冷启栈 → wrapper 注册。

**配方 B（crash-loop，机理反证用）**：净化 env（env -i 仅 PATH）直连 pc.exe 跑 update -f 全套 → -v verbose 显示全表 "updated"（↺）→ 空插值配置替换全栈 → chat-bridge/nats crash-loop（restarts=23）、pg Completed 死。**坐实：pc "updated"=配置替换；坏渲染=替换后循环；update 命令本身 exit 0。**
- 复制：`env -i PATH=... pc.exe -p <port> project update -v -f ×4`（勿在有价值栈上跑！）

## 未定案问题

1. 配方 A 的桥重启由谁发起（pc 对 pending readiness 的连带行为？oneshot 碰撞？）——读 pc v1.122 源码 project update 路径（diff 判据/readiness 等待/连带重启规则）。
2. agent 富 yaml（探针端口正确）为何在 2-4 分钟窗口触发同签名（s97b/d/g）而沉降后同 wrapper 全绿——怀疑启动收尾链（daily-backup/pg）与 update 的等待交互。
3. 修向候选（取证后裁决）：wrapper 注册前等栈沉降（daily-backup Completed 门）；或 wrapper 检测 update 后桥 PID 变化即重试；或 hints 教「冷启后先做别的步骤、2 分钟后再注册」。

## 相关物证位置（沙盒已删，关键数据已录 journal s97）

- 三次失败的时间线/备份戳：journal 2026-09-18-s97 §主线3。
- verbose 全表 updated 截图文本：本文件配方 B。
