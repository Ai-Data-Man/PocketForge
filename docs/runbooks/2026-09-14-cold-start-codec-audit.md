# PocketForge v0.9.12 冷启全流程复盘（下载解压 → 零配置使用）

日期：2026-09-14　被测物：`dist/PocketForge-20260914-v0.9.12.zip`（sha256 `872fcee5…` 已核对，与 .sha256 一致）
方法：全新解压到干净目录 → 真实双击式启动（`cmd /c 启动数字员工.cmd`，输出重定向抓取原始字节）→ 逐环节字节级核验 → 单变量隔离复现。
证据：全程原始字节落盘于 `C:\PF-Test\`（已清理），下文每结论附可复现命令或字节样本。

---

## 0. 结论摘要

| # | 问题 | 严重度 | 状态 |
|---|---|---|---|
| P1 | 控制台中文/箭头符号乱码（用户已报） | **中**（观感，不阻功能） | 根因确定，修法已验证 |
| P2 | 安装路径含非 ASCII 字符时 `.cmd` 被 cmd.exe 误解析 | **高**（功能失败） | 根因确定，修法已验证 |
| P3 | 安装路径含非 ASCII 字符时 PG 初始化必失败 | **高**（PG 全废） | 根因确定（上游 PG 限制） |
| P4 | `%APPDATA%` junction 是悬挂状态且永不修复 | **高**（记忆丢失/写入报错） | 根因确定 |
| P5 | 包内混入开发机残留（`tmp/`、`dev-stack-up.ps1` 含 `C:\ZCodeWorks`） | 低 | 确认 |
| P6 | 出厂默认模型名 `deepseek-v4-flash` 已下线 | 中 | 确认（实测 109 个模型名单内无此名） |
| P7 | 文档与实现不符（"启动中" vs `starting...`） | 低 | 确认 |

干净的方面（核验通过，无需改）：zip 中文文件名带 UTF-8 标志位；4 个顶层 `.cmd` 均为纯 ASCII 无 BOM；`bootstrap.ps1` 带 BOM 正确；`使用说明.md`/welcome 模板 UTF-8 且 HTML 声明 `charset=utf-8`；`process-compose.yaml` 无硬编码绝对路径（全走 `${FORGE_ROOT}`）；ASCII 路径下整栈冷启全部健康。

---

## 1. P1 控制台乱码 —— 用户已报的那个

### 现象与字节证据

```
[bootstrap] permission.yaml seeded from template (first run)   ← 正常
[chat-bridge] 数据库存储：没连上数据库…                        ← 正常（GBK 字节）
[faucet] … e2 86 92 … API in seconds                          ← 乱码：e2 86 92 = UTF-8 的 "→"
```

同一份启动日志里，非 ASCII 字节分两类：

- **GBK 字节**（可打印正常）：来自 `bootstrap.ps1`（PowerShell 5.1 按 ANSI 输出）、cmd 自身 echo。
- **UTF-8 字节**（显示为乱码）：来自 faucet（Go，`→` 与英文拼写）、chat-bridge（Node，`数据库存储：…`）。

判定命令（在解压目录执行）：

```bash
python -c "
d=open('out-launch.bin','rb').read()
for b in [0xe2,0x86,0x92]: pass
seg=d[0xf9d:0xfa8]
print('utf8:',seg.decode('utf-8','replace'))   # e → API i
print('gbk :',seg.decode('gbk','replace'))     # e 鈫� API i
"
```

### 根因

Windows 控制台代码页为 **CP936（GBK）**，而 Go / Node 程序向 stdout 写 **UTF-8** 字节。控制台按 CP936 渲染这些字节 → 乱码。

这不是 PocketForge 自己的 bug，而是 **UTF-8 生产者 × CP936 控制台**的经典错配。三个生产者：

| 生产者 | 语言 | 写出的编码 |
|---|---|---|
| faucet | Go | UTF-8（含 `→`） |
| chat-bridge / node | Node.js | UTF-8（含中文提示） |
| bootstrap.ps1 | PowerShell 5.1 | ANSI（GBK）——**正常** |

注：`nats-server`、`process-compose` 的日志是纯 ASCII，不参与乱码。

### 修法（已实测验证）

在启动器首行 `chcp 65001`：

```bat
@echo off
setlocal EnableExtensions
chcp 65001 >nul          ← 新增
```

实测（`cmd /c` 下逐个验证）：
- 改前 `NODE-CN 鏁版嵁搴撳瓨鍌?` → 改后 `NODE-CN 数据库存储`
- 改前 `PS-CN 鏁版嵁搴撳瓨鍌×` → 改后 `PS-CN 数据库存储`

**注意副作用**：`chcp 65001` 会让 cmd 按 UTF-8 解析后续 `.cmd` 文件，而这与 P2 的修法相互纠缠 —— 两者必须一起改，见 §4。

---

## 2. P2 安装路径含中文 → `.cmd` 被 cmd.exe 误解析

### 现象

把整包解压到 `C:\...\数字员工\` 后双击启动，控制台出现：

```
[pg-init] 'cketForge' 不是内部或外部命令，也不是可运行的程序
[pg-init] 'ORGE_ROOT' 不是内部或外部命令，也不是可运行的程序
系统找不到指定的路径。
```

`bootstrap.ps1` 生成的两个包装脚本（`bin\memory-mcp.cmd`、`bin\pg-init.cmd`）里的路径被 cmd.exe 解析错位，变量赋值失败，命令被截断成碎片。

复现（生成物落在中文目录）：

```bash
cmd /c "C:\...\数字员工\bin\pg-init.cmd"
# → 'cketForge' 不是内部或外部命令 …
```

### 根因（两个独立因素，缺一不可）

`bootstrap.ps1` 用 `[IO.File]::WriteAllText()` 写文件，其默认编码是 **UTF-8 无 BOM**。而 `cmd.exe` 按**当前控制台代码页**（这里是 CP936）逐字节解析 `.cmd`。路径里的中文被写成 UTF-8 三字节序列，cmd 按 CP936 两两配对读取 → 字节错位 → 吃掉下一行开头（正是该仓库自己在 `停止数字员工.cmd` 注释里记录过的同族事故：*"UTF-8 Chinese comment bytes got paired as GBK and ate the next line's head"*）。

单变量矩阵（同一份内容、只改编码）：

| 编码 | cmd 解析结果 |
|---|---|
| UTF-8 无 BOM | **FAIL**（字节错位） |
| UTF-8 带 BOM | **FAIL**（BOM 被当成命令的一部分：`'锘縮et' 不是内部或外部命令`） |
| GBK (ANSI) | **OK** |

第二个因素：**行尾**。目标机的 `.tpl.cmd` 模板是 **LF** 结尾（`memory-mcp.tpl.cmd` 实测 `b'@echo off\nrem …'`），而 cmd 需要 CRLF。中文路径 + LF 时，每行最后一个中文字符的末字节会被当作行尾处理而丢失。完整矩阵（GBK 编码固定，只变行尾）：

| 目录名 | 行尾 | 结果 |
|---|---|---|
| 中文 | LF | FAIL |
| 中文 | CRLF | **OK** |
| ASCII | LF / CRLF | OK / OK |

### 修法（已实测验证）

`bootstrap.ps1` 写 `.cmd` 时同时修正两处：

```powershell
# 1) CRLF 行尾（模板是 LF）
$memCmd = $memTpl.Replace('__FORGE_ROOT__', $ForgeRoot).Replace("`r`n","`n").Replace("`n","`r`n")
# 2) 按 ANSI 代码页写出（cmd 就是按这个代码页解析的）
[IO.File]::WriteAllText($path, $memCmd, [Text.Encoding]::Default)
```

实测：中文路径 + CRLF + ANSI → `set` 变量正确、路径可解析（`RESOLVE=OK`，`VAR` 还原为原路径）。

**更稳的替代**：让生成的包装脚本**保持纯 ASCII**，用 `%~dp0` 自推导根目录（顶层四个启动器已经这么做了）。这样路径里有没有中文都不进文件：

```bat
@echo off
set "FORGE_ROOT=%~dp0.."
if "%FORGE_ROOT:~-1%"=="\" set "FORGE_ROOT=%FORGE_ROOT:~0,-1%"
```

实测 `%~dp0` 方案在中文路径下同样 `RESOLVE=OK`。推荐这个（不依赖代码页，零编码风险）。

---

## 3. P3 中文安装路径 → PG 初始化必失败（上游限制）

### 现象

中文路径下 `pg-init` 必然失败，且 **initdb 会把已建好的数据目录删掉**：

```
performing post-bootstrap initialization ... FATAL:  invalid byte sequence for encoding "UTF8": 0xca 0xfd
child process exited with exit code 1
initdb: removing data directory "C:/PF-Test/数字员工/data/pg"
```

`data/pg/PG_VERSION` 不存在 → 后续 `pg` 进程 `Skipped`，PG 全废。

### 根因（单变量隔离到底）

关键实验：**让 initdb.exe 的位置（安装根）与数据目录分别取 ASCII / 非 ASCII**，其余全部固定（GBK+CRLF 的 `.cmd`，同一 initdb 二进制）:

| initdb.exe 所在路径 | 数据目录 | 结果 |
|---|---|---|
| ASCII | ASCII | OK |
| ASCII | **中文** | **OK** ← 数据目录是不是中文，无关 |
| **中文** | ASCII | **FAIL** |
| **中文** | 中文 | **FAIL** |

→ 触发条件是 **initdb.exe 自身所在路径含非 ASCII**，与数据目录无关。

继续收窄（`-L` 显式指定 PG 的 share 目录）：

| 变体 | 结果 |
|---|---|
| 不传 `-L`（出厂行为） | FAIL |
| `-L <ASCII share 目录>` | **OK** |
| `-L <非 ASCII share 目录>` | FAIL |

→ 真正敏感的是 **share 目录路径**（initdb 从自身位置推导 `share/`，在 post-bootstrap 阶段把该路径当 UTF-8 处理，中文路径导致 `invalid byte sequence`）。补证：把非 ASCII 的 share 用 junction 映射出一个 ASCII 路径后 `-L` 指过去 → **OK**，说明 `.exe` 路径本身无关，只有 share 路径生效。

这是 **PostgreSQL 上游在中文路径下的既有限制**，不是 PocketForge 引入的缺陷；但 PocketForge 把它暴露给了"零技术背景用户双击解压"的场景。

### 处置建议（按成本排序）

1. **最省事、最稳**：启动器加一次预检——`FORGE_ROOT` 含非 ASCII 时给出明确人话提示，让用户换个纯英文/数字路径（如 `D:\PocketForge`）。目标机是企业 Windows 便携文件夹，这是可接受的交付约束，且必须在**第一次失败前**说清楚，不能靠用户看 PG 日志。
2. 若必须支持中文路径：启动时用 `mklink /J`（免管理员，产品已在 1c 用于 memory 目录）建一个 ASCII 路径映射（如 `%LOCALAPPDATA%\PocketForge` → 真实根），并让 `pg` 从映射路径启动 + `-L` 指向映射后的 share。

注意区分：`postgres.exe` **服务**阶段另有一条与本问题无关的失败——本测试机以 Administrator 身份运行，PG 拒绝以管理员启动（`Execution of PostgreSQL by a user with administrative permissions is not permitted.`）。目标机是**无管理员权限**的企业用户，正常情况不会遇到；但若内测机有人用管理员账号双击，PG 会同样起不来，值得在文档/预检里带一句。

---

## 4. P1 与 P2 的相互纠缠（重要）

`chcp 65001`（修 P1）与"ANSIC 编码 + CRLF"（修 P2）会互相干扰，**必须成套改**：

- 只加 `chcp 65001`：cmd 改按 UTF-8 解析 `.cmd`。此时若 `.cmd` 是 ANSI/GBK 写的 → **FAIL**；若 `.cmd` 是 UTF-8 写的但模板是 LF → **FAIL**。
- 实测矩阵（中文路径）：`UTF-8 无 BOM + chcp 65001` → FAIL；`GBK + 无 chcp` → OK；`GBK + chcp 65001` → FAIL。

**推荐组合（风险最低）**：
1. 启动器首行 `chcp 65001`（解决 P1 乱码）。
2. 生成的包装脚本走 `%~dp0` 纯 ASCII 方案（绕开 P2 的编码问题，不再受代码页影响）。

这两条组合后，中文路径下整栈冷启实测通过：`8099 / 8790 / 8091 / 4222` 全 UP，控制台零乱码、零解析错误。

---

## 5. P4 `%APPDATA%` junction 悬挂且永不修复

`bootstrap.ps1` 1c 段把 `%APPDATA%\Block\goose\config\memory` 建成指向便携目录的 junction（goose-mcp 硬编码该路径），但守卫是 `if (-not (Test-Path $memApp))`。

**问题**：`Test-Path` 对**悬挂 junction 返回 True**。实测：

```
Test-Path 返回 : True
Target         : C:\PocketForge-Test\conf\goose\config\memory
Target 存在    : False          ← 目标已被删除
写入尝试       : FAILED (FileNotFoundError)
```

后果：用户按《使用说明》"换电脑：整个文件夹拷过去"或**改了文件夹名**之后，junction 仍指向旧路径 → 目标不存在 → 任何经该 junction 的记忆读写报 `FileNotFoundError`，而 bootstrap 因 `Test-Path=True` **永远不会重建**，每次启动都静默跳过。修法是删掉 junction 再启动可恢复，但用户不可能知道。

### 修法建议

守卫改为"目标是否有效"，而不是"路径是否存在"：

```powershell
$ok = $false
if (Test-Path $memApp) {
    $it = Get-Item $memApp -Force
    $ok = ($it.LinkType -eq 'Junction') -and (Test-Path ($it.Target -join ''))
}
if (-not $ok) { 删除失效项后重建 }
```

---

## 6. 包内卫生与配置（P5–P7）

**P5 开发机残留进包**：包内含 `tmp/`（`s78-agg.js`、`s78-init.js`、`s78-meta.js`、`s78exam-init.js`、两个 openapi.json）与 `conf/dev-stack-up.ps1`，两者都写死开发路径 `C:\ZCodeWorks\PocketForge\forge`。产品代码**零引用**它们（已全仓 grep 确认）。

根因在 `tools/package.sh` 的 SKIP 列表，只排了 `data/*` 与 `.playwright-mcp`，没排 `tmp/`：

```python
SKIP = ('data/chat-window-profile', 'data/pw-chat-check', 'data/pw-chat-v2check',
        'data/backups', 'conf/goose/state', 'conf/goose/data', '.playwright-mcp')
```

建议加 `tmp/` 与 `conf/dev-stack-up.ps1`。风险等级低（无运行时引用、无密钥），但它让交付物里出现了开发机路径，与"零污染/审计友好"的定位不符。

**P6 出厂默认模型已下线**：包内三处写死 `deepseek-v4-flash`（`bootstrap.ps1` 种子 + 幂等补键、`conf/goose/config/config.yaml`、`conf/goose/config/custom_providers/forge-router.json`、模板 `goose-config.tpl.yaml`）。实测本机路由 `GET /v1/models` 返回 109 个模型，**`deepseek-v4-flash` 不在其中**（现有为 `deepseek-v4.1-flash` 等）。STATE.md 记录该名 2026-09-12 已下架、dev 侧已切 `deepseek-v4.1-flash`，但**发版物未同步**。新用户首启即撞"模型不可用"，需靠 v0.9.12 新增的 provider 健康告警条兜（该机制存在，故降级为"中"）。

**P7 文档与实现不符**：《使用说明.md》写"等黑色窗口出现 `[PocketForge] 启动中`"，但启动器实际 echo 的是英文 `[PocketForge] starting... pc=… faucet=…`。用户按文档找中文串会找不到。建议二选一：把文档改成实际的英文串，或把 echo 改成中文（注意中文 echo 在 CP936/CP65001 下都要能正常显示）。

---

## 7. 核验通过项（无需改动）

- **zip 中文文件名**：5 个顶层中文项（`使用说明.md`、4 个 `.cmd`）均带 UTF-8 标志位（bit 11），Python/资源管理器/`Expand-Archive` 解出后文件名正确。
- **脚本 BOM 策略正确**：4 个顶层 `.cmd` 全部**纯 ASCII 无 BOM**（含中文注释的 `停止数字员工.cmd` 也已按纪律改为 ASCII 注释）；`bootstrap.ps1` 与 `dev-stack-up.ps1` 带 UTF-8 BOM，PS 5.1 能正确读中文字符串。这一层已经做对了，P2 纯粹是**生成物**（bootstrap 写出的 `.cmd`）漏了同一套纪律。
- **路径与端口**：`conf/process-compose.yaml` 零硬编码绝对路径；端口由 `data/*.port` 动态分配，`ports.env.yaml` 由 bootstrap 每次按实际路径重写（出厂包里那份带 `C:/ZCodeWorks` 的副本会被覆盖，实测确认）。
- **ASCII 路径冷启**：整栈健康（faucet/chat-bridge/nats/pc 全 UP，`healthz` 返回 ok；`daily-backup`、`faucet-rawsql` 正常退出）。
- **文档编码**：《使用说明.md》《welcome.shown》为 UTF-8 可解；HTML 模板 `<meta charset="utf-8">` 正确。
- **发布物完整性**：zip 的 sha256 与随包 `.sha256` 一致；`SHA256-EXE.txt` 覆盖包内全部 exe。

---

## 8. 建议改动清单（最小 diff）

| 文件 | 改动 | 解决的问题 |
|---|---|---|
| `forge/启动数字员工.cmd` | 首行加 `chcp 65001 >nul` | P1 |
| `forge/conf/bootstrap.ps1` | 两个 `.cmd` 写出改 ANSI 编码 + CRLF；或模板改 `%~dp0` 纯 ASCII | P2 |
| `forge/conf/bootstrap.ps1` | junction 守卫改判 Target 有效性 | P4 |
| `forge/启动数字员工.cmd` | 启动前预检 `FORGE_ROOT` 含非 ASCII → 人话提示换路径 | P3 |
| `forge/conf/bootstrap.ps1` + goose config 2 处 | `deepseek-v4-flash` → `deepseek-v4.1-flash`（或置空由健康探测接管） | P6 |
| `tools/package.sh` | SKIP 加 `tmp/`、`conf/dev-stack-up.ps1` | P5 |
| `forge/使用说明.md` | "启动中"改为实际的 `starting...` | P7 |

改完请在同一台机器上跑一次**中文路径 + 首次解压**的冷启作为验收，这一场景同时覆盖 P1/P2/P3。
