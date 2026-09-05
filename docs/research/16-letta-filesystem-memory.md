# Letta（原 MemGPT）「文件即记忆」主张独立验证（ADR-0005 外部佐证核查）

- 结论：**方向性成立，量化数字不予采信**。「文件即记忆」是 Letta 官方真实且持续加码的方向（2023 论文分层 → 2025-07 Letta Filesystem → 现行 git-backed MemFS，含 skills/ 目录），与 ADR-0005「记忆=人可读文本文件」殊途同归，**可作方向佐证**；但「纯文件存储 74.0% 胜专门记忆层」为厂商自证，且 LoCoMo 基准经第三方审计存在 6.4% 答案键错误与偏松 judge，**该数字不可引用**。STATE backlog「厂商自证未复现」标注维持。
- 取证：pf-researcher，2026-09-05，WebSearch+官方页直读；只读，未跑 Letta（VERIFIED-DOC 级，无 VERIFIED-RUN 项）。
- 关联：ADR-0001 / ADR-0005 / ADR-0007 / ADR-0010；research/11（首次记录该主张）；STATE backlog 行。

## 1. 主张取证（一手官方源，全部 2026-09-05 直读核对）

### 1.1 MemGPT 论文：OS 启发的记忆分层（方向源头）
- 来源：arXiv 2310.08560（v1 2023-10-12，v2 2024-02-12，Packer/Wooders 等 = Letta 创始团队）。https://arxiv.org/abs/2310.08560
- 原文：「virtual context management…drawing inspiration from hierarchical memory systems in traditional operating systems」（借鉴 OS 分层记忆，在快/慢存储间搬数据以呈现大内存）。
- 验证状态：VERIFIED-DOC。这是**分层思想**源头，论文本身没有「文件即记忆」四字主张。

### 1.2 Letta Filesystem 发布（2025-07-24）
- 来源：https://www.letta.com/blog/letta-filesystem/
- 主张原文：给 agent 一个「organize and reference content from documents like PDFs, transcripts, documentation」的接口；「The Letta Filesystem represents documents as folders and files (containing parsed contents) to the agent」；工具三件套：`grep`（模式匹配）、`open`（行级精度读取+关闭其他文件）、`semantic_search`（向量相似）；文件夹=「named collections with descriptions」。
- 关键限定：**该公告全文未使用 "filesystem as memory" 措辞**，也未提 MemGPT 论文——它自我定位是文档上下文接口（「Think Claude Projects, but purpose-built for developers」），不是记忆宣言。「文件即记忆」是外界（含我们 research/11）对后续基准文的概括。
- 验证状态：VERIFIED-DOC。

### 1.3 基准博客：「Is a Filesystem All You Need?」（2025-08-12，74.0% 数字出处）
- 来源：https://www.letta.com/blog/benchmarking-ai-agent-memory/
- 原文引语：「74.0% accuracy on LoCoMo by simply storing conversation histories in files」（GPT-4o mini），对比 Mem0 自报最佳图变体 68.5%；「even simple filesystem tools are sufficient to perform well on retrieval benchmarks such as LoCoMo」；「Agents today are extremely effective at using filesystem tools」；「memory is more about how agents manage context than the exact retrieval mechanism used」。
- 机制细节（与「纯文本」的偏差）：对话历史放入文件上传后「automatically parsed and embedded to enable semantic (vector) search」；agent 拿到 grep / search_files / open / close + answer_question，**无写工具**，用 tool rules 约束必须先 search_files（因 4o-mini 弱）。即：**这次实验是「文件+嵌入检索+只读」，且只测检索，不测记忆写入与沉淀**。
- 作者自认局限：LoCoMo 只测检索不测 agentic memory；记忆评估离不了周边 agent 系统；**无法核实 Mem0 声称的 MemGPT 运行（Mem0 未回应）**。
- 验证状态：VERIFIED-DOC（主张与数字存在性）；数字真实性 = 厂商自证，未复现。

### 1.4 现行形态：MemFS——git-backed 记忆文件系统（2026 年现在时）
- 来源：https://docs.letta.com/concepts/memfs 、https://docs.letta.com/configuration/memory/ （旧 V1 Filesystem 文档页已标 deprecated：https://docs.letta.com/v1-sdk/concepts/filesystem/ ）
- 原文引语：agent 记忆是「part of the agent's state, held in a git repository that belongs to the agent」；「MemFS projects that repository onto whatever computer the agent is running on, as a real checkout」；「All Letta agents use MemFS」；「Every memory edit is committed to the MemFS git repository」。
- 结构：`$MEMORY_DIR/system/`（persona.md、human.md，**每轮注入 system prompt**）、`reference/`（不进上下文，文件树本身常驻 system prompt 作路标）、`skills/`（SKILL.md + YAML frontmatter，「versioned with the rest of the agent's memory」）。
- 周边机制：Dreaming = 后台 subagent 复盘近期会话、沉淀教训、提交记忆更新（触发：步数阈值或 compaction 时）；`/doctor` 审计记忆放置/重复/token 占用；`/remember` 显式教学。**默认不带嵌入语义索引**——记忆检索「in its Markdown files with normal file-search and read tools」（issue #3234 证实语义索引仍是可选功能请求，官方建议用 skill 包 qmd 之类本地搜索工具）。
- 现实摩擦信号：letta-code #808——headless 模式遇 memfs 同步冲突直接退出无恢复（https://github.com/letta-ai/letta-code/issues/808 ）。
- 验证状态：VERIFIED-DOC（文档存在与内容）；#808 为用户 issue 级证据（未复现）。

## 2. 独立核验（第三方，反驳与佐证并存）

### 2.1 LoCoMo 基准本身不可靠（对 74.0% 最重的独立打击）
- Penfield Labs 系统审计（方法与脚本开源可复现）：1540 题中答案键错误 99 题 = **6.4%**（含幻觉事实、时间推理错误、24 题说话人张冠李戴）→ 完美系统理论上限约 93.6%；judge（gpt-4o-mini）对**故意构造的错误答案接受率 62.81%**（具体事实错误约 89% 能抓住，模糊答案近三分之二放行）；结论「score differences below that threshold are not interpretable」。来源：https://dev.to/penfieldlabs/we-audited-locomo-64-of-the-answer-key-is-wrong-and-the-judge-accepts-up-to-63-of-intentionally-33lg
- 分数混战全景（各家全是自证）：Mem0 论文报 MemGPT 低分被 Letta 质疑无法核实；Zep 报 84% 被发现算术错误虚高 25.56pp（更正 58.44%，Zep 反称 75.14%）——https://github.com/getzep/zep-papers/issues/5 。Towards AI 评论（标题级证据，原文 403 未直读）：「agent memory 领域没有一个数字被与厂商无利害的第三方复现过」。
- 净结论：**LoCoMo 上所有厂商数字互相打架且无一独立复现，74.0% 只能当方向信号，不能当证据。**

### 2.2 方向的独立佐证（弱但正向）
- HN「Letta Code」讨论用户反馈：记忆管理「primarily text/files based so very transparent and controllable」，并提 learned skills（https://news.ycombinator.com/item?id=46294274 ）。
- 「files are all you need」已成行业辩论题（The New Stack 有反驳文《The 'files are all you need' debate misses what's actually…》——仅确认存在，原文未读，UNVERIFIED）。
- 无发现反驳「Letta 实际把记忆做成文件」这一事实本身；发现的反驳全部针对基准数字与竞品分数，而非机制方向。

## 3. 对照 ADR-0005 四层（+ 关联 ADR）

| PocketForge 四层 | Letta 对应形态 | 覆盖判定 |
|---|---|---|
| 1. 静态手册（.goosehints 人设/规矩，常驻注入） | MemFS `system/persona.md`+`human.md` 每轮进 system prompt | 覆盖，同构 |
| 2. 事实/偏好层（goose mcp memory，txt，显式写） | MemFS Markdown 文件 + `/remember` 显式教 + Dreaming 后台巩固 | 覆盖，且 Letta 多出自动巩固 |
| 3. 历史召回（chatrecall 关键词） | 消息历史持久化+压缩；基准文演示对话历史入文件+grep | 覆盖（路线不同） |
| 4. 任务连续（session --resume） | MemFS 跨会话共享（commit 即同步） | 覆盖 |

- **Letta 有、我们没有**（如实）：记忆编辑逐次 git 提交（版本化/可回滚/冲突解决——我们 memory/*.txt 无版本）；Dreaming 后台巩固 subagent；`/doctor` 记忆体检。
- **任务假设修正**：backlog 预估「技能沉淀/制品版本管理大概率缺」——技能沉淀**已不成立**：现行 MemFS 含 `skills/` 目录（SKILL.md+frontmatter，与记忆同 git 版本化），与 agentskills 规范方向一致；**制品版本管理仍缺**：MemFS 是 agent 自身记忆的 repo，没有面向用户交付物的工作区制品层（ADR-0007/0008 的 workspace 制品+IA+生命周期在 Letta 无对应物）。
- **我们有、Letta 没有**（如实，不自夸）：① 项目级记忆拓扑——ADR-0001 五层权威递减是项目/团队级 SSOT，MemFS 是 per-agent 私有记忆（「a git repository that belongs to the agent」），非多角色共享的项目记忆；② 用户交付物制品工作区（ADR-0007/0008）；③ 便携零污染交付（Letta 主打 Cloud/self-hosted App Server，便携 Windows 不在其目标，细节 UNVERIFIED）；④ 「无语义检索」是我们显式接受的约束，Letta 现行默认同样不带嵌入索引——**对方的演进反向佐证了 ADR-0005 当初的取舍**。
- 2025-08 基准与现行 MemFS 机制不同（前者带嵌入、只读；后者纯文件工具+git、可写），引用时必须分开表述。

## 4. ADR-0005 复核引用建议措辞（结论）

> Letta（MemGPT 原班团队）沿「OS 式分层记忆」演进至 git-backed 记忆文件系统 MemFS：记忆即 Markdown 文件、普通文件工具读写、每次编辑 git 提交、含 skills/ 目录，且默认不带嵌入语义检索——与 ADR-0005「记忆=人可读文本文件、无语义检索（显式接受）」方向收敛，可作**方向性外部佐证**（VERIFIED-DOC 2026-09-05，本机未复现）。其 2025-08 基准宣称纯文件存储 74.0% 胜专门记忆层，属厂商自证，且 LoCoMo 基准经第三方审计存在 6.4% 答案键错误、judge 对错误答案接受率 62.8%，各家分数无一独立复现——**量化数字不予采信，仅引用方向**。

## 5. 可借鉴想法（全部 UNVERIFIED，供 backlog 评估，不构成本底稿结论）

1. **记忆编辑 git 版本化**（MemFS 式逐次 commit）：ADR-0005 memory/*.txt 目前无版本。约束：不得给非技术用户增加可感知负担（须无感自动 commit，或降级为备份脚本）。对应 ADR-0005 复核条件评估。
2. **记忆体检工具**（/doctor：放置/重复/token 占用审计）：与 ADR-0010 能力中心「记忆可见性」天然同构，可作为其中的一个工具候选。
3. **后台巩固**（Dreaming 式 subagent 整理记忆）：对应 ADR-0005 复核条件「用户找不到旧记忆」——届时先评估低成本关键词级巩固，再考虑语义层（doobidoo）。
4. qmd（tobi/qmd，本地 BM25+向量+重排）：Letta 官方推荐的语义检索替代路径；许可证未核，引入前须过 §5 白名单。

## 6. 排除与遗留

- 已排除：Mem0/Zep 各自博客分数不作证据（厂商互搏，见 2.1）；Letta 官方 Research 页与 LinkedIn 转发视为与 1.3 同源，不重复计独立证据。
- 未直读（工具受限）：Towards AI 分析文（403）、The New Stack 反驳文、Reddit r/LocalLLaMA 原帖（超时，仅有搜索摘要级印象）——三者均不作为引用依据。
- 全文无 VERIFIED-RUN 项；如需升级（本机跑 Letta Code 验证 MemFS 行为），需另立实验任务。
