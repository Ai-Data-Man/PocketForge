# 2026-09-16 s94：做过的东西×技能 IA 返工 + 从零安装猎捕两批修复

用户两主线：①「管理小forge」「技能」两模块信息架构严重问题（技能双入口/内置技能误归因/表双清单）②从零安装反复测试观察一切可观测点猎捕问题逐一修复。测试模型=9router 中转 glm-5.3-flash（/models 实测在列）。

## 主线1：IA 返工全链闭环

- **裁决** docs/verdicts/2026-09-15-made-ledger-ia-rework.md（PM，5ce4a9d）：方向 B=台账收窄为纯对话产出。收录判据=进台账⇔对话产出（有来源会话或 origin.source==='self'）；内置（origin=null）与市场安装（market/local）永不入账——「做过的」=「有当时」。分职母句=「台账只记账、带路；要看内容、要删改，去各自的家」。s83 两勘误（技能源条款+R1 豁免条件补全），s87 维持。
- **工程** S1-S4（e01a6b1+212024b）：桥端 self 过滤一行+函数头注释；前端分职文案 5 处；探针适配（assets-probe A3 种子法+A11 内置黑名单 28→29ck；fuzz 189→190ck；e2e §22 同步）。全量 e2e 59/59+fuzz 190/190+appcap 13/13+GUI 冒烟 13/13。
- **QA 独立复审通过**（tmp/qa-ia-rework-review.md，重跑全绿）：零 P1/P2；P3-1 探针前瞻性假红（A3 every() 焊死「本机 0 self」，产品成功日即假红，随下次探针批改等价断言）；P4×5 留档（origin 伪造面=设计接受——HTTP 写面全闭合唯一 self 写者=本地 agent=协议本身；A11 前提依赖内置目录存续；两套件共享种子路径并行互删面；chip=tbl/file 空态空引号[既有]；种子清理断言条件式）。

## 主线2：从零安装猎捕（三沙盒三轮）

包：v0.9.13-iat（2886e442，含主线1）→ ia1 全轮→修复批1→ v0.9.13-iat2（ab337ecf）→ ia2 复验→修复批2→ iat3 终验。纪律：§8 真实解压+冷启，§8.1 沙盒根 C:\PF-TEST\ia1/ia2/ia3。**MSYS unzip 解 UTF-8 中文名必坏——沙盒一律 Expand-Archive（实测教训）**。

### 通过面（ia1 全轮 + ia2 复验）
冷启降权路径正常；welcome 首启弹出并消费；停止全停零残留；二启 3s 就绪；持久性全过（provider/会话/台账/技能/库）；pg 停机零 FATAL；备份链首启即两 dump+zip（F1/F3 修复保持）；⚙️ 七 tab/🧩弹窗/@菜单渲染零 JS 错误；**新 IA 台账活体全链**（表条目人话名+时间+来源对话回链+「打开」落数据 tab 展开列样例+seed self 技能在列+内置 5 技能绝迹）。

### 发现与修复（详情 tmp/s94/findings.md + 本节）

**批1（ia1 发现，09665a3/74d2420/dd4d00a/f892a29 + 主控热修 1f65c66）**：
- F-2 (P1) 保存→拉取=0 模型：key 栏安全清空+桥 secrets 启动快照永不更新+401 映射空列表三因链。修=回落链接活跃档案现读+非 200 诚实报错。探针 12/12。
- F-1 (P2) 保存静默无效+添加清表单。修=未建档保存给人话提示+Key 栏保留。
- F-4 (P1) goose 走 IE 系统代理→回合永久挂起零反馈（netstat 铁证 7890×3；重放完整请求体直连 5s 200 SSE；探测(node 直连)与运行时(代理)不对称告警永不触发）。修=spawnAcp 注入 NO_PROXY=活跃 provider host（机理源码级验证：hyper-util matcher env no 优先于系统代理，ProxyOverride 仅 env 空时生效——ia1 实测一致）+探测 ok 但代理旗在也保留告警条（人话文案）。
- F-6 (P1) faucet 新装机零供给（无 admin/key/.apikey，WARN 教你去 /setup；dev 树 .apikey 是 8/19 手工化石故从未暴露；桥富化静默全 null）。修=bootstrap 种子凭据+pc oneshot faucet-provision 三件套幂等供给。**iat2 沙盒抓出 ROOT 解析错层 bug（'..','..' 应为 '..'，闭盒测试 argv 覆盖绕过默认路径故未拦）——1f65c66 一行修，热修后 ia2 全链点亮**。
- F-7 日期串 UTC 解析+8h 显示 08:00→本地零点。F-8 无 frontmatter 技能 human 回落一级标题（顺修 body 恒空真 bug）。F-9 @菜单漏 forge_* 建账表→精确排两张。

**ia2 复验结论**：F-1 提示✓/Key 保留✓；F-2 保存后拉 120 模型✓；F-4a 代理开+回合跑通✓（对照 ia1 死挂）；F-4c 告警条人话文案✓；F-6 供给+台账四键全亮✓；F-9 只剩 drink✓。F-1 模型面残留（批2 修）。

**批2（ia2 发现，7d916c3/8c6554f/da03e4c）**：
- F-3 (P2) 首配自动切换宣称成功但不生效：模型随 spawn env 在 session/new 钉进会话持久化（goose evicted-restore 按 DB 原样回放），首配 subscribe(null) 不带 model→会话钉死种子 mimo-v2.5，10 份 llm_request 全 mimo（中转恰有 mimo 掩盖；若无=首任务必死）。修=prompt 前会话模型对账（effectiveModel≠已记账→先 set_config_option 再发 turn）+同 env 热重启抑制（三连 info 根源）。修前探针 4 红=根因活体复现，修后 10/10。
- F-11 (P1) 回合中途渲染流冻结+忙碌态泄漏：hotRestartProvider 清订阅集而前端不重订阅→带 sid 的 chunk/tool 帧被无订阅者丢弃（s78 P2-B 族新形态；服务端全程健康 84/101 消息，UI 冻结 7 条，重载回放完整=纯事件路由层）；busy 只等发起 ws 的 stop 帧→断线/切换后永挂。修=订阅集按 wsSession 现挂重建+ws.onclose 即 setBusy(false)。探针 A4 修前 0 帧=冻结复现。
- F-1 残留：添加路径双渲染（add 应答+300ms 补拉）第二帧整盒覆写勾选面。修=去冗余补拉。
- 回归：e2e 61/61+fuzz 190/190（新 §24/§25 只增不减）；ws-subscribe-race 24/24 等锚点零适配。

### 留档跟进（非本批）
- 热重启窗口内 in-flight subscribe(null) 的 session/new 静默丢弃（前端等不到 subscribed 须手动重试）——独立跟进项。
- 观察项：pc.log 把 stderr INFO 标 level:error（上游组件走 stderr）；llm_request 日志含完整 faucet key（agent 转发上下文，单用户面接受）；faucet CLI db add 在 cmd 下路径转义 bug（ia2 agent 自报绕过——上游，agent 已有自然 workaround）。
- QA P3-1（A3 等价断言）随下次探针维护批。

## 环境/流程事件
- PFdrill2 僵尸任务态复发一次（s80 家族），/End+/Run 处置序有效。
- 本机系统代理：s77 同族重现（proxy 开=goose 死）。测试期 ProxyOverride 追加中转 IP（对 goose 无效，机理已明）→ ProxyEnable=0（测试窗口）→ **已恢复 ProxyEnable=1 原状**（原值备份 tmp/s94/proxy-override-backup.txt；ProxyOverride 多追加的 111.228.54.166 保留无害——goose 走 env NO_PROXY 已绕开）。
- 沙盒树 ia1/ia2 保留至收尾统一清理（§8.1 整删）。

## 终态（iat4 出厂包从零终验全绿，04:2x）

- **iat4**（sha 9b974c3f，含全部两批+热修）→ ia4 全新解压冷启（系统代理保持开=全负例环境）：
  - F-6 首启即供给（.apikey 71B+key 鉴权 404=valid+provision 日志一条）✓
  - GUI 配置流：添加后拉 120 模型→勾 glm-5.3-flash→保存，切换 info 收敛为一条 ✓
  - 首任务全程渲染流健康（msgCount 5→6→7 渐进、agent 思路文本流式可见、终答「s94end candy 2 条+账留好」）= **F-11 出厂路径修复实锤**（对照 ia3 冻结在 5）✓
  - llm_request 全 glm-5.3-flash = **F-3 出厂路径修复实锤**（对照 ia2 全 mimo）✓（iat3 已验，iat4 同码）
  - 台账终态：s94end.candy 四键全亮（human「糖果库存表…」/ts/srcSid/srcTitle）✓
  - F-11 二轮根因（e03f511）：**向量二=ws 中途掉线重连不重订阅**——桥 drop() 摘死连接正确，前端 onopen 对 sessionId≠null 只 ensureWs 不订阅→新连接无成员籍→turn 帧按无订阅者丢弃（info/权限卡广播帧仍达=「看起来连着」）。修=onopen 重发 subscribe(sessionId)（复用既有协议，UI 无感）。判别探针修前红（CDP 实录零 turn 帧）/修后绿 3/3。七组沙盒排除链证明桥端无其余向量；`<-> 20260915` 为日志 slice(0,8) 截断非缺陷。
- 终态基线：**e2e-chat 61/61 + fuzz 190/190**（新 §24 model-fallback/§25 skill-desc + ia3-tinfo F-7 断言，只增不减）；ws-subscribe-race 24/24 锚点零适配。
- 环境：沙盒 ia1-ia4 整删（§8.1）+零进程零端口核对；启动器 TUI 窗口残留是目录占用元凶（停栈后窗口不关=新观察项）；PFdrill2 僵尸态复发一次 /End+/Run 处置；系统代理 ProxyEnable 已恢复 1（ProxyOverride 追加的 111.228.54.166 保留无害）；dev 栈终态 healthz 200。
- 遗留挂账：①热重启窗口内 in-flight subscribe(null) 静默丢弃（独立跟进）；②~~停止后启动器 TUI 窗口残留~~ → **s94-b3 已修（f2ae53b）**：根因=启动器尾部无条件 pause 占窗占目录；改 errorlevel 门控（正常停栈收窗/启动失败留窗可读日志），沙盒三循环 WIN-GONE+RENAME-OK+坏配置留窗实证；③faucet REST /api/v1/services 路由 404（版本路由面待核，非阻断）；④~~QA P3-1 探针等价断言~~ → **已修（51c52a6）**：A3b=台账 skill 集=={种子}∪实扫 origin:self 集，29→30ck，产品成功态不再假红；⑤QA P4-5 退化档热重启去重失效 → **已修（762eedc+ed097fb）**：sig2 与 spawnAcp 同源三级回落链，M9 桩测 12→13ck；⑥发布收尾仍挂用户（v0.9.13 release 草稿态处置+指纹更新——本会话 iat 系列不入 dist 发布序）。

## s94-b3 小批（05:2x 收口）

三只遗留项修复（见上②④⑤），全量 e2e 61/61+fuzz 190/190 只增不减。插曲：工程用 dev-stack-up.ps1 从提权会话重启 dev 栈触发 pg 拒管理员令牌 5 红（s67/s90 家族），按 PFdrill2 通道重拉后复跑全绿——**本机 dev 栈重启唯一正确通道=PFdrill2 任务**再实证。

## s94b 发布（06:1x，用户令「请发布一版」）

- v0.9.13 中止处置：删 release（id 389163812，资产/说明指纹不符）+ tag 留档；**v0.9.14 发布**（并入 s90-s94 全量）。
- 发布门（§8 出厂包全新解压冷装，C:\PF-TEST\rel）：冷启 3s/首启供给/welcome/五端点/停栈收窗（b3 出厂实证）/pg 零 FATAL/备份链/logscan 唯一良性 WARN——全绿，沙盒整删。
- 发布：tag+release+双资产（zip 323,590,457B / sha a7b9428c…）+正文精修稿 PATCH+API 对账（latest=v0.9.14，sha 资产=发布门包逐字节，exe 零尖峰）。可复现构建再证：release.sh 重打包同 sha。
- 环境：dev 栈复位（PFdrill2 /End+/Run）。
