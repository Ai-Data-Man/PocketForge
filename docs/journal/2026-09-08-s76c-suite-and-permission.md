# s76c 套件 rc 捕获 + 错误文案人话化 + permission.yaml 停追踪（裁决→实施→qa 返工闭环）

## 套件与文案（遗留⑦⑧ 销账）
- c4b8ce6：e2e-chat.sh 38 处探针调用统一 `rc=0; cmd || rc=$?; ck $rc`——`set -e` 下首红不再中止全套件（演练：人为红一处→套件走完、摘要 PASS=52 FAIL=1；全绿 53 与基线一致）。展示 grep 补 `|| true` 防二次杀。fuzz-chat.sh 核实无 -e、天然计数语义，未动。
- ff03b03：桥非 NF 错误人话化——归类门（classifyUpstream）先于 S26 门，unauthorized→Key 指引 / S26 命中→服务商不通 / 其余→「这一轮没完成请重发」；英文内部错误零透出。rescue-guard-probe 20→22ck（S9 改牙断言+S10/S11 新案，旧模板恰红五条验证有牙）。桥重启 healthz 200。
- f148671（第二批）：剩余 7 行 `[ ]` 断言+15 行命令替换赋值 set -e 安全化+L190 unzip `|| true`；ck 65↔65 零增减。

## permission.yaml 停追踪（裁决 ef08496 → 实施 → qa 两轮）
- 裁决（pm）：停追踪+显式种子模板（取证修正题设：种子从不存在于模板，「首启种子」实为被追踪运行时副本随包直发）。
- 实施 54ec3a3+f148671：git rm --cached+gitignore、permission.tpl.yaml（=b10b5af+1 注释行）、bootstrap 1b-7 copy-if-missing、package.sh:28 剥离。活体证据：e2e 18 节真实 goose 会话 03:17 回写运行时副本后 `git status` 0 行（修复前=第 5 次追认提交场景）。
- **qa 抓出裁决事实错误（P2-1）**：update-runner deleted 判定=「盘上有+新包无」→ 每次升级都会删+重种、goose judge 缓存每升必清，裁决「一次性过渡」不成立。主控拍板方案 (a) PROTECTED 化：55d5776 追加 `'conf/goose/config/permission.yaml'`（文件路径式条目，isProtected 精确匹配分支）+bin 物化+裁决书文末勘误节；四场景 node 断言过（盘上有+包无→保护）。缓解事实记录：默认 GOOSE_MODE=auto 不查询 permission.yaml，伤害面=手动 approve/smart_approve 会话。
- qa P2-2/P3-1（649d464+fc75240）：1b-7 空文件/缺 `user:` 块守卫（bak 留档后补种，照 1b-2 模式）+模板缺失红字告警；perm-seed-test.ps1 12/12（真实提取块+BOM 规避 PS5.1 ANSI 坑）。

## 卫生
- 仓库根 forgeconfgoose/（08-25 路径分隔符事故残留：goose 实验态+cli 日志，git 无历史）已删；dist 孤儿 .sha256 已删。
- permission.yaml 追踪面最终态：模板+裁决+update-runner 条目入库，运行时副本 0 追踪 0 脏树。

## 发布门挂账（下一打包窗口必须清）
- 沙盒冷启全流程（新装首启三键齐写无 panic+cold-surface-probe；旧→新升级实录——预期按 PROTECTED 新语义写：permission.yaml 升级零触碰）。
- research/12 §3.3「goose 缺整个 permission.yaml 行为」考证（挂起②）。

## 回归
e2e-chat 53/53 + fuzz 150/150（ff03b03+c4b8ce6 后全量绿，本轮终态）。其后 permission 批不触桥/UI 面，bootstrap 块由 perm-seed-test 12/12 覆盖。
