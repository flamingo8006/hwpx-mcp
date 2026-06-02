<#
.SYNOPSIS
  Removes the hwpx-mcp skill and the `hwpx` entry from claude_desktop_config.json.

.DESCRIPTION
  Non-destructive:
    * Auto-detects claude_desktop_config.json using the same logic as the
      installer (EXE installer + MSIX/Store builds + env-var override).
    * Backs up the config before modification (keeps the most recent 2 .bak-*
      snapshots and prunes the rest).
    * The skill directory is MOVED to .bak-<timestamp> (not deleted) so a
      manual restore is possible.
    * Template files under Documents\skills\templates are LEFT IN PLACE --
      users may have edited them; a warning explains how to remove manually.

  NOTE: This file is intentionally ASCII-only so Windows PowerShell 5.1
  reads it correctly regardless of console encoding.
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

function Remove-OldBackups {
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

function Copy-AsideWithBackup {
    param([Parameter(Mandatory)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    $backup = "$Path.bak-$(Get-Timestamp)"
    Copy-Item -LiteralPath $Path -Destination $backup -Force
    Write-Info "Config snapshot saved -> $(Split-Path -Leaf $backup)"
    Remove-OldBackups -ItemPath $Path -Keep 2
    return $backup
}

function Move-AsideWithBackup {
    param([Parameter(Mandatory)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    $backup = "$Path.bak-$(Get-Timestamp)"
    Move-Item -LiteralPath $Path -Destination $backup -Force
    Write-Info "Existing item moved aside -> $(Split-Path -Leaf $backup)"
    Remove-OldBackups -ItemPath $Path -Keep 2
    return $backup
}

# ---------------------------------------------------------------------------
# Claude Desktop config path detection (same logic as installer)
# ---------------------------------------------------------------------------
function Find-ClaudeConfigPath {
    if ($env:HWPX_MCP_CLAUDE_CONFIG) {
        return [PSCustomObject]@{
            Path       = $env:HWPX_MCP_CLAUDE_CONFIG
            Source     = 'HWPX_MCP_CLAUDE_CONFIG env var'
            Exists     = (Test-Path -LiteralPath $env:HWPX_MCP_CLAUDE_CONFIG)
            Candidates = @()
        }
    }

    $candidates = New-Object System.Collections.ArrayList

    try {
        $pkgs = Get-AppxPackage -ErrorAction SilentlyContinue |
                Where-Object { $_.Name -like '*Claude*' -or $_.PackageFamilyName -like '*Claude*' }
        foreach ($pkg in $pkgs) {
            $p = Join-Path $env:LOCALAPPDATA "Packages\$($pkg.PackageFamilyName)\LocalCache\Roaming\Claude\claude_desktop_config.json"
            [void]$candidates.Add([PSCustomObject]@{ Path = $p; Source = "Store app ($($pkg.Name))" })
        }
    } catch { }

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
# Paths
# ---------------------------------------------------------------------------
$SkillTarget   = Join-Path $env:USERPROFILE '.claude\skills\hwpx-document-writer'
$TemplatesRoot = Join-Path $env:USERPROFILE 'Documents\skills\templates'

# ---------------------------------------------------------------------------
# Banner
# ---------------------------------------------------------------------------
Write-Host ''
Write-Host '========================================' -ForegroundColor White
Write-Host '  hwpx-mcp uninstaller (Windows)'         -ForegroundColor White
Write-Host '========================================' -ForegroundColor White
Write-Host ''

# ---------------------------------------------------------------------------
# 1. Remove the hwpx entry from Claude Desktop config
# ---------------------------------------------------------------------------
Write-Step 'Editing claude_desktop_config.json'
$configInfo = Find-ClaudeConfigPath
if (-not $configInfo.Path -or -not $configInfo.Exists) {
    Write-Warn2 'No Claude Desktop config found (already uninstalled?).'
} else {
    Write-Info "Config target: $($configInfo.Path)"
    Write-Info "(detected via: $($configInfo.Source))"
    Copy-AsideWithBackup -Path $configInfo.Path | Out-Null
    try {
        $raw = Get-Content -LiteralPath $configInfo.Path -Raw -Encoding UTF8
        $configObject = if ([string]::IsNullOrWhiteSpace($raw)) {
            [PSCustomObject]@{}
        } else {
            $raw | ConvertFrom-Json
        }
    } catch {
        Write-Fail "Could not parse claude_desktop_config.json: $($_.Exception.Message)"
        exit 5
    }

    if ($configObject.PSObject.Properties.Name -contains 'mcpServers' -and
        $configObject.mcpServers.PSObject.Properties.Name -contains 'hwpx') {
        $configObject.mcpServers.PSObject.Properties.Remove('hwpx')
        $json = $configObject | ConvertTo-Json -Depth 20
        Write-Utf8NoBom -Path $configInfo.Path -Content $json
        Write-Ok "Removed 'hwpx' entry"
    } else {
        Write-Warn2 "'hwpx' entry was not present"
    }
}

# ---------------------------------------------------------------------------
# 2. Move the skill aside
# ---------------------------------------------------------------------------
Write-Step 'Moving skill folder aside'
if (Test-Path -LiteralPath $SkillTarget) {
    Move-AsideWithBackup -Path $SkillTarget | Out-Null
    Write-Ok 'Skill moved to .bak-<timestamp>'
} else {
    Write-Warn2 'Skill folder not found (nothing to move)'
}

Write-Host ''
Write-Host '----------------------------------------' -ForegroundColor White
Write-Ok 'Uninstall complete.'
Write-Host ''
Write-Host 'Notes:' -ForegroundColor White
Write-Host "  * Template files under $TemplatesRoot were left in place" -ForegroundColor White
Write-Host '    in case you customized them. Delete manually for a full wipe.' -ForegroundColor White
Write-Host '  * Config and skill backups (.bak-<timestamp>) were kept --' -ForegroundColor White
Write-Host '    delete them manually once you are sure the uninstall is clean.' -ForegroundColor White
Write-Host ''
exit 0
