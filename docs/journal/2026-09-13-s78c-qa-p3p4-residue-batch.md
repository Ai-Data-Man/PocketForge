# s78c：QA 复审 P3/P4 余项小批（修1 健康 P3-2 / 修2 工具卡 key P4 / 修3 死分支）

- 日期：2026-09-13 ｜ 角色：pf-engineer ｜ 上游：367b57a/4f46d90（工作树干净起）｜ 报告输入：tmp/s78b-qa-review.md 批1 P3 节 + tmp/s78-qa-report.md P3 留档节

## 修1（s78b P3-2）同档 switch_model 不失效健康缓存 + 探测目标 models[0] 漂移
- 取证：healthTargets model 与 spawnAcp GOOSE_MODEL 基础链本已同源（`(act.models||[])[0]` 同读法）——漂移面在**同档 set_config_option**：生效模型≠池首且不失效缓存，条误报 stale ≤30min。跨档路径 :3522 已有失效。
- 改法（chat-bridge.tpl.js +7/-2）：
  - `lastModelOverride` 模块级记录，三落点：switch_model 命中池后（两档共点）、subscribe(null) 带 model（session/new resolve 内）。
  - healthTargets：`override∈活跃池 ? override : pool[0]`，不在池（换档/改池）自愈回落；secrets 回落链尾保持。
  - 同档分支补 `healthCache.at=0; probeProviderHealth()`（对齐 §S1/save/跨档失效语义）。
- 验证：tmp/s78c-health-switch.js 沙盒（短 TTL=4s 变体+假 provider 恒回 [m-b]，池=[m-a,m-b]）**8/8**：A 首连锚 m-a→stale 基线；同档切 m-b → hits +1 必重探 + 条 ok（B2 主断言）；model_switched 不回归；B（TTL 过期+态不变）必收帧=e9f04ee P1-1 回归钉；C 阶段 subscribe 带 model m-a → 探测目标随 override → stale 复现（D1）。
  - **负对照**：S78C_TPL 指向回退变体（三处修1 反patch）跑同探针 → 「切换后 ok 健康帧」超时红——判别力实证。
  - 注记：goose session/new 也会自发 GET /models（建模型列表），与探测计数解耦——hits 精确断言不稳健，改 ≥ 存在性断言。
- 边界保持：探测仍只读零计数零自愈；未配置提前 return 路径不变。

## 修2（s78 主线测试 P4）工具卡明文 API key
- 现象（journal s78 P4 观察）：agent 直查 faucet 的 curl 带 `X-API-Key: faucet_xxx`，工具卡参数区全文显示长密钥（本地无洞，妻子可见）。
- 改法（chat.tpl.html +7/-2）：`maskKeys(s)` 显示层掩码——`X-API-Key:`/`Authorization: Bearer` 后 token 保留前6后4（≤12 位全 `****`），token 字符集排除引号/反斜杠（JSON 序列化形态下截在 `\"` 前）；两个显示点=工具卡参数区 pre + **权限卡参数摘要 pre（同族补**：同一命令同一密钥，先于工具卡出现，1 行，主控可否决）。`card._inp` 喂料/explain 载荷/回放/导出/桥侧数据全不动。
- 验证：e2e§19 toolcard-frames-probe **25→31ck**：maskKeys 随 toolCard 一并从模板原文提取进桩（漂移显式红）；新增断言=掩码形态两组/完整密钥零泄露/URL 不受影响/`_inp` 原文/explain 载荷带原文。e2e-chat.sh §19 标签同步 25→31。
- 掩码先行后截断（mask→slice），窗口边界不破掩码形态。

## 修3（s78b P3-3）:659 死分支
- `ws.send(now || { sys:'health', state:null })` 右支：state=null 唯一路径在未配置分支 :629 提前 return（done() 只以非空 state 串收尾）——QA 已核+本轮代码流复核，删 `|| {...}`，注释补不可达理由。清态不广播面（配置→未配置迁移）QA 已裁由前端 providers 帧互斥兜住，不动。

## 全量与物化
- node --check 模板语法过；全量 e2e-chat **57/57** + fuzz **150/150** 顺序绿（tmp/e2e-final-s78c.log / tmp/fuzz-final-s78c.log）。
- 物化：bootstrap 重物化，`cmp conf/templates/chat-bridge.tpl.js bin/chat-bridge.js` 逐位一致；仅 pc restart chat-bridge（`pc -p 8099 process restart chat-bridge`，pg/faucet 未动），栈 10 进程在列、healthz 200。
- **chat.tpl.html 行尾事故预防**：Edit 工具写盘引入 CRLF，git stash/pop 往返按 .gitattributes(eol=lf) 归一回 LF（e622060 钉版惯例）；三个模板消费探针（toolcard-frames 31/ui-logic 56/ia-logic 7）归一后复跑全绿。chat-bridge.tpl.js 未受影响（cmp 仍一致实证）。

## 不做（任务裁定）
- NUL 注入缓存碰撞（P3-B，键已含 \0 分隔，注入面理论性，backlog）；<changes> 段间歇缺失（P3-C 模型行为）；Tab 菜单残留（P3-D 独立 UI 批）；busy-merge 窗口（QA 裁定保留）；假路由 :20129 未动。
