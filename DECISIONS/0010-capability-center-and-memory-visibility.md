# ADR-0010: 能力中心与记忆可视化（双视角暴露）

- 状态：Accepted
- 日期：2026-08-27
- 关联：ADR-0005（记忆四层）/ ADR-0008（工作区信息架构）；docs/research/04-goose.md；journal s17；仓库契约 §2.8（设施对 Agent 透明）

## 背景 / 约束
goose 的能力面（扩展开关、批准档位、permission.yaml、长期记忆、调度）对目标用户（非技术）完全不可见：不知道员工会什么、记了什么、哪些操作会先征得同意。记忆尤其是隐私盲区——agent 可自动写入敏感信息，用户却无查看/删除入口。约束：面向小白的零术语文案；不新增许可证面；改动不得破坏"解压即用"与 bootstrap 幂等性。

## 决定
1. **能力开关走 config.yaml 原地改**：桥新增 `/api/extensions` GET/POST，直接改 `conf/goose/config/config.yaml` 的 `enabled:` 行（行级正则，无 yaml 依赖）。bootstrap 模板重写逻辑改为"保留现有 config.yaml 中各扩展的 enabled 值"（正则提取→回填模板产物），幂等性不变，用户改动不再被启动覆盖。运行时开关变更需重启生效（goose acp 启动时读配置），UI 明示。
2. **记忆管理读文件不走 MCP**：memory MCP 的存储 = `conf/goose/config/memory/<category>.txt` 纯文本（junction 另一侧），格式 `# tags` 可选行 + 内容行、空行分条，与 MCP retrieve 语义一致（MCP 自己也按空行分条）。桥直接解析/重写该目录，免起 MCP 子进程。**只提供查看与删除**（单条精确匹配删/分类清空），不提供人工写入口——agent 自动记是唯一写入路径，人工代写会绕过 agent 的格式与上下文判断。
3. **护栏可见化**：安全护栏说明区块 = 顶栏工作模式四档的大白话 + permission.yaml ask_before 清单的归纳文案（执行命令/写文件/删改库/动网页会先问）。不做 per-tool 展示（小白不需要工具名）。
4. **暴露范围裁剪**：chatrecall 不出现在开关列表（纯增强，关掉无收益）；schedule 写操作一期不暴露（s14 cron 误配事故的复发风险大于收益）；skill/recipe 商店不做（需外网源与审核机制，当前 5 个内置技能 + skill-sediment 自沉淀已覆盖主路径）。
5. **HTTP 层 CSRF 修复（审查轮产出）**：s15 只给 WS 加了 Origin 校验，HTTP POST 全裸（恶意网页可跨站触发删记忆/关扩展/删工作区/触发升级）。`handleHttp` 顶部统一拦截：带非本源 Origin 的非 GET/HEAD 请求一律 403；无 Origin（同源导航/curl/Edge --app）放行。

## 后果
- 配置可调面 = 3 个可见扩展开关 + 4 档工作模式，全部"重启生效"语义，无热加载复杂度。
- 记忆面板数据面 = 目录即数据，零迁移、零 schema（.txt 文件是 goose 所有，桥只读/整条删，不引入 _schema）。
- CSRF 修复顺带覆盖既有全部 POST 端点（upload/vcs/ws-delete/update 等），是 s15 审查的补网。
- 模板双份坑再现（bin/chat.tpl.html 误编辑）：真相源只有 conf/templates/*，bootstrap 直接复制生成 bin/*；bin/ 下同名残留文件已清除。

## 复核条件
- goose 升级改变 memory 存储格式/路径 → parseMem 与 junction 复核
- 出现第二个会写 config.yaml 的入口（如 agent 自改配置）→ 开关读侧需加缓存失效
- 用户出现"让员工记住 XX"的人工写需求 → 在会话内走 agent（"记住这个"），仍不做面板写入口
