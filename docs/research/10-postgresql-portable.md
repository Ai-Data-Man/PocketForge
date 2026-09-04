# PostgreSQL（便携化嵌入形态）（来源：postgresql.org / EDB / zonkyio/embedded-postgres-binaries / npm registry）
- 结论：ADOPT（2026-09-05 用户批准白名单扩列并采纳，ADR-0011；三阶段路线，每阶段独立可回退。原 BACKUP 双前置之一"扩列"已解除；真机 EDR/initdb 实测随阶段一沙盒与随包护航进行）
- 一句话用途：forge 自建应用首选结构化存储+检索引擎（ADR-0011 阶段一基础设施接线 → 阶段二自建库 → 阶段三检索升级）
- 许可证：**PostgreSQL License**（SPDX: `PostgreSQL`，https://www.postgresql.org/about/licence/ ，核对 2026-09-04）。官方自述 "similar to the BSD or MIT licenses"；OSI 2010-02-10 认证，无 copyleft、无网络条款。**不在现行白名单（MIT/Apache-2.0/公有领域）字面内**——文本与 SPDX 均独立，需扩列一行；同类别还卷入 npm `pg` 依赖树的 ISC（pg-int8/pg-numeric）。唯一字面命中现行白名单的客户端是 postgres.js（Unlicense=公有领域奉献）。
- Windows/便携性：zonky 渠道（EDB 官方 zip 的最小子集，repack 脚本实证仅 `share`+`lib/*.dll`+bin 下 initdb/pg_ctl/postgres 三 exe）解压态 **125MB（2026-09-05 勘误：zonky 17.11.0 jar 解包实测；原记 104MB 系 npm 18.x beta registry 元数据口径，偏小）**；EDB 官方 zip 压缩态 307-319MB（本机 HEAD 实测 17.5/16.9/18.0）。`initdb -D`+`postgres -D -p`+pg_ctl 全程无注册表/服务注册（官方文档），删目录即卸载——硬约束 1/2/4 形态兼容。
- 版本与活跃度：PG 17.x/18.x 稳定线；zonky/npm 渠道跟随上游。**2026-09-05 勘误补事实：npm 渠道（@embedded-postgres/*）所有版本线均为 beta、无一条稳定版**——把 beta 标签制品 pin 进交付树违背 pinned-stable 纪律，此为 ADR-0011 选 zonky 的决定性理由。
- 验证状态：许可证与官方文档 VERIFIED-DOC(2026-09-04)；EDB zip 体积 VERIFIED-RUN(2026-09-04, curl -sI HEAD)；zonky 打包内容 VERIFIED-RUN(2026-09-05, jar 解包 3 exe+dll+share)；node 客户端（pg 8.23.0 MIT ~98KB / postgres.js 3.4.9 Unlicense ~293KB，均纯 JS 零编译）VERIFIED-DOC(registry 元数据)。**阶段一实测清账（2026-09-05，s66）**：initdb 耗时 dev 机实测 7.2s（手工口径）/12.6s（pc 编排冷启口径，含 pc 起服）；PG 空闲内存 postmaster 工作集 18.9MB、全进程树 6 进程合计约 76MB；沙盒全流程实测见 s66 交付。**UNVERIFIED 留真机 POC**：企业 EDR 对用户目录 postgres.exe 的态度。
- 对本项目的关键事实/风险：
  1. **许可证是硬门槛不是技术门槛**：引入必须先扩白名单（建议表述："OSI 认证宽松许可等价类：PostgreSQL License、ISC"），扩列属硬约束变更，待用户确认后落 ADR。
  2. **Windows 三坑**：postgres.exe 在管理员令牌下拒绝启动（社区多源交叉证实）——启动链必须非提权，目标机用户天然无管理员权限是利好，残余风险=用户右键"以管理员身份运行"；中文 Windows initdb 必须显式 `-E UTF8 --locale=C`（C locale 默认编码是 SQL_ASCII 不是 UTF8）；多进程模型（postmaster+每连接 backend）比 SQLite 多崩溃清理/孤儿进程一层运维面，process-compose 托管可行。
  3. **同类先例为零**：goose v1.46.0 会话存储=SQLite（本机文件头实证）；OpenHands=纯 JSON 文件（官方文档）；Manus=云 VM 文件系统。无一家本地嵌入 PG；zonky/npm 两个嵌入先例均自述 "intended for testing purposes"。
  4. **中文搜索现状与去向**：现 /api/search 是 node:sqlite LIKE 逐条匹配（chat-bridge.js:1226-1234）；SQLite FTS5 内置分词器中文硬边界实证（unicode61 视连续中文为单 token、trigram <3 字符不命中、自定义分词器需写 C 扩展）——backlog"FTS5 升级"条目若推进需重新设计（PG 侧中文全文检索能力本次未取证，不作为决策输入）。
  5. 体积后果：交付树 287MB → ~412MB（2026-09-05 勘误：按 zonky 125MB 实测重算，原 ~391MB 系 104MB 旧口径），增量下界即 zonky 125MB。
