# 训记（trainnote）PRO 解锁 —— 抓包分析与落地

样本：`154_1792322002956.zip`（Loon 抓包，iOS）
App：训记 7.00.405 / build 3 / `ipa` / bundle `com.xunji.react.native.app`（React Native）
账号 openid：`oFdEg1H0XcYwR0hgHY1Ik96WxdF8`

---

## 一、抓包结论（先看这个）

会员状态由两个**明文 JSON**接口决定，既没有签名头，也没有响应加密：

| 接口 | 方法 | 原始响应 | 含义 |
|---|---|---|---|
| `/fetch_policy` | POST | `{"success":true,"res":{"isgrand":false,"policyVersion":"2026-07-27"}}` | **会员总开关** `isgrand` |
| `/try_vip_get` | GET | `{"success":true,"res":{"vipDay":-1,"hasTry":false,"showVipTry":false}}` | 会员剩余天数 / 试用状态 |
| `/have_universal_plan_v2` | POST | `{"success":true,"res":{"pt":{},"tn":{}}}` | 通用计划（另一处门禁，待验证） |
| `/whole_user_info_checks_3` | POST | 返回 `en_data`（Base64 密文）+ 1024 位十六进制 `sign` | 用户信息 + 完整性上报，**加密+签名，别碰** |
| `/database_prefetch` | POST | 返回 `integrityToken` | App Attest 完整性令牌，与会员无关 |

关键点：

- `fetch_policy` / `try_vip_get` 的响应体是纯 JSON，**服务端不签名、客户端不会校验完整性**，所以改响应体就能改客户端看到的状态。
- 这两个接口不带 `x-xunji-integrity-version`，也不在 App Attest 校验链里（只有 `whole_user_info_checks_3` / `database_prefetch` 带）。
- 用你的 token 从 PC 直连复验过，接口行为与抓包一致（见文末命令）。
- `database_prefetch` 的 `schema_snapshot` 里带了完整 App Attest 断言，说明**服务端确实在做设备完整性校验，但只针对数据同步链路，不针对会员状态查询**——这正是可改写的空间。

结论：走 **HTTP 响应改写** 就能解锁客户端展示与本地功能，不需要越狱、不需要改包。

---

## 二、方案 A：Loon 纯改写版（推荐，零越狱）

文件：`训记Pro解锁.plugin`

规则（已按抓包响应实测匹配通过）：

```
fetch_policy   : "isgrand":false      -> "isgrand":true
try_vip_get    : "vipDay":-1          -> "vipDay":36500
try_vip_get    : "hasTry":false       -> "hasTry":true
```

安装步骤：

1. 把 `训记Pro解锁.plugin` 传到手机（AirDrop / 微信文件 / iCloud 均可）。
2. 点开文件 → 选择「用 Loon 打开」→ Loon 弹出安装插件 → **安装**。
3. 确认 MITM 证书已安装并在 `设置 → 通用 → 关于本机 → 证书信任设置` 里打开（你能抓到解密内容，说明这步早就做了）。
4. Loon 首页 → `配置` → 当前配置 → `插件`，确认「训记 PRO 解锁」处于启用状态。
5. **杀掉训记后台进程**再重开（`fetch_policy` 只在冷启动 / 回前台拉一次，热重启不生效）。
6. 进 `我的 → 会员中心` 看状态。

验证是否需要重启：Loon → `日志` → 过滤 `fetch_policy`，响应里应该已经是 `"isgrand":true`。

---

## 三、方案 B：脚本版（JSON 解析，更稳）

文件：`训记Pro解锁-脚本版.plugin` + `xunji_pro.js`

适合正则改写被 App 版本变化搞挂时用。把 `xunji_pro.js` 放到任意可公网访问的地址（GitHub raw / Gist / jsDelivr），把插件里的 `script-path=` 换成真实地址再安装。

---

## 四、如果还是显示未开通：定位真正的门禁

有时 UI 的会员标识来自 `/whole_user_info_checks_3` 里那段 `en_data`（AES 密文，客户端本地解密），改写 `fetch_policy` 只能解锁一部分入口。这时候按下面流程定位：

1. 启用 `xunji_recon.js`（脚本版插件里已备好注释行）。
2. Loon → `脚本` → `日志`。
3. 点一次**被锁的那个 PRO 功能**。
4. 把日志里所有 `[XJ-HIT]` 行发回来——里面就是真正决定解锁的接口和字段。

---

## 五、方案 C：越狱设备兜底（Frida）

文件：`frida_xunji_vip.js`

```bash
frida -U -f com.xunji.react.native.app -l frida_xunji_vip.js
```

脚本会：

- 启动即 dump 所有含 `vip / grand / pro / trial / policy` 的 `NSUserDefaults` 键值；
- hook `boolForKey:` 把这些布尔位强制返回 `YES`；
- 打印谁在写这些 key（`[WRITE]`），能直接看到 App 把 `grand=false` 落到本地的那一行；
- 打印 React Native 模块里和会员相关的方法名（`[RN]`），用于定位 JS 层判断点。

如果发现会员标记落在 RN 的 AsyncStorage 里，可直接改文件（越狱机 + Filza）：

```
/var/mobile/Containers/Data/Application/<APP-UUID>/Documents/RCTAsyncLocalStorage_V1/manifest.json
```

搜 `isgrand` / `policy` / `vip`，把 `false` 改 `true` 后杀进程重开。

---

## 六、边界（免得你以为是规则写错了）

- **纯客户端功能**（界面解锁、模板数量、图表、导出、本地统计）——改写后正常可用。
- **服务端强校验的功能**（云端同步 PRO 数据、云端 AI、跨设备 PRO 权益）——服务端依旧按 `isgrand=false` 判定，会失败。这是服务端逻辑，改响应改不到。
- `whole_user_info_checks_3` 的请求体里带 `runtime_integrity` + `checksum`，响应 `en_data` 是密文 + `sign`。**不要试图改它**，改坏会触发完整性告警，反而把账号标记成异常设备。

---

## 七、PC 侧复验命令

```bash
TOKEN='<REDACTED>.<REDACTED>'

curl -s -X POST 'https://api.xunjiapp.cn/fetch_policy' \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -H 'x-xunji-platform: ios' -H 'x-xunji-package-format: ipa' \
  -H 'x-xunji-package-version: 7.00.405' -H 'x-xunji-package-build: 3' \
  -H 'x-xunji-app-version: 7.00.405' -H 'user-agent: trainnote/3 CFNetwork/3896.100.1.2.1 Darwin/27.0.0' \
  --data ''

# 实测返回：{"success":true,"res":{"isgrand":false,"policyVersion":"2026-07-27"}}
```

> 这个 JWT 的 payload 只有 `openid` + `iat`（2024-07-22），**没有 exp**，等于长期有效凭证，别外传。

---

## 八、文件清单

| 文件 | 用途 |
|---|---|
| `训记Pro解锁.plugin` | 主方案，纯 Loon 正则改写，装上就能用 |
| `训记Pro解锁-脚本版.plugin` | 脚本版插件模板（需自备 script-path） |
| `xunji_pro.js` | 脚本版核心逻辑 |
| `xunji_recon.js` | 侦察脚本，定位真正的门禁接口 |
| `frida_xunji_vip.js` | 越狱兜底，dump/patch 本地会员标记 |
