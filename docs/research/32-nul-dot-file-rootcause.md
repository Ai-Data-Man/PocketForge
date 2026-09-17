# 32 — 安装根残留 0 字节文件 `nul。` 根因（s95 遗留观察项）

- 状态：**VERIFIED-RUN**（真栈复现 + 单变量 A/B + 前缀二分定因）
- 日期：2026-09-17
- 范围：只做取证，未改动任何 `forge/` 产品文件
- 影响面：每次启动器运行在安装根落下 0 字节 `nul。`（`nul` + U+3002）。破坏「删文件夹=完全卸载」体验；Explorer 侧删不掉（Windows 保留名家族）。

## 结论（一句话）

`forge/启动数字员工.cmd` 第 75 行 rem 注释里的 `>nul。` 是唯一触发源：在 `chcp 65001`（UTF-8 代码页）已生效的前提下，cmd 对这个 UTF-8 中文注释行做**字节级配对**，`rem` 前缀与行首若干字节被吞，行尾残余 `…与 conf\apps.guard.log，故不再 >nul。` 被当成一条「命令 + 重定向」执行；重定向目标 `nul。` 的 base name 不含 ASCII `.`，不命中 Windows 保留设备名判定，于是落成真实文件，且因无数据写入而为 0 字节。

## 关键证据链

### 1）真栈复现（沙盒 = `C:\PF-TEST\cold`）

- 搭建：`robocopy C:\ZCodeWorks\PocketForge\forge C:\PF-TEST\cold /E /XD …\data\pg …\data\js`；删除 `data\{pc,faucet,pg}.port` 强制重新分配（避开 dev 栈占用的 8099/8092/5432）；启动器以 `relaunched` 参数运行（跳过降权重启分支，等价于非管理员双击路径）。
- 三次全量启动**每次都**生成 `C:\PF-TEST\cold\nul。`，大小 0。
- 文件名码点校验（Python `os.listdir`）：`0x6e 0x75 0x6c 0x3002`；UTF-8 字节 `6e 75 6c e3 80 82` → 与观察项描述完全一致。

### 2）出现时刻（200 ms 轮询目录快照 diff）

`WATCH START 16:41:22.817`

| 相对时刻 | 事件 |
|---|---|
| +15.36 s | `data\pc.port` 重写 |
| **+15.58 s** | **`nul。` 生成，ctime 16:41:38.282** |
| +15.59 s | `conf\ports.env.yaml` 重写 |
| +16.00 s | `conf\apps.env.yaml` 重写 |

→ 文件出现在 bootstrap（`conf\bootstrap.ps1` 写 pc.port 之后）到 cmd 读取端口文件之间，栈子进程（pc/node/faucet/nats/pg）尚未启动。

### 3）A/B 单变量（决定性）

唯一改动 = 删除 L75 的 4 字节 `>nul`，保留其后的 `。`；其余（沙盒、启动参数、目录树）完全一致。

| 组 | L75 内容 | 结果 |
|---|---|---|
| A 对照（原文） | `…故不再 >nul。` | 生成 `nul。`（+8.49 s，ctime 16:45:50.726） |
| B 实验 | `…故不再 。` | **不生成**（同次运行 `apps.env.yaml` 正常重写 → 启动器确实执行） |
| A 还原 | `…故不再 >nul。` | 再次生成 |

### 4）前缀二分（把定因钉在 L75）

把启动器截断为原始第 1–75 行 + `echo PREFIX-OK` + `exit /b 0`，其余逐字节不动：

```
> 'ole（本窗口）与' is not recognized as an internal or external command,
operable program or batch file.
PREFIX-OK
NUL: ['nul。']
```

cmd 自报的报错与被生成的文件同出一行 —— 且 `pc up` 等后续代码被完全移除。L75 之后（第 76–89 行）与栈子进程全部无关。

### 5）必要条件对照：`chcp 65001` 是必需的

同前缀文件，唯一改动 = 去掉第 4 行 `chcp 65001 >nul`（即回到 cp936）：

```
> 文件名、目录名或卷标语法不正确。
PREFIX-OK
chcp-off -> []        ← 不生成文件
```

→ 命令仍被错解析为命令，但只有 UTF-8 代码页下 `nul。` 才被解析成那个字面文件名。两个条件（该行原文 + `chcp 65001`）缺一不可。

## 已排除清单（勿重复）

1. **「L75 作为孤立单行不触发」≠ 排除 L75。** 本次再验两次：逐字节复制该行（UTF-8，含 `chcp 65001`，CRLF 与 LF）→ 无文件。但同一行文本在 6.2 KB 真实启动器里触发、在孤立小文件里不触发：**现象依赖前文上下文**（cmd 批处理读取器的字节配对状态由文件前文决定）。因此此前 s95 的两次「最小复现否定 L75」是**假阴性**，不能作为排除依据。
2. **全仓字面扫描**（大小写不敏感；`>nul` 后跟任意非 ASCII 字节；含 UTF-16/GBK 形态）：`forge/` 树内仅 L75 一处命中（排除 `bin/pg/**/LC_MESSAGES/*.mo`、`data/**` 二进制噪声）。
3. **conf 层脚本单独跑**：`bootstrap.ps1` 在同一沙盒单独运行（rc=0）不产生任何 `nul*` 文件；`apps-aggregate.ps1`/`start-preflight.ps1` 无该字面量。
4. **栈子进程**：前缀测试在 `pc up` 之前就生成文件 → pc/node/faucet/nats/pg 无关。
5. **`process-compose.yaml` / pg-init.cmd / 停止数字员工.cmd / 跟数字员工聊天.cmd**：字面扫描无 `>nul` + 中文标点组合；`2^>nul` 转义形态全部正确。

## 未验证（明确标注）

- cmd 具体为何从 `console` 中途开始取命令名（报错 token 为 `ole（本窗口）与`）——字节级配对路径未逐字节追证，未用 API hook / ETW 抓 cmd 内部 token。
- 为什么重定向目标含 `。` 时落成真文件而非 NUL 设备——只做了行为验证（`>nul。` 在孤立文件里不建文件、在本上下文里建文件），未做 CreateFileW 参数级取证。

## 修法建议（最小、低风险）

1. **删掉 L75 的重定向字符**：`故不再 >nul。` → `故不再重定向到 nul。`。注释改动，功能零影响。风险：无。
2. **纪律**（把 `停止数字员工.cmd` 已有的「注释纯 ASCII」纪律提升为启动器通用纪律）：`.cmd` 注释禁止 `>` 与中文标点组合；更彻底是注释 ASCII 化——本次对照已证明中文 UTF-8 注释在 cp936 解析下会错位（cmd 仍报错），只是不再落文件。
3. **卸载兜底**：`卸载清理.cmd` 增加 `del /f /q "%~dp0nul。"`（或保留名家族扫描）。Explorer 无法删保留名，只能脚本删。

风险提示：不要为了「省掉那条报错」而删 `chcp 65001` —— 去掉后本机虽不再落文件，但会引入新的解析报错（见上文第 5 条），且 UTF-8 输出渲染回退。

## 复现路径（命令级，供他人重跑）

```bat
robocopy C:\ZCodeWorks\PocketForge\forge C:\PF-TEST\cold /E ^
  /XD C:\ZCodeWorks\PocketForge\forge\data\pg C:\ZCodeWorks\PocketForge\forge\data\js
del C:\PF-TEST\cold\data\pc.port C:\PF-TEST\cold\data\faucet.port C:\PF-TEST\cold\data\pg.port
```
```powershell
Start-Process -FilePath 'C:\PF-TEST\cold\启动数字员工.cmd' -ArgumentList 'relaunched' -WorkingDirectory 'C:\PF-TEST\cold'
# 观察：每 500ms Get-ChildItem C:\PF-TEST\cold -Force 做快照 diff
# 停止：Get-Process | ? { $_.Path -like 'C:\PF-TEST\cold\*' } | Stop-Process -Force
```

前缀二分最小载体：启动器第 1–75 行 + `echo PREFIX-OK` + `exit /b 0`，以 `%~dp0` 所在目录为 FORGE_ROOT 运行。

## 环境

- win32 10.0.20348 x64，控制台默认 cp936；`forge/启动数字员工.cmd` 为 UTF-8 无 BOM、CRLF。
- 取证期间 dev 栈未停（`/processes` 200、faucet `/healthz` 200、chat-bridge `/healthz` 200），沙盒与 dev 栈端口错开。
- 沙盒整目录删除、临时脚本自清；`forge/` 无任何文件被修改。
