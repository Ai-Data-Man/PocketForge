# s80 冷启首跑红观察项——两大新数据点家族受控实验（research/29）

- **裁决**：①p34「pg stop/start 过渡竞态」归因**被否定**——start 过渡 0/5/15/30s 档 12/12 绿（本机热目录 pg 秒级开端口，e2e 尾部数分钟无 pg 操作，串跑时间几何不成立）；真·运行中停 pg 的红=签名 C（探针 SQL）/签名 A（桥 20s waitPg<30s 重探），**均非** s76c 的「文件未采纳」（签名 B）；B 代码上仅 reconcile 亚秒死连（串跑无停 pg 者=不可达）或采纳写被 FS/AV 锁静默吞（:400 catch{}，B2 假说 UNVERIFIED 转首要）→ **s76c 红根因 UNRESOLVED**。②§11b 红 19 跑 0 复现（桥重启即刻×5/全栈冷启即刻×7/负载×2/基线>0×1/热×4）——扩展 spawn 实测 1.4-1.8s（10s 门 5-7 倍裕度），「会话间共享扩展进程」假说证伪（基线 9→18 每会话独享 +9）→ 瞬态，残余=真冷机 EDR/IO 偶发（同 research/15 E4 性质）。
- **环境实锤两枚（已处置）**：PFdrill2 僵尸「正在运行」态 pc down 后**确定性复发**两次→`/Run` 静默被拒（0x800710E0）却报「成功」（runbook 补丁：先 `/End` 再 `/Run`，两次验证，冷启 6.0s 至桥 HTTP）；pg 快循环 stop/start ×6 复现孤儿 postgres backend（`--forkchild=backend` 占目录→新实例 exit(1)→pc 耗尽 3 重启→Completed；s69③ 家族 +1，手清恢复）。
- **建议**（tools 侧可夹带，未动）：p34 waitPg 20→50s（吸收签名 A）；§11b 扩展门 10→20s；观察项收窄到「仅签名 B 复现才追」+ §11b 再积 2 独立日全绿可关。签名谱系表/复现命令见 docs/research/29-coldstart-first-red-rootcause.md。
- 终态：全栈 Ready（pg/桥 restarts=0，桥 pg 态），explorer 0 窗，产品代码零触碰；副作用（≈20 空会话 dev 树、6 分钟 pg 局部不可用窗、一次自伤脚本事故留痕）全记录于 research/29 §七。
