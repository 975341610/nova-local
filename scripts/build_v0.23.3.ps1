<#
.SYNOPSIS
    One-shot build of nova-v0.23.3-full.nova-update.

.DESCRIPTION
    Wrapper around scripts/release.ps1 that does ALL prechecks inline so
    you can double-click or dot-source this file and walk away:

      1. Kills any residual Nova electron.exe bound to this NovaRoot.
      2. Verifies release.ps1, RELEASE_NOTES_v0.23.3.md, signing pem exist.
      3. Installs nova-block / electron production deps if missing.
      4. Sets RAYON_NUM_THREADS=1 to keep vite+rollup memory sane.
      5. Invokes release.ps1 with -BumpVersion so VERSION.txt is aligned.
      6. Prints the produced .nova-update path + sha256 + size.
      7. Tells you how to install it from inside Nova.

    Run from the NovaRoot:
        cd C:\AI\nova-local-v0.18.0\nova-local
        .\scripts\build_v0.23.3.ps1

    Or from anywhere (the script resolves its own NovaRoot):
        C:\AI\nova-local-v0.18.0\nova-local\scripts\build_v0.23.3.ps1

.PARAMETER Version
    Override target version. Default: 0.23.3.

.PARAMETER SkipDepInstall
    Skip the "make sure node_modules exist" bootstraps.

.NOTES
    Safe to re-run. If a partial build exists the underlying release.ps1
    wipes dist\v<ver>\ and nova-block\dist\ and rebuilds cleanly.
#>
[CmdletBinding()]
param(
    [string]$Version = '0.23.3',
    [string]$SigningKeyId = 'nova-release-2026-05',
    [string]$MinBaseVersion = '0.23.0',
    [switch]$SkipDepInstall
)

$ErrorActionPreference = 'Stop'
$script:t0 = Get-Date

function Log-Step($msg)  { Write-Host ""; Write-Host "==> $msg" -ForegroundColor Cyan }
function Log-Ok($msg)    { Write-Host "    [ok]   $msg" -ForegroundColor Green }
function Log-Warn($msg)  { Write-Host "    [warn] $msg" -ForegroundColor Yellow }
function Log-Info($msg)  { Write-Host "    [info] $msg" -ForegroundColor DarkGray }
function Die($msg)       { Write-Host ""; Write-Host "FATAL: $msg" -ForegroundColor Red; exit 1 }

# --- 0. Resolve paths relative to THIS script ------------------------------
$ScriptDir = Split-Path -Parent $PSCommandPath
$NovaRoot  = Split-Path -Parent $ScriptDir
Set-Location $NovaRoot

Log-Step "Nova release pipeline — v$Version"
Log-Ok "NovaRoot     = $NovaRoot"
Log-Ok "Signing key  = $SigningKeyId"
Log-Ok "MinBaseVer   = $MinBaseVersion"

# --- 1. Kill any residual electron.exe bound to this NovaRoot --------------
Log-Step "Kill residual Nova electron.exe"
$residual = Get-Process electron -EA SilentlyContinue |
    Where-Object { $_.Path -and $_.Path -like ($NovaRoot + '*') }
if ($residual) {
    $residual | ForEach-Object { Log-Info "killing pid=$($_.Id) ($($_.Path))" }
    $residual | Stop-Process -Force
    Start-Sleep -Seconds 1
    Log-Ok "residual electron.exe terminated"
} else {
    Log-Ok "no residual processes"
}

# --- 2. Sanity: required files --------------------------------------------
Log-Step "Precheck required files"
$releasePs  = Join-Path $ScriptDir 'release.ps1'
$relNotes   = Join-Path $ScriptDir ("RELEASE_NOTES_v$Version.md")
$signPem    = Join-Path $NovaRoot  ("dist\keys\$SigningKeyId.pem")

foreach ($p in @($releasePs, $relNotes, $signPem)) {
    if (-not (Test-Path $p)) { Die "missing required file: $p" }
    Log-Ok $p
}

# --- 3. Bootstrap deps if needed -------------------------------------------
if (-not $SkipDepInstall) {
    Log-Step "Ensure nova-block deps present"
    $novaBlockNM = Join-Path $NovaRoot 'nova-block\node_modules\vite'
    if (-not (Test-Path $novaBlockNM)) {
        Log-Info "first-run: npm install in nova-block\"
        Push-Location (Join-Path $NovaRoot 'nova-block')
        try {
            npm install --no-audit --no-fund
            if ($LASTEXITCODE -ne 0) { Die "nova-block npm install failed" }
        } finally { Pop-Location }
    }
    Log-Ok "nova-block\node_modules\vite present"

    Log-Step "Ensure electron production deps present (yaml, chokidar, ...)"
    $electronPkgJson = Join-Path $NovaRoot 'electron\package.json'
    $needsInstall = $false
    if (Test-Path $electronPkgJson) {
        $pkg = Get-Content $electronPkgJson -Raw | ConvertFrom-Json
        if ($pkg.dependencies) {
            foreach ($d in $pkg.dependencies.PSObject.Properties.Name) {
                if ($d -eq 'electron') { continue }
                $ddir = Join-Path $NovaRoot ("electron\node_modules\" + $d)
                if (-not (Test-Path $ddir)) {
                    Log-Warn "missing electron\node_modules\$d"
                    $needsInstall = $true
                }
            }
        }
    }
    if ($needsInstall) {
        Log-Info "running: npm install --omit=dev in electron\"
        Push-Location (Join-Path $NovaRoot 'electron')
        try {
            npm install --omit=dev --no-audit --no-fund --ignore-scripts
            if ($LASTEXITCODE -ne 0) { Die "electron npm install failed" }
        } finally { Pop-Location }
    }
    Log-Ok "electron production deps ready"
} else {
    Log-Step "Skipping dep install (-SkipDepInstall)"
}

# --- 4. Stage a vite-friendly env ------------------------------------------
Log-Step "Environment"
$env:RAYON_NUM_THREADS = '1'
Log-Ok "RAYON_NUM_THREADS = 1"

# --- 5. Hand off to release.ps1 --------------------------------------------
# v0.23.3: rolldown minifies React identifiers like `UpdaterPanel` and
# `updaterApi` to short names, so release.ps1's default RequiredStrings
# produce false negatives. Override with literals that survive minification:
# hyphenated data-testid attributes, the literal `.nova-update` extension,
# and Chinese UI labels which Vite never mangles.
$RequiredStrings = @('updater-panel','updater-current-version','nova-update')

Log-Step "Invoking release.ps1"
& $releasePs `
    -Version         $Version `
    -ReleaseNotes    $relNotes `
    -SignKey         $signPem `
    -SigningKeyId    $SigningKeyId `
    -MinBaseVersion  $MinBaseVersion `
    -RequiredStrings $RequiredStrings `
    -BumpVersion

if ($LASTEXITCODE -ne 0) { Die "release.ps1 exited with code $LASTEXITCODE" }

# --- 6. Final summary ------------------------------------------------------
$pkg = Join-Path $NovaRoot ("dist\nova-v$Version-full.nova-update")
if (-not (Test-Path $pkg)) { Die "package not produced at $pkg" }

$sha = (Get-FileHash $pkg -Algorithm SHA256).Hash
$md5 = (Get-FileHash $pkg -Algorithm MD5).Hash
$sizeMB = [math]::Round(((Get-Item $pkg).Length / 1MB), 2)
$elapsed = [math]::Round(((Get-Date) - $script:t0).TotalSeconds, 1)

Write-Host ""
Write-Host "+---------------------------------------------------------------+" -ForegroundColor Green
Write-Host "|  Nova v$Version release package built successfully            |" -ForegroundColor Green
Write-Host "+---------------------------------------------------------------+" -ForegroundColor Green
Write-Host "  path   : $pkg"
Write-Host "  size   : $sizeMB MiB"
Write-Host "  sha256 : $sha"
Write-Host "  md5    : $md5"
Write-Host "  elapsed: $elapsed s"
Write-Host ""
Write-Host "Install:" -ForegroundColor Cyan
Write-Host "  1. Start Nova (.\start_windows.bat)"
Write-Host "  2. 'Settings -> Updates -> Check updates -> Select .nova-update file'"
Write-Host "  3. Pick: $pkg"
Write-Host "  4. After install, click 'Switch to $Version'. Nova restarts."
Write-Host "  5. Verify: Settings -> Updates -> 'Current version' = $Version"
Write-Host ""
