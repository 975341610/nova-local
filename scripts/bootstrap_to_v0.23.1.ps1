<#
.SYNOPSIS
    One-shot bootstrap from Nova v0.22.x flat layout to v0.23.1 versioned layout.

.DESCRIPTION
    Nova v0.23.1 introduced a versioned APP_ROOT layout (versions/<ver>/ + current
    junction). The in-app updater requires that layout. Pre-v0.23.1 installs are
    flat (backend/, electron/, frontend_dist/ at the root). This script does the
    one-time migration, then drops the v0.23.1 payload into versions/0.23.1/.

    After this script succeeds you never need PowerShell to upgrade Nova again —
    use Settings -> Updates inside the app.

.PARAMETER NovaRoot
    Absolute path to Nova install root. Default: C:\AI\nova-local-v0.18.0\nova-local

.PARAMETER Package
    Path to the v0.23.1 .nova-update package (signed). Default: <NovaRoot>\dist\nova-v0.23.1-full.nova-update

.PARAMETER FromVersion
    Version we are upgrading FROM. Default: 0.22.0 (read from <NovaRoot>\VERSION.txt if present)

.PARAMETER DryRun
    Print what would happen without touching anything.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap_to_v0.23.1.ps1

.EXAMPLE
    .\scripts\bootstrap_to_v0.23.1.ps1 -NovaRoot 'C:\AI\nova-local-v0.18.0\nova-local' -Package 'D:\downloads\nova-v0.23.1-full.nova-update'

.NOTES
    Requirements: PowerShell 5.1+, Windows. Run as the user that owns NovaRoot;
    Administrator NOT required (uses directory junctions, not symlinks).
#>
[CmdletBinding()]
param(
    [string]$NovaRoot    = 'C:\AI\nova-local-v0.18.0\nova-local',
    [string]$Package     = '',
    [string]$FromVersion = '',
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$TargetVersion = '0.23.1'

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "    OK  $msg" -ForegroundColor Green }
function Write-Warn2($m)  { Write-Host "    WARN $m" -ForegroundColor Yellow }
function Die($msg)        { Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }

# -----------------------------------------------------------------------------
# 0. Validate environment
# -----------------------------------------------------------------------------
Write-Step "Pre-flight checks"

if (-not (Test-Path -LiteralPath $NovaRoot -PathType Container)) {
    Die "NovaRoot does not exist or is not a directory: $NovaRoot"
}
$NovaRoot = (Resolve-Path -LiteralPath $NovaRoot).Path
Write-Ok "NovaRoot     = $NovaRoot"

# Detect FromVersion
$versionFile = Join-Path $NovaRoot 'VERSION.txt'
if (-not $FromVersion) {
    if (Test-Path -LiteralPath $versionFile) {
        $FromVersion = (Get-Content -LiteralPath $versionFile -Raw).Trim()
    } else {
        Die "Cannot detect current version: VERSION.txt missing at $versionFile. Pass -FromVersion explicitly."
    }
}
Write-Ok "FromVersion  = $FromVersion"
Write-Ok "TargetVersion= $TargetVersion"

if ($FromVersion -eq $TargetVersion) {
    Die "Already on $TargetVersion. Use the in-app updater for future upgrades."
}

# Default Package path
if (-not $Package) { $Package = Join-Path $NovaRoot 'dist\nova-v0.23.1-full.nova-update' }
if (-not (Test-Path -LiteralPath $Package -PathType Leaf)) {
    Die "Package not found: $Package`n  Hint: copy dist\nova-v0.23.1-full.nova-update from the release pipeline."
}
$Package = (Resolve-Path -LiteralPath $Package).Path
Write-Ok "Package      = $Package"

# Required top-level dirs (flat layout)
foreach ($d in 'backend','electron','frontend_dist') {
    $p = Join-Path $NovaRoot $d
    if (-not (Test-Path -LiteralPath $p -PathType Container)) {
        Die "Expected flat-layout dir missing: $p"
    }
}

# Anti-double-bootstrap
$currentLink = Join-Path $NovaRoot 'current'
if (Test-Path -LiteralPath $currentLink) {
    Die "'current' already exists at $currentLink — looks like already bootstrapped. Use the in-app updater."
}

# -----------------------------------------------------------------------------
# 1. Stop running Nova
# -----------------------------------------------------------------------------
Write-Step "Stopping any running Nova / Electron / Python processes"
$procNames = @('Nova','nova','electron','Nova Helper')
$killed = 0
foreach ($name in $procNames) {
    Get-Process -Name $name -ErrorAction SilentlyContinue | ForEach-Object {
        if (-not $DryRun) { $_ | Stop-Process -Force -ErrorAction SilentlyContinue }
        $killed++
    }
}
# Python children whose path is rooted under NovaRoot
Get-CimInstance Win32_Process -Filter "Name='python.exe' OR Name='pythonw.exe'" -ErrorAction SilentlyContinue | Where-Object {
    $_.ExecutablePath -and $_.ExecutablePath.StartsWith($NovaRoot, [StringComparison]::OrdinalIgnoreCase)
} | ForEach-Object {
    if (-not $DryRun) { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    $killed++
}
Write-Ok "Stopped $killed process(es)"

# -----------------------------------------------------------------------------
# 2. Backup data/
# -----------------------------------------------------------------------------
Write-Step "Backing up data/"
$dataDir = Join-Path $NovaRoot 'data'
if (Test-Path -LiteralPath $dataDir -PathType Container) {
    $ts = Get-Date -Format 'yyyyMMdd-HHmmss'
    $backupRoot = Join-Path $NovaRoot "cache\backups\pre-bootstrap-$FromVersion-$ts"
    if ($DryRun) {
        Write-Ok "DRY-RUN: would copy $dataDir -> $backupRoot"
    } else {
        New-Item -ItemType Directory -Force -Path (Split-Path $backupRoot) | Out-Null
        Copy-Item -LiteralPath $dataDir -Destination $backupRoot -Recurse -Force
        Write-Ok "Backed up to $backupRoot"
    }
} else {
    Write-Warn2 "data/ does not exist — skipping backup (fresh install?)"
}

# -----------------------------------------------------------------------------
# 3. Migrate flat layout -> versions/<FromVersion>/
# -----------------------------------------------------------------------------
Write-Step "Moving flat backend/, electron/, frontend_dist/ -> versions/$FromVersion/"
$oldVersionDir = Join-Path $NovaRoot "versions\$FromVersion"
if (Test-Path -LiteralPath $oldVersionDir) {
    Die "$oldVersionDir already exists — refusing to overwrite. Move it aside and retry."
}
if (-not $DryRun) {
    New-Item -ItemType Directory -Force -Path $oldVersionDir | Out-Null
}
foreach ($d in 'backend','electron','frontend_dist') {
    $src = Join-Path $NovaRoot $d
    $dst = Join-Path $oldVersionDir $d
    if ($DryRun) {
        Write-Ok "DRY-RUN: would move $src -> $dst"
    } else {
        Move-Item -LiteralPath $src -Destination $dst -Force
        Write-Ok "moved $d/"
    }
}
# VERSION.txt also moves into the old version dir so versions/<old>/VERSION.txt is correct
$rootVer = Join-Path $NovaRoot 'VERSION.txt'
if (Test-Path -LiteralPath $rootVer) {
    if ($DryRun) {
        Write-Ok "DRY-RUN: would move VERSION.txt -> $oldVersionDir\VERSION.txt"
    } else {
        Move-Item -LiteralPath $rootVer -Destination (Join-Path $oldVersionDir 'VERSION.txt') -Force
        Write-Ok "moved VERSION.txt"
    }
}

# -----------------------------------------------------------------------------
# 4. Extract v0.23.1 payload -> versions/0.23.1/
# -----------------------------------------------------------------------------
Write-Step "Extracting $TargetVersion payload"
$newVersionDir = Join-Path $NovaRoot "versions\$TargetVersion"
if (Test-Path -LiteralPath $newVersionDir) {
    Die "$newVersionDir already exists — clean it up and retry."
}
if (-not $DryRun) {
    New-Item -ItemType Directory -Force -Path $newVersionDir | Out-Null

    # .nova-update is a ZIP. Extract to a staging dir and lift `payload/` contents up.
    $staging = Join-Path $NovaRoot "cache\updates\stage-$TargetVersion-$([System.Guid]::NewGuid().ToString('N').Substring(0,8))"
    New-Item -ItemType Directory -Force -Path $staging | Out-Null
    try {
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        [System.IO.Compression.ZipFile]::ExtractToDirectory($Package, $staging)

        $payload = Join-Path $staging 'payload'
        if (-not (Test-Path -LiteralPath $payload -PathType Container)) {
            Die "package layout invalid — payload/ not found inside $Package"
        }
        Get-ChildItem -LiteralPath $payload -Force | ForEach-Object {
            Move-Item -LiteralPath $_.FullName -Destination $newVersionDir -Force
        }

        # sanity: VERSION.txt inside payload must equal target
        $payloadVer = Join-Path $newVersionDir 'VERSION.txt'
        if (-not (Test-Path -LiteralPath $payloadVer)) {
            Die "payload missing VERSION.txt"
        }
        $declared = (Get-Content -LiteralPath $payloadVer -Raw).Trim()
        if ($declared -ne $TargetVersion) {
            Die "payload VERSION.txt = '$declared', expected '$TargetVersion'"
        }
        Write-Ok "extracted payload -> $newVersionDir (VERSION.txt = $declared)"
    } finally {
        Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
    }
} else {
    Write-Ok "DRY-RUN: would extract $Package payload to $newVersionDir"
}

# -----------------------------------------------------------------------------
# 5. Create `current` directory junction
# -----------------------------------------------------------------------------
Write-Step "Creating 'current' junction -> versions\$TargetVersion"
if ($DryRun) {
    Write-Ok "DRY-RUN: would mklink /J $currentLink versions\$TargetVersion"
} else {
    # mklink /J does not require admin and works across drives within NTFS
    $cmd = "mklink /J `"$currentLink`" `"$newVersionDir`""
    $out = & cmd.exe /c $cmd 2>&1
    if ($LASTEXITCODE -ne 0) { Die "mklink failed: $out" }
    Write-Ok "$currentLink -> $newVersionDir"
}

# -----------------------------------------------------------------------------
# 6. Write rollback_pointer.json
# -----------------------------------------------------------------------------
Write-Step "Writing rollback_pointer.json"
$rollbackPath = Join-Path $NovaRoot 'rollback_pointer.json'
$rollback = @{
    previous_healthy_version = $FromVersion
    set_at                   = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    reason                   = "bootstrap from flat $FromVersion to versioned $TargetVersion"
} | ConvertTo-Json -Depth 4
if ($DryRun) {
    Write-Ok "DRY-RUN: would write $rollbackPath"
} else {
    [System.IO.File]::WriteAllText($rollbackPath, $rollback, (New-Object System.Text.UTF8Encoding($false)))
    Write-Ok "rollback_pointer -> $FromVersion"
}

# -----------------------------------------------------------------------------
# 7. Seed versions/.index.json
# -----------------------------------------------------------------------------
Write-Step "Seeding versions/.index.json"
$indexPath = Join-Path $NovaRoot 'versions\.index.json'
$nowIso = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$index = @{
    versions = @(
        @{ version = $FromVersion;   installed_at = $nowIso; healthy = $true; disabled = $false; failed_count = 0 },
        @{ version = $TargetVersion; installed_at = $nowIso; healthy = $true; disabled = $false; failed_count = 0 }
    )
} | ConvertTo-Json -Depth 6
if ($DryRun) {
    Write-Ok "DRY-RUN: would write $indexPath"
} else {
    [System.IO.File]::WriteAllText($indexPath, $index, (New-Object System.Text.UTF8Encoding($false)))
    Write-Ok "indexed $FromVersion + $TargetVersion"
}

# -----------------------------------------------------------------------------
# 8. Final verification
# -----------------------------------------------------------------------------
Write-Step "Verifying"
if (-not $DryRun) {
    $finalVer = (Get-Content -LiteralPath (Join-Path $currentLink 'VERSION.txt') -Raw).Trim()
    if ($finalVer -ne $TargetVersion) { Die "post-check failed: current\VERSION.txt = '$finalVer'" }
    Write-Ok "current\VERSION.txt = $finalVer"

    foreach ($d in 'backend','electron','frontend_dist') {
        $p = Join-Path $currentLink $d
        if (-not (Test-Path -LiteralPath $p -PathType Container)) { Die "post-check: $d missing under current\" }
    }
    Write-Ok "backend/, electron/, frontend_dist/ all present under current/"

    $dataStill = Join-Path $NovaRoot 'data'
    if (Test-Path -LiteralPath $dataStill -PathType Container) {
        Write-Ok "data/ untouched at $dataStill"
    }
}

Write-Host ""
Write-Host "=== Bootstrap complete: $FromVersion -> $TargetVersion ===" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. Launch Nova. First start runs M5 health self-check; if it fails twice it auto-rolls back to $FromVersion."
Write-Host "  2. Open Settings -> Updates to confirm version manager shows BOTH $FromVersion and $TargetVersion (current)."
Write-Host "  3. From now on, use Settings -> Updates -> Check for Updates. No more PowerShell."
Write-Host ""
if (-not $DryRun) {
    Write-Host "Backup of pre-bootstrap data/ kept under: $NovaRoot\cache\backups\" -ForegroundColor DarkGray
}
