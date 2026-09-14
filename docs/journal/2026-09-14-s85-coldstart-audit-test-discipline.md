# 2026-09-14 s85 冷启编码审计 + 测试纪律入契约

## 任务来路
用户报「.cmd 启动后 console 日志乱码」，要求模拟下载解压从零配置全流程找问题。

## 做了什么
- 出厂 `PocketForge-20260914-v0.9.12.zip` 全新解压到 `C:\PF-Test\pkg`（ASCII 路径）+ `C:\PF-Test\数字员工`（中文路径），真实 `cmd /c 启动数字员工.cmd` 冷启，stdout/stderr 原始字节落盘逐字节核验。
- 乱码定位：faucet(Go)/chat-bridge(Node) 写 UTF-8 × 控制台 CP936；bootstrap.ps1 走 ANSI 故正常。字节证据 `e2 86 92`（UTF-8 `→`）。
- 挖出并单变量隔离三个更重缺陷：
  - P2：bootstrap 用 `WriteAllText`（UTF-8 无 BOM）生成 `.cmd` + 模板 LF 行尾 → cmd 按 CP936 解析错位（s67 事故家族复发于生成物层）。矩阵：ANSI+CRLF 唯一通过。
  - P3：中文安装路径 initdb post-bootstrap `invalid byte sequence for encoding UTF8` 后自删数据目录。隔离结论：只看 **share 目录路径**（exe 位置与数据目录无关，`-L <ASCII share>` 即愈）。PG 上游限制。
  - P4：`%APPDATA%` memory junction 悬挂时 `Test-Path=True` → 守卫永不修复，改名/搬迁即静默失忆（写入 FileNotFoundError 实锤）。
- 修法验证：`chcp 65001`（P1）与 `.cmd` ANSI/CRLF 或 `%~dp0` 纯 ASCII（P2）**必须成套**，单独任一改法实测失败；组合后中文路径整栈冷启通过。
- 包卫生：`tmp/`、`conf/dev-stack-up.ps1` 带 `C:\ZCodeWorks` 进包（`package.sh` SKIP 漏项）；出厂默认模型 `deepseek-v4-flash` 实测已下架（109 模型路由无此名）。
- 报告：docs/runbooks/2026-09-14-cold-start-codec-audit.md（P1-P7 + 最小改动清单）。

## 用户拍板
**测试纪律入 AGENTS.md §8**：以后测试 PocketForge 必须模拟真实 ①解压安装（出厂 zip → 干净目录 → 启动器）②升级安装（旧版数据在位 → 新包升级路径 → 数据保留验证）；禁止 dev 栈代替交付物验证。

## 遗留
- 修复未落地（用户未下开工令）：报告 §8 改动清单 7 项。
- `.goosehints` 工作区改动 = dev 栈 bootstrap 端口物化回写，非本会话产物，未纳入本提交。
- 测试痕迹已清：`C:\PF-Test` 删除，无残留进程/端口；`C:\PocketForge-Test`（P4 junction 悬挂的旧目标）本就早已不存在。
