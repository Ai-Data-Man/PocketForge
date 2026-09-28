# Runbook：手动覆盖升级通道 + 本机栈倒换操作实录（s104，2026-09-29）

> 场景：无内网更新通道时，把新版 zip 手动覆盖到既有安装目录（数据保留）。s104 升级路径测试实测沉淀。
> 前置纪律：AGENTS §8.1——测试只在 `C:\PF-TEST\<场景>` 做，测完整删；用户真机树永不做试验田。

## 1. 覆盖升级的正确通道

**不要**对既有目录直接 `Expand-Archive -Force`：对已存在树逐文件校验极慢（实测 25,306 文件 7 分钟超时未完成）。

正确序（实测 ~3 分钟）：

```powershell
# ① 新包先解到同盘新目录（快）
Expand-Archive -Path 'C:\...\PocketForge-<date>-<ver>.zip' -DestinationPath 'C:\PF-TEST\s104new' -Force
```

```bash
# ② robocopy /E 覆盖（不删除目标多余文件=data/ 天然保留；Git Bash 下 flag 会被吃，必须走 cmd /c 包装）
cmd //c "robocopy C:\PF-TEST\s104new C:\PF-TEST\s104a /E /NFL /NDL /NJH /NJS /NP"
# 注意 robocopy 退出码 0-7 都是成功（1=有文件复制），bash 里 rc>0 会被当失败——管道后用 `; echo done` 判行
```

- 升级生效判据：新模板标记（如本批 `s104/R2-F3` 字符串）grep 在场 + `cat VERSION` + 冷启后 cold-surface-probe（新锚=升级真生效，不是只解压了）。
- 数据保留判据：`data/providers.json` 升级前后 `diff` 逐字节一致 + 旧会话在侧栏存活。

## 2. 本机 dev 栈与沙盒的倒换（端口互斥：8790/8099/8091/5432/4222/8222）

```powershell
# 停 dev 栈（顺序不能反：PFdrill2 任务会重拉栈）
schtasks /End /TN PFdrill2
```

```bash
cd /c/ZCodeWorks/PocketForge/forge && ./bin/pc/process-compose.exe -p 8099 down   # -p 必带（默认 8080 打 usage）
```

```powershell
schtasks /Run /TN PFdrill2   # 恢复；~20s 后 healthz 200
```

## 3. 沙盒产品脚本启动/停止（Git Bash 下中文 .cmd 文件名传参会被吃——cmd 只打 banner 不执行）

- 用 8.3 短名：`cmd //c "启动数~1.CMD"`（`dir /x *.cmd` 查短名）；停止 `cmd //c "停止数~1.CMD"`。
- 停止后残留收尾：`Get-Process` 按命令行含 `PF-TEST` 匹配全杀（含锁 db 的 goose/pg/faucet），再核 `netstat` 六端口零监听。

## 4. 已知坑（本会话实录）

- 停栈后 faucet 偶剩单进程（监听 8091）：等 10s 不退就按命令行匹配杀。
- 升级继承的半配置（providers.json `models:[]`）会在新版触发池空守卫（s104/R2-F4）——这是修复后的正确行为；旧版会 400 Missing model 误报成「服务商不通」。
- IAB 自动化测试产品页须预置 `window.alert/confirm` 覆写：产品 alert() 在 IAB 不弹显 → JS 主线程阻塞（零 CPU 僵死），且页面在 `cmd //c` 启动器弹窗抢焦点后 rAF 节流会让 Playwright 动作性检查永不安定——用页面侧 `el.click()` 派发。
