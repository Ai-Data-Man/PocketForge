# ADR-0006: 二开（fork）策略——默认不二开，运行时对冲优先

- 状态：Accepted
- 日期：2026-08-20
- 关联：ADR-0002/0005；STATE 开放问题

## 背景 / 约束
用户原则："能不二开就不二开，实在不行就二开或吸收重造，怎么够用怎么省力怎么来"。官方二进制存在已知缺陷，逐项评估 fork 与否。

## 缺陷清单与决策（全部 VERIFIED-RUN）
| 缺陷 | 影响 | 对冲 | 二开？ |
|---|---|---|---|
| faucet db add 后运行中 serve 不可见 | agent 建库后查不到 | `pc process restart faucet`（<3s，healthz 探针自动恢复），已入 .goosehints 协议 | **否**：Go fork 维护成本 > 3 秒中断 |
| goose-mcp memory 无视 GOOSE_PATH_ROOT | 记忆写 AppData | NTFS junction（零代码，免管理员） | **否** |
| goose config.yaml 不展开环境变量 | 便携配置静默失败 | bootstrap.ps1 生成绝对路径 config | **否** |
| goose stdio 扩展 spawn .cmd 失败 | wrapper 型扩展起不来 | config 用 `cmd /c <wrapper>` | **否** |
| chatrecall 仅关键词（中文无语义） | 召回质量 | 接受；观察用户反馈 | 暂否 |
| browser-use Edge 死锁 | （已换 playwright-mcp） | 换件 | 否（弃用） |

## 决定
1. 当前**零 fork**。全部缺陷以运行时对冲（脚本/junction/协议约束）消化。
2. 二开触发线（满足其一才 fork）：a) 无运行时对冲可用且阻塞核心故事；b) 上游停更+安全漏洞；c) 对冲的体验成本被真实使用证明不可接受。
3. fork 时的形态：优先**吸收重造**（把需要的部分做成我们自己的小组件，如一个 50 行的记忆 MCP）而非整仓 fork——除非改动是上游一两行的 PR 级。
4. 上游互动代替 fork：goose memory 便携问题提交 issue（零维护成本）。

## 复核条件
- 每次真实目标机使用反馈后重读本表。
- faucet 若出现第二个需 fork 的缺陷 → 整体切 PocketBase（ADR-0002 退路）而非修 faucet。
