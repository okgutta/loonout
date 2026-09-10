# Loon App IP Router

这个工具会观察指定 App 的网络请求 Host，识别核心业务、媒体/CDN 和未知流量，发现稳定的 `DOMAIN`、`DOMAIN-SUFFIX`、`DOMAIN-KEYWORD` 候选，计算观察样本内的规则覆盖率，并且只导出用户明确确认的规则。所有导出规则都指向用户填写的策略组，例如 `IP`、`PROXY`、`香港节点`。

它不是普通域名收集器，也不会自动修改、覆盖或删除用户的 Loon 配置。

## 最重要的边界

不能保证 100% 隐藏 App 看到的真实出口 IP。Loon 分流依赖可识别并命中的流量；下列情况都可能未覆盖：

- 其他 Request Script 在最终配置顺序中先匹配。Loon 对一个请求最多选择一个 Request Script。
- App 直接连接 IP，或未知 Host 没有被用户确认。
- IPv6 走了不同的直连路径。
- QUIC、HTTP/3 或其他 UDP 流量没有经过可观察的 HTTP Request Script 路径。
- 分析期间没有触发到的功能、区域接口、登录接口或灰度 Host。

报告中的覆盖率只针对本次已观察请求，是请求次数加权的估计，不是全局网络覆盖证明。

## 交付文件与安装

### Loon 在线安装（推荐）

在 Loon 的插件页面添加下面这个订阅地址即可，脚本会自动从同一仓库加载：

```text
https://raw.githubusercontent.com/okgutta/loonout/main/Loon-App-IP-Router.plugin
```

仓库主页：<https://github.com/okgutta/loonout>

如果 GitHub Raw 在当前网络无法访问，需要先让该地址经过可用代理，或把仓库同步到你能访问的 HTTPS 托管服务。

已构建的主入口是 [`Loon-App-IP-Router.plugin`](./Loon-App-IP-Router.plugin)。它旁边包含可直接加载的相对脚本：

```text
Loon-App-IP-Router.plugin
analyzer.js
control.js
report.js
export.js
```

`plugin/` 目录也包含同一套完整产物。线上 manifest 使用固定 GitHub Raw URL；Loon 官方 Script v2 文档确认脚本路径可以是本地文件、相对路径或远程 URL。

本地开发时运行：

```bash
npm run build
```

本地自托管时可把上述五个文件放到同一 HTTPS 目录，并把 manifest 中四个脚本 URL 换成自己的地址。官方仓库版本已经配置为从 `okgutta/loonout` 自动加载。

最低版本声明为 Loon `3.5.1 (983)`，因为项目使用该版本起的新 Script v2 语法。

## 使用流程

1. 在插件参数里选择目标 App；支持 `BILIBILI`、`DOUYIN`、`NETEASE`、`WECHAT`、`WEIBO`、`XIAOHONGSHU`、`KUAISHOU`、`ZHIHU`、`TIEBA`、`COOLAPK`、`CUSTOM` 和 `ALL`。
2. 填写真实策略组名称，默认是 `IP`，代码没有写死策略组。
3. 选择 `OBSERVE` 或 `ANALYZE`。前者只保存指纹已识别 Host；后者还保存本次目标会话中的未知 Host。
4. 选择 App Proxy Mode：`CORE_ONLY`、`CORE_MEDIA`、`WHOLE_APP` 或 `CUSTOM`。`WHOLE_APP` 会扩大未知 Host 观察并允许更多媒体/CDN 候选，但未知 Host 仍不会自动生成规则。
5. 把“生命周期操作”设为 `START`，运行 Generic Script“控制分析生命周期”。
6. 正常使用目标 App，覆盖主页、搜索、评论、个人资料、登录、Feed 与媒体播放等场景。
7. 选择 `PAUSE` 可暂停；完成后选择 `STOP` 冻结本次数据。
8. 可把现有 `DOMAIN` 类规则用分号填入“已有规则”，再运行“生成分析报告”，查看候选、置信度、覆盖率、重复/策略遮蔽冲突和漏网 Host。
9. 从报告复制要接受的 ID，例如 `DOMAIN-KEYWORD:core-c-lq`，用分号填入“已确认规则”。
10. 运行“导出已确认规则”，手动把结果加入自己的 `[Rule]`。

`CLEAR` 只删除本工具自己的持久化 Key，不调用会清空其他脚本数据的 `$persistentStore.remove()`。

## 两种分析模式

`OBSERVE` 适合平时低噪声观察，只记录明确属于内置 App 指纹的 Host。`ANALYZE` 适合用户临时只操作一个目标 App 的会话；未匹配指纹的 Host 会以 `SESSION` 归属进入未知列表，但不会自动成为规则候选。这种会话归属仍可能混入后台流量，所以必须人工复核。

`CUSTOM` 没有内置归属指纹，因此其隔离会话记录标记为 `CUSTOM_SESSION`。工具可以据此给出明确降权的 DOMAIN/后缀/关键词候选，让任意 App 分析仍然可用；候选理由会标出未经指纹验证，而且仍然只有用户复制 ID 确认后才能导出。

Loon Rule Analyzer 受到 Loon Request Script 机制限制。如果其他 Request Script 优先匹配，分析器可能无法观察对应请求。建议临时分析时检查最终脚本顺序，并在结束后恢复日常配置顺序。

## 分类与 CDN 评分

分类包括：

```text
API AUTH WEB FEED SEARCH COMMENT USER STATIC IMAGE VIDEO CDN DOWNLOAD
TRACKING ANALYTICS WEBSOCKET UNKNOWN
```

核心业务和媒体流量分开计算。代码不会仅凭 Host 包含 `cdn` 就丢弃请求；它综合路径扩展名、Host 标记、已知 App 角色、请求次数和资源得分。明显 API 得分高，明显视频/图片/音频/CDN 在默认核心模式下会降权，无法判断的请求保留为 `UNKNOWN`。

由于规定分类中没有单独的 `AUDIO`，明确音频资源映射到 `CDN` 媒体组，并在理由中标记。

## DOMAIN-KEYWORD 如何发现

```text
实际请求 → 多个 Host → 连续稳定片段 → 支持 Host 数/请求数分析
        → 长度与分隔符评分 → UUID/hash/数字随机性惩罚
        → App 一致性与业务分类 → 置信度 → 用户确认 → 导出
```

例如多个 Host 反复出现 `core-c-lq` 会得到高置信度；`a8f71c92` 这类十六进制随机标识会被标记为随机字符串并且不推荐。

## 规则、冲突与确认

每条候选包含：

```text
ruleType / value / policy / confidence / reason
requestCount / hostCount / category / App / 星级
```

规则使用 `类型:值` 作为确认 ID。导出时会自动去重；若已确认的 `DOMAIN-SUFFIX,biliapi.net,IP` 覆盖了同策略的 `DOMAIN,api.biliapi.net,IP`，精确规则会从导出中省略并记录冲突。填写“已有规则”后，同策略已存在的规则也不会重复导出；不同策略的已有宽规则会显示 `POLICY_SHADOW` 和顺序警告。

输出建议顺序是精确 `DOMAIN`、`DOMAIN-SUFFIX`、`DOMAIN-KEYWORD`。把结果加入 Loon 前还需检查它与用户已有规则的相对位置，尤其是更早出现的 `DIRECT`、`REJECT` 或其他宽规则。

## 覆盖率与漏网流量

报告分别显示：

- 指纹已识别请求比例与未知请求比例。
- 推荐候选在已观察请求上的总覆盖率。
- 核心业务覆盖率、媒体覆盖率和未知流量覆盖率。
- 未识别 Host 的请求次数、首次发现和最近访问时间。

未知 Host 只提示继续观察，不自动加入代理规则。数据默认最多保留 3000 个 Host；超过 Host 或序列化大小上限后，优先淘汰长期未访问、低次数、低置信度的记录。

## 出口 IP、IPv6 与 QUIC/UDP 验证

本版本不伪造自动出口验证结果。推荐手动执行：

1. 确认目标策略组选中的节点可用。
2. 用临时、明确的测试规则把合法 IP 查询服务（如 `api.ipify.org` 或 `api64.ipify.org`）分别送往 `DIRECT` 和目标策略组，记录 IPv4/IPv6 结果；测试后手动删除临时规则。
3. 在 Loon 请求日志中核对目标 App 的实际 Host 命中了导出的规则和预期策略组，而不是只验证浏览器测试域名。
4. 在启用与关闭 IPv6 的网络环境分别复测。没有观察到 IPv6 字面量并不能证明无 IPv6 泄漏。
5. 检查 App 是否仍建立 QUIC/HTTP3/UDP 会话；必要时根据 Loon 当前配置能力单独处理或禁用 QUIC 后对比。`DOMAIN` 规则不自动等于所有 UDP 均已代理。

## 开发与验证

```bash
npm test
npm run simulate
npm run verify
```

`npm run verify` 会重新构建 Loon bundle、运行全部自动测试，再模拟抖音、Bilibili 和网易云验收场景。测试覆盖 Host/IP 标准化、App 指纹、业务/CDN 分类、关键词置信度、三类规则、去重、冲突、覆盖率、持久化、生命周期、诊断和生成后 bundle 的 Loon 全局变量执行。

项目结构：

```text
plugin/entries/     Loon 脚本入口源码
plugin/             可安装插件及构建后脚本
src/                可测试的分析模块
scripts/build.js    无第三方依赖的 CommonJS 合并器
scripts/simulate.js 三个验收场景
fixtures/           固定请求样本
test/               Node 测试
docs/               官方 API 核对记录
```

## 官方 API 依据

- <https://nsloon.app/docs/Plugin/>
- <https://nsloon.app/en/docs/Script/script_v2/>
- <https://nsloon.app/docs/Script/script_api/>

详细核对记录见 [`docs/LOON_API_NOTES.md`](./docs/LOON_API_NOTES.md)。
