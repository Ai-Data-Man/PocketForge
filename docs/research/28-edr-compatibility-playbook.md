# 企业 EDR 兼容性 playbook（P31 真机护航·开放问题#1）

日期：2026-09-13。来源=2026-09-13 web 检索（Microsoft Learn / Elastic 官方文档一手核对、GitHub API 一手 issue、厂商论坛一手帖；逐条 URL 见 §5）。验证等级按仓库三级制；厂商登录墙后的细节明示 UNVERIFIED。回答 STATE 开放问题#1「真实公司机 EDR 行为」的事前可推演部分：哪些行为可能触发什么、同类产品踩过什么坑、被拦后怎么申诉、需要 IT 放行时拿什么材料。产物两份：§2 出发前本机自检清单（模拟方法已验证可跑）、§3 企业 IT 沟通模板。

## 0. 结论先行

1. **便携形态的头号风险是三要素叠加，不是「便携」本身**：unsigned + 低流行度新 hash + 从用户可写目录运行。三者分别对应 Defender ASR 规则「prevalence/age/trusted list」（GUID 01443614…，官方原文见 §1.1）、勒索信誉防护「blocks files that don't yet have a positive reputation」、以及各 EDR 的 ML 启发式。**每次发新版 hash 都会重置信誉冷启动**——这解释了同类产品「旧版没事、更新后突然被杀」的普遍模式。
2. **我们的行为面（进程树 cmd→node→python、loopback 端口、自解压、写 %APPDATA%、junction）全部属于「被检测规则覆盖、但被厂商官方认定为合法开发者场景」的类别**（Elastic 官方规则 FP 注记原文，§1.1）。没有找到任何厂商对「写 %APPDATA%」「loopback 监听」设独立检测规则的公开证据——它们是低置信度启发式的加分项，不是独立触发器。结论：行为面风险=中低，入口风险（unsigned+新 hash）=高。
3. **唯一的结构性硬墙是应用控制策略（AppLocker/WDAC）**：官方默认规则只放行 Windows/Program Files 目录，社区标准加固模式=显式 Deny 用户可写目录 exe。若目标公司启用且无豁免通道，便携形态无法也不应绕过——唯一出路=IT 放行。零权限用户最可能撞上的限制面排序判断见 §1.4。
4. **MOTW（Zone.Identifier ADS）是被实证的误报放大器**：SentinelOne 2026-02 全网误报事件根因=云端 hash 黑名单打中了 MOTW 数据流本身（§1.1）。zip 下载→解压会传播 MOTW 到包内文件。可控、可检测、可清除（§2 S1）。
5. **同类产品无一幸免但全部存活**：LM Studio 被 Defender 删主进程文件（官方认 FP，esbuild 混淆触发启发式）、Everything 被 ESET/Cisco/Malwarebytes 轮番误报（ESET 官方确认+解锁）、嵌入式 Python/PyInstaller 是重灾区。存活模式=**官方发布 hash 清单 + 逐厂商申诉 + 公开文档指引**。教训直连我们：JS 侧**不要混淆打包**（可读性=降险）、hash 清单=申诉刚需材料。
6. 事前能推演的到此为止；EDR 真实策略在每家公司都是黑盒（CrowdStrike/SentinelOne 策略细节在登录墙后，一手不可得）。**开放问题#1 的最终裁决权在真机 A1 采集**，本文的价值=把真机上的意外变成「预期内的分支」。

## 1. 证据链

### 1.1 主流 EDR/Defender 对便携行为的已知反应

| 我们的行为 | 敏感度 | 证据（等级） |
|---|---|---|
| unsigned exe 从用户目录运行 | **高** | Defender ASR 规则「Block executable files from running unless they meet a prevalence, age, or trusted list criterion」：阻止「untrusted or unknown」exe/dll/scr 启动，依赖云保护，支持按文件夹/FQPN 排除（VERIFIED-DOC，learn.microsoft.com，ms.date 2026-09-09，URL 见 §5-A1）。注意该规则 **EDR alerts=N**（只弹用户通知不进 EDR 告警队列）——真机上用户看到弹窗≠安全团队收到告警，两边都要看。勒索防护规则原文「blocks files that don't yet have a positive reputation」「reputation and trust values incrementally increase as non-problematic usage increases」——**信誉随使用自动增长**，也即「新 hash 首日最危险」（同源 VERIFIED-DOC）。 |
| node/python 解释器从用户空间跑 | 中 | Elastic 官方检测规则「Suspicious Execution with NodeJS」的 FP 注记原文："Developer tooling, version managers, IDEs, package managers, and build/test runners can legitimately run node.exe from user-space"（VERIFIED-DOC，§5-A6）——检测规则覆盖此形态、官方承认合法，企业侧靠 FP 标注收敛。node.exe 被攻击者武器化是检测激进的背景（二手，§5-C7）。 |
| 进程树 spawn（cmd→node→python→工具） | 中 | Elastic 反弹 shell 规则=「shell 进程+TCP 连接」组合逻辑，FP 注记承认本地 dev server/调试器常触发（VERIFIED-DOC，§5-A7）；Splunk 有 cmd/PowerShell 被应用 spawn 的检测规则（VERIFIED-DOC，§5-A8）。纯进程树深度本身未见独立规则；**树形状+网络行为组合才是检测逻辑**。 |
| 自解压（SFX / 运行时落盘 exe） | 中（UNVERIFIED） | 未找到任何厂商官方文档独立讨论自解压检测；属「dropper 形态」启发式加分项的社区共识，无一手来源。真机观察项。 |
| junction/symlink 创建 | 低-中 | symlink 是高信号检测对象：Sigma 有 fsutil 修改 symlink 行为规则、Splunk 有「symlink→shadow copy 凭据窃取」检测（VERIFIED-DOC，§5-A9/A10）；Varonis GhostTree 研究=NTFS junction 滥用可挂起 EDR（二手研究，§5-C4）。**我们仅在安装目录内建 junction 指向包内路径，不指向系统对象**——不在已见检测规则的靶心，但「junction 创建」事件会被记录（EDR 遥测面，非告警面）。 |
| loopback 端口监听（8790/4222/5432…） | 低（UNVERIFIED） | 无厂商公开文档对「监听端口」设独立检测；仅作为组合特征参与（如反弹 shell 规则的网络连接维度）。真机护航清单 E-5 已有「EDR 对 localhost 出网反应」采集项，互补。 |
| 写 %APPDATA% | 低 | 无任何官方证据表明单独触发检测；微软自家产品（Teams 等）也写用户目录。我们包外足迹仅 %APPDATA%\Block（护航清单 B2），属正常形态。 |
| USB 场景（若用户从 U 盘直接跑） | 高 | Defender ASR「Block untrusted and unsigned processes that run from USB」：阻止从 USB 直接运行 unsigned exe，但官方原文「doesn't block the files from being copied from the USB drive to disk. It blocks the copied files from running from disk」——**拷到硬盘再跑不受此规则管**（VERIFIED-DOC，§5-A1）。分发指引应明确「先拷贝后运行」。 |
| 系统工具名冒用 | 中 | Defender ASR「Block use of copied or impersonated system tools」：非默认路径运行+启发式可拦合法第三方 exe，官方明示「A block indicates that the executable matched the rule criteria, not that the executable is necessarily malicious」（VERIFIED-DOC，§5-A1）。**雷区：便携包内不要出现 cmd.exe/csc.exe 等系统工具副本**；我们自带 node/python/pg 不在 System32 工具名单内，安全。 |

**MOTW 放大器**（单独列，因为可控）：SentinelOne 2026-02-02 事件=两分钟内全网大量「Malware」告警命中合法业务文件，threat name 形如 `文件名:Zone.Identifier`，根因是「SentinelOne pushed a block file hash for .Zone.Identifier. Microsoft does not uniquely hash that file for Mark of the Web」（VERIFIED-DOC，安全厂商一手分析，§5-A5）。启示：带 MOTW 的文件比不带的多一层被云端 hash 误伤的面。

**厂商策略文档可达性**：CrowdStrike 的 FP 提交/IOA 排除细节在 supportportal.crowdstrike.com 登录墙后（官方渠道存在=支持门户 case + VirusTotal 报告入口，VERIFIED-DOC，§5-A11）；SentinelOne 的 Detect（只告警）vs Protect（自动杀）模式是策略杠杆（二手，§5-C5）。两家具体默认策略=UNVERIFIED，真机才知道。

### 1.2 同类便携/绿色软件的误杀实录

**LM Studio（Electron 应用，最接近我们的形态）**——VERIFIED-DOC（GitHub API 一手，§5-B1）：
- 2026-03-24 issue #1686：v0.4.7 更新后 Defender 检出 `Trojan:JS/GlassWorm.ZZ!MTB` 并**删除文件致程序不可用**；命中文件=`resources\app\.webpack\main\index.js`（Electron 主进程 bundle，~14MB）。
- VirusTotal 1/62 仅 Microsoft 检出=典型单引擎启发式误报。
- 官方回复原文："We do not use LiteLLM. We are investigating this report with priority. We currently believe it is a false positive."
- 社区归因：esbuild/Vite 打包产生的混淆样式（rotating string array + `_0x` 标识符）与恶意混淆共享特征，触发启发式。
- **对我们的直连教训：forge 侧 JS 不做混淆/压缩打包（现状即如此），保持可读=降误报+升申诉可信度**；issue 区还出现「为什么不开源让它可审计」的舆论压力——可审计形态在 FP 争议时是信用资产。

**Everything（voidtools，资深便携软件）**——VERIFIED-DOC（官方论坛/厂商论坛一手，§5-B2-B5）：
- 1.4.1.1025 被 Cisco Secure Endpoint 隔离——该版**只是本地化更新**，作者上报 Cisco 后解决（官方论坛 t=15427）。
- ESET 拦截运行：ESET 官方在自家论坛确认 FP 并「unblocked the file in LiveGrid」（forum.eset.com/topic/41916）——**厂商云信誉解锁是申诉的产出物**。
- Malwarebytes 确认 FP 并修检测（forums.malwarebytes.com/topic/299863）。
- 官方应对基建：downloads 页发布 SHA256 供校验；论坛指引「hash 与官方一致→按 FP 上报厂商；不一致→怀疑供应链」。
- 模式：**误报是常态不是事故，存活靠官方 hash 清单+作者代报+逐厂商跟进**。我们已有 .sha256 随包（护航清单 0.1），方向正确。

**嵌入式 Python 运行时**（我们的 python 分发同族）——VERIFIED-DOC/二手（§5-B6/B7）：PyInstaller 自解压 exe 与携带完整 python.exe 的桌面应用（EasyPyDesktop 实例）被 Malwarebytes 等按「trojan」误报，Malwarebytes 论坛有 developer report 流程。**自研进程树携带官方原版 python.exe/node.exe 比魔改/打包混合体更不易误报**（原版二进制=厂商已知 hash）。

### 1.3 规避雷区的合法实践（无签名条件下）

1. **不混淆、不复刻系统工具名、不 packer 加壳**——三条都是启发式加分项，我们零成本避开（§1.2 LM Studio 教训+§1.1 系统工具规则）。
2. **白名单三键的权衡**（社区共识+官方能力印证，二手-实践，§5-C1/C2）：
   - **hash**：最精确但每次发版失效——IT 需要逐版登记；Defender file allow indicator 官方支持按 hash（VERIFIED-DOC，§5-A3）。
   - **publisher/证书**：跨版本稳定——**我们无签名，此路不通**；Defender 也支持 .CER/.PEM 证书 indicator（同源）。
   - **path/文件夹**：最弱（可被投放滥用），但对企业内「自用工具」场景常是 IT 实际愿意给的方式（Defender 文件夹排除/ASR per-rule exclusion 官方支持，§5-A1/A3）。
3. **申诉渠道惯例**：
   - Microsoft：Security Intelligence 提交门户有 **Software developer 身份**（"Software providers wanting to validate detection of their products"，VERIFIED-DOC，§5-A4）——发布者视角可主动送检自证；企业侧 admin 也可在 Defender portal submissions 提交（§5-A3）。提交需检测名+引擎版本+说明；优先级：High=两小时响应（紧急用）。
   - CrowdStrike：支持门户 case（登录墙）+ VirusTotal 上对其 ML 引擎的 FP 报告入口（§5-A11）。
   - SentinelOne：企业管理员建 exclusion（路径/证书/Packaging）；行为类 FP 走 support（二手，§5-C5/C6）。
   - ESET：LiveGrid 云端解锁（Everything 实例，§5-B3）。
4. **Defender 官方处置顺序**值得抄进我们的沟通话术（VERIFIED-DOC，§5-A3）：先分类标注 FP（帮助引擎学习）→ 撤销隔离（Action center）→ allow indicator（临时缓解）→ 提交分析（根治）→ 排除项最后用（官方原文「Every exclusion lowers your level of protection」——向 IT 申请时主动承认这点，把文件夹排除作为「最小代价选项」而不是「应该的」）。

### 1.4 Windows 企业限制面族谱（零权限用户撞墙排序）

| 限制面 | 对便携 exe 的效果 | 撞上概率判断 | 等级 |
|---|---|---|---|
| Defender AV 实时保护+云信誉（默认就开） | 新 hash 首启可能被拦/慢扫/偶发误报（§1.1） | **最高——即使无任何企业策略也存在** | VERIFIED-DOC |
| ASR 规则（需企业配置，默认未启用） | 规则 01443614 直击 unsigned 用户目录 exe | 中；开 ASR 的企业多是 Intune 管理规范公司 | VERIFIED-DOC（规则行为）+ UNVERIFIED（普及率） |
| AppLocker（需企业配置） | 默认规则只放行 Windows/Program Files；**默认 deny 语义=集合启用后无匹配即拦**（官方：「these rules are only meant to function as a starter policy」，且官方点名 Windows\Temp 用户可写是漏洞，§5-A2）。社区标准加固=显式 Deny `*\Users\*\AppData\*` 等用户可写路径（二手，§5-C3） | 中；启用 AppLocker 的公司里便携软件基本活不了，除非豁免 | VERIFIED-DOC（机制）+二手（加固模式） |
| WDAC/App Control for Business | 策略化默认拒绝一切未签名/未批准代码，比 AppLocker 更硬（官方推荐替代品） | 低-中；启用门槛高但增长中 | VERIFIED-DOC（定位）+ UNVERIFIED（普及率） |
| SRP（软件限制策略，旧技术） | 老域环境仍存在，路径/哈希规则 | 低（存量旧环境） | 二手 |
| SmartScreen | 下载未签名文件时浏览器/资源管理器弹「更多信息才能运行」——**不拦已解压目录内的文件执行**（MOTW 驱动） | 高（首次下载时），但仅用户体验级摩擦 | VERIFIED-DOC（MOTW 机制）+ UNVERIFIED（解压传播版本边界） |

微软自家佐证：Teams 的 AppLocker 官方文档写「We don't recommend the use of path rules because the Teams installation directory is user-writable」（§5-A2b）——**连微软自家用户目录应用都在被这类策略误伤**，用户目录=雷区是平台级事实。

**排序结论**：零权限用户最可能先撞 Defender 云信誉（必然）→ 再撞 SmartScreen 下载闸（大概率，仅摩擦）→ 再撞 ASR/AppLocker（取决于公司成熟度）。「零权限」本身与 EDR 误杀无强相关——拦不拦取决于策略，不取决于权限。

## 2. 产物一：出发前自检清单（本机可模拟）

设计原则：真机只有一次机会且变量不可控（STATE 开放问题#1），出发前把「我们自己这侧的可控变量」全部锁死+把「行为面自证材料」备好。每项标注模拟方法；S1/S2/S5 的探测命令已于 2026-09-13 在 devbox 验证可跑（Defender 4.18.26080.3 实时保护开、本机无 ASR 配置无排除路径——干净基线，VERIFIED-RUN）。

| # | 检查什么 | 模拟方法（已验证/待跑） | 判定与动作 |
|---|---|---|---|
| S1 | **MOTW 传播面**：分发 zip 经下载→解压后，包内 exe/js 是否带 Zone.Identifier | 模拟完整链：把 dist zip 从浏览器（或 curl 后用 `Unblock-File` 对照）重新下载到新目录→Explorer 右键全部解压→`Get-ChildItem -Recurse | Get-Item -Stream Zone.Identifier -ErrorAction SilentlyContinue`（ADS 探测命令已在 devbox 验证，zip 本体在生成侧无 ADS，VERIFIED-RUN） | 若传播：护航清单 B1 改为「解压后先跑 `Unblock-File -Path * -Recurse` 或用不传播 MOTW 的解压路径」；同时把「下载渠道建议直链而非网盘中转」写入用户须知。注：Explorer 解压是否传播 MOTW 随 Windows 版本而变（UNVERIFIED 版本边界），S1 就是来测它的 |
| S2 | **Defender 对我们包的静态/首启反应基线** | devbox 上（无排除路径、实时保护开）：①`Get-FileHash` 取全部 exe 清单；②VirusTotal **先查 hash 不传样本**（`virustotal.com/gui/search/<sha256>`，隐私优先）；③解压到 `C:\Users\<user>\` 下新目录→双击启动→计时首启（对照护航清单 A4 的 1-3 倍参照）；④`Get-MpThreatDetection` 看有无检出记录 | VT≥2 家检出→发版前逐家申诉（§1.3 渠道）；仅 1 家（Microsoft）→走 wdsi developer 提交；0 家→静态面干净，剩余风险只在行为启发式 |
| S3 | **ASR 规则影响面演练**：规则 01443614 在 audit 模式下会不会命中我们的进程树 | devbox 管理员 PowerShell：`Set-MpPreference -AttackSurfaceReductionRules_Ids 01443614-cd74-433a-b99e-2ecdc07bfc25 -AttackSurfaceReductionRules_Actions AuditMode`→跑完整启动链+一次冒烟任务→事件查看器 `Microsoft-Windows-Windows Defender/Operational` 查事件 1122（audit 命中）→跑完 `..._Actions Disabled` 还原。同时演练勒索规则 `c1db55ab-c21a-4637-bb3f-a12568109d35` audit | 有命中→记录命中进程与场景，真机被拦时直接对号入座（省一次猜测）；无命中→ASR 面风险下调。**注意：audit 演练后必须还原**（本机基线当前为空配置，还原即回基线） |
| S4 | **行为面自证材料**（= §3 沟通模板的附件） | Process Monitor 过滤我们的进程树跑一轮完整任务：产出①写盘范围清单（应全部在包目录+%APPDATA%\Block）②注册表零写③网络连接清单（应=loopback 监听集+显式外联 LLM API）④进程树快照。与真机护航清单 B2/D9 的零污染验收同源 | 材料入 `docs/research/` 附件或 dist 随包 `SECURITY-NOTES.md`；IT 审批周期里这份材料决定成败（§1.3：企业最缺的就是行为清单） |
| S5 | **EDR 指纹识别预案**（真机 A1 的执行手册化） | 准备只读探测命令清单（真机上以能跑通为准）：`tasklist /svc`、`Get-Service | Where Status -eq Running`、常见对照表：WinDefend=Defender（官方）；CSFalconService=CrowdStrike、SentinelAgent*=SentinelOne、CbDefense=Carbon Black、TmListen*=Trend（**此表为社区常识，UNVERIFIED**，真机以进程签名/路径为准） | 护航清单 A1 从「记 EDR 产品名」细化为「跑这套命令+对照表」；识别出厂商→立即套用 §1.3 对应申诉/豁免预案 |
| S6 | **hash 清单与版本绑定** | 每个发行版：`Get-FileHash -Algorithm SHA256` 输出全部 exe（node/python/pg/goose/process-compose/主程序）→存 `dist/<ver>.sha256-manifest.txt`（现有 .sha256 只覆盖 zip 整体，**exe 级清单是 IT 放行登记的粒度**） | 白名单三键里我们只能给 hash/path（无签名）——hash 清单是刚性材料，缺它 IT 无法登记 |
| S7 | **分发链路 MOTW 最小化** | 对照 S1 结果固定推荐链路：公司内网直链/USB 拷贝 zip→解压→跑；**禁止**「网盘下载 exe 单文件」形态。检查 welcome/文档中的下载指引措辞 | 与 S1 联动收敛；「从 U 盘直接跑」路径明确写「先拷到硬盘」（§1.1 USB 规则原文） |

止损说明：S1-S7 全部为本机可控，无一项依赖真实 EDR——真机才能回答的部分（策略成熟度、告警形态、IT 反应）不假装能预演。

## 3. 产物二：企业 IT 沟通模板

**何时用**：真机护航中出现拦截/隔离（先走申诉再走本模板），或用户主动提出「想在公司电脑长期用，帮我问问 IT」。

**申请材料清单**（对照 §1.3 官方要求反推）：
1. 工具用途一段话（业务价值，非技术）。
2. 形态说明：免安装绿色软件，解压到用户目录运行，**不写注册表/PATH/服务/计划任务**，删除目录即完全卸载。
3. 行为清单（S4 产出）：进程树、监听端口（全部 loopback）、外联目标（仅 LLM API 显式域名）、写盘范围、零持久化点。
4. **exe 级 SHA256 清单**（S6 产出）+ 版本号 + 官方分发渠道。
5. 无签名声明+替代保证：无代码签名证书，因此提供 hash 清单与行为自证材料；如需可提供完整包供沙箱 detonation。
6. 请求的放行方式（按 IT 代价从低到高给选项，主动示弱）：
   - 选项 A：按 hash 登记 file allow（每版本更新一次）；
   - 选项 B：安装目录文件夹排除/ASR per-rule exclusion（注明微软官方提示「every exclusion lowers protection」，限定单目录+只读用途可缓解）；
   - 选项 C：安全团队沙箱审查后自行决定。
7. 联系人+版本更新时的通知义务（主动承诺发新版 hash 清单）。

**模板正文**（可直接给用户改写）：

> 主题：申请放行一个便携式办公工具（PocketForge）
>
> 你好，IT 团队：
>
> 我需要在工作电脑上使用一个免安装的 AI 助手工具（PocketForge），用于【业务用途，一句话】。它是一个绿色软件：解压到我的用户目录即可运行，不需要管理员权限，不写注册表/系统 PATH/不装服务/不建计划任务，删除文件夹即完全卸载。
>
> 它的运行行为我已整理成附件清单：会启动自带的 node/python/PostgreSQL 进程（仅监听本机回环端口，不对外开端口）；对外只访问我配置的大模型 API 域名；所有数据写在安装目录内。
>
> 附件包含：全部可执行文件的 SHA256 清单、行为明细、当前版本号。该软件无代码签名，因此提供 hash 清单供登记。如果需要整包做沙箱检测，我可以提供下载渠道。
>
> 希望能按文件 hash 白名单或安装目录例外的方式放行；后续版本更新时我会主动提供新 hash 清单。如果需要更多信息或需要我走其他审批流程，请告诉我。
>
> 【姓名/部门/日期】

**话术红线**（内部纪律，写给护航者自己）：
- 只说「申请白名单/放行」，永远不说「绕过 EDR」；
- 不替 IT 做决定（不给「你应该排除这个文件夹」的命令式表述）；
- 被拒不是失败结局：记录拒绝理由回填 STATE（这就是开放问题#1 的数据），公司机跑不了=产品边界事实。

## 4. 排除了什么、怎么排除的

- **未找到**：任何厂商公开文档将「loopback 监听」「写 %APPDATA%」「自解压」列为独立检测触发器——检索覆盖 learn.microsoft.com ASR/Defender 全参考、Elastic detection rules、Sigma 规则库、Splunk research；该三行为仅以组合特征出现。结论「非独立触发器」是**证据缺失型结论**，非证明不存在。
- **无法一手核实**：CrowdStrike/SentinelOne 的默认策略与 FP 处理细节（登录墙）；两家的行为面判断依赖社区+渠道存在性证据，全部标注。
- **未做**：本机未实际执行 S2-S7（本次只验证了命令可跑性与基线状态）；ASR audit 演练（S3）会临时改 Defender 配置，留作护航前专项执行，不在本轮调研内偷跑。
- **来源甄别**：qwe.edu.pl 等内容农场型「LM Studio 误报教程」未采信（只引用其指向的官方 issue/文档原文）；「CrowdStrike 零误报」press release 只作背景不作依据。

## 5. 来源清单

**A. 一手官方/实证（VERIFIED-DOC，除单独标注外）**
1. ASR rules reference（含规则 01443614/b2b3f03d/c1db55ab/c0033c00 原文、USB 拷贝例外、信誉增长机制、per-rule exclusion）——https://learn.microsoft.com/en-us/defender-endpoint/attack-surface-reduction-rules-reference（ms.date 2026-09-09）
2. AppLocker default rules（starter policy 定位+Windows\Temp 用户可写警告）——https://learn.microsoft.com/en-us/windows/security/application-security/application-control/app-control-for-business/applocker/understanding-applocker-default-rules（ms.date 2024-09-11）；三条默认规则内容（Program Files/Windows/Administrators）由 learn.microsoft.com 搜索摘要+Microsoft Q&A 双源印证
2b. Teams AppLocker 文档（用户可写目录=path 规则雷区，微软自家产品自证）——https://learn.microsoft.com/sv-se/MicrosoftTeams/applocker-in-teams
3. Defender FP 处置五步工作流+allow indicator 类型（files/IP/certs）+「Every exclusion lowers protection」——https://learn.microsoft.com/en-us/defender-endpoint/defender-endpoint-false-positives-negatives（ms.date 2026-09-01）
4. Microsoft Security Intelligence 提交门户（developer persona/优先级/50MB/密码 infected）——https://www.microsoft.com/en-us/wdsi/filesubmission
5. SentinelOne Zone.Identifier 误报事件分析（2026-02-02，根因=云端 hash 打 MOTW 流）——https://www.criticalpathsecurity.com/sentinelone-detection-anomaly-involving-zone-identifier-metadata/
6. Elastic「Suspicious Execution with NodeJS」规则+官方 FP 注记（node 用户目录执行=合法场景原文）——https://www.elastic.co/guide/en/security/8.19/suspicious-execution-with-nodejs.html
7. Elastic 反弹 shell 检测规则（shell+TCP 组合逻辑+dev tooling FP 注记）——https://github.com/elastic/detection-rules/blob/main/rules/cross-platform/execution_revershell_via_shell_cmd.toml
8. Splunk「Suspicious React or Next.js Child Process」检测——https://research.splunk.com/endpoint/baa80bc8-7c9c-4395-b458-b69feb92830a/
9. Sigma 规则「fsutil symlink 行为修改」——https://detection.fyi/sigmahq/sigma/windows/process_creation/proc_creation_win_fsutil_symlinkevaluation/
10. Splunk「Credential Dumping via Symlink to Shadow Copy」——https://research.splunk.com/endpoint/c5eac648-fae0-4263-91a6-773df1f4c903/
11. CrowdStrike 官方联系页（FP=support portal case+VirusTotal 渠道存在性）——https://www.crowdstrike.com/en-us/contact-us/

**B. 同类产品一手实录（VERIFIED-DOC）**
1. LM Studio issue #1686（GitHub API 一手：Defender 删 Electron 主进程、VT 1/62、官方「we currently believe it is a false positive」、esbuild 混淆归因）——https://github.com/lmstudio-ai/lmstudio-bug-tracker/issues/1686（2026-03-24，47 评论）
2. Everything 1.4.1.1025 被 Cisco Secure Endpoint 隔离（仅本地化更新中招）——https://www.voidtools.com/forum/viewtopic.php?t=15427
3. ESET 拦 Everything+官方 LiveGrid 解锁——https://forum.eset.com/topic/41916-everything-by-voidtools-is-prevented-from-working/
4. Malwarebytes 确认 Everything FP——https://forums.malwarebytes.com/topic/299863-false-positive-for-everything-1411024x64-setupexe/
5. voidtools 官方下载页 SHA256 清单与 FP 处置指引——https://www.voidtools.com/downloads/ + https://www.voidtools.com/forum/viewtopic.php?t=1115
6. Malwarebytes 论坛嵌入式 Python 桌面应用 FP（developer report 流程实例）——https://forums.malwarebytes.com/topic/332638-false-positive-easypydesktopexe-developer-report/
7. PyInstaller 误报模式（二手教程，仅作现象印证）——https://python.plainenglish.io/python-pyinstaller-exe-false-positive-as-trojan-virus-resolved-abd13cb0f314

**C. 二手/社区（标注使用）**
1. r/sysadmin 白名单三键权衡（signature 跨版本/hash 逐版/path 最弱）——https://www.reddit.com/r/sysadmin/comments/3sf2tg/using_software_restriction_policies_is_there_a/
2. CrowdStrike 白名单概念页（hash/证书/路径分类）——https://www.crowdstrike.com/en-us/cybersecurity-101/observability/application-whitelisting/
3. AppLocker 加固实践：「Allow Executables Only Outside of User Profile」模式——https://community.spiceworks.com/topic/1008461 + 默认规则可绕过 PSA（Reddit r/sysadmin dvu43i）+ Helge Klein《AppLocker 常见问题》https://helgeklein.com/blog/applocker-solutions-to-common-problems/
4. Varonis GhostTree（NTFS junction 滥用与 EDR 相互作用研究）——https://www.varonis.com/blog/ghosttree-ntfs-trick
5. SentinelOne Detect vs Protect 模式说明——https://helpdesk.sherweb.com/en-us/knowledge-base/articles/KA-03929
6. SentinelOne 行为类 FP 处置实例（MCBSys）——https://www.mcbsys.com/blog/2022/06/handling-sentinelone-behavioral-false-positives/
7. node.exe 被武器化背景（检测激进化的动因）——https://securityarsenal.com/blog/nodejs-runtime-abuse-detecting-and-blocking-nodeexe-malware-delivery-in-targeted-attacks

**D. 本机实证（VERIFIED-RUN，2026-09-13，devbox）**
1. Defender 平台 4.18.26080.3、实时保护开、无 ASR 规则配置、无排除路径——S2/S3 的干净基线。
2. `dist/PocketForge-20260912-v0.9.11.zip` 生成侧无 Zone.Identifier ADS（仅 :$DATA 主流）——MOTW 只会在「下载」链路引入，S1 的对照起点。
3. `$var` 在 bash 内联 PowerShell 中会被转义层吃掉——探测一律走 .ps1 脚本文件（tmp/edr-probe.ps1），已回收可复用。

## 6. 回填约定

- 真机护航 A1 识别出 EDR 厂商→S5 对照表补签名级验证并升级为 VERIFIED-RUN；
- 真机任何拦截/隔离→回填 §1.1 对应行为行（预期内/预期外）+走 §1.3 渠道+§3 模板；
- S2-S7 执行结果→本文 §2 表格补「已跑+日期」列；
- STATE 开放问题#1 的关闭依据=真机数据，本文只是事前地图，不代裁决。
