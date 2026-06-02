<#
.SYNOPSIS
  Installs the hwpx-mcp skill, template, and Claude Desktop MCP entry for Windows.

.DESCRIPTION
  Safe, idempotent installer:
    * Auto-detects claude_desktop_config.json across EXE-installer and MSIX
      (Microsoft Store) Claude Desktop builds -- works under a standard user
      account (no admin elevation).
    * Prints an "Install Plan" before touching anything.
    * Skips writes that would be no-ops (identical JSON / identical SHA-1).
    * Backs up replaced items to <target>.bak-<timestamp> and prunes older
      backups so at most 2 remain per target.
    * Only touches its own keys:
        - mcpServers.hwpx inside claude_desktop_config.json (other MCP
          entries' VALUES are preserved -- file is reserialized via
          ConvertTo-Json so indentation / whitespace / key order / line
          endings may shift; original is saved to .bak-<timestamp>)
        - ~\.claude\skills\hwpx-document-writer            (other skills
          under ~\.claude\skills are not touched)
        - ~\Documents\skills\templates\<template>.hwpx     (other templates
          in that folder are not touched)

  Override the config location with the HWPX_MCP_CLAUDE_CONFIG environment
  variable if auto-detection picks the wrong file.

  NOTE: This file is intentionally ASCII-only so Windows PowerShell 5.1
  reads it correctly regardless of console encoding. Template filenames
  containing non-ASCII characters are resolved at runtime from the payload
  folder.
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------
function Write-Step  { param([string]$msg) Write-Host "[*] $msg" -ForegroundColor Cyan }
function Write-Ok    { param([string]$msg) Write-Host "[+] $msg" -ForegroundColor Green }
function Write-Warn2 { param([string]$msg) Write-Host "[!] $msg" -ForegroundColor Yellow }
function Write-Fail  { param([string]$msg) Write-Host "[x] $msg" -ForegroundColor Red }
function Write-Info  { param([string]$msg) Write-Host "    $msg" -ForegroundColor Gray }

function Get-Timestamp { (Get-Date).ToString('yyyyMMdd-HHmmss') }

function Write-Utf8NoBom {
    param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$Content)
    $enc = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $enc)
}

function Get-Sha1 {
    param([Parameter(Mandatory)][string]$Path)
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA1).Hash
}

function Remove-OldBackups {
    # Keep the most recent $Keep backups matching "<basename>.bak-*" next to
    # $ItemPath; delete older ones.
    param(
        [Parameter(Mandatory)][string]$ItemPath,
        [int]$Keep = 2
    )
    $parent   = Split-Path -Parent $ItemPath
    $basename = Split-Path -Leaf   $ItemPath
    if (-not (Test-Path -LiteralPath $parent)) { return }
    $pattern  = "$basename.bak-*"
    $backups  = Get-ChildItem -Path $parent -Filter $pattern -Force -ErrorAction SilentlyContinue |
                Sort-Object LastWriteTime -Descending
    if ($backups -and $backups.Count -gt $Keep) {
        $toPrune = $backups | Select-Object -Skip $Keep
        foreach ($b in $toPrune) {
            try {
                Remove-Item -LiteralPath $b.FullName -Recurse -Force
                Write-Info "Pruned old backup: $($b.Name)"
            } catch {
                Write-Warn2 "Could not prune $($b.Name): $($_.Exception.Message)"
            }
        }
    }
}

function Move-AsideWithBackup {
    param([Parameter(Mandatory)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    $backup = "$Path.bak-$(Get-Timestamp)"
    Move-Item -LiteralPath $Path -Destination $backup -Force
    Write-Info "Existing item backed up -> $(Split-Path -Leaf $backup)"
    Remove-OldBackups -ItemPath $Path -Keep 2
    return $backup
}

function Copy-AsideWithBackup {
    param([Parameter(Mandatory)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    $backup = "$Path.bak-$(Get-Timestamp)"
    Copy-Item -LiteralPath $Path -Destination $backup -Force
    Write-Info "Config snapshot saved -> $(Split-Path -Leaf $backup)"
    Remove-OldBackups -ItemPath $Path -Keep 2
    return $backup
}

# ---------------------------------------------------------------------------
# Claude Desktop config path detection
# ---------------------------------------------------------------------------
function Find-ClaudeConfigPath {
    # 1. Manual override.
    if ($env:HWPX_MCP_CLAUDE_CONFIG) {
        return [PSCustomObject]@{
            Path       = $env:HWPX_MCP_CLAUDE_CONFIG
            Source     = 'HWPX_MCP_CLAUDE_CONFIG env var'
            Exists     = (Test-Path -LiteralPath $env:HWPX_MCP_CLAUDE_CONFIG)
            Candidates = @()
        }
    }

    $candidates = New-Object System.Collections.ArrayList

    # 2. MSIX / Microsoft Store app via Appx module (works for standard users).
    try {
        $pkgs = Get-AppxPackage -ErrorAction SilentlyContinue |
                Where-Object { $_.Name -like '*Claude*' -or $_.PackageFamilyName -like '*Claude*' }
        foreach ($pkg in $pkgs) {
            $p = Join-Path $env:LOCALAPPDATA "Packages\$($pkg.PackageFamilyName)\LocalCache\Roaming\Claude\claude_desktop_config.json"
            [void]$candidates.Add([PSCustomObject]@{ Path = $p; Source = "Store app ($($pkg.Name))" })
        }
    } catch {
        # Appx cmdlets unavailable (Server Core, locked-down SKU, etc.) -- fall through.
    }

    # 3. Glob fallback when Get-AppxPackage yielded nothing.
    $packagesRoot = Join-Path $env:LOCALAPPDATA 'Packages'
    if (Test-Path -LiteralPath $packagesRoot) {
        $folders = Get-ChildItem -LiteralPath $packagesRoot -Directory -ErrorAction SilentlyContinue |
                   Where-Object { $_.Name -like '*Claude*' }
        foreach ($f in $folders) {
            $p = Join-Path $f.FullName 'LocalCache\Roaming\Claude\claude_desktop_config.json'
            if (-not ($candidates | Where-Object { $_.Path -eq $p })) {
                [void]$candidates.Add([PSCustomObject]@{ Path = $p; Source = "Store folder ($($f.Name))" })
            }
        }
    }

    # 4. Traditional EXE-installer paths.
    [void]$candidates.Add([PSCustomObject]@{
        Path   = (Join-Path $env:APPDATA 'Claude\claude_desktop_config.json')
        Source = 'EXE installer (%APPDATA%\Claude)'
    })
    [void]$candidates.Add([PSCustomObject]@{
        Path   = (Join-Path $env:APPDATA 'AnthropicClaude\claude_desktop_config.json')
        Source = 'EXE installer (%APPDATA%\AnthropicClaude)'
    })
    [void]$candidates.Add([PSCustomObject]@{
        Path   = (Join-Path $env:LOCALAPPDATA 'Claude\claude_desktop_config.json')
        Source = 'EXE installer (%LOCALAPPDATA%\Claude)'
    })

    # 5. Pick: existing file first, then existing parent dir, else no hit.
    foreach ($c in $candidates) {
        if (Test-Path -LiteralPath $c.Path) {
            return [PSCustomObject]@{ Path = $c.Path; Source = $c.Source; Exists = $true;  Candidates = $candidates }
        }
    }
    foreach ($c in $candidates) {
        $parent = Split-Path -Parent $c.Path
        if (Test-Path -LiteralPath $parent) {
            return [PSCustomObject]@{ Path = $c.Path; Source = $c.Source; Exists = $false; Candidates = $candidates }
        }
    }
    return [PSCustomObject]@{ Path = $null; Source = $null; Exists = $false; Candidates = $candidates }
}

# ---------------------------------------------------------------------------
# Paths and payload resolution
# ---------------------------------------------------------------------------
$PayloadDir      = Join-Path $PSScriptRoot 'payload'
$SkillZip        = Join-Path $PayloadDir 'hwpx-document-writer.zip'

$SkillsRoot      = Join-Path $env:USERPROFILE '.claude\skills'
$SkillTarget     = Join-Path $SkillsRoot 'hwpx-document-writer'
$TemplatesRoot   = Join-Path $env:USERPROFILE 'Documents\skills\templates'

# The template filename contains Hangul; resolve it at runtime from the
# payload folder so no non-ASCII literal appears in this script.
$templateCandidates = @(Get-ChildItem -LiteralPath $PayloadDir -Filter '*.hwpx' -File -ErrorAction SilentlyContinue)

# Pin to @latest so npx cache stays warm across patch releases.
$TargetHwpxEntry = [PSCustomObject]@{
    command = 'npx'
    args    = @('-y', 'hwpx-mcp-server@latest')
}
$TargetHwpxJson  = $TargetHwpxEntry | ConvertTo-Json -Compress -Depth 10

# ---------------------------------------------------------------------------
# Banner
# ---------------------------------------------------------------------------
Write-Host ''
Write-Host '========================================' -ForegroundColor White
Write-Host '  hwpx-mcp installer (Windows)'           -ForegroundColor White
Write-Host '========================================' -ForegroundColor White
Write-Host ''

# ---------------------------------------------------------------------------
# 0. Claude Desktop running-process guard
# ---------------------------------------------------------------------------
# If Claude Desktop is running, it holds the old config in memory and will
# not pick up our changes until fully quit + relaunched. The first DGIST
# tester deployment hit this and saw "hwpx-mcp 도구가 연결되어 있지 않습
# 니다" even though the config file on disk was correct. Detect early and
# let the user decide whether to abort or proceed.
Write-Step 'Checking Claude Desktop process'
# Get-Process matches by name only. We follow up with a $_.Path filter to
# avoid false positives from unrelated binaries also named Claude.exe.
#
# Caveats handled below:
#  * MSIX / Microsoft Store builds run under a sandbox where $_.Path is
#    often $null for a standard user (no perms to read the Process Path
#    property). To avoid missing a Store install entirely, treat null Path
#    as "trust the name" -- it's better to over-warn than to silently skip
#    the guard for Store users.
#  * Real Store install path is C:\Program Files\WindowsApps\<package>\Claude.exe
#    (the *\Packages\Claude_*\... tree is the per-user config sandbox, NOT
#    the executable location).
$claudeProcs = @(Get-Process -Name 'Claude' -ErrorAction SilentlyContinue | Where-Object {
    if (-not $_.Path) {
        # Path unavailable (MSIX sandbox / permission denied) -> fall back
        # to name match. Most likely this IS Claude Desktop.
        return $true
    }
    $_.Path -like '*\Claude\Claude.exe' -or
    $_.Path -like '*\WindowsApps\*Claude*\Claude.exe' -or
    $_.Path -like '*\AnthropicClaude\*\Claude.exe'
})
if ($claudeProcs.Count -gt 0) {
    $pidList = ($claudeProcs | ForEach-Object { $_.Id }) -join ', '
    Write-Warn2 "Claude Desktop is currently running (PID: $pidList)."
    Write-Info 'It holds the old config in memory; changes will not take effect until you'
    Write-Info 'fully quit it (system tray icon -> Quit) and reopen.'

    # PowerShell's $Host.UI.RawUI.KeyAvailable is unreliable; use Read-Host
    # but only when stdin is interactive (Read-Host throws under -NonInteractive).
    $isInteractive = -not ([Console]::IsInputRedirected)
    if ($isInteractive) {
        $ans = Read-Host 'Continue anyway? [y/N]'
        if ($ans -notmatch '^(y|Y|yes|YES)$') {
            Write-Fail 'Aborted by user. Quit Claude Desktop, then rerun this installer.'
            exit 7
        }
        Write-Info 'Proceeding. Remember to fully quit and reopen Claude Desktop afterwards.'
    } else {
        Write-Info '(non-interactive shell -- proceeding without prompt; do quit + reopen Claude Desktop after install)'
    }
} else {
    Write-Ok 'Claude Desktop is not running.'
}

# ---------------------------------------------------------------------------
# 1. Payload sanity
# ---------------------------------------------------------------------------
Write-Step 'Checking payload files'
if (-not (Test-Path -LiteralPath $SkillZip)) {
    Write-Fail "Payload missing: $SkillZip"
    Write-Info 'Extract the installer zip intact and rerun.'
    exit 2
}
if ($templateCandidates.Count -eq 0) {
    Write-Fail "No .hwpx template found in $PayloadDir"
    Write-Info 'Extract the installer zip intact and rerun.'
    exit 2
}
if ($templateCandidates.Count -gt 1) {
    Write-Fail "Multiple .hwpx templates in $PayloadDir (expected exactly one):"
    foreach ($t in $templateCandidates) { Write-Info "  - $($t.Name)" }
    exit 2
}
$TemplateSource   = $templateCandidates[0].FullName
$TemplateFilename = $templateCandidates[0].Name
$TemplateTarget   = Join-Path $TemplatesRoot $TemplateFilename
Write-Ok 'Payload OK'

# ---------------------------------------------------------------------------
# 2. Node.js prereq
# ---------------------------------------------------------------------------
Write-Step 'Checking Node.js'
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Fail 'Node.js not found on PATH.'
    Write-Info 'Install Node.js 18 LTS or newer from https://nodejs.org/ then rerun this installer.'
    exit 3
}
$nodeVersion = (& node --version) 2>$null
Write-Ok "Node.js detected ($nodeVersion)"

# ---------------------------------------------------------------------------
# 3. Locate Claude Desktop config
# ---------------------------------------------------------------------------
Write-Step 'Locating Claude Desktop config'
$configInfo = Find-ClaudeConfigPath
if (-not $configInfo.Path) {
    Write-Fail 'Claude Desktop config directory not found.'
    Write-Info 'Install Claude Desktop from https://claude.ai/download, open it at least once, then rerun.'
    Write-Info 'Non-standard install? Set HWPX_MCP_CLAUDE_CONFIG to the full path of claude_desktop_config.json.'
    exit 4
}
Write-Ok "Config target: $($configInfo.Path)"
Write-Info "(detected via: $($configInfo.Source))"

$existing = @($configInfo.Candidates | Where-Object { Test-Path -LiteralPath $_.Path })
if ($existing.Count -gt 1) {
    Write-Warn2 'Multiple Claude config files detected. Using the first one listed below.'
    foreach ($c in $existing) { Write-Info ("  - {0}  ({1})" -f $c.Path, $c.Source) }
    Write-Info 'Set HWPX_MCP_CLAUDE_CONFIG to pick a different one.'
}

# ---------------------------------------------------------------------------
# 4. Build install plan
# ---------------------------------------------------------------------------
Write-Step 'Planning changes'

# -- config
$configChange = 'create new config file'
if ($configInfo.Exists) {
    try {
        $raw = Get-Content -LiteralPath $configInfo.Path -Raw -Encoding UTF8
        if (-not [string]::IsNullOrWhiteSpace($raw)) {
            $parsed = $raw | ConvertFrom-Json
            if ($parsed.PSObject.Properties.Name -contains 'mcpServers' -and
                $parsed.mcpServers.PSObject.Properties.Name -contains 'hwpx') {
                $currentHwpxJson = ($parsed.mcpServers.hwpx | ConvertTo-Json -Compress -Depth 10)
                if ($currentHwpxJson -eq $TargetHwpxJson) {
                    $configChange = 'skip (hwpx entry already current)'
                } else {
                    $configChange = 'update hwpx entry (other MCP entries preserved)'
                }
            } else {
                $configChange = 'add hwpx entry (other MCP entries preserved)'
            }
        }
    } catch {
        Write-Warn2 "Could not parse existing config: $($_.Exception.Message)"
        $configChange = 'rewrite (config unparseable; original will be backed up)'
    }
}

# -- skill
$skillChange = 'install'
if (Test-Path -LiteralPath $SkillTarget) {
    $skillChange = 'replace (existing folder will be backed up)'
}

# -- template
$templateChange = 'install'
if (Test-Path -LiteralPath $TemplateTarget) {
    $sameTpl = (Get-Sha1 -Path $TemplateSource) -eq (Get-Sha1 -Path $TemplateTarget)
    $templateChange = if ($sameTpl) { 'skip (bytes identical)' } else { 'replace (existing file will be backed up)' }
}

Write-Host ''
Write-Host '--- Install Plan ---' -ForegroundColor White
Write-Host ("  Claude config : {0}" -f $configInfo.Path)
Write-Host ("      action    : {0}" -f $configChange)
Write-Host ("  Skill folder  : {0}" -f $SkillTarget)
Write-Host ("      action    : {0}" -f $skillChange)
Write-Host ("  Template file : {0}" -f $TemplateTarget)
Write-Host ("      action    : {0}" -f $templateChange)
Write-Host ''

# ---------------------------------------------------------------------------
# 5. Update Claude Desktop config
# ---------------------------------------------------------------------------
Write-Step 'Updating claude_desktop_config.json'

if ($configChange -like 'skip*') {
    Write-Ok 'Config already current; skipping write.'
} else {
    $configDir = Split-Path -Parent $configInfo.Path
    if (-not (Test-Path -LiteralPath $configDir)) {
        New-Item -ItemType Directory -Path $configDir -Force | Out-Null
    }

    $configObject = [PSCustomObject]@{}
    if (Test-Path -LiteralPath $configInfo.Path) {
        Copy-AsideWithBackup -Path $configInfo.Path | Out-Null
        try {
            $raw = Get-Content -LiteralPath $configInfo.Path -Raw -Encoding UTF8
            if (-not [string]::IsNullOrWhiteSpace($raw)) {
                $configObject = $raw | ConvertFrom-Json
            }
        } catch {
            Write-Warn2 'Existing config unparseable - starting from empty object (backup preserved).'
            $configObject = [PSCustomObject]@{}
        }
    }

    if (-not ($configObject.PSObject.Properties.Name -contains 'mcpServers')) {
        $configObject | Add-Member -NotePropertyName 'mcpServers' -NotePropertyValue ([PSCustomObject]@{}) -Force
    }
    if ($configObject.mcpServers.PSObject.Properties.Name -contains 'hwpx') {
        $configObject.mcpServers.hwpx = $TargetHwpxEntry
    } else {
        $configObject.mcpServers | Add-Member -NotePropertyName 'hwpx' -NotePropertyValue $TargetHwpxEntry -Force
    }

    $json = $configObject | ConvertTo-Json -Depth 20
    Write-Utf8NoBom -Path $configInfo.Path -Content $json
    Write-Ok "Wrote $($configInfo.Path)"
}

# ---------------------------------------------------------------------------
# 6. Install the skill
# ---------------------------------------------------------------------------
Write-Step 'Installing skill'
if (-not (Test-Path -LiteralPath $SkillsRoot)) {
    New-Item -ItemType Directory -Path $SkillsRoot -Force | Out-Null
}
if (Test-Path -LiteralPath $SkillTarget) {
    Move-AsideWithBackup -Path $SkillTarget | Out-Null
}

# Warn -- but never touch -- loose SKILL.md / REFERENCE.md siblings at the
# skills root. The buggy v0.5.2 installer dropped these here; clean them
# up manually if you see this warning. We intentionally do NOT delete files
# outside our declared ownership scope (hwpx-document-writer\ subfolder only).
Get-ChildItem -LiteralPath $SkillsRoot -File -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -in @('SKILL.md', 'REFERENCE.md') } |
    ForEach-Object {
        Write-Warn2 "Loose $($_.Name) detected at $SkillsRoot\ -- not ours; left in place"
        Write-Info  "If left over from a v0.5.2 install, remove manually: Remove-Item -LiteralPath '$($_.FullName)'"
    }

# Extract to a throwaway staging dir so we can cope with both flat zips
# (SKILL.md at root) and nested zips (<folder>/SKILL.md) without leaving
# stray files under $SkillsRoot.
$skillStage = Join-Path ([System.IO.Path]::GetTempPath()) ("hwpx-skill-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $skillStage -Force | Out-Null
try {
    Expand-Archive -LiteralPath $SkillZip -DestinationPath $skillStage -Force

    $skillMd = Get-ChildItem -LiteralPath $skillStage -Filter 'SKILL.md' -Recurse -File -ErrorAction SilentlyContinue |
               Select-Object -First 1
    if ($null -eq $skillMd) {
        Write-Fail "Skill zip does not contain SKILL.md"
        exit 6
    }
    $srcDir = Split-Path -Parent $skillMd.FullName

    New-Item -ItemType Directory -Path $SkillTarget -Force | Out-Null
    Get-ChildItem -LiteralPath $srcDir -Force |
        Move-Item -Destination $SkillTarget -Force
} finally {
    Remove-Item -LiteralPath $skillStage -Recurse -Force -ErrorAction SilentlyContinue
}

if (-not (Test-Path -LiteralPath (Join-Path $SkillTarget 'SKILL.md'))) {
    Write-Fail "Skill extraction did not produce SKILL.md at $SkillTarget"
    exit 6
}
Write-Ok "Skill installed to $SkillTarget"

# ---------------------------------------------------------------------------
# 7. Install the template
# ---------------------------------------------------------------------------
Write-Step 'Installing template'
if ($templateChange -like 'skip*') {
    Write-Ok 'Template bytes already identical; skipping copy.'
} else {
    if (-not (Test-Path -LiteralPath $TemplatesRoot)) {
        New-Item -ItemType Directory -Path $TemplatesRoot -Force | Out-Null
    }
    if (Test-Path -LiteralPath $TemplateTarget) {
        Move-AsideWithBackup -Path $TemplateTarget | Out-Null
    }
    Copy-Item -LiteralPath $TemplateSource -Destination $TemplateTarget -Force
    Write-Ok "Template installed to $TemplateTarget"
}

# ---------------------------------------------------------------------------
# 8. Done
# ---------------------------------------------------------------------------
Write-Host ''
Write-Host '----------------------------------------' -ForegroundColor White
Write-Ok 'Installation complete.'
Write-Host ''
Write-Host 'Next steps:' -ForegroundColor White
Write-Host '  1. Fully quit Claude Desktop (system tray icon -> Quit).'
Write-Host '  2. Reopen Claude Desktop.'
Write-Host '  3. Open a new chat and try the hwpx skill. See README.md for Korean sample prompts.'
Write-Host ''
exit 0
