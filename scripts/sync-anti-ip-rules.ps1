<#
.SYNOPSIS
    同步 SunsetMkt/anti-ip-attribution 的规则，生成两个产物。

    1. Loon.conf 里的本地 [Rule] 区块 —— 策略写具体组名（默认 IP归属地）
    2. plugin/ip-attribution.plugin   —— 可直接导入的独立插件，策略写 PROXY

.DESCRIPTION
    为什么两个产物都要：

    Loon 的规则来源优先级是「本地规则 > 插件规则 > 订阅规则」。

    - 本地区块：优先级最高，连 IP 规则也能生效。缺点是要手工贴进 [Rule]，
      而且必须放在配置里 GEOIP,CN,DIRECT 之前。
    - 插件：`loon://import?plugin=<url>` 一条链接就能挂到任何配置上，不用改对方
      配置一行。规则里用 PROXY，导入时由 Loon 让用户挑策略组，所以不依赖具体
      组名。缺点是优先级低于对方的本地规则 —— 如果对方配置里也有本地的
      GEOIP,CN,DIRECT，那 116 条 IP 规则会被它抢先直连（域名规则不受影响）。

    规则源用上游的 generated/surge.list：它已经按正确顺序排好，且给所有 IP 规则
    补了 no-resolve。

    App 补丁段（Loon.conf 里手工维护、同步脚本不重写的那一段）会一并复制进插件，
    策略同步改成 PROXY。

    两个产物都幂等生成，重复运行结果一致。

.PARAMETER ConfigPath
    Loon 配置文件路径，默认仓库根目录下的 Loon.conf。

.PARAMETER PolicyName
    本地区块用的策略组名，默认 IP归属地。

.PARAMETER PluginPath
    插件输出路径，默认仓库根目录下的 plugin/ip-attribution.plugin。

.EXAMPLE
    pwsh -File scripts/sync-anti-ip-rules.ps1
#>
[CmdletBinding()]
param(
    [string]$ConfigPath = (Join-Path $PSScriptRoot '..\Loon.conf'),
    [string]$PolicyName = 'IP归属地',
    [string]$PluginPath = (Join-Path $PSScriptRoot '..\plugin\ip-attribution.plugin')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$UpstreamList = 'https://raw.githubusercontent.com/SunsetMkt/anti-ip-attribution/main/generated/surge.list'
$BaseUrls = @($UpstreamList, "https://ghproxy.net/$UpstreamList")

$BlockStartMarker = '# ==== IP 归属地伪装'
$BlockEndMarker   = '# ==== IP 归属地伪装 结束（以上由 scripts/sync-anti-ip-rules.ps1 生成）===='
$LegacyEndAnchor  = '# 未被域名规则识别的中国大陆 IP 直连，其余交给兜底策略。'
$PatchStartMarker = '# ==== App 补丁'

# Loon 支持的规则类型。上游若新增了别的类型，宁可中止也不要写进配置。
$SupportedTypes = @(
    'DOMAIN', 'DOMAIN-SUFFIX', 'DOMAIN-KEYWORD', 'IP-CIDR', 'IP-CIDR6',
    'GEOIP', 'IP-ASN', 'DST-PORT', 'SRC-PORT', 'USER-AGENT', 'URL-REGEX', 'PROTOCOL'
)

function Get-UpstreamRules {
    foreach ($url in $BaseUrls) {
        try {
            $text = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 30 $url).Content
            if ($text -match 'DOMAIN') { return $text }
            Write-Warning "$url 内容异常，尝试下一个源。"
        } catch {
            Write-Warning "拉取失败 $url : $($_.Exception.Message)"
        }
    }
    throw '无法拉取上游规则，请检查网络或代理。'
}

# 把上游的一行规则转成 Loon 语法。$Policy 是没有显式策略时补上的策略名。
function ConvertTo-LoonRule {
    param(
        [Parameter(Mandatory)][string]$Rule,
        [Parameter(Mandatory)][string]$Policy
    )
    $f = $Rule -split ','
    # IP-CIDR,x/y,no-resolve  →  IP-CIDR,x/y,<策略>,no-resolve（Loon 要求策略在 no-resolve 之前）
    if ($f[0] -like 'IP-CIDR*' -and $f.Count -eq 3 -and $f[2] -eq 'no-resolve') {
        return "$($f[0]),$($f[1]),$Policy,no-resolve"
    }
    if ($f.Count -eq 2) { return "$Rule,$Policy" }
    return $Rule   # 已带 REJECT / DIRECT
}

# ---------------------------------------------------------------- 取上游规则
$raw = @(
    (Get-UpstreamRules) -split "`n" |
        ForEach-Object { $_.Trim() } |
        Where-Object { $_ -match '\S' -and $_ -notmatch '^#' }
)
if ($raw.Count -eq 0) { throw '上游规则为空，中止以免写坏配置。' }

$unsupported = @($raw | Where-Object { ($_ -split ',')[0] -notin $SupportedTypes } | Select-Object -Unique)
if ($unsupported.Count -gt 0) {
    throw "上游出现 Loon 不支持的规则类型，中止：$($unsupported -join ', ')"
}

# ---------------------------------------------------------------- 产物 1：Loon.conf 本地区块
$localRules = @($raw | ForEach-Object { ConvertTo-LoonRule -Rule $_ -Policy $PolicyName })

$block = [System.Collections.Generic.List[string]]::new()
$block.Add($BlockStartMarker + '：上游 SunsetMkt/anti-ip-attribution 全量规则（按上游原序，本地优先）====')
$block.Add('# 为什么不放在 [Remote Rule]：')
$block.Add('#   1. 上游规则按 App 交错排列（抖音的 -lq 关键词夹在 zijieapi.com 的 DIRECT 前后），')
$block.Add('#      拆成按策略分组的订阅文件会打乱顺序，具体规则会被更宽的规则抢走；')
$block.Add('#   2. 上游 116 条 IP 规则全是中国大陆地址，放订阅层会被下面的 GEOIP,CN,DIRECT 抢先直连。')
$block.Add('# 顺序与上游 generated/surge.list 完全一致；行内 REJECT / DIRECT 保留，其余走上面那个策略组。')
$block.Add('# 本段由 scripts/sync-anti-ip-rules.ps1 生成，请勿手工编辑。')
$block.Add('')
foreach ($rule in $localRules) { $block.Add($rule) }
$block.Add('')
$block.Add($BlockEndMarker)

$resolved = (Resolve-Path -LiteralPath $ConfigPath).Path
$lines = ([System.IO.File]::ReadAllText($resolved, [System.Text.Encoding]::UTF8)) -split "`n"

$startIndex = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i].StartsWith($BlockStartMarker)) { $startIndex = $i; break }
}

$endIndex = -1
if ($startIndex -ge 0) {
    for ($i = $startIndex + 1; $i -lt $lines.Count; $i++) {
        if ($lines[$i].StartsWith($BlockEndMarker)) { $endIndex = $i; break }
    }
}
if ($endIndex -lt 0) { $endIndex = [Array]::IndexOf($lines, $LegacyEndAnchor) - 1 }
if ($endIndex -lt 0) { throw "在 $resolved 中找不到区块结束位置（既没有结束标记，也没有旧锚点行）。" }

$before = if ($startIndex -ge 0) { $lines[0..($startIndex - 1)] } else { $lines[0..$endIndex] }
$after  = $lines[($endIndex + 1)..($lines.Count - 1)]

$new = [System.Collections.Generic.List[string]]::new()
$new.AddRange([string[]]$before)
$new.AddRange($block)
$new.AddRange([string[]]$after)
[System.IO.File]::WriteAllText($resolved, [string]::Join("`n", $new), [System.Text.UTF8Encoding]::new($false))

# ---------------------------------------------------------------- 产物 2：可导入的插件
# 插件里只能用 DIRECT / REJECT / PROXY（PROXY = 导入时由用户挑策略组）。
$pluginRules = @($raw | ForEach-Object { ConvertTo-LoonRule -Rule $_ -Policy 'PROXY' })
# 取出 App 补丁段（手工维护，不在受管区块内），插件里要一并带上。
$patchStart = -1
for ($i = 0; $i -lt $new.Count; $i++) {
    if ($new[$i].StartsWith($PatchStartMarker)) { $patchStart = $i; break }
}
$patchEnd = $new.IndexOf($LegacyEndAnchor)
if ($patchEnd -lt 0) { $patchEnd = $new.Count }
$patchLines = @()
if ($patchStart -ge 0 -and $patchEnd -gt $patchStart) {
    $patchLines = @($new.GetRange($patchStart, $patchEnd - $patchStart))
}

$plugin = [System.Collections.Generic.List[string]]::new()
$plugin.Add('#!name=IP 归属地伪装')
$plugin.Add('#!desc=让指定 App 看到非大陆出口 IP。导入时把 PROXY 指到你自己的策略组即可，不需要改动配置。')
$plugin.Add('#!author=okgutta')
$plugin.Add('#!homepage=https://github.com/okgutta/loonout')
$plugin.Add('#!icon=https://raw.githubusercontent.com/fmz200/wool_scripts/main/icons/apps/Proxy.png')
$plugin.Add('#!category=IP归属地')
$plugin.Add('')
$plugin.Add('# ============================================================')
$plugin.Add('# 内容来自 SunsetMkt/anti-ip-attribution 的 generated/surge.list（233 条，按上游原序）')
$plugin.Add('# 加上本仓库手工维护的 App 补丁，由 scripts/sync-anti-ip-rules.ps1 生成。')
$plugin.Add('#')
$plugin.Add('# 插件规则只能用 DIRECT / REJECT / PROXY 三种策略：')
$plugin.Add('#   REJECT —— 阻断 App 私有 HTTPDNS，逼它回落系统 DNS，否则域名分流会被绕过')
$plugin.Add('#   DIRECT —— 视频 / 图片 / 静态资源 CDN，必须直连，否则会明显变慢')
$plugin.Add('#   PROXY  —— 需要改 IP 归属地的业务接口，导入时由你选择走哪个策略组')
$plugin.Add('#')
$plugin.Add('# 注意：插件规则优先级低于配置里的「本地 [Rule]」。')
$plugin.Add('# 如果对方配置里也有本地的 GEOIP,CN,DIRECT，那下面这 116 条 IP 规则会被它抢先直连；')
$plugin.Add('# 域名规则不受影响，仍然全部生效。要 IP 规则也生效，就得把它们放进 [Rule] 里。')
$plugin.Add('# ============================================================')
$plugin.Add('')
$plugin.Add('[Rule]')
foreach ($rule in $pluginRules) { $plugin.Add($rule) }
$plugin.Add('')
if ($patchLines.Count -gt 0) {
    $plugin.Add('# ---- 以下来自 Loon.conf 的 App 补丁段 ----')
    foreach ($line in $patchLines) {
        if ($line -match '^(DOMAIN|IP-CIDR)') {
            $plugin.Add(($line -replace ",$([regex]::Escape($PolicyName))", ',PROXY'))
        } elseif ($line -match '\S') {
            $plugin.Add($line)
        }
    }
    $plugin.Add('')
}

$pluginResolved = [System.IO.Path]::GetFullPath($PluginPath)
$pluginDir = [System.IO.Path]::GetDirectoryName($pluginResolved)
if (-not (Test-Path -LiteralPath $pluginDir)) { New-Item -ItemType Directory -Path $pluginDir -Force | Out-Null }
[System.IO.File]::WriteAllText($pluginResolved, [string]::Join("`n", $plugin), [System.Text.UTF8Encoding]::new($false))

# ---------------------------------------------------------------- 汇报
$counts = $localRules | ForEach-Object {
    $p = $_ -split ','
    if ($p[2] -in @('REJECT', 'DIRECT')) { $p[2] } else { $PolicyName }
} | Group-Object | Sort-Object Count -Descending | ForEach-Object { "$($_.Name) $($_.Count)" }

$pluginText = Get-Content -LiteralPath $pluginResolved -Raw -Encoding UTF8
$action = if ($startIndex -ge 0) { '已重写' } else { '已插入' }
Write-Host "$action $resolved 的 IP 归属地区块：共 $($localRules.Count) 条（$($counts -join '，')）。"
Write-Host "已生成 $pluginResolved，共 $([regex]::Matches($pluginText, '(?m)^(?:DOMAIN|IP-CIDR)').Count) 条规则（含 App 补丁）。"
