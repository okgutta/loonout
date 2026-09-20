<#
.SYNOPSIS
    把 SunsetMkt/anti-ip-attribution 的 IP 层规则同步进 Loon.conf 的本地 [Rule]。

.DESCRIPTION
    Loon 的规则来源优先级是「本地规则 > 插件规则 > 订阅规则」。配置里本地的
    GEOIP,CN,DIRECT 会把所有中国大陆 IP 抢先直连，导致上游通过 [Remote Rule]
    引用的 116 条 IP 规则（HTTPDNS 私域阻断 + 解析结果代理）全部失效。

    本脚本把这些 IP 规则提取出来、统一补上 no-resolve，写进 Loon.conf 中
    GEOIP,CN,DIRECT 之前的一个受管区块。域名层不动，仍由 [Remote Rule] 里的
    rule-set-*.list 自动跟随上游更新。

    脚本只重写自己生成的那个区块，其余内容原样保留；重复运行结果一致。

.PARAMETER ConfigPath
    Loon 配置文件路径，默认仓库根目录下的 Loon.conf。

.PARAMETER PolicyName
    代理策略组名，默认 IP归属地。改了 [Proxy Group] 里的组名后同步改这里。

.EXAMPLE
    pwsh -File scripts/sync-ip-rules.ps1

.EXAMPLE
    pwsh -File scripts/sync-ip-rules.ps1 -PolicyName 默认代理
#>
[CmdletBinding()]
param(
    [string]$ConfigPath = (Join-Path $PSScriptRoot '..\Loon.conf'),
    [string]$PolicyName = 'IP归属地'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$BlockStartMarker = '# ==== IP 归属地伪装'
$BlockEndAnchor   = '# 未被域名规则识别的中国大陆 IP 直连，其余交给兜底策略。'

$BaseUrls = @(
    'https://raw.githubusercontent.com/SunsetMkt/anti-ip-attribution/main/generated',
    'https://ghproxy.net/https://raw.githubusercontent.com/SunsetMkt/anti-ip-attribution/main/generated'
)

function Get-UpstreamText {
    param([Parameter(Mandatory)][string]$FileName)

    foreach ($base in $BaseUrls) {
        try {
            $text = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 30 "$base/$FileName").Content
            if ($text -match 'IP-CIDR') { return $text }
            Write-Warning "$base/$FileName 内容异常，尝试下一个源。"
        } catch {
            Write-Warning "拉取失败 $base/$FileName : $($_.Exception.Message)"
        }
    }
    throw "无法拉取 $FileName，请检查网络或代理。"
}

function Get-IpRules {
    param([Parameter(Mandatory)][string]$Text)

    # 上游这三份 list 里 IP 规则不带 no-resolve（只有 surge.list 带），这里统一去掉后由本脚本补。
    # 第三段字符类必须含冒号，否则会漏掉 IP-CIDR6（知乎 HTTPDNS）。
    return @(
        $Text -split "`n" |
            ForEach-Object { $_.Trim() } |
            Where-Object { $_ -match '^IP-CIDR6?,[0-9a-fA-F:\.]+/\d+' } |
            ForEach-Object { $_ -replace ',no-resolve$', '' }
    )
}

$rejectRules = Get-IpRules (Get-UpstreamText 'rule-set-reject.list')
$proxyRules  = Get-IpRules (Get-UpstreamText 'rule-set-proxy.list')

if ($rejectRules.Count -eq 0 -or $proxyRules.Count -eq 0) {
    throw "上游 IP 规则为空（reject=$($rejectRules.Count) proxy=$($proxyRules.Count)），中止以免写坏配置。"
}

$total = $rejectRules.Count + $proxyRules.Count

$block = [System.Collections.Generic.List[string]]::new()
$block.Add($BlockStartMarker + '：上游 SunsetMkt/anti-ip-attribution 的 IP 层规则（本地优先）====')
$block.Add("# 这 $total 条全是中国大陆 IP，只有放在本地 [Rule] 里才能先于下面的 GEOIP,CN,DIRECT 命中；")
$block.Add('# 放在 [Remote Rule] 会被 GEOIP,CN 抢先直连，等于失效。')
$block.Add('# 域名层不在这里，由 [Remote Rule] 的 rule-set-*.list 承担，继续跟随上游更新。')
$block.Add('# 本段由 scripts/sync-ip-rules.ps1 生成，请勿手工编辑。')
$block.Add('')
$block.Add('# 阻断 App 私有 HTTPDNS 私域，逼它回落系统 DNS；否则 App 直接连 IP，域名分流会被绕过。')
foreach ($rule in $rejectRules) { $block.Add("$rule,REJECT,no-resolve") }
$block.Add('')
$block.Add('# HTTPDNS 解析结果 IP：App 直接连这些地址，必须代理，否则看到的仍是真实出口。')
foreach ($rule in $proxyRules) { $block.Add("$rule,$PolicyName,no-resolve") }
$block.Add('')

$resolved = (Resolve-Path -LiteralPath $ConfigPath).Path
$lines = ([System.IO.File]::ReadAllText($resolved, [System.Text.Encoding]::UTF8)) -split "`n"

$anchorIndex = [Array]::IndexOf($lines, $BlockEndAnchor)
if ($anchorIndex -lt 0) {
    throw "在 $resolved 中找不到锚点行：$BlockEndAnchor"
}

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

$action = if ($startIndex -ge 0) { '已重写' } else { '已插入' }
Write-Host "$action $resolved 中的 IP 归属地区块：$($rejectRules.Count) 条 REJECT + $($proxyRules.Count) 条 $PolicyName，共 $total 条。"
