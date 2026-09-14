# tools/sec — 云主机安全处置脚本

2026-09-14 RDP/WinRM 爆破事件产物。处置详情见 `docs/verdicts/2026-09-14-rdp-bruteforce-disposition.md`。

| 脚本 | 用途 |
|---|---|
| `rdp-ip-hunt.ps1` | 挖掘全量 RDP 来源 IP（4624 + TS-LSM/TS-RCM/RdpCoreTS）。输出：各来源 IP 的次数/首末时间/事件 ID |
| `tslsm-analyze.js` | 把 `rdp-ip-hunt.ps1` 导出的 TS-LSM CSV 做按 IP 聚合（次数/天数/小时分布） |
| `per-ip-profile.js` | 单 IP 行为画像：小时直方图 + 星期分布 + 连续使用段（用于区分工作地/居住地） |
| `ip-geo3.js` | 多源 geo 归属地交叉核验（vore.top / mir6 / zxinc），避免单源误导 |
| `fw-apply.ps1` | **幂等**下发显式阻断规则 + 收敛既有 3389/5985 放行规则来源（含回滚说明） |
| `fw-verify.ps1` | 滚动采样验证爆破是否停止（4625 / RdpCoreTS 131 / 存活会话） |

## 快速用法

```powershell
# 1) 取证：定位所有 RDP 来源
powershell -File tools/sec/rdp-ip-hunt.ps1            # 输出 tmp/tslsm.csv 等
node tools/sec/per-ip-profile.js                       # 行为画像
node tools/sec/ip-geo3.js <ip> [<ip>...]               # 归属地核验

# 2) 处置（先改脚本顶部的 $allow 白名单网段）
powershell -File tools/sec/fw-apply.ps1

# 3) 验证
powershell -File tools/sec/fw-verify.ps1

# 回滚
Remove-NetFirewallRule -DisplayName 'PF-SEC-BLOCK-IN-TCP','PF-SEC-BLOCK-IN-UDP'
```

## 注意

- 脚本一律写**纯 ASCII**：PowerShell 5.1 会把 UTF-8 无 BOM 的中文按 GBK 解析，导致语法错误。
- 阻断集 = 「全网段 − 白名单空间」，私网段（10/8、172.16/12、192.168/16）**故意保留**，避免切断云 VPC 内管理通道。
- 白名单网段属个人信息，写入前确认仓库为私有。
