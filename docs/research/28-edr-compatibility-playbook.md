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

## 7. 升级与 EDR（补篇，2026-09-13）

背景：§1 已实锤「每次发新 hash 信誉冷启动重置」，而我们内置自动升级器（ADR-0009；`forge/conf/templates/update-runner.tpl.js`：GitHub 下载 zip→sha256 校验→python zipfile 解压→**逐文件 sha256 差量应用**→重启→失败回滚）——升级动作本身在用户机引入多少新 hash，直接决定 EDR 风险尖峰是「等同首装」还是「远小于首装」。ADR-0009 的复核条件原文「企业 EDR 对『下载+自我替换+外联 GitHub』报警」即本节要预演的对象。方法：本机对 5 个真实 dist zip 做逐文件 hash 对照实验（VERIFIED-RUN）+ web 一手检索；既有 §0-§6 结论不受本节影响（只收窄 §1.1「新 hash 首日最危险」在我们差量机制下的实际口径）。

### 7.0 结论先行

1. **实测反直觉：差量升级几乎不引入新 hash**。真实升级路径 v0.9.10(0906)→v0.9.11(0912)：新树 25,293 文件中 25,274 个 hash 不变（99.9%），**全部 54 个 .exe 字节级不变**，实际写盘仅 18 个纯文本文件（约 1MB；971MB 原样留在盘上连 mtime 都不动）。升级的 EDR hash 尖峰 ≠ 首装——「新版本=全量新 hash」的恐惧对差量机制不成立（§7.1）。
2. **但风险转移为三类，不是消失**（§7.4）：①每次仍有 ~十几个新 hash 的 JS/YAML 冷启动——LM Studio 中弹的恰是 14MB 主进程 JS bundle，文本大文件同样是 ML 靶子（我们的是 KB 级小文本，命中面小得多）；②升级**行为**本身：detached node 进程全树 35K 文件读 hash（数分钟）+ 批量备份复制 + 批量删除（本次实测 3,706 个）+ 自我替换 update-runner.js——「批量读+批量删+自改写」与 dropper/勒索预备形态相似，未见公开独立检测规则（证据缺失型结论，真机观察项）；③54 exe 零换 hash 的前提是**运行时版本钉死**——一旦 bump node/python/pg 版本，全量 exe 换 hash，那一刻才是真尖峰。
3. **SmartScreen/MOTW 面在升级路径结构性缺席**（本机三连实验，§7.1）：node https.get 下载不写 Zone.Identifier、python zipfile 解压不传播 MOTW（即使暂存 zip 带 MOTW）、dist 生成侧无 ADS（§5-D2）——升级路径的对手只有 Defender 云/ASR 与三方 EDR；SmartScreen 只咬浏览器首装下载。
4. **信誉预热无捷径（官方口径）**：unsigned 每个新版本从零信誉；达标无精确阈值，官方量级=「数周+数百次干净安装」；consumer 侧**无人工提交通道**（信誉只随下载量有机增长）；**EV 证书「即时信誉」已被微软取消**（签名≠豁免，官方明说签名文件在证据攒够前仍可弹窗）。官方推荐的预热方法=灰度/内测放量+提前告知用户可能见提示（§7.3）。
5. **同类更新误杀实录（补 §1.2）**：Jan 0.4.4 被 Bitdefender 自动隔离→官方 23 分钟内回滚版本并发布公告（含「CI 构建机产物被标、同一代码换 GitHub runner 重构建即不被标」的构建环境归因）；Docker Desktop 4.3.1 的 **delta 更新器临时文件被 Defender 拦而全量安装器无事**（差量制品的反向案例）；Obsidian（已签名）1.8.3/1.8.4/1.13.4/v0.15.9 四波更新 FP；Rufus 长期 unsigned 姿态+公开 FP 政策，3.15 签名后 FP 显著减少但未绝迹。**无一靠绕过，全部靠快速公告+hash 清单+逐厂商申诉存活**（§7.2）。
6. **升级期文案有官方背书的先例**：微软官方建议开发者「告知早期用户可能看到 SmartScreen 提示」；JetBrains 2019.2 起产品内置 Defender 干扰检测并引导用户加排除——「明说杀软可能误报」不是自曝其短，是官方推荐动作（§7.5）。

### 7.1 本机一手实验（VERIFIED-RUN，2026-09-13，devbox，脚本 tmp/zip-hash-diff.py 等）

| # | 实验 | 方法 | 结果 |
|---|---|---|---|
| E1 | **真实 dist zip 逐文件 sha256 对照** | 5 个历史包（v0.9.9 / v0.9.10×2 / v0.9.11×2）全条目解压流式 hash，按 update-runner 的 walkMap 语义比对 | 升级路径 v0.9.10→v0.9.11：zip 内 15 改+4 增，**盘上实际应用 18 个**（custom_providers/forge-router.json 被 PROTECTED 跳过）、删除 3,706 个（bin/vendor/ node_modules 瘦身；permission.yaml 被 PROTECTED 跳过——与 runner 注释互证）。必换清单全部为文本：VERSION、bin/chat-bridge.js、**bin/update-runner.js（升级器自我替换）**、conf/bootstrap.ps1、conf/templates/×9、.agents/×1、vendor-licenses/×1、使用说明.md。**54 个 .exe（node/python/pg×5/goose/process-compose/faucet/nats×2/site-packages 脚本垫片）hash 全稳定**。同版本重构建 churn 仅 8/1 个文件→构建近确定性，hash 稳定是结构性（钉版本+模板内容稳定），不是运气 |
| E2 | **python zipfile 解压是否传播 MOTW** | 给 zip 打 Zone.Identifier（ZoneId=3，模拟浏览器下载件）→ 用 runner 同款 `zipfile.ZipFile().extractall()` 解压 → 探测 ADS | 解压产物 0 个带 MOTW。**即使暂存 zip 带 MOTW，应用落盘的文件也无 MOTW**（对照：Explorer 解压会传播，§2-S1 首装路径才是 MOTW 风险面） |
| E3 | **node https.get 下载是否产生 MOTW** | runner 同款 https.get 落盘真实文件 → 探测 ADS | 无 Zone.Identifier（MOTW 由浏览器/Shell 附件服务写入，raw socket 下载不经此路径）。**在线升级下载的 zip 天然无 MOTW** |

实验边界：devbox 无 EDR；E1 的 hash 稳定结论仅对「运行时版本不 bump 的窗口」成立。

### 7.2 Q1：同类产品更新误杀实录（补 §1.2，均 VERIFIED-DOC 除标注外）

| 产品/事件 | 实录 | 厂商怎么指导 |
|---|---|---|
| **Jan 0.4.4**（2024-01-09，Tauri 形态） | Bitdefender `Gen:Variant.Tedy.258323` **自动隔离**（Defender/McAfee 不触发；跨 3 家公司多机复现）。issue：github.com/janhq/jan/issues/1483 | **23 分钟内回滚版本**（02:18 首报→02:41 revert，官方事故报告 jan.ai/post/bitdefender）；根因实验：CI 自建 agent 构建的二进制被标，**同一代码在 GitHub hosted runner 重构建即不被标**（构建机指纹影响检测）；行动项=发布前 AV×版本测试矩阵+**pre-release 阶段与 AV 厂商协作**；官方博客 Lesson 6=教育用户 FP 处理 |
| **Docker Desktop 4.3.1**（2021-12，有签名——签名状态为社区公知 UNVERIFIED） | **delta 更新器**解到 %TEMP% 的临时文件被 Defender `Trojan:Script/Oneeva.A!ml` 拦截致更新失败；全量安装器不受影响。issue：github.com/docker/for-win/issues/12447 | 维护者确认「false positive in our delta updater 4.3.0 -> 4.3.1」→ 上报杀软厂商 + 指导用户**手动跑全量安装器**作 workaround。两点教训：①签名产品照样中（签名≠豁免的又一实证）；②**二进制差分包制品本身可比全量包更可疑**——我们「全量 zip+hash 跳过」不产生 patch blob，恰好规避此类 |
| **Obsidian**（签名 Electron+便携使用广泛） | 1.8.3/1.8.4 被 Defender 检出（forum.obsidian.md/t/virus-found-in-obsidian-1-8-3-and-1-8-4/95827）；1.13.4 安装器 VT 复核 FP（/t/resolve-spurious-virus-detection-in-installer/116963）；v0.15.9 Dr.Web（/t/trojan-found-in-obsidian-v0-15-9-installer/41035） | 论坛指引=VT 复核+向 Microsoft 报 FP+等签名更新；社区经验「一两天内随定义更新自愈」（Prisma issue #29636，二手） |
| **Rufus**（长期 unsigned，同我们姿态） | Defender `Trojan:Plutruption!`/`Trojan.Vigorf!`（issue #1169）、多引擎（#433，早期 UPX 加壳触发——印证 §1.3「不加壳」）；Malwarebytes 持续标记 CI 未签名构建（forums.malwarebytes.com/topic/288934） | 作者公开 FP 政策 wiki（github.com/pbatard/rufus/wiki/FAQ：要求 AV 厂商给出技术细节，否则视为 FUD）；3.15 起签名后 FP 显著减少但未绝迹——**签名的边际收益真实但非豁免** |
| **Etcher** | #4164 Malwarebytes 标记；#862 Webroot 在点 flash 时对写入 %TEMP% 的文件报 `Trojan.Dropper.Gen`（「写 TEMP+执行」行为面）。github.com/balena-io/etcher/issues/4164、#862 | 官方论坛回应「启发式猜测，FP 常见」+建议报厂商 |
| Discord/Squirrel 家族（二手，选录） | Update.exe 长期被用户当病毒举报（desktop/desktop#5884、r/discordapp） | ——「更新器下载+替换二进制」这个动作本身就是用户信任雷区，与是否真检出无关 |

与 §1.2 合并的纵向结论：**LM Studio（0.4.7 更新后删主进程 JS）、Everything（仅本地化更新的版本中招）与本节五例共同构成「更新即误杀窗口」的行业常态**；无一例通过「绕过」解决，全部通过「版本回滚或快速公告 + hash 清单 + 厂商申诉/预沟通」存活。

### 7.3 Q2：信誉预热的官方口径（核心来源 Microsoft Learn《SmartScreen reputation for Windows app developers》，ms.date 2026-05-04，VERIFIED-DOC）

1. **unsigned 冷启动机制原文**："When a file is not signed, SmartScreen reputation must build for each new version of your files, starting with zero reputation. Reputation cannot transfer from previous versions unless both were signed using the same publisher identity."——不能跨版本继承，每版从零。
2. **达标时长无 SLA，只有量级**："There is no exact threshold, but it can take several weeks and hundreds of clean installs from a wide audience."——**数周+数百次干净安装**。这是全部公开来源里最接近「预热时长」的官方说法。
3. **无人工预热通道（consumer）**："There is no need (or mechanism) to manually submit a file for SmartScreen reputation review for consumer endpoints. Reputation builds organically through download volume."——信誉只随下载量有机增长；企业侧例外：admin 提交可为 managed 设备加速（同文档）。
4. **EV 签名豁免已取消**："Years ago, signing files with an EV code signing certificate would result in positive SmartScreen reputation by default. **This is no longer the case.**"且签名文件"could still show a SmartScreen warning until its hash or publisher certificate accumulates sufficient evidence"（DigiCert 官方 alert 与 ToDesktop PSA 印证）。**结论对我们的含义：将来上签名值得（Rufus 实录边际收益），但别指望签名解决冷启动——差量保 hash（§7.1）比签名更直接。**
5. **Smart App Control 注意点**（同文档）：Win11 全新安装默认开启的 SAC 对 unsigned 可执行文件「blocks execution unless positive reputation」且**不依赖 MOTW**（管全部可执行文件）。当前升级路径 0 个新 exe→不触发；**未来 bump 运行时版本=54 个新 unsigned exe，SAC 开启的用户机可能直接 block**——真机观察项。
6. 与 §1.1 的关系：ASR 01443614 的 prevalence/age/trusted 判定走 Defender 云保护，同源「新 hash 最危险」逻辑；wdsi developer 提交（§1.3-A4）解决的是「误报判定」，不直接搬 prevalence——两者是并行通道。

### 7.4 Q3：增量 vs 全量的工程对冲（落到我们的差量机制）

1. **行业两极与我们所在**：Electron 主流（Squirrel/electron-updater）=全量替换 app 目录→每次更新全部文件重写（新 hash+新 mtime 面最大化），靠签名与流行度硬扛；Everything=单 exe 每版必新 hash，靠作者逐版申诉+hash 清单扛（§1.2）。**我们=第三条路：全量 zip 分发+逐文件 hash 跳过应用**——不产生 Docker 式可疑差分 blob，又继承 54 个 exe 的既有 hash 信誉（E1 实测），两头收益都占。
2. **「更新后首启慢/重扫」是被官方产品承认的现象**：Electron#1487（AV 拖慢启动的基准 issue）；JetBrains 2019.2 起内置 Defender 干扰检测+自动排除功能（官方 YouTrack SUPPORT-A-1681：youtrack.jetbrains.com/articles/SUPPORT-A-1681；SO 实例：PyCharm 19.1.2→19.2.0 更新后即弹 Defender 性能警告）。映射到我们：升级后新 18 文件+重启栈=一次秒级首启扫描，真正的耗时大头是**升级前的 35K 文件全树 hash 预扫**（ADR-0009 已知数分钟，20min 总超时已兜底）——升级时长预期文案已有基础，无需新增机制。
3. **未变文件连 mtime 都不动**（E1：hash 相同即不 copyFileSync）——规避「用户目录新落盘 exe」类启发式的重置（该类规则存在性 UNVERIFIED，但零成本获益）。同版本重构建 churn=1-8 文件→**构建环境漂移检测是免费的哨兵**（Jan CI 构建机被标案例的反向应用）。
4. **差量保留策略的现实核对**（E1 实测互证）：PROTECTED 名单是用户侧稳定锚（config.yaml/custom_providers/memory/permission.yaml 升级不触碰——permission.yaml 在 v0.9.11 包中缺席但盘上保留，实测确认）；代码侧 hash 稳定靠钉版本。**规则化：凡 bump `bin/` 下任何运行时版本（node/python/pg/goose/pc/nats/faucet）=「信誉尖峰版」**，须走 §7.6-B 流程。
5. **升级窗口的行为面观察项**（无公开独立规则，证据缺失型，真机 A1 采集）：数分钟全树读+3,706 文件批量备份复制+批量删除+update-runner.js 自我替换，单窗口内完成——dropper/勒索预备形态相似度高于日常运行态；若真机 EDR 在升级窗口告警，优先对号此组合而非逐文件 hash。

### 7.5 Q4：升级期「杀软可能误报」文案先例

1. **微软官方建议直接背书**（§7.3 同文档）："Communicate with early adopters — let beta users know they may see a SmartScreen prompt on first download"——把「可能见安全提示」写进用户沟通是官方推荐动作。
2. **JetBrains**：产品内检测 Defender 干扰并弹通知引导加排除（2019.2+，YouTrack SUPPORT-A-1681；Rider 官方文 rider-support.jetbrains.com/hc/en-us/articles/360006365380）。
3. **Jan**：事故后官方博客公开时间线+用户指引（恢复隔离/白名单/向厂商申诉）。
4. **voidtools**：downloads 页 SHA256+论坛 FP 处置指引（§1.2 已录）。
共同模式：**没有产品假装不会误报**；都是「事前告知可能弹窗+事后三步人话指引（恢复→白名单→报厂商）」。

### 7.6 可执行建议（4 条）

- **A. 发布说明模板加「安全软件提示」段**（落到 tools/release.sh 的 release notes 生成）：三句人话——①更新或首启时杀软可能提示/隔离（新版本文件需要重新建立信任，属正常现象）；②Defender：保护历史记录→恢复；第三方：隔离区恢复+加白名单目录；③拿不准→官网 hash 清单核对+§1.3 申诉渠道链接。依据：微软官方建议+Jan/JetBrains 先例（§7.5）。
- **B. 「信誉尖峰版」流程钩子**（自动化进 release.sh）：对比新旧 dist 包的 54 个 exe hash（E1 脚本 tmp/zip-hash-diff.py 可复用），**任一变化即触发**：发版前 VT 先查后传（§2-S2 流程）+ wdsi developer 送检新 exe + 发布说明注明「本次升级杀软重扫较久」。普通文本差量版（E1 实测形态）免检。依据：§7.3 无预热通道+Docker/Rufus 实录。
- **C. 升级失败文案区分「安全软件拦截」分支**（改 update-runner.tpl.js 的 ST.msg/前端展示，不动逻辑）：apply/restart 阶段失败或回滚时附一句「若刚才看到杀毒软件弹窗或隔离通知，请先在其界面恢复文件，再点重试；仍失败请把 data/updates/status.json 发给支持」——只给人话出口，**不自动改任何安全设置**。依据：Obsidian/Docker 案例中用户的第一反应决定去留。
- **D. 差量保留策略核对表**（进 release checklist）：①dry-run 输出确认 config.yaml/custom_providers/memory/permission.yaml 不在 applied/deleted 列表（E1 已互证现状正确）；②同版本重构建 churn>50 文件=构建环境漂移警报，停下排查再发（Jan CI 构建机被标的反向教训）。

### 7.7 排除了什么、怎么排除的（补篇）

- **未找到**：任何厂商对「prevalence 达标时长」的精确 SLA——微软只给「数周+数百安装」量级（§7.3-2），其余厂商零公开数据；「用户目录进程批量删除文件」的公开独立检测规则——未见，仅行为族推断（§7.4-5）。
- **未采信**：CA 营销页「EV 证书=即时 SmartScreen 信誉」（与微软官方文档直接冲突，弃用）；Discord Update.exe「被杀」的社区转述（未找到一手硬案例，降级为用户信任条目）。
- **实验边界**：E1-E3 在无 EDR 的 devbox；hash 稳定性仅代表钉版本窗口；SAC 本机未实测。
- **对既有章节的收窄（非修改）**：§1.1「每次发新 hash 信誉冷启动」在差量机制下实际口径=「每次约 18 个文本文件冷启动、54 个 exe 例外，直到 bump 运行时版本」。

### 7.8 补篇来源清单

1. Microsoft Learn：SmartScreen reputation for Windows app developers（ms.date 2026-05-04；unsigned 每版从零/数周+数百安装/无 consumer 提交通道/EV 不再豁免/SAC/官方沟通建议）——https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation
2. DigiCert 官方 alert（EV 签名仍现 SmartScreen 警告）——https://knowledge.digicert.com/alerts/ev-signed-application-showing-microsoft-defender-smartscreen-warnings；ToDesktop PSA——https://www.todesktop.com/blog/posts/windows-apps-psa-ev-certs-do-not-grant-immediate-reputation-anymore
3. Jan issue #1483 + 官方事故报告——https://github.com/janhq/jan/issues/1483 、https://www.jan.ai/post/bitdefender
4. Docker for-win #12447（delta updater FP/全量安装器 workaround）——https://github.com/docker/for-win/issues/12447
5. Obsidian 论坛 95827/116963/41035——https://forum.obsidian.md/t/virus-found-in-obsidian-1-8-3-and-1-8-4/95827 等
6. Rufus #1169/#433/官方 wiki FAQ/Malwarebytes 288934——https://github.com/pbatard/rufus/issues/1169 、https://github.com/pbatard/rufus/issues/433 、https://github.com/pbatard/rufus/wiki/FAQ 、https://forums.malwarebytes.com/topic/288934-rufus-executable-once-again-being-falsely-flagged-as-malware/
7. Etcher #4164/#862——https://github.com/balena-io/etcher/issues/4164 、https://github.com/balena-io/etcher/issues/862
8. JetBrains YouTrack SUPPORT-A-1681 + Rider 官方文——https://youtrack.jetbrains.com/articles/SUPPORT-A-1681/Antivirus-Impact-on-Build-Speed 、https://rider-support.jetbrains.com/hc/en-us/articles/360006365380
9. Electron #1487（AV 拖慢启动基准）——https://github.com/electron/electron/issues/1487
10. 二手：Prisma #29636（FP 一两天自愈）https://github.com/prisma/orm/issues/29636 ；GitHub Desktop #5884（Squirrel 用户信任）https://github.com/desktop/desktop/issues/5884
11. 本机实证（VERIFIED-RUN，2026-09-13，devbox）：E1 五包 hash 对照（tmp/zip-hash-diff.py）；E2 python zipfile 不传播 MOTW（tmp/motw-probe.ps1）；E3 node https.get 无 MOTW（tmp/dl-probe.js）——脚本留存 tmp/ 可复跑。

**补篇回填约定**：真机护航若在升级窗口观察到拦截/告警→回填 §7.4-5 观察项（对照「批量读删+自改写」组合优先于逐文件 hash 归因）；bump 运行时版本的首次发版→执行 §7.6-B 并记录 VT/wdsi 结果。
