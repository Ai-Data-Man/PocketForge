# s103 会话：闲时自主——用户两主线「慢会话黑箱+断线UI」与「观测性缺口」全闭环（2026-09-25~26）

## 触发

闲时章程拉起，用户带两条已知问题：①「指定模型后，会话响应非常慢，似乎并非空转，但完全不知道在做什么（也不知道思考内容或工具调用)。并且会话框内会出现奇怪的断线等异常ui元素」②「应用观测性非常差，没有覆盖每个环节，导致日志反馈功能形同虚设，抓不住有效信息。典型代表：模型提供商的测试与拉取模型完全没有留痕」。

## 做了什么（为什么）

1. **双研究员并行取证**（research/44+45，520b284）：
   - 主线1 RCA：慢不在桥（llmproxy 零可测延迟）——三因叠加=①默认思考档放大器（新会话无习惯→注入官方预置 default=flash 系 max/high，选快模型实际跑最高思考档）②前端刻意丢弃 agent_thought_chunk（:1432 keep silent，长思考期唯一视觉=三点动画）③断线 UI 四条独立通路（health-bar 插聊天流+8s 超时抖动/S26 正则对成功回复误报💡卡/桥重启 zombie 卡翻「失败」/sid 复用竞态「切换失败」卡）。
   - 主线2 矩阵：六类留痕通道无一条能答「这次操作发生了什么」——test_model/list_models 五通道全零（用户点名，双重实锤）；LLM 非别名主路径生产静默（09-25 六笔真实请求 llmproxy.log 停在 09-22）；📮 报告读最弱通道（pc.log 冲刷受限 8h 无新行实证）。**主通道选型关键事实：console.log→pc.log 不可靠，必须 appendFileSync 直写**。
2. **pm 裁决**（dd6fd80，九切片）：thought 渲染=状态优先于内容（忙碌条三要素为主+草稿折叠面板为次+deepseek 诚实降级）；官方预置表 default 一个字不动（s102 同族错误不犯）+不做名字启发式降档，靠可见性闭合「慢↔思考档」因果链；断线四通路①②③进批④backlog；观测=按域双文件（llmproxy.log 扩展+events.log 新建）+5MB×3 轮转+报告补读四节。
3. **工程批1（S1+S2+S9）**49e4e47/1c32c5e/67d90fb：忙碌条三要素（阶段由帧推导+秒计时+THINK_LABELS 档位人话）、思考草稿面板（32KB 尾窗、回合即弃、不进聊天流）、zombie 卡中性收口。活体探针 glm/deepseek/32KB 臂全绿。
4. **工程批2（S3-S6）**9de772b/17ce962/9257618/ff55269：events.log 直写+test/list 留痕（6s 内盘上有痕，零留痕实证反转）+llmproxy 全请求行（model/effort/首字节/总时/状态码/错误摘要——LLM 主路径不再静默）+运维事件行（providers/switch/set_think/hotRestart/健康探测）+📮 报告补读四节（llmproxy 尾30+events 尾50+ring buffer 尾50+usage_ledger 7 天聚合）。
5. **工程批3（S7+S8）**2e4faed/54e03dd：健康条永久退出聊天流（挂 #main 零新第三处）+探测去抖（连续 2 败才 down+超时 15s）；S26 收窄（活测五臂定门=错误报告头冠正则；成功回合三零；真错误臂三路保持）。
6. **桥态退化 RCA（research/46，6d5a117）+S10 止血（0946de3）**：批1/批2 两次独立撞到的「快速建删会话后桥态退化」定案——删当日最新会话→sid 复用→goose closed 集只增不减→新会话出生即死（六环链源码级+六臂活体）；两放大器=救援守卫 sid 继承死锁（仅重启可解）+毒号进程内累积；s81 错峰冲刷反而把碰撞从竞速变必然。现行配置下更重变形=救援轮跑错模型（E5）。S10=修①出生清 rescuedSids+修②switch 死绑定代开重绑（零 goose 改动）。
7. **QA 终局批审判 REWORK→返工三落→复验 PASS**：P2-1 非 sk 形态 key 外带（c97ed5d 双层脱敏）/P2-2 阶段信号源失效（e3fc72d——现行 W4 配置 goose 对所有非 gpt-5 系 0 thought 帧，批1 绿证据产于旧家族态；主控修订裁决 3.1：「想」=等模型响应窗口，对所有模型统一显示，假象边界=内容）/P3-2 llmproxy 行补 path（c265554）。QA 复验独立仪器全闭合（busy-live 复刻 150ms 采样严判据 11/11）。
8. **收尾安全批（d47a727）**：QA 复验边界测绘挖出 NEW-1 形态黑名单结构性盲区（恶意/故障中继原样回显裸凭据值可穿两层）→值域脱敏根治（sanErr 增参收真实 key、split/join 纯字面替换、三组装点接线）+NEW-2 黑名单补三形态。攻击臂 0 泄漏。
9. **使用说明 §33 补句**：忙碌条引导（「等得久→看档位→调浅」行动闭环，零术语）。

## 关键新事实（防重查）

1. **goose 只对 gpt-5 系产 thought 帧**（RCA E0+QA P2-2 双证）：现行 W4 真名路线下 glm/deepseek 全部 0 帧——thought 内容渲染对现行池待帧而立；「想」阶段已换轨为响应窗口推导（不依赖帧）。
2. **桥 console.log 不可靠**（pc.log 冲刷受 pc 缓冲策略限制，ring buffer 落后+8h 无新行实证）——观测主通道恒走 appendFileSync 直写（backup.log 先例）。
3. **删当日最新会话=唯一触发 sid 复用毒号**（E3 单变量：删非最新零触发）；间隔 1-11s 四臂全败=出生门控与复用正交。
4. **形态黑名单对裸值回显结构性失明**——值域脱敏（组装点已知 key 字符串替换）才是根治；replaceAll/RegExp 形态会被 key 内 $& 反噬，split/join 纯字面替换安全。
5. S8 判定门：goose 把 SSE 错误体包成 `Ran into this error:` 头冠居首随正常 resolve；401 走 reject 路（不属此门）；中途断流=残正文裸收零包装。
6. 探针自清核对教训（QA）：`max(id)` 字典序读数是伪影（_96 vs _100+），清零核验用 count+数值 max。

## 留痕

- commit：520b284（research）→dd6fd80（verdict）→49e4e47/1c32c5e/67d90fb（批1）→9de772b/17ce962/9257618/ff55269（批2）→2e4faed/54e03dd/397cc46（批3+落账）→6d5a117（RCA）→0946de3（S10）→ccfee9f（批4 落账+push 59099e9..ccfee9f）→c97ed5d/e3fc72d/c265554（返工）→d47a727（seal）——**全部已 push**；终态批（使用说明+STATE+journal）随本枚。
- 报告：tmp/qa-s103-review.md（终局批审）/tmp/qa-s103-recheck/（复验+边界测绘）；红绿证据 tmp/s103-e1~e6-*/；批次 journal 三篇（batch3/qa-rework/seal）。
- 终态基线（§8.2 全 15 套）：e2e 62+fuzz 225+ui 92+ia 38+sem 38+think-grad 27+capeditor 141+modelcaps 43+w2-preset 15+proxythink 30+xlate 10+w1-effort 14+rescue-guard 46+toolcard 55+health-fuzz 27。
- backlog（带触发器，详见 STATE 顶行留档）：③救援补钉模型（D5 跑错模型，单独裁决）/④goose 发号避死集/G10+G12+G13 事件行/首档策略重开/S26 正则最终形态/S9 unknown 卡状态行/S7 down 盲窗手册留档/thought 帧通路恢复（goose 上游项）。
- 环境：dev 栈 healthz 200；C:\PF-TEST 空；sessions.db 无 s103 残留；events.log/llmproxy.log 攻击行手术清档完毕。

## v0.9.17 发布记录（尾段，用户令「再出个包」）

- 发版材料：5fadd3e（VERSION 0.9.17+docs/v0.9.17-release-notes.md 面向使用者七条+技术明细）。
- 发布门（出厂包全新解压冷装，AGENTS §8）：C:\PF-TEST\gate 降权冷启（GBK wrapper+runas trustlevel 复刻 e2e.sh 先例）→ **cold-surface 15/15** + 新面抽查全过（忙碌条页面锚/使用说明引导句/sanErr+events.log 写入器/📮 报告四节实测【llmproxy 行全字段+502 诚实+usage_ledger 聚合】/converge rc=0 零补跑）。
- 构建：可复现（两次打包 sha 逐位一致 **ed6ae68f…**，323,744,558B/25,306 文件）；**exe 哈希 vs v0.9.16 零变化=无信誉尖峰**。
- 发布：tag v0.9.17+分支已推；release id **397041585** 双资产；**API 下载对账 sha256 逐位一致**+latest=v0.9.17。
- 发版操作实录三条教训：①release.sh 的 python urllib 大资产上传经代理会卡死（连接断后挂起零进展）——杀链改 `curl -x` 显式代理直传一次成（release.sh 后续可改 curl 通道）；②API 资产 id 必须先查 releases/tags 响应再下载（猜 id=404）；③停 dev 栈正确序=先 `schtasks /End /TN PFdrill2` 再 `pc down`（任务承载进程会重拉栈，直接 down 端口不清）；沙盒清理=按命令行匹配 PF-TEST 全杀进程族再整删。PAT 取用与清除纪律保持（zcode db part 表 data 列 github_pat_ 正则，环境变量直传，用后即删）。
