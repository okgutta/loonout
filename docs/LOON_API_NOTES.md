# Loon 官方 API 核对记录

核对日期：2026-09-10。

来源：

- <https://nsloon.app/docs/Plugin/>
- <https://nsloon.app/en/docs/Script/script_v2/>
- <https://nsloon.app/docs/Script/script_api/>

本项目实际使用且已由上述文档确认的能力：

- 插件 `[Argument]` 的 `input`、`select`、`switch` 控件。
- Loon 3.5.1 (983) 起的新 Script v2 语法；Request、Generic 脚本及插件对象参数。
- Request Script 中的 `$request.url`、`$request.method`。
- `$persistentStore.read(key)` 与 `$persistentStore.write(value, key)` 字符串存储。
- `$done({})` 放行请求；Generic Script 用 `$done({ title, content })` 返回结果。
- 脚本路径可以是本地文件、相对路径或远程 URL。

官方明确限制：一个请求最多选择一个 Request Script，选择最终配置顺序中第一个完整匹配项。因此本工具不宣称捕获率为 100%。

项目未使用不存在的全局网络监听 API，也未使用 `$config` 修改用户配置。虽然官方文档确认 `$httpClient` 可指定 `node`，本版本不把单个脚本请求包装成“App 出口已经验证”的证明；出口 IP 与 IPv6/UDP 仍要求用户按 README 的双栈步骤验证。
