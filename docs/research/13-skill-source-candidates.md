# 研究底稿：真实异构第二技能源选型（切片 B 闸门前取证）

- 日期：2026-09-05
- 执行：pf-researcher（只研究，未改产品代码，未装技能，未动运行栈，未 commit）
- 服务对象：裁决书 docs/verdicts/2026-09-05-marketplace-ecosystem.md 切片 B 验收标准 1——「实测加第二源（真实可达的开源技能 repo，主控选型过目+许可证白名单适用）」。本轮产出=选型证据底稿；闸门（人工过目）与验收实施不在本轮。
- 许可证白名单（裁决书）：MIT / Apache-2.0 / 公有领域 / PostgreSQL License / ISC；BSL/GPL/SSPL/未明确=禁止；无 LICENSE=出局。
- 验证状态标注约定：[跑通]=本机经代理（https_proxy=127.0.0.1:7890）调 GitHub REST API / raw.githubusercontent.com 实取，取数时点 2026-09-05；[代码核实]=读本地源码；[未验证]=未实测。star/fork 数为 API 报告值（查询时点值，波动不锁定）。

---

## 1. 管道假设（选型的硬约束，[代码核实]）

`forge/bin/chat-bridge.js`（s70 切片 B 已落地多源）：

- L528-549 `fetchAllRemoteSkills`：对每个 enabled 源调 `GET api.github.com/repos/{repo}/contents/{subdir}?ref={branch}`；**顶层目录=技能**；逐目录抓 `{subdir}/{dir}/SKILL.md`。任一源不可达→整轮 sync 抛错→保留旧缓存。
- **只缓存 SKILL.md 一个文件**（L544 `atomicWrite(SKILL.md)`；安装 L685 cpSync 缓存目录）→ 技能目录内的 scripts/references/assets 不随市场安装落盘。现任源 anthropics/skills 同样如此（既有管线行为，非新源额外劣化）。
- 目录名白名单 `^[\w\-]{1,64}$`（L537）：带点/空格/超长目录静默跳过。
- 源条目校验（L445-463）：repo 须 `owner/repo` 形；subdir 允许 `[\w.\-/]`（**可含斜杠**→深层路径可按子目录接入）；subdir 缺省或空串回落 `'skills'`。
- 嵌套不兼容推演：若 `skills/` 下是分类目录（`skills/<分类>/<技能>/SKILL.md`），管道会把「分类」当技能，抓不存在的 `skills/<分类>/SKILL.md`，404→catch→默认 meta→`atomicWrite(SKILL.md, undefined)` 抛 TypeError→**整轮 sync 失败**（L540-544 中 atomicWrite 在 try 块外）。[未验证]（未对运行栈实测，按代码路径推演）。

## 2. 候选总表（[跑通] 2026-09-05）

检索方法：GitHub search API（关键词 + topic:agent-skills / topic:claude-skills / topic:claude-code+skills，按 star 排序）+ WebSearch 交叉。命中物中剔除：纯清单仓库（无技能实体）、agent 定义仓库、单技能仓库、harness/工具仓库。

| # | 候选 | stars（API 值） | 最近 push | 仓库级许可 | 技能数 | 布局合规 | 建议 |
|---|---|---|---|---|---|---|---|
| 1 | JimLiu/baoyu-skills | 25,669 | 2026-07-04 | MIT | 21 | ✅ 21/21 | **入（首推过闸）** |
| 2 | obra/superpowers | 281,958 | 2026-09-04 | MIT | 14 | ✅ 14/14 | 缓（内容偏开发方法论） |
| 3 | addyosmani/agent-skills | 92,370 | 2026-09-05 | MIT | 25 | ✅ 25/25 | 缓（纯工程向，妻子场景错位） |
| 4 | mattpocock/skills | 251,637 | 2026-09-04 | MIT | 37 | ❌ 37/37 两级嵌套 | 否（管道不兼容） |
| 5 | K-Dense-AI/scientific-agent-skills | 42,831 | 2026-09-02 | MIT（**技能级污染**） | 163 | ✅ 163/163 | 否（许可白名单不过+域错位） |
| 6 | anthropics/claude-plugins-official | 35,931 | 2026-09-05 | Apache-2.0 | 31 | ❌ 四层深 | 缓（subdir 逐插件可接，本轮不承诺） |
| 7 | VoltAgent/awesome-agent-skills | 33,780 | 2026-09-05 | MIT | 0 | — | 否（纯清单仓库，无实体） |
| 8 | VoltAgent/awesome-openclaw-skills | 52,394 | 2026-09-05 | MIT | 0 | — | 否（纯清单仓库，无实体） |
| 9 | ComposioHQ/awesome-claude-skills | 74,512 | 2026-08-10 | **None** | 0 | — | 否（无 LICENSE 出局+清单仓库） |
| 对照 | anthropics/skills（现任） | 174,387 | 2026-09-03 | API 报 None（根目录无 LICENSE 文件，仅 THIRD_PARTY_NOTICES.md） | 16 目录 | ✅（现任） | 既有源，不在此轮重审 |

## 3. 候选详录

### 3.1 JimLiu/baoyu-skills —— 入（首推）

- 元数据 [跑通]：stars=25,669，pushed=2026-07-04T16:25:18Z，default_branch=main，size≈35MB。作者 JimLiu（宝玉，中文创作者）。约 2 个月未 push，但有 CHANGELOG.md/.releaserc.yml 版本化纪律。
- 许可证 [跑通]：`LICENSE`（仓库根）→ "MIT License / Copyright (c) 2026 Jim Liu"。白名单 ✅。树内另有 `packages/baoyu-md/src/LICENSE`（子包，不在 skills/ 供给范围）。
- 布局 [跑通]（tree sha `6b7a2e41…`，recursive=1 共 1,077 项）：`skills/<name>/SKILL.md` 21/21 全部深度合规；目录名全过管道白名单；顶层另有 packages/（316 项，发布用 monorepo）、screenshots/ 等，被 subdir=skills 天然隔离。仅 1 个技能目录带附属文件，20/21 纯 SKILL.md 自包含。
- 内容抽样 [跑通]（raw 原文）：
  - `skills/baoyu-translate/SKILL.md`：description 触发词直接含中文（"翻译/精翻/改成中文/这篇文章翻译一下"）+ 三档翻译模式+术语表。对中文零技术用户**天然可唤起**。
  - `skills/baoyu-xhs-images/SKILL.md`：小红书图片卡片/微信图文生成，中文触发词；图片渲染走后端选择链（含外部图像服务）。
  - `skills/baoyu-compress-image/SKILL.md`：图片压 WebP；工具链 sips→cwebp→ImageMagick→Sharp，运行时依赖 bun/npx（frontmatter `requires.anyBins`）。
  - 附加抽查 `skills/baoyu-danger-x-to-markdown/SKILL.md`：作者自带 `danger-` 前缀标注逆向 API 类风险，透明度好。
- 中英情况：唯一 description 双语的候选；正文多为中文/中英混合。
- 风险（过闸需知）：
  1. 运行时依赖 `bun x`/`npx` 从 npm 拉工具（非仓库内文件）——本机无 bun/npx 时部分技能运行期降级；属运行面事项，非拉取面（s55-56 出网面收敛不受影响）。
  2. 21 枚全量入市场清单（管道无按技能排除机制）：`post-to-wechat/weibo/x`、`danger-*` 等涉及外部账号/逆向接口的技能会被列出并可安装——按裁决「人工过目」精神，建议过闸时对枚举清单留痕知悉（机制上无法单技能下架，除非上游删目录或本地关源）。
  3. 3 个外部图片/视频类技能依赖外部 AI 服务与密钥。
- 配置样例（改 JSON 零代码）：
```json
{ "repo": "JimLiu/baoyu-skills", "branch": "main", "subdir": "skills", "enabled": true }
```

### 3.2 obra/superpowers —— 缓

- 元数据 [跑通]：stars=281,958，pushed=2026-09-04，size≈4.4MB，社区头部技能框架（本环境插件生态亦有同名分发）。
- 许可证 [跑通]：`LICENSE` → "MIT License / Copyright (c) 2025 Jesse Vincent"。白名单 ✅。
- 布局 [跑通]（tree sha `b36e0829…`，255 项）：`skills/<name>/SKILL.md` 14/14 合规；顶层 hooks/、.claude-plugin/ 等被 subdir 隔离。7/14 技能带附属文件（references 等，装后不落盘，文本主体仍完整）。
- 内容抽样 [跑通]：brainstorming / writing-plans / verification-before-completion——质量高，但全部是**软件开发方法论**（TDD/代码评审/worktree）。description 英文、强自我 mandating 措辞（"You MUST use this before any creative work…"，设计使然的强行为引导，非注入，记录在案）。
- 结论：许可/布局/活跃度全绿；内容对妻子（零技术）场景价值低，对用户/主控开发场景有价值。作第一异构源=机制验收能过但无用户供给增量 → 缓；若主控为自己选第二源则可入。

### 3.3 addyosmani/agent-skills —— 缓

- 元数据 [跑通]：stars=92,370，pushed=2026-09-05（日更级活跃），Addy Osmani（Google Chrome 工程_leader）。
- 许可证 [跑通]：`LICENSE` → "MIT License / Copyright (c) 2025 Addy Osmani"。白名单 ✅。
- 布局 [跑通]（tree sha `84ee5067…`，279 项）：`skills/<name>/SKILL.md` 25/25 合规；24/25 纯 SKILL.md 自包含。
- 内容抽样 [跑通]：idea-refine / interview-me / doubt-driven-development——纯提示词技能、文本自包含、质量高；但 25 枚全为软件工程向（API 设计/CI-CD/安全加固），仅 idea-refine/interview-me 半通用。
- 结论：技术上几乎无瑕疵，供给内容与目标用户错位 → 缓。

### 3.4 mattpocock/skills —— 否（当前管道下）

- 元数据 [跑通]：stars=251,637，pushed=2026-09-04。
- 许可证 [跑通]：`LICENSE` → "MIT License / Copyright (c) 2026 Matt Pocock"。白名单 ✅。
- 布局 [跑通]（tree sha `3cca18b3…`，257 项）：**37/37 全部两级嵌套** `skills/{engineering,productivity,misc,in-progress}/<name>/SKILL.md`。按 §1 推演，接入即整轮 sync 失败（分类目录被当技能→抓不存在的 SKILL.md→atomicWrite(undefined) 抛错→全源列表拉取失败，含现任源合并轮）。[未验证]（未实测炸点，代码路径推演）。
- 结论：许可与内容（工程向）均可，唯布局不兼容。除非管道升级支持二级目录遍历，否则否。此候选是「subdir 顶层假设」边界的实证样本。

### 3.5 K-Dense-AI/scientific-agent-skills —— 否

- 元数据 [跑通]：stars=42,831，pushed=2026-09-02，size≈249MB（本批最大）。
- 许可证 [跑通]：仓库根 `LICENSE.md` → MIT。**但技能级许可污染实锤**：`skills/docx/LICENSE.txt`（pdf/pptx/xlsx 同）原文关键行 "© 2025 Anthropic, PBC. All rights reserved. … use is governed by Anthropic's Consumer Terms of Service or Commercial Terms of Service"——非 MIT、不在白名单。整仓「许可证白名单适用」不成立，须逐技能甄别，违背「无 LICENSE/未明确=禁止」从紧原则 → 整仓否。
- 布局 [跑通]（tree sha `1e5eeffb…`，3,071 项）：163/163 深度合规；目录名全过白名单。
- 内容抽样 [跑通]：scientific-writing / statistical-analysis（提示词型、质量高、frontmatter 自标 MIT）；infographics（依赖 OPENROUTER_API_KEY 外部服务，无 key 即死）。
- 其他：163 枚入清单=manifest/翻译预算（10 条/批截 150 字符）显著膨胀；科学域（生物信息/量子/实验室协议）对目标用户错位。

### 3.6 anthropics/claude-plugins-official —— 缓（本轮不承诺）

- 元数据 [跑通]：stars=35,931，pushed=2026-09-05，Apache-2.0（API 报告），Anthropic 官方管理目录。
- 布局 [跑通]（tree sha `85cce038…`，684 项）：31 枚 SKILL.md 全部位于 `plugins/<plugin>/skills/<skill>/SKILL.md`（四层深）——顶层假设不匹配。但 readSkillSources 允许 subdir 含斜杠（L459 正则 `[\w.\-/]`），可**逐插件**配 `{repo, branch, subdir:"plugins/<p>/skills"}` 接入——天然契合「人工过目逐个进」闸门。属未来可选项，本轮不做承诺（否决项 6：不批量扩容）。

### 3.7 出局速记 [跑通]

- VoltAgent/awesome-agent-skills：树仅 4 文件（README/LICENSE/CONTRIBUTING/.gitignore），0 SKILL.md——awesome 清单仓库，无技能实体。
- VoltAgent/awesome-openclaw-skills：树 39 项 0 SKILL.md——同为清单。
- ComposioHQ/awesome-claude-skills：API license=None 且树内无 LICENSE 实体文件——白名单硬规则出局（叠加清单仓库属性）。

## 4. 内容安全横扫（[跑通] 2026-09-05）

- 方法：对 baoyu(21)+superpowers(14)+addyosmani(25)+K-Dense(163) 共 **223 个 SKILL.md 全量**（非抽样）经代理拉 raw 原文，正则扫 8 类模式：ignore-previous 类指令覆盖、disregard、密钥/凭证外发（post/send/exfiltrate+key/token/secret/env）、`curl | sh` 管道、env 密钥读取、钱包/助记词、对用户隐匿指令（"don't tell the user"）、`rm -rf /`。
- 结果：**0 命中**。
- 边界（诚实声明）：模式扫描是粗筛，不免除裁决规定的逐源人工过目；技能文本可指挥 agent 执行命令属 agent 运行面既有性质（现任源同），不在本轮拉取面评估范围。

## 5. 排除清单（查了什么、为何排除）

- 搜索命中但排除：纯清单/awesome 仓库 ×3（§3.7）、agent 定义与 harness 仓库（wshobson/agents、affaan-m/ECC、ultraworkers/claw-code 等，非 SKILL.md 形态）、单技能仓库（taste-skill、i-have-adhd、planning-with-files 等，不值一个源位）、无许可证仓库（multica-ai/andrej-karpathy-skills、ComposioHQ）、AGPL/专有域（firecrawl/cherry-studio 非技能仓库）。
- 检索盲区声明：GitHub search 按星排序有马太偏差；中文生态候选主要经 baoyu 仓库关联发现（宝玉为中文技能生态代表性作者）。未做 npm/OpenClaw 注册表渠道排查 [未验证]。

## 6. 结论与下一步

**推荐排序**：① JimLiu/baoyu-skills（入）→ ② obra/superpowers（缓）→ ③ addyosmani/agent-skills（缓）→ ④ anthropics/claude-plugins-official（缓，逐插件 subdir 模式）→ ⑤ mattpocock/skills（否，布局）→ ⑥ K-Dense-AI/scientific-agent-skills（否，许可污染）→ ⑦-⑨ 清单类仓库（否）。

建议下一步（切片 B 验收标准 1 实施路径）：
1. 主控对 JimLiu/baoyu-skills 过人工闸门：浏览 21 枚清单（§3.1 风险 2 枚举），确认可接受全量入清单。
2. 过闸后改 `forge/data/config/skill-sources.json` 增一条（见 §3.1 配置样例），走 sync→列表→安装→卸载 GUI 实景验收。
3. superpowers 作为备选第二源（若首推开拉失败或要英文/开发向异构源）。
4. mattpocock 布局问题若未来要接，需先立管道二级目录切片（本轮不立项）。

## 附：证据锚点

- tree sha（内容时点锚，[跑通] 2026-09-05）：baoyu `6b7a2e417500561a5ecdd0b168332f4142584617`；superpowers `b36e0829c6d0140e93cfef2ca599b1b07d4a7797`；addyosmani `84ee50673804b95c287d1e4eb4f1c1dad7c5188a`；mattpocock `3cca18b368ae95cdbdebbff572ccafa662551015`；K-Dense `1e5eeffbdad3749125afe7ab48a39694e27f181c`；plugins-official `85cce0381e7860082641b59d961a2b8c368b8b79`。
- 原始树 JSON 落盘：`C:\ZCodeWorks\PocketForge\tmp\skill-source-research\`（7 个 .tree.json + skill_urls.txt + 223 个 SKILL.md 快照），可复核。
- 关键代码位置：`forge/bin/chat-bridge.js` L443-463（源校验）、L528-549（拉取）、L685（安装 cpSync）。
- 未验证项汇总：嵌套源接入的炸点未实测（§1 推演）；baoyu 技能在本机 goose 运行面（bun/npx 依赖）的实装表现未测；各仓 star 数为查询时点 API 值。
