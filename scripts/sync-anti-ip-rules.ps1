<#
.SYNOPSIS
    把 SunsetMkt/anti-ip-attribution 的规则按原顺序同步进 Loon.conf 的本地 [Rule]。

.DESCRIPTION
    为什么整份内联到本地 [Rule]，而不是用 [Remote Rule] 引用：

    1. 顺序。上游的规则是按 App 交错排列的，例如抖音那一段：
         DOMAIN-KEYWORD,core-c-lq          (代理)
         ... 另外 5 条 -lq 关键词           (代理)
         DOMAIN-SUFFIX,zijieapi.com,DIRECT (直连，故意夹在中间)
         DOMAIN-KEYWORD,-normal-hl         (代理)
       Loon 的订阅规则一条 URL 只能指定一个策略，要拆成「按策略分组」的文件就必然
       打乱这个顺序，结果具体规则被更宽的规则抢走。本地 [Rule] 里每条规则可以各带
       策略，能一比一还原上游顺序。

    2. 优先级。Loon 的规则来源优先级是「本地规则 > 插件规则 > 订阅规则」。上游那
       116 条 IP 规则全是中国大陆地址，放在订阅层会被本地的 GEOIP,CN,DIRECT 抢先
       直连，等于失效。

    规则源直接用上游的 generated/surge.list：它已经是按正确顺序排好的、且已给所有
    IP 规则补了 no-resolve。脚本只做两件事：保留行内的 REJECT / DIRECT，其余规则
   补上 -PolicyName。

    脚本只重写自己生成的那个区块，其余内容原样保留；重复运行结果一致。

.PARAMETER ConfigPath
    Loon 配置文件路径，默认仓库根目录下的 Loon.conf。

.PARAMETER PolicyName
    代理策略组名，默认 IP归属地。改了 [Proxy Group] 里的组名后同步改这里。

.EXAMPLE
    pwsh -File scripts/sync-anti-ip-rules.ps1

.EXAMPLE
    pwsh -File scripts/sync-anti-ip-rules.ps1 -PolicyName 默认代理
#>
[CmdletBinding()]
param(
    [string]$ConfigPath = (Join-Path $PSScriptRoot '..\Loon.conf'),
    [string]$PolicyName = 'IP归属地'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$UpstreamList = 'https://raw.githubusercontent.com/SunsetMkt/anti-ip-attribution/main/generated/surge.list'
$BaseUrls = @(
    $UpstreamList,
    "https://ghproxy.net/$UpstreamList"
)

$BlockStartMarker = '# ==== IP 归属地伪装'
$BlockEndAnchor   = '# 未被域名规则识别的中国大陆 IP 直连，其余交给兜底策略。'

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

function ConvertTo-LoonRule {
    param([Parameter(Mandatory)][string]$Rule)

    $f = $Rule -split ','
    # IP-CIDR,x/y,no-resolve  →  IP-CIDR,x/y,<策略>,no-resolve（Loon 要求策略在 no-resolve 之前）
    if ($f[0] -like 'IP-CIDR*' -and $f.Count -eq 3 -and $f[2] -eq 'no-resolve') {
        return "$($f[0]),$($f[1]),$PolicyName,no-resolve"
    }
    # 只有 TYPE,VALUE 两段 → 补策略
    if ($f.Count -eq 2) { return "$Rule,$PolicyName" }
    # 已经带了 REJECT / DIRECT 的原样保留
    return $Rule
}

$upstream = Get-UpstreamRules
$raw = @(
    $upstream -split "`n" |
        ForEach-Object { $_.Trim() } |
        Where-Object { $_ -match '\S' -and $_ -notmatch '^#' }
)

if ($raw.Count -eq 0) { throw '上游规则为空，中止以免写坏配置。' }

$unsupported = @($raw | Where-Object { ($_ -split ',')[0] -notin $SupportedTypes } | Select-Object -Unique)
if ($unsupported.Count -gt 0) {
    throw "上游出现 Loon 不支持的规则类型，中止：$($unsupported -join ', ')"
}

$rules = @($raw | ForEach-Object { ConvertTo-LoonRule $_ })

$block = [System.Collections.Generic.List[string]]::new()
$block.Add($BlockStartMarker + '：上游 SunsetMkt/anti-ip-attribution 全量规则（按上游原序，本地优先）====')
$block.Add('# 为什么不放在 [Remote Rule]：')
$block.Add('#   1. 上游规则按 App 交错排列（抖音的 -lq 关键词夹在 zijieapi.com 的 DIRECT 前后），')
$block.Add('#      拆成按策略分组的订阅文件会打乱顺序，具体规则会被更宽的规则抢走；')
$block.Add('#   2. 上游 116 条 IP 规则全是中国大陆地址，放订阅层会被下面的 GEOIP,CN,DIRECT 抢先直连。')
$block.Add('# 顺序与上游 generated/surge.list 完全一致；行内 REJECT / DIRECT 保留，其余走上面那个策略组。')
$block.Add('# 本段由 scripts/sync-anti-ip-rules.ps1 生成，请勿手工编辑。')
$block.Add('')
foreach ($rule in $rules) { $block.Add($rule) }
$block.Add('')

$resolved = (Resolve-Path -LiteralPath $ConfigPath).Path
$lines = ([System.IO.File]::ReadAllText($resolved, [System.Text.Encoding]::UTF8)) -split "`n"

$anchorIndex = [Array]::IndexOf($lines, $BlockEndAnchor)
if ($anchorIndex -lt 0) { throw "在 $resolved 中找不到锚点行：$BlockEndAnchor" }

$startIndex = -1
for ($i = 0; $i -lt $anchorIndex; $i++) {
    if ($lines[$i].StartsWith($BlockStartMarker)) { $startIndex = $i; break }
}

$before = if ($startIndex -ge 0) { $lines[0..($startIndex - 1)] } else { $lines[0..($anchorIndex - 1)] }
$after  = $lines[$anchorIndex..($lines.Count - 1)]

$new = [System.Collections.Generic.List[string]]::new()
$new.AddRange([string[]]$before)
$new.AddRange($block)
$new.AddRange([string[]]$after)

# 保持仓库既有的 LF + 无 BOM。
[System.IO.File]::WriteAllText($resolved, [string]::Join("`n", $new), [System.Text.UTF8Encoding]::new($false))

$counts = $rules | ForEach-Object { $p = $_ -split ','; if ($p[2] -eq 'REJECT' -or $p[2] -eq 'DIRECT') { $p[2] } else { $PolicyName } } |
    Group-Object | Sort-Object Count -Descending | ForEach-Object { "$($_.Name) $($_.Count)" }

$action = if ($startIndex -ge 0) { '已重写' } else { '已插入' }
Write-Host "$action $resolved 中的 IP 归属地区块：共 $($rules.Count) 条规则（$($counts -join '，')）。"
