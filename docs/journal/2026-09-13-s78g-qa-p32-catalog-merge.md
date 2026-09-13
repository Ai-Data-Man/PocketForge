# s78g QA s78f P3-2 落地——catalog 字段级合并（2026-09-13）

上游：tmp/s78f-qa-review.md P3-2（catalog 整文件合法即采用，模板演进被存量文件静默遮蔽的结构性漂移面；s78f 批明确留档下批）。基线 e2e 57/57 + fuzz 178/178。最小 diff 3 文件，一次 commit。

## 修法（chat-bridge.tpl.js readMcpCatalog）
- 整文件优先→字段级合并：入口门放宽为只校 id（合并键）；`okMcpId` 上提共用（okMcpItem 与合并门同源，防两份 id 正则漂移）。
- 合并语义：同 id 逐项 `{...模板条目,...运行时条目}`（运行时键优先=用户/运行期自定义保住；缺键由模板回填——desc 注记/未来字段演进对存量部署可见）+ 运行时缺的模板条目全量补尾（运行时序优先）。
- 合并产物整体仍过 okMcpItem 同门：模板外自定义条目无回填源，字段不齐=整体回落（原门语义不变）；运行时键值类型非法（如 name 传数字）同样整体回落。
- 不动面：_schema 兼容照旧；读侧永不改写用户文件（UI 变更写侧以合并视图落盘=s72「顺带写干净清单」语义自然延伸）；坏 JSON/坏 id/重复 id/空 catalog 回落路径与 warn 文案逐字不动。
- 已知语义（设计内，留档）：删内置条目会被模板回补（模板=保底目录；删自定义条目不受影响）——QA 建议方向「运行时无该条目则模板条目全量进」的直接推论。

## 探针（mcp-catalog-probe D8 节 +4ck，7→11；fuzz 标签同步，fuzz 总数 178 不变）
- ① fetch 缺 desc 键→回填模板 desc（断言含 s78e 注记特征「接口类(json)」，模板 desc 再演进时同步此特征串）+无回落警告（warn 在场=整体回落，判别点）。
- ② 运行时自定义 name/desc 保住（同文件走合并非回落）。
- ③ memory-graph 整条缺→模板全量进且补尾+运行时序优先；pkg/entry 断言走 /api/config/market（mcpstore GET 视图只出 id/name/desc/license）。
- ④ 无运行时文件→原路（首启生成默认 3 条+_schema:1 落盘）。
- 修前红实证：旧桥（HEAD 物化）跑新探针=8/11——三合并 ck 红（回落 warn 实锤+自定义被清+默认序）+④绿对照；修后 11/11。

## 验证矩阵
| 项 | 结果 |
|---|---|
| mcp-catalog-probe（修前→修后） | 8/11（D8-①②③红）→ 11/11 |
| e2e-chat 全量 | 57/57（fresh 栈，最终代码首轮绿） |
| fuzz 全量 | 178/178 首轮绿（顺序跑） |
| 物化 | cp tpl→bin + cmp 逐位一致（node --check 双过） |
| 栈 | 仅 pc process restart chat-bridge，healthz 200 ok |
| 纪律 | explorer 零开窗；假路由/pg 未触碰；探针沙盒自清（.mcp-cb 无残留） |

## 过程观察（跟进项，非本批缺陷）
- e2e §11b ws-close-reclaim 套件内偶发红（本会话 6 跑 4 红：run1/2/3/5/6 红、run4/7 绿），红形态=「extension processes did not appear, count stuck at baseline」。
- 归因证据：同前置（restart→healthz→全量）F/P 翻转（run3 F vs run7 P）；standalone 同码基线 0/27/99 均 PASS；A/B 对照 HEAD 桥 1/1 绿；本 diff 无代码路径关联（纯读时合并，不触 session/extension 生命周期）。属 s80 research/29 已记录的进程树容差家族（STATE stale 家族：MCP 句柄占用至桥重启；套件级进程树 27/run 积累形态同源）。证据留痕 tmp/reclaim-grab-*.log。建议 QA 单列取证（勿与本批合并归因）。

## 未做（明确跳过）
- _schema 2 版本迁移钩子（QA 备选方案；字段级合并已消遮蔽面，schema 升级留待真有破坏性目录变更时）。
- QA 报告其余 P3 项（P3-3/P3-4/P3-6/P3-7）不在本批任务范围。
