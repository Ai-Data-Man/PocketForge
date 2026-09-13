# ADR-0012：上游差异适配层——同名遮蔽与管道保持 wrapper

- 日期：2026-09-13 ｜ 状态：Accepted ｜ 关联：ADR-0006（零二开）、裁决 2026-09-13-v150-builtin-skills-trim、goose v1.50 升级（research/23 实施记录）、s69 goose 防护裁决

## 背景

ADR-0006 定死「不二开上游」。但上游（goose 等）在版本演进中会带来两类我们不可接受的默认行为：

1. **捆绑内容越界**：v1.50 新捆绑 web-search 内置技能——描述常驻自荐、激活后走 `user.always_allow` 的 shell 路径尝试装 uv/拉 PyPI/出网，绕开 s69 审批卡纪律；goose-doc-guide（v1.46 存量）在目标机结构性坏死（默认回落外部文档站）。
2. **进程语义漂移**：v1.46→v1.50 `goose acp` 对 stdin EOF 从忽略变为优雅退出——pc 守护（无 stdin）下 goose-scheduler 秒退，调度器死。

零二开约束下不能改上游源码；hints 一句话禁令被 s69 先例证伪（提示词不是限制机制）。

## 决策

**建立「上游差异适配层」：不改上游一行代码，用外围机制遮蔽或包装不可接受的默认行为。** 两个已落地形态：

### 形态 A：同名遮蔽桩（内容越界类）

- 机制：上游技能发现序=文件系统技能优先（v1.50 mod.rs:613-637 seen 集去重）。在 `conf/goose/config/skills/<name>/SKILL.md` 放产品桩 → 上游 builtin 被跳过。
- 分层优先级：**用户显式安装（.agents/skills）> 产品桩（config/skills）> 上游捆绑**——妻子日后从商店装同名技能仍生效，产品桩不劫持用户选择。
- 桩正文=护栏位（人话说明正确分流，不自荐、不引导出网）。
- 物化：模板 `forge/conf/templates/skill-stub-*.tpl.md` + bootstrap 每启覆盖重建（自愈可打包）。
- 验收锚：升级 playbook T2 哨兵（桩描述在+上游文案关键词零出现+`goose skills list` Location 断言）。

### 形态 B：管道保持 wrapper（进程语义类）

- 机制：pc 守护拉起的目标进程若对 stdin EOF 敏感（新版 goose acp），用 node wrapper 持一条永不关闭的 stdin 管道转发 spawn，退出码透传。
- 落地：`forge/conf/templates/goose-scheduler.tpl.js`（v1.46 同形兼容——旧版忽略 EOF，wrapper 无副作用）+ bootstrap 5g 物化 + pc yaml command 指向 wrapper。
- 约束：审计确认无其他 stdin 敏感 spawn 点（桥 spawnAcp/schedToggle 均自持管道）。

## 适应准则（未来升级复用）

1. 上游新捆绑内容/新默认行为 ≠ 自动接受：按 s69 最小能力面原则逐项过堂，越界项优先找**上游自己提供的旁路机制**（如技能发现的文件系统优先序），找不到再考虑 wrapper。
2. 适配必须**版本兼容双向**（v1.46 同形可跑），保证升级失败回滚后适配层不反咬。
3. 适配层每处必须有**哨兵断言**（playbook 常驻检查），防上游后续版本改变旁路机制时静默失效。
4. 分层优先级铁律：用户同意 > 产品桩/包装 > 上游默认。

## 后果

- 正面：零二开纪律完整保持；上游不可接受行为被可控旁路；升级窗口的前置评估（research/23 类）+ 适配层两层防线。
- 负面/成本：每次 goose 升级的十面回归清单多一类检查（捆绑内容 diff+stdin/进程语义 diff）；桩与 wrapper 自身进入维护面（bootstrap 物化块+哨兵）。
- 边界：本 ADR 不授权任意包装——每处适配须有裁决书记录「为什么该默认行为不可接受」（先例：web-search 的 shell 恒放行+出网诱导实锤）。
