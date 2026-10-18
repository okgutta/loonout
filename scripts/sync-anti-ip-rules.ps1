<#
.SYNOPSIS
    同步 SunsetMkt/anti-ip-attribution 的规则，生成可直接导入的 Loon 插件。

.DESCRIPTION
    产物：

    1. plugin/ip-attribution.plugin —— 主产物。`loon://import?plugin=<url>` 一条链接就能挂到
       任何配置上，规则里用 PROXY，导入时由 Loon 让用户挑策略组，不依赖具体组名。
    2. （可选）Loon.conf 里的本地 [Rule] 区块 —— 只有当配置里本来就有
       `# ==== IP 归属地伪装` 标记时才重写。现在的 Loon.conf 故意不放本地块：
       本地规则优先级高于插件，会把插件的 IP 规则抢先直连掉。

    规则源用上游 rules.yaml，不用 generated/surge.list：

    - surge.list 是压平后的产物，丢了 App 分组名，生成的配置只能是一坨平铺规则；
    - rules.yaml 里每个 App 都有 `# ======= App =======` 分隔行，按它分组输出，
      规则内容和顺序与 surge.list 完全一致（脚本会校验条数），可读性高得多。

    分组只是加注释，不改匹配顺序：组内顺序照抄上游，组间顺序也照抄上游，
    规则依旧「从上往下、命中即停」。

    App 补丁（上游没收录、实测有效的规则）放在 plugin/app-patches.conf，追加在所有上游
    分组之后：像 -normal- 这种宽泛关键词必须最后生效，否则会抢走前面 App 的流量。

    两个产物都幂等生成，重复运行结果一致。

.PARAMETER ConfigPath
    Loon 配置文件路径，默认仓库根目录下的 Loon.conf。里面没有 IP 归属地标记时跳过该产物。

.PARAMETER PolicyName
    本地区块用的策略组名，默认 IP归属地。

.PARAMETER PluginPath
    插件输出路径，默认仓库根目录下的 plugin/ip-attribution.plugin。

.PARAMETER PatchPath
    本仓库补丁文件，默认仓库根目录下的 plugin/app-patches.conf。

.EXAMPLE
    pwsh -File scripts/sync-anti-ip-rules.ps1
#>
[CmdletBinding()]
param(
    [string]$ConfigPath = (Join-Path $PSScriptRoot '..\Loon.conf'),
    [string]$PolicyName = 'IP归属地',
    [string]$PluginPath = (Join-Path $PSScriptRoot '..\plugin\ip-attribution.plugin'),
    [string]$PatchPath = (Join-Path $PSScriptRoot '..\plugin\app-patches.conf')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$UpstreamUrl = 'https://raw.githubusercontent.com/SunsetMkt/anti-ip-attribution/main/rules.yaml'
$BaseUrls = @($UpstreamUrl, "https://ghproxy.net/$UpstreamUrl")

$BlockStartMarker = '# ==== IP 归属地伪装'
$BlockEndMarker   = '# ==== IP 归属地伪装 结束（以上由 scripts/sync-anti-ip-rules.ps1 生成）===='
$LegacyEndAnchor  = '# 未被域名规则识别的中国大陆 IP 直连，其余交给兜底策略。'
$PatchStartMarker = '# ==== App 补丁'

# Loon 支持的规则类型。上游若新增了别的类型，宁可中止也不要写进配置。
$SupportedTypes = @(
    'DOMAIN', 'DOMAIN-SUFFIX', 'DOMAIN-KEYWORD', 'IP-CIDR', 'IP-CIDR6',
    'GEOIP', 'IP-ASN', 'DST-PORT', 'SRC-PORT', 'USER-AGENT', 'URL-REGEX', 'PROTOCOL'
)

function Get-UpstreamText {
    foreach ($url in $BaseUrls) {
        try {
            $text = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 30 $url).Content
            if ($text -match 'rules:') { return $text }
            Write-Warning "$url 内容异常，尝试下一个源。"
        } catch {
            Write-Warning "拉取失败 $url : $($_.Exception.Message)"
        }
    }
    throw '无法拉取上游规则，请检查网络或代理。'
}

# rules.yaml → 有序分组列表。每个元素：Name（App 名）、Rules（该组的规则原文）。
function ConvertFrom-RulesYaml {
    param([Parameter(Mandatory)][string]$Text)

    $sections = [System.Collections.Generic.List[object]]::new()
    $current = $null

    foreach ($raw in ($Text -split "`n")) {
        $line = $raw.Trim()

        # 分组标题：        # ======= 哔哩哔哩 ======= #
        if ($line -match '^#\s*={3,}\s*(.+?)\s*={3,}\s*#?$') {
            $current = [pscustomobject]@{
                Name  = $matches[1].Trim()
                Rules = [System.Collections.Generic.List[string]]::new()
            }
            $sections.Add($current)
            continue
        }

        # 规则行：        - DOMAIN,httpdns.bilivideo.com,REJECT # issues/51
        if ($line -notmatch '^-\s+(.+)$') { continue }
        $rule = ($matches[1] -replace '\s+#.*$', '').Trim()
        if ($rule -notmatch ',') { continue }

        $type = ($rule -split ',')[0].Trim()
        if ($type -cmatch '^[A-Z][A-Z0-9-]{1,15}$' -and $type -notin $SupportedTypes) {
            throw "上游出现 Loon 不支持的规则类型，中止：$rule"
        }
        if ($type -notin $SupportedTypes) { continue }

        if ($null -eq $current) {
            $current = [pscustomobject]@{
                Name  = '其他'
                Rules = [System.Collections.Generic.List[string]]::new()
            }
            $sections.Add($current)
        }
        $current.Rules.Add($rule)
    }

    $sections
}

# 把上游的一行规则转成 Loon 语法。
# $Policy 是没有显式策略时补上的策略名；IP 规则统一补 no-resolve（上游 surge.list 的老规矩，
# 不补的话 Loon 会为了匹配 IP 规则去解析域名，既慢又可能把域名规则该管的事抢走）。
function ConvertTo-LoonRule {
    param(
        [Parameter(Mandatory)][string]$Rule,
        [Parameter(Mandatory)][string]$Policy
    )
    $f = @($Rule -split ',')
    if ($f[-1] -eq 'no-resolve') { $f = @($f[0..($f.Count - 2)]) }

    if ($f[0] -like 'IP-CIDR*') {
        if ($f.Count -eq 2) { $f += $Policy }
        $f += 'no-resolve'
        return ($f -join ',')
    }
    if ($f.Count -eq 2) { return "$Rule,$Policy" }
    return $Rule   # 已带 REJECT / DIRECT
}

# ---------------------------------------------------------------- 取上游规则
$sections = @(ConvertFrom-RulesYaml -Text (Get-UpstreamText))
$total = 0
foreach ($s in $sections) { $total += $s.Rules.Count }

if ($sections.Count -lt 5 -or $total -lt 100) {
    throw "上游规则解析异常（$($sections.Count) 组 / $total 条），中止以免写坏配置。"
}

# 上游把豆瓣写了两段（rules.yaml 里两个同名分隔行），第二段加「（续）」区分，避免看起来像重复。
$sectionList = @()
$dupIndex = @{}
foreach ($s in $sections) {
    if ($s.Rules.Count -eq 0) { continue }
    $name = $s.Name
    if ($dupIndex.ContainsKey($name)) {
        $dupIndex[$name] = $dupIndex[$name] + 1
        $suffix = if ($dupIndex[$name] -eq 2) { '（续）' } else { "（续$($dupIndex[$name] - 1)）" }
        $name = "$name$suffix"
    } else {
        $dupIndex[$name] = 1
    }
    $sectionList += [pscustomobject]@{ Name = $name; Rules = $s.Rules }
}

# 给几组容易看懵的规则加一句说明（只影响注释，不影响规则）。
$SectionNotes = @{
    '哔哩哔哩'   = '开头那批 REJECT 的 IP 是 App 私有 HTTPDNS，必须拦；后面才是业务接口和 CDN'
    '抖音'       = '关键词 + amemv.com 决定属地；zijieapi / ecombdapi 是素材 CDN，直连'
    '小红书'     = '大部分是 IP 段：App 会绕过域名直连 IP，只封域名没用'
    '斗鱼'       = '前面是直播流 CDN（直连才不卡），最后两条才是业务接口'
    '网易云音乐' = 'API 域名 + 私有 HTTPDNS；结尾几条 IP 是 App 直连用的'
}

# 本仓库补丁：原样保留注释和空行，规则行已经是最终形态（PROXY / DIRECT / REJECT）。
if (-not (Test-Path -LiteralPath $PatchPath)) { throw "找不到补丁文件：$PatchPath" }
$patchLines = @(([System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $PatchPath).Path, [System.Text.Encoding]::UTF8)) -split "`n" | ForEach-Object { $_.TrimEnd("`r") })

# ---------------------------------------------------------------- 产物 1：Loon.conf 本地区块（可选）
$block = [System.Collections.Generic.List[string]]::new()
$block.Add("# ==== IP 归属地伪装：上游 SunsetMkt/anti-ip-attribution 全量规则（$total 条 / $($sectionList.Count) 组，按上游原序，本地优先）====")
$block.Add('# 规则从上往下匹配、命中即停：组内顺序照抄上游，组间顺序也照抄上游，不要重排。')
$block.Add('# 为什么建议用插件而不是本地区块：本地规则优先级高于插件，会把插件的 IP 规则抢先直连掉。')
$block.Add('# 策略：REJECT 拦私有 HTTPDNS；DIRECT 视频/图片/静态 CDN；其余业务接口走上面的策略组。')
$block.Add('# 逐 App 的实测记录、维护方法见 docs/ip-attribution-notes.md。')
$block.Add('# 本段由 scripts/sync-anti-ip-rules.ps1 生成，请勿手工编辑。')
foreach ($s in $sectionList) {
    $block.Add('')
    $block.Add("# ===== $($s.Name)（$($s.Rules.Count) 条）=====")
    if ($SectionNotes.ContainsKey($s.Name)) { $block.Add("#   $($SectionNotes[$s.Name])") }
    foreach ($r in $s.Rules) { $block.Add((ConvertTo-LoonRule -Rule $r -Policy $PolicyName)) }
}
if ($patchLines.Count -gt 0) {
    $block.Add('')
    $block.Add('# ===== 本仓库补丁（上游未收录，实测有效）=====')
    foreach ($line in $patchLines) {
        if ($line -match '^(DOMAIN|IP-CIDR)') { $block.Add(($line -replace ',PROXY$', ",$PolicyName")) }
        else { $block.Add($line) }
    }
}
$block.Add('')
$block.Add($BlockEndMarker)

$resolved = $null
$startIndex = -1
$blockWritten = $false

if (Test-Path -LiteralPath $ConfigPath) {
    $resolved = (Resolve-Path -LiteralPath $ConfigPath).Path
    $lines = ([System.IO.File]::ReadAllText($resolved, [System.Text.Encoding]::UTF8)) -split "`n"

    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i].StartsWith($BlockStartMarker)) { $startIndex = $i; break }
    }

    if ($startIndex -ge 0) {
        $endIndex = -1
        for ($i = $startIndex + 1; $i -lt $lines.Count; $i++) {
            if ($lines[$i].StartsWith($BlockEndMarker)) { $endIndex = $i; break }
        }
        if ($endIndex -lt 0) { $endIndex = [Array]::IndexOf($lines, $LegacyEndAnchor) - 1 }
        if ($endIndex -lt 0) { throw "在 $resolved 中找不到区块结束位置（既没有结束标记，也没有旧锚点行）。" }

        $before = $lines[0..($startIndex - 1)]
        $after  = $lines[($endIndex + 1)..($lines.Count - 1)]

        $new = [System.Collections.Generic.List[string]]::new()
        $new.AddRange([string[]]$before)
        $new.AddRange($block)
        $new.AddRange([string[]]$after)
        [System.IO.File]::WriteAllText($resolved, [string]::Join("`n", $new), [System.Text.UTF8Encoding]::new($false))
        $blockWritten = $true
    }
}

# ---------------------------------------------------------------- 产物 2：可导入的插件
# 插件里只能用 DIRECT / REJECT / PROXY（PROXY = 导入时由用户挑策略组）。
$plugin = [System.Collections.Generic.List[string]]::new()
$plugin.Add('#!name=IP 归属地伪装')
$plugin.Add('#!desc=让指定 App 看到非大陆出口 IP。导入时把 PROXY 指到你自己的策略组即可，不需要改动配置。')
$plugin.Add('#!author=okgutta')
$plugin.Add('#!homepage=https://github.com/okgutta/loonout')
$plugin.Add('#!icon=https://raw.githubusercontent.com/fmz200/wool_scripts/main/icons/apps/Proxy.png')
$plugin.Add('#!category=IP归属地')
$plugin.Add('')
$plugin.Add('# ============================================================')
$plugin.Add("# 规则来源：SunsetMkt/anti-ip-attribution 的 rules.yaml，$total 条 / $($sectionList.Count) 组。")
$plugin.Add('# 按 App 分组，组内顺序与上游一致（规则从上往下匹配、命中即停，不要重排）。')
$plugin.Add('#')
$plugin.Add('# 插件里只有三种策略：')
$plugin.Add('#   REJECT —— 阻断 App 私有 HTTPDNS，否则域名分流会被绕过')
$plugin.Add('#   DIRECT —— 视频 / 图片 / 静态资源 CDN，必须直连，否则会明显变慢')
$plugin.Add('#   PROXY  —— 需要改 IP 归属地的业务接口，导入时由你选择策略组')
$plugin.Add('#')
$plugin.Add('# 插件规则优先级低于配置里的本地 [Rule]。如果对方配置里也有本地的')
$plugin.Add('# GEOIP,CN,DIRECT，那下面这些 IP 规则会被它抢先直连；域名规则不受影响，仍然全部生效。')
$plugin.Add('# 逐 App 的实测记录、已知改不动的场景见 docs/ip-attribution-notes.md。')
$plugin.Add('# ============================================================')
$plugin.Add('')
$plugin.Add('[Rule]')
foreach ($s in $sectionList) {
    $plugin.Add('')
    $plugin.Add("# ===== $($s.Name)（$($s.Rules.Count) 条）=====")
    if ($SectionNotes.ContainsKey($s.Name)) { $plugin.Add("#   $($SectionNotes[$s.Name])") }
    foreach ($r in $s.Rules) { $plugin.Add((ConvertTo-LoonRule -Rule $r -Policy 'PROXY')) }
}

# 本仓库补丁（plugin/app-patches.conf），原样追加在所有上游分组之后。
if ($patchLines.Count -gt 0) {
    $plugin.Add('')
    foreach ($line in $patchLines) { $plugin.Add($line) }
}
$plugin.Add('')

$pluginResolved = [System.IO.Path]::GetFullPath($PluginPath)
$pluginDir = [System.IO.Path]::GetDirectoryName($pluginResolved)
if (-not (Test-Path -LiteralPath $pluginDir)) { New-Item -ItemType Directory -Path $pluginDir -Force | Out-Null }
[System.IO.File]::WriteAllText($pluginResolved, [string]::Join("`n", $plugin), [System.Text.UTF8Encoding]::new($false))

# ---------------------------------------------------------------- 汇报
$counts = $sectionList | ForEach-Object {
    $p = @($_.Rules | ForEach-Object { ((ConvertTo-LoonRule -Rule $_ -Policy $PolicyName) -split ',')[2] })
    [pscustomobject]@{
        Reject = @($p | Where-Object { $_ -eq 'REJECT' }).Count
        Direct = @($p | Where-Object { $_ -eq 'DIRECT' }).Count
        Proxy  = @($p | Where-Object { $_ -eq $PolicyName }).Count
    }
}
$pluginText = Get-Content -LiteralPath $pluginResolved -Raw -Encoding UTF8
if ($blockWritten) {
    Write-Host "已重写 $resolved 的 IP 归属地区块：$total 条 / $($sectionList.Count) 组（$PolicyName $(($counts | Measure-Object Proxy -Sum).Sum)，DIRECT $(($counts | Measure-Object Direct -Sum).Sum)，REJECT $(($counts | Measure-Object Reject -Sum).Sum)）。"
} else {
    Write-Host "跳过本地区块：$ConfigPath 里没有「$BlockStartMarker」标记（这份配置用插件，不放本地块）。"
}
Write-Host "已生成 $pluginResolved，共 $([regex]::Matches($pluginText, '(?m)^(?:DOMAIN|IP-CIDR)').Count) 条规则（含 App 补丁）。"
