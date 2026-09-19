---
name: scrape-table-to-db
description: |
  从内网系统网页表格抓数据入库的全流程做法。这条是做法不是工具：要用自带的浏览器
  （要登录、要点按的页面）和工具里的抓取器来干，管的是从抓到入库的全流程——导航、
  快照定位、建表、批量入库、结果核对。适用场景：目标页面有 HTML 表格或类表格结构，
  需要把表格内容提取并存入 faucet 数据库（SQLite）。
---

# 抓网页表格入库

## 操作步骤

### 1. 打开页面
- 用 `browser_navigate` 导航到目标内网页面 URL。
- 若需登录：提示用户在弹出的 Edge 窗口人工登录一次，profile 会记住。不要硬试密码或验证码。
- 登录后重新 `browser_navigate` 到目标页面。

### 2. 快照定位表格
- `browser_snapshot` 抓页面可访问性树。
- 在快照中找表格节点（role=table / role=grid / role=rowgroup）。
- 若快照里表格行数明显少于预期（见坑1），`browser_wait_for` 等几秒后重新快照。
- 记下表格列名（第一行 header）和行数，用于下一步建表。

### 3. faucet 建表
- `faucet_list_services` 确认可用数据库 service。
- 已有合适表 → `faucet_describe_table` 确认列结构匹配。
- 需新建表 → 先建 SQLite 文件再 `faucet db add`（见全局手册），或直接 `faucet_raw_sql` 执行 `CREATE TABLE`。
  - 列类型映射：文本→TEXT，数字→INTEGER/REAL，日期→TEXT（ISO 格式）。
  - 加自增主键 `id INTEGER PRIMARY KEY AUTOINCREMENT`。

### 4. 提取数据
- 用 `browser_evaluate` 执行 JS 提取表格数据为 JSON 数组：
  ```js
  () => {
    const rows = [...document.querySelectorAll('table tbody tr')];
    return rows.map(tr => {
      const cells = [...tr.querySelectorAll('td')];
      return cells.map(td => td.innerText.trim());
    });
  }
  ```
- 列顺序对应建表列顺序。需要列名映射则在 JS 里直接输出对象数组。

### 5. 入库
- 入库前先清旧数据（见坑2）：`faucet_delete` 或 `faucet_raw_sql` `DELETE FROM <表> WHERE 1=1`。
- `faucet_insert` 批量写入，每批 ≤100 行避免请求过大。
- 若 faucet_insert 不支持批量，循环单行插入或用 `faucet_raw_sql` 拼 INSERT。

### 6. 结果核对
- `faucet_query` 查 `SELECT COUNT(*) FROM <表>` 确认行数与页面表格行数一致。
- 抽查首尾各一条记录，对比页面内容。
- 数据有误 → 删重来；数据正确 → 告诉用户入库行数和表名。

## 已知坑

### 坑1：动态加载要等几秒
内网系统常用 AJAX/前端框架渲染表格，`browser_navigate` 返回时表格可能还没画完。
- 现象：快照里表格为空或行数偏少。
- 对策：`browser_wait_for` time=3 等几秒后重新 `browser_snapshot`；或 `browser_evaluate` 里用 `document.querySelectorAll('table tbody tr').length` 轮询直到稳定。

### 坑2：入库前先清旧数据
重复抓取同一表会累积重复行。
- 对策：每次入库前 `faucet_delete`（filter 写 `1=1` 或安全条件）或 `faucet_raw_sql` `DELETE FROM <表>` 清空。
- 若需要保留历史：建表时加 `scrape_date TEXT DEFAULT (datetime('now'))` 列，不清空只追加，核对时按日期区分。
