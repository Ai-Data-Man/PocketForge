# s108 取证：中文（非 ASCII）表名在桥读面被静默滤除——全消费面枚举与两通道定案

- 日期：2026-10-03。研究员：s108 取证子任务（只读调查 + 隔离实例实测，未改任何产品文件）。
- 事故输入（主控既定事实，不复跑）：iat124 净冷装沙盒 C:\PF-TEST\s108a，agent 经 faucet 建服务 `home`（sqlite），业务表 `家庭开销`（列名全中文）；`faucet.exe db schema home` CLI 输出含该表；桥 GET /api/db/overview 的 home 服务 tables 只剩 forge_meta/forge_table_info。
- 根因锚：`forge/conf/templates/chat-bridge.tpl.js:2477` `const DB_NAME_RE = /^[A-Za-z0-9_\-]+$/;`（注释自述用途：来自 faucet 输出，拼 CLI 参数/REST 路径前强制过一遍）。
- 本机独立复核（只读，经副本）：`s108a/data/sqlite/family.db` 表清单 = `["家庭开销","sqlite_sequence","forge_meta","forge_table_info"]`；forge_table_info 行 `{tbl:"家庭开销", description:"家庭每天花了什么钱：日期、项目、金额，给用户记账用", created_at:"2026-10-03"}`；`PRAGMA table_info(家庭开销)` 列 = id/日期/项目/金额。与主控口径一致。

## 一、消费点枚举（真相源 forge/conf/templates/，物化 forge/bin/ 同步行号已核对：2477/2546/2550/2604 逐字节一致）

### 1.1 桥侧（chat-bridge.tpl.js）

| 行号 | 代码 | 闸门对象 | 对中文表名的当前行为 | 影响的用户可见面 |
|---|---|---|---|---|
| :2477 | `DB_NAME_RE = /^[A-Za-z0-9_\-]+$/` 定义 | — | — | 全部下游的单一根因点 |
| :2546 | `if (!DB_NAME_RE.test(svc)) continue;`（dbOverview） | 服务名 | 中文**服务名**整库消失（本事故 svc=home 未触发，是同病潜层面） | 下述所有面 |
| :2550 | `.filter(x => DB_NAME_RE.test(x))`（dbOverview，`faucet db schema` 输出的表名过滤） | 表名 | **本事故直接根因**：`家庭开销` 被 filter 掉，静默（无 tblMiss——CLI 本身成功，schemaMiss 不触发） | 见 1.2 全部五面（它们都消费 /api/db/overview 的 services[].tables） |
| :2604 | `if (!DB_NAME_RE.test(svc) \|\| !DB_NAME_RE.test(tbl)) return { ok: false, err: '表名不对，没有这张表。' };`（dbTableSchema） | svc+tbl | 硬拒 + 错误文案「表名不对，没有这张表。」（把合法表名说成不存在） | 点表名展开行（GET /api/db/_schema，:4374-4379 处理器直传参数）。当前 UI 到不了这一步（面板已不列中文表），直接调 API 会撞这句 |
| :2562/:2575 | `faucetGet('/api/v1/' + en.service + '/_table/' + TINFO_TBL ...)` | 常量表名 | 不受影响（forge_table_info/forge_meta 是 ASCII） | — |
| :2621/:2622 | `faucetGet('/api/v1/' + svc + '/_table/' + tbl + ...)`（dbTableSchema 的样例/行数取数） | svc+tbl | 同 :2604 门内，未及此；若白名单放宽，此处 path 拼接**裸中文会炸**（见 §二） | 点表名展开行 |

非消费点（同字符集正则、不同解析面，**与表名无关**，勿误伤）：:2363/:2383 与 :4219 的 `/^ {2}[A-Za-z0-9_\-]+:\s*$/` 解析的是 conf/goose/config/config.yaml 的 extensions 块（mcp-* 扩展 id）；:35/:50 是 .env 键名；:2933 是脱敏正则。全 templates 目录 grep 复核：除 chat-bridge 外无其他 DB 白名单（forge-backup.tpl.js 不碰表名）。

### 1.2 前端（chat.tpl.html；全部经 /api/db/overview → dbOverview() 60s 缓存 :2898-2904，故 :2550 一处过滤五面齐暗）

| 面 | 前端锚 | 中文表名的表现 |
|---|---|---|
| 🗄️ 数据面板（管理面板「数据」tab） | loadDbUI :2288 → dbPaint/dbRowEl :2194-2216 | 表行整条不出现；面板顶搜索框（db-q :2297）按原名也搜不到——「数据没丢」安抚文案只在 tblMiss 时出现，本事故 CLI 成功、无 tblMiss，**连降级提示都没有=纯静默** |
| 点表名展开行（列结构+样例+行数） | dbRowEl onclick :2207 → /api/db/_schema | 入口不可达（行都没渲染）；直接调 API 则吃 :2604 的「表名不对」错文案 |
| @ 引用菜单「库里的数据」组 | :2930-2950 | 组内不列该表；插入「数据库表 服务.表」引用链路（hints :14 识别约定）断了起点 |
| 报表向导「🗄️ 库里的数据表」组 | paintSel :1047-1069 | optgroup 缺该表；用户无法用向导对该表出报表 |
| ✨ 做过的东西（/api/assets 台账） | 桥 assetsOverview :2689-2697（kind:'tbl' 条目） | agent 建的表在台账不可见——「做过的」叙事缺一件实事 |

附带事实：`?fields=id` 行数探针（:2622）对无 id 列的表仍返回 200 且 meta.count 正确（实测见 §二 T5）。

## 二、两通道安全性定案（VERIFIED-RUN 2026-10-03，本机 dev 树 faucet.exe v0.1.12 + forge 自带 node-v22.21.1；隔离实例 C:\PF-TEST\researcher-d1，自有 data-dir/端口 18147/admin/role/key，实测完已整目录删除）

### REST 读通道（faucetGet，http.get 拼 path）
- **node 侧（VERIFIED-RUN）**：`http.get({ path: '/api/v1/r1/_table/家庭开销' })` 同步抛 `TypeError [ERR_UNESCAPED_CHARACTERS]: Request path contains unescaped characters`——请求根本发不出。faucetGet :2501 的 try/catch 会吞成 `resolve(null)`=静默富化缺席。⇒ 裸中文拼 path 这条路在 node 客户端侧就死，与 faucet 无关。
- **faucet 侧（VERIFIED-RUN）**：`encodeURIComponent` 编码后 faucet REST 全接受——
  - `GET /api/v1/r1/_table/%E5%AE%B6%E5%BA%AD%E5%BC%80%E9%94%80?max_results=3` → 200，返回中文列中文值；
  - `GET /api/v1/<编码后的中文服务名>/_table/t` → 200（服务名段同样接受编码 UTF-8）；
  - `GET ...?fields=id`（桥式行数探针）→ 200，meta.count=1；
  - `/openapi.json` paths 含 `/api/v1/r1/_table/家庭开销`（原生中文，JSON 内往返无损）。
- **已排除的混杂**：首轮「中文服务名编码 GET → 404 Service not found」不是编码问题——是 `db add` 后运行中实例不热加载新服务（hints :10 明文要求建库后 `pc process restart faucet`）；重启实例后同路径 200。r1 先 add 后 serve 故首轮即可见，对照成立。

### CLI 通道（faucetCli，execFile 无 shell）
- **（VERIFIED-RUN）**：`faucet db add --name 测试库 ...` 成功注册；`faucet db schema 测试库` 正常返回（中文参数去回无损）；`faucet db schema r1` 输出含 `家庭开销` 及中文列名（与沙盒 CLI 事实互证）。Windows execFile 走 CreateProcessW UTF-16 命令行，Go 侧按 UTF-8 解码——中文参数原生安全，无注入面（无 shell 元字符解释层）。结论=预期「是」，已证。

## 三、写侧事实（上游 faucet 本来就收中文）

- **REST 建表（VERIFIED-RUN）**：`POST /api/v1/r1/_schema`，body JSON `{name:"家庭开销", columns:[{name:"日期",type:"TEXT"},...]}` → **201 Created**，回显表与列全中文名。表名在 JSON body（UTF-8），不经 path。旁证：README（forge/bin/faucet/README.md:268）`POST /api/v1/{service}/_schema # Create table`。
- **REST 插行（VERIFIED-RUN）**：编码 path `POST /api/v1/r1/_table/%E5%AE%B6...` body `{resource:[{日期,项目,金额}]}` → 201，回读 200。
- **CLI/SQL 写（VERIFIED-FACT）**：沙盒存量 `家庭开销` 表即实证（本报告开头独立复核）。faucet 配置库 services 表对 name 无字符约束（dev 副本 census：name/label 均 TEXT）。
- ⇒ **上游全链（REST 写、REST 读、CLI 写读、sqlite 存储）对中文表名/服务名零障碍；唯一的 ASCII 假设在桥的 DB_NAME_RE 一处。**

## 四、hints 真相源核对（forge/conf/templates/goose-hints.tpl.md；物化 conf/goose/config/.goosehints 与 tpl 仅占位符替换差异，逐段 diff 核对）

- :10 建新库：`faucet db add --name <名> ...`——`<名>` 无语言约束（服务名同病面）。
- :11 建库留账：forge_meta 三列——description 明说「用一句中文人话」，无表名语言约束。
- :14 引用识别：「就是 faucet 里的确定表名，直接用 faucet_query 等工具操作它，**不猜、不改名、不要求用户澄清**」——反向强调表名原样尊重。
- :16 建表留说明：forge_table_info「tbl 填表名」——同样无语言约束；description 要求中文人话（列名/表名语言从未被提及）。
- **结论：hints 全文不存在「表名/服务名须 ASCII/英文」条款（VERIFIED-DOC，tpl+物化双核对）。中文任务自然产出中文表名是 hints 语义下的合规产物。**

## 五、修法两侧的事实约束（只列事实，不裁决）

### 侧 A：扩白名单收中文（改桥）
- 必须同步做的事：:2562/:2575/:2621/:2622 四处 faucetGet path 拼接补 `encodeURIComponent`（tbl 与 svc 段都要）——否则放宽 :2550/:2604 后中文表名走到取数处会撞 node 的 ERR_UNESCAPED_CHARACTERS（被 try 吞成静默 null，等于换一种静默坏）。CLI 侧（faucetCli 参数）无需任何处理。
- 白名单若从 `[A-Za-z0-9_\-]` 扩到 Unicode，注入安全论证要点：CLI=execFile 无 shell（已证原生安全）；REST=encodeURIComponent 百分号编码后无路径段穿越能力（`/`、`?`、`#` 均被编码）且上游 v0.1.12 实测接受；剩余风险=表名里含 `%` 等字符经编码往返仍保真（encodeURIComponent 双向无损）。可考虑用「显式黑名单禁 `/ \ ? # % 空白 控制字符 + 长度上限」替代字符白名单，或直接 `\p{L}\p{N}_\-`（node 22 支持 Unicode property escapes）。
- 存量数据兼容：中文表名是合法存量（沙盒 family.db 已有一例）；侧 A 让它们自然回到五个可见面，无需迁移。
- 服务名（:2546）同病：faucet 全链也接受中文服务名（§二已证），侧 A 若只修表名不修服务名，留下一个已知复发面。

### 侧 B：hints 强制英文表名（改提示词）
- 与现行 hints 语义冲突：:14 明文「不猜、**不改名**、不要求用户澄清」；:11/:16 要求 description 中文人话而表名从未提语言——加一条「表名用英文」是对 hints 的语义收紧，且中文任务下 agent 起英文名需要额外翻译决策（与「不猜」精神有张力）。
- 存量不可自愈：已存在的中文表名（沙盒 family.db 一例；净冷装环境天然会再产出）不会因 hints 收紧而消失，桥侧静默滤除依旧发生——侧 B **不修复已发生的数据不可见**，只降低未来概率。
- 姐妹面证据：i18n 任务里列名也全中文（家庭开销 表列=日期/项目/金额）——列名从不进 DB_NAME_RE（dbTableSchema 对列名零校验，dbOverview 只搬表名），说明产品其他环节已经默认非 ASCII 数据合法，表名是唯一被白名单卡住的标识符类别。

## 六、验证等级与命令存档
- VERIFIED-RUN（2026-10-03，faucet v0.1.12 dev 树二进制 + node-v22.21.1）：§二全部、§三 REST 两项。复现路径：隔离 data-dir 起 faucet serve → faucet db add → POST _schema 建中文表 → 编码 path GET/POST。实例与临时目录已删（端口 18147 无监听复核）。
- VERIFIED-FACT（副本只读 census，better-sqlite3 readonly，node v24.14.0）：沙盒 family.db、dev 树 plm.db、dev 树 faucet.db（服务注册名全 ASCII=plm）。**dev 树无中文表名先例；沙盒这例是首个自然产出**。
- VERIFIED-DOC：hints 行号引用（§四）；README REST 形状（forge/bin/faucet/README.md:255-268）。
- 未验证/未做：未读 faucet Go 源码（上游仓库源码不在本机，downloads/faucet.zip 仅二进制）——REST 结论以本机实测为准，等效强度。未测试 pg 驱动下中文表名（本产品 faucet 服务现全 sqlite；pg 行为若未来接入需另测）。
