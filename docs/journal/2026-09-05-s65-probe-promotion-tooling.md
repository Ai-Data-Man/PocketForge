# 2026-09-05 s65 — 报告探针转正 + 工具链竞态清账 + goose 上游情报

## 输入
s64 收尾队列 + 章程"学习"线。基线 e2e 33/33 + fuzz 44/44。

## 落地
1. **报告 v2 探针转正**（5922d1d）：s64 四个 tmp 探针整理为 tools/e2e/report-probe-{static,sandbox}.js + report-probe.sh 编排；static 39 ck（秒级）+ sandbox 29 ck（自建沙箱真桥 18790/18799，实测 31s < 90s 门槛）挂进 e2e-chat.sh 第 12 节。转正适配三条留痕：删两条一次性 git-diff 断言/qa-edge 注释行断言更新为 67b871d 修复后行为/路径改 __dirname。e2e 变为 **35/35**。
2. **「浏览全部加上限」零 diff 裁决**：任务前提失实——renderAllPane 自 P29 起有 PAGE_N=30 分页+翻页器；工程师拒绝死代码改动并留证，主控复核确认，STATE 勘误撤销该错误条目（教训：主控自己也会犯"未核实就归约"，GUI 观察不完整时别写 backlog）。
3. **EPIPE 竞态修复**（a3adb0d）：e2e 第 11 节 `node|grep -q` 在 pipefail 下偶发中止全量——输出先落 tmp 文件再 grep；3 遍全量 35/35 验证。
4. **goose 上游情报**（research/04 s64 节，f203083）：latest v1.49.0；三条红线（scheduler persist/schedules ACP/GOOSE_PATH_ROOT）源码级未动；#11383 permission.yaml 多进程写锁随 v1.50；裁决=不追 v1.49.0，等 v1.50（~09-09±3）或退 v1.48.0，回归五面清单落档。**升级预案重建**（research/goose-upgrade-playbook.md，abfbe3a）——原引用文件从未存在，勘误闭合。
5. **矩阵 13 全归档态**（主控 GUI，IAB）：API 批量归档 175 活跃会话→页面复核：活跃区空（不出「还没有对话」，直接归档头，符合双空才显示空态的设计）/归档头计数/展开 30 行+↩✕ 按钮齐全/「已归档共 50 个，显示最近 30 个」截断提示（s64 修复实战生效）/UI 取消归档回活跃区。全量恢复原状（unarchive 175，归档键回到 134）。
6. **沙箱 rmSync 间歇 EPERM 取证+修复**：根因双因子——①stopBridge 只杀桥，goose 孙进程（SQLite/目录句柄持有者）靠 pipe EOF 自退，句柄拆除窗 0.1-0.3s（1.2 万文件形态最长 2290ms）；②node v24.14.0 上游 Sleep 单位 bug（`Sleep(i*retryDelay/1000)` POSIX 秒语义误植）使 rmSync maxRetries 重试零间隔形同虚设（取证：baseline 19/20 失败、maxRetries 臂 16/20 仍失败、显式轮询臂 0/20）。修复=轮询重删（200ms 间隔/8s 上限）替换 4 处调用点，明确禁用 retryDelay hack（Node 升级后语义会反转成挂死）。探针 tmp/forensic-rm-perm/（三臂对照+进程 census，VERIFIED-RUN）。

7. **qa 快审转正探针**：断言弱化审计三条证据链闭合（70→68 恰剩声明删除的两条，隐私/截断保护网一条不少）；抓出 1 条 P2——static 探针「脱敏不误伤」断言因 `===` 优先级恒真（skype 守卫死代码），修复 7762fdb 带守卫咬人证明（变异注入 A/B/C/D 四证明）；P3 临时目录 finally 兜底一并修。
8. **对标 2026 Q3 落档**（research/11，cf4b22f）：ADR 选型更稳（OpenHands Windows 仍 WSL+pip、OpenClaw CVE 集群、8 强无三条件全达者，拒因勘误进 research/04）；Manus 数据删除事件=本地便携最强外部论据（话术挂 P32）；Plan Mode 三要素作任务选择层设计输入（P32）；MCP 2026-07-28 stateless 规范→商店选型加 SDK 大版本护栏（backlog）。
9. **使用说明（妻子面向）补 📮 条目**（3696123）：手册对 s61 新功能过时，闪退处置从"拍照"改走"点📮发报告文件"。

## 新观察
- 侧栏「已归档 N」的 N=goose session/list 返回窗口大小（实测 50），非库内归档总数（216）——会话少时无感，规模化后属信息精度问题，挂主线 4 观察。

## 验收
e2e 35/35（+2）+ fuzz 44/44 全绿（主控独立复跑）；矩阵 13 全过且 dev 数据完全还原。

## 遗留
- 已落地 6ec8c29：rmSandbox 轮询（200ms/8s）替换 4 处调用点；验证 5 遍沙箱 29/29 + 2 遍 e2e 35/35 + 等价复现 harness 10/10（10 次全部撞窗、全部轮询脱困，反证 baseline 10/10 会失败）
- goose 升级窗口裁决已挂 backlog，等护航窗口（预案就绪）
