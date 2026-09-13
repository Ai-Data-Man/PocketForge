# s82：ws-fuzz-s50h 探针会话自清 + research/27 B1 前置验证（2026-09-13）

两项独立小批，零产品代码触碰。

## 1. QA s80g 跟进：ws-fuzz-s50h 会话残留清理

- 问题：探针 5 处 `subscribe(null)`（FIND-2 回归/FIND-4b/4c/4d/正常 prompt 回归）每轮各建一会话，跑完不删（QA 登记）。
- 修（tools/e2e/ws-fuzz-s50h.js 最小 diff）：wsSession 数据处理器收集 newSession 帧 sid；收尾逐个 `wsDeleteSession(sid)`——单连接发 `delete_session` 等 `session_deleted` 回执（≤5s 兜底）。复用 s81 acpCloseSession 语义：探针只发 delete 收回执，幼龄延迟窗/树回收归桥侧；桥回执后自断请求方 socket → 一会话一连接。
- 验证：单探针 11/11 PASS；5 会话全建全删（回执 ok=true ×5）；sessions.db 前后 646 行、sid 集零增零减（tmp/s82-before-sids.json 对照）；fuzz 全量 178/178。
- 未做：cleanup 失败不转红（日志行留痕，外部 sessions.db 计数是验收面）；e2e 全量未跑（本 diff 只动 fuzz 探针，基线面未变）。

## 2. research/27 B1 前置：外部改 permission.yaml 的热感知验证

- 问题：v1.50 #11383 的重读路径是 goose 自身 mutate 触发；外部（桥/agent）改写是否同路生效未证——决定 B1「撤销即生效还是需重启」文案。
- 实验（tmp/b1-hotperm/hotperm-probe.js，s78d-stubs/b2-perm 同手法）：隔离 root+产品 permission.yaml 拷贝+假 OpenAI+GOOSE_MODE=smart_approve 直驱 goose v1.50.0 ACP；工具面 load_skill（smart_approve.ask_before 既有项必出卡）；权限回执恒 reject_once（实验侧零 mutate）。
- 矩阵：T1 基线出卡 → 外部加 user.always_allow → T2 **同会话**不出卡（71ms）/T3 新会话不出卡 → 外部删 → T4/T5 复出卡。**结论=热感知，同会话下一轮即生效，双向，无需重启。**
- 机理（v1.50.0 源码 raw 核对 + 盘面快照物证）：无文件 watcher；内存 map 唯一换血点=mutate_permission_map（锁→重读盘→原子写→换内存），普通轮次注解/judge 缓存 mutate 高频，顺路吸收外部改写（快照差分：goose 每次自身重写都保住外部刚加/刚删条目，终态语义零实验残留）。
- 落盘：research/27 末尾「B1 前置验证附注」节（VERIFIED-RUN）；遗留 UNVERIFIED #1 按该文档 #2 先例格式关闭。B1 文案输入=「撤销即生效，时机=下一轮（非即时推送）」。
- 过程自伤记档：首版探针纯探测路径 `changed` 恒 false（加/删探测同函数），首轮快照「含load_skill」全废+mtime 被自身写污染——修为内容级 gooseRewrote 检测（diskKnown 对照）+hasEntry 直读后复跑取证。

## 验证与提交

- 探针 11/11 + fuzz 178/178（见上）；实验 EXIT=0 两态+反向全落定。
- commit ×2：①fix(e2e) 探针自清；②docs(research) B1 附注+STATE+journal。
- explorer 0 窗；dev 活体 permission.yaml 零接触；假路由未碰（已亡不管）。
