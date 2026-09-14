# s87 应用运行面板（app-runtime-panel）落地

- 裁决：docs/verdicts/2026-09-14-app-runtime-panel.md（S1-S5 逐条；S4 已由上批 50cb103 落地，本批仅核对）
- commits：5f7f0f3（S1）/ 7f7b95d（S2+S3）/ 0feb6e8（S5 探针+§23）/ 本批尾（模板文案定稿+使用说明+文档）

## S1 建账（0 行桥代码）
- goose-hints.tpl.md 应用注册协议补第 5 条「建账留痕」（句式照裁决 §3-S1 原文）；conf/_app-template.yaml 首行加 forge-meta 占位注释（agent 复制即继承）。
- bootstrap 重物化 .goosehints：与「模板 + __FORGE_ROOT__/__FAUCET_PORT__ 替换」逐位相等（python 字节级断言 True）；零占位符残留；其余产物零意外 drift。

## S2 桥端 GET /api/apps（chat-bridge.tpl.js +171 行，bin 同步 cmp 一致）
- **裁决待验证项②收口**：bin/vendor 无任何 YAML 解析器（artifact-vcs/mcp-fetch/pgstore 三处 node_modules 全查）→ 自研最小行级解析器 appParseYaml（顶层 processes: 下两缩进精确键名；readiness_probe.http_get 流式+块式两形态）——apps/ 源文件全部出自 _app-template.yaml 单一形状，不引 vendored 依赖（js-yaml 白名单内但「不升级依赖」纪律优先）。
- 状态合并：pcExec 走 :2151 先例通道（-p data/pc.port）；procState 用 is_running/exit_code 布尔数值字段（不依赖 status 字符串，裁决 §0 Failed 无样本规避）；pc 失败→端点仍 200、进程态全 absent+note（「状态未知」诚实降级）。
- URL 三层：meta.url > http_get 合成（port:0 占位不合成）> null；command 端口正则红线零实现（解析器根本不读 command）。
- listenPorts：`process ports <name>` 仅在跑进程、总调用 ≤8 次/请求护栏、超出 portsTruncated 标记、失败空数组静默。
- srcSid=meta.source→workspace-map 反解+srcTitle=sessionMeta（/api/assets srcOf 同款）；排序 run>stop>fail、createdAt 倒序 null 沉底；yaml 路径只进折叠技术区；POST 405。

## S3 前端第 7 tab「🚀 小应用」（chat.tpl.html +52 行）
- mtabs 注册表接入（重开重拉走既有 for-in 重置）；插在 ✨做过的东西 之后（裁决：概念相邻）。
- 卡片：徽章 ✅运行中/⏹已停/⚠️出错（note→❓状态未知）；主名 human 或「〈id〉· 小 forge 搭的应用」；注册时间无=「—」；单进程合并卡片头/多进程列表；absent 进程人话「下次启动时自动带起」；展开详情=监听端口+来源对话回链（openSession 复用）+yaml 路径收折叠技术区。
- 动作仅「打开看看」（url 非空才渲染，window.open）；url=null 人话句「这个应用没有网页，它在后台做事」；fail 态指引「跟小 forge 说一声」（无按钮）；空态照裁决文案；「刷新看看」手动刷新，无轮询无推送。
- R1-R4 自查：R1 一 tab 一信息域（与 ledger 分容器）；R2 声明终态 <10 个/安装（0-8 档直列，无搜索无分页）；R3 面板即归属域、无裸露技术配置；R4 主名=建账人话/结构性兜底/不编造（时间无=「—」）。

## S4 核对（只读走查，未跑升级）
- update-runner PROTECTED 含 'apps/'（模板与 bin cmp 一致）；isProtected 前缀匹配 apps/<任意> 成立；walkMap 跳过受保护目录→用户 yaml 永不进差量 curMap，delete 循环另有 isProtected continue 双保险；package.sh SKIP 已含 apps（s86 P5）→升级包不含 apps/ 目录。结论：升级差量删除判定对 apps/ 用户目录生效。

## S5 探针与基线
- **tools/e2e/apps-probe.js 44ck 入 e2e-chat.sh §23**：活体 fixtures（完整 meta/无 meta 只有 probe/坏 JSON meta/纯后台/进程键不以文件名开头——键用 pc 既有进程名 chat-bridge+daily-backup，零注册零 pc 写即得活体 run/stop 映射）→ 枚举/精确键 join/URL 三层优先级/降级/absent/listenPorts 实听 [8790]/srcSid 反解/405/排序 sanity；桩测 appParseYaml（command 红线/port:0/块式/段边界）+procState+排序比较器提取执行；前端锚 14 条（含红线：pane 唯一按钮=刷新看看、动作面仅打开看看一枚）；**用后自清**（fixtures 删+目录基线零扰动+apps:[] 终态）。
- **基线双绿**：e2e-chat **59/59**（58+§23）+ fuzz **187/187** 顺序跑。
- **GUI 冒烟 13/13**（tmp/s87-apps-gui-smoke.js，DOM 桩+dev 桥实发页面）：空态/运行卡片/单进程合并/详情折叠/打开看看→window.open/回链→openSession/无网页人话句/出错指引/note 状态未知不误称待启动/刷新重拉/桥实发页含新 tab。
- **S5.1 真会话活体**（tmp/s87-live-agent.js，7/9）：真模型（deepseek-v4.1-flash）自然语言让 agent 建 app → **无额外提示自发按协议第 5 条落账**（DB 行 16219 实录 write apps/s87live.yaml：forge-meta description/created_at/source 三键齐）→ /api/apps 面板在列、human=「活体验证临时应用」、createdAt=2026-09-14、url=null 诚实降级 → 清理后回空。两红均为探针环境非产品缺陷：①srcSid 期望错位=探针裸 WS 发 prompt 未带前端「系统备注」（工作区目录随提示词由前端 submit 注入——chat.tpl.html:1300），agent 无自有工作区遂拿了旧 ws 名，桥 ws→sid 反解本身正确（与 workspace-map 逐字一致）；②text 空=agent 22 步工具链 600s 未收尾（慢模型），非静默失败。**GUI 路径（带系统备注）的建账活体留批次 4 沙盒复验**（任务书预授权，不阻塞本批）。

## 事故与恢复（如实留痕）
- **活体探针清理段跑 `pc project update -f <仅主文件>` 且未带 FORGE_ROOT/端口 env → pc 按 CLI 客户端 env 插值 ${FORGE_ROOT}，留成字面量 → chat-bridge/faucet/nats 全栈 crash-loop（「系统找不到指定的路径」）**。恢复=重聚合空 apps/（顺带清掉 apps.env.yaml 里 s86 遗留的 e2e-report/hello-oneshot 残影，工作树回到与 HEAD 一致）+ 全 env+全 3 个 -f 文件 project update → 8 进程 restarts=0 全健康，healthz/资产端点复验绿。教训入 dev-lessons #29。产品路径不受影响（agent 的 env 链自带 FORGE_ROOT，hints 步骤 2 的命令形态安全）。

## 遗留与跟进
- fuzz 侧 /api/apps 模糊断言未加（本批基线按任务书跑 187 原量；端点无参数面小，POST 405 已被 §23 钉）→ 交测试角色补（同步角色纪律 #3）。
- S5.1 GUI 路径建账活体 → 批次 4 沙盒。
- 探针 A16/B12 对 fail 态排序位（fail 殿后于 stop）为桩测定序，活体 fail 样本仍无（裁决 §0 已知，映射不依赖 status 字符串故风险面小）。
