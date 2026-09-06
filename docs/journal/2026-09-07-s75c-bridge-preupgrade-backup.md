# s75c 桥端升级前自备份（v0.9.11 台账最后一项大件；s69 遗留①「桥端升级前自备份设计入 v0.9.11」销账）

## 缺陷与机制（为什么在桥端）
- s73 阻断级实证：v0.9.8/v0.9.9→v0.9.10 升级由**旧版 runner** 执行（运行中不换代码），PROTECTED 保全只对「由新版 runner 执行的升级」生效——存量路径 config.yaml/custom_providers/memory 被删重建（backup manifest 铁证）。现行兜底=发布说明要求护航者手动备份 conf/goose/config/。
- 机制化：桥是触发升级时机器上正在跑的代码，由它在 spawn runner **前**把用户态配置同步快照——从本版起不依赖 runner 版本（v0.9.11→未来的所有升级均被覆盖；v0.9.10→v0.9.11 由 v0.9.10 新 runner 的 PROTECTED 覆盖，桥端备份自 v0.9.11 装上后生效）。

## 设计裁决
- **触发点**：`/api/update/start` 参数校验通过后、spawn runner 前，同步完成——runner 是唯一改文件者，spawn 前落盘即保证先于任何改动。不挂 upload（只暂存不动树，挂了会在多包上传时堆积无谓备份）。
- **幂等**：包身份（staged=名+字节数；url=下载地址）与最新一份备份 manifest 比对，相同即复用不新建——同包重复 apply（首败重试场景）不堆积。
- **范围**：`conf/goose/config/` 整树（s73 丢失清单全体 + PROTECTED 不保的 permission.yaml/recipes/）+ `data/config/`（skill-sources/mcp-catalog；对旧 runner 路径 data/ 无任何保护）。缺漏说明：conf/ports.env.yaml、conf/apps.env.yaml 在 runner PROTECTED 内且非 s73 实证丢失项，未纳入。
- **落点**：`data/backups/pre-upgrade-<ts>/`（package.sh 已排除该目录），keep 3（pg-dumps/forge-backup 同语义），内附 `恢复说明.txt`（护航者手工拷回步骤，发布说明可直接引用该文件路径）+ `manifest.json`（pkg/from/items）。
- **失败面**：备份失败（磁盘满等）→ warn 一行进 /api/update/status 的 warnings + console.warn，**升级照常**——与 runner 侧「写入失败静默降级不得让升级失败」同族裁决：备份是兜底不是闸门，闸门会把磁盘满变成永久卡死的升级路径。

## 验证（tmp/preupgrade-backup-test.js，真端点驱动 dev 栈桥，28/28）
- 内容逐位一致：两棵源树整树 sha256 对账 mismatch=0；点名件 config.yaml/permission.yaml/memory（种子）/recipes/skill-sources/mcp-catalog/恢复说明.txt 全在；manifest.pkg/from 正确。
- 幂等：同包二次 POST 不新增目录（复用最新一份）。
- keep 3：4 份伪造旧目录+新包触发 → 恰 3 份，最旧 3 份被清。
- 失败注入：data/backups 以同名文件占位（≈只读盘）→ start 仍 ok:true、warn 进 /api/update/status warnings、桥存活。
- runner 无害性：staged 包无 .sha256 → runner 于 verify 阶段早期失败（stage=staged，不属回滚集合），不停栈不改树——用真端点验证备份时机的安全性。
- 回归：e2e-chat 49/49（含并行 qa 的第 16 节 drift 探针）+ fuzz 143/143。首两轮 e2e 死于与并行 qa 同栈同窗跑 fuzz 的争用（reclaim 探针基线 54→90 自涨=fuzz 建会话；对方跑完后复跑全绿），非本 diff 接触面（失败探针不碰 /api/update/*）。
- 物化：bin/chat-bridge.js 与模板 cmp 逐位一致（bin/ 不入库，AGENTS §4）。

## 遗留
- 备份测试脚本留 tmp/preupgrade-backup-test.js（未转正 tools/e2e——本任务文件所有权只限桥模板；qa 可评估转正）。
- STATE.md 台账销账留给主控（同会话并行编辑卷入风险，s74 教训）。
