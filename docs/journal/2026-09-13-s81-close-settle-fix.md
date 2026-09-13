# s81：秒删会话进程泄漏修复（QA s80g 转交产品级缺陷）

日期：2026-09-13 · 角色：pf-engineer · 上游：tmp/s78g-qa-11b.md「转交」节 + research/17 s80g 补录

## 机制勘误（源码级，先于修法）

QA 假说「close 先于树装配完成发出」经 v1.46 本机源码 + v1.50 官方源双核实证**不成立于 delete 路径**：
`handle_new_session → finish_new_session_setup → activate_acp_session`（含 `load_extensions_from_session`
join_all await）全部完成后才回包——bridge 收到 resolve 时树已装配完。真实形态 = **装配刚完成的冷/载窗内
teardown 竞态丢失**（kill 部分执行后丢失，9 进程永久存活）。本会话冷窗独立复现 2 轮 ×5 建删 0 泄漏（触发
随机态）；「等装配再 close」恒真恒无效 → 修法取**错峰**。on_close_session 幂等语义复核（HashSet insert +
remove，bogus close 无害）。

## 修复（chat-bridge.tpl.js 最小 diff；bin 产物 bootstrap 重物化 cmp 逐位一致）

- `noteSessionBorn`：session/new resolve（=装配完成）登记出生，三个 resolve 点（subscribe(null)/rescue/
  switch_model）全覆盖，先于代际判定（迟到丢弃的孤儿同享延迟）。
- `acpCloseSession`：delete_session 与 staleNewSession 孤儿回收统一入口——幼龄（<CLOSE_SETTLE_MS=10s）
  延迟到窗末发 close（回执/DB 删除时序不变）；满龄/未登记即发（桥重启前旧会话无树，语义同旧）。同 sid 重复
  删除幂等去重。
- `flushPendingCloses`：任何 session/new **发起点**先冲刷全部 pending close 再落笔（同流 FIFO 保序）——
  sid 复用（删当日最新→MAX+1 回退，实测 5 连建删恒同 sid）场景下 close 必先于新会话落笔：复用会话
  「closed 守卫→救援」语义逐字保持 + research/21 G6 删除内容零复活（旧 Agent 必先关）。
- rollbackRewrite 步2 事务性 close 不动（不同机制）。

## 验证矩阵

- 行为断言 tmp/s81-verify.js **5/5**：秒删树 born+8s 仍在（延迟生效铁证）/born+30s 内回收/复用 prompt→
  rescued 非挂死/满龄 ≤10s 回收（即发语义保持）/相位清理回基线。
- QA 复现配方冷窗 ×5（tmp/s81-repro.js）：**leaked=0**（pid-SET 语义）。
- 桥日志实录 `pending closes flushed before session/new: <sid>`（pc.log）。
- 全量 **e2e 57/57 + fuzz 178/178**（首轮 e2e §18c 单红=QA 已归档沙盒批载竞态家族，净机复跑绿；与本 diff
  零交集——该探针自建沙盒桥）。
- 附带（QA §4 建议小项）：e2e §11b ws-delete-receipt 红时保留 tmp 日志（rm -f 吞证据）。
- 探针残留清理：全部会话经产品路径 delete_session 删除，DB 复核归零。

## 留档

- 已知极限：SETTLE=10s 为错峰工程值非机理根治（goose 内部 kill 丢失不可桥侧观测）；90s 慢 teardown 形态
  桥侧无杠杆（§11b 20s 门对它本就红=既有观察项）；闲置/救援放弃会话滞留面不变（主控裁决）。
- 教训入册 dev-lessons-s78.md #15/#16（转交假说须源码复核再定修法/不可复现≠不存在→严格不劣于设计+行为断言/
  探针相位污染/rm -f 绿清红留）。
- research/17 补录 s81 实施节（VERIFIED-RUN）。
