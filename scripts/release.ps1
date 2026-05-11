<#
.SYNOPSIS
    End-to-end release script for Nova .nova-update packages.

.DESCRIPTION
    Addresses the v0.23.1 packaging regression where the frontend bundle was
    NOT rebuilt before staging, so the shipped package lacked UpdaterPanel
    (and any other UI added since the last cached vite build). This script
    enforces:

      1. Clean frontend build (removes nova-block/dist first, then `vite build`).
      2. Stage directory freshly populated from the tree.
      3. Signed `.nova-update` produced via scripts/build_update_package.py.
      4. Post-build sanity check — greps the bundled frontend bundle for the
         feature strings that MUST be present at this version. If any is
         missing, the release aborts instead of shipping a broken package.

    All paths are resolved relative to the repo root (parent of scripts/).

.PARAMETER Version
    Target version, e.g. '0.23.2'. The bumped VERSION.txt must already be
    committed before running (or pass -BumpVersion).

.PARAMETER ReleaseNotes
    Path to release notes markdown. Default: scripts/RELEASE_NOTES_v<ver>.md.

.PARAMETER SignKey
    PEM ed25519 private key path. Required.

.PARAMETER SigningKeyId
    Pinned key id in backend/services/updater_keys.py::TRUSTED_KEYS.

.PARAMETER BumpVersion
    If set, rewrite VERSION.txt + nova-block/package.json to $Version before build.

.PARAMETER RequiredStrings
    Strings that MUST appear in the built frontend JS bundle. Missing ->
    release fails. Defaults cover: UpdaterPanel + history revisions.

.EXAMPLE
    ./scripts/release.ps1 -Version 0.23.2 -SignKey C:\keys\nova-release.pem -SigningKeyId nova-release-2026a
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)] [string]$Version,
    [string]$ReleaseNotes = '',
    [Parameter(Mandatory=$true)] [string]$SignKey,
    [Parameter(Mandatory=$true)] [string]$SigningKeyId,
    [switch]$BumpVersion,
    [string[]]$RequiredStrings = @('UpdaterPanel','RevisionHistory','nova-update'),
    [string]$MinBaseVersion = ''
)

$ErrorActionPreference = 'Stop'

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "    OK  $msg" -ForegroundColor Green }
function Die($msg)        { Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }

# --- 0. Paths ---------------------------------------------------------------
$ScriptDir = Split-Path -Parent $PSCommandPath
$RepoRoot  = Split-Path -Parent $ScriptDir
$NovaBlock = Join-Path $RepoRoot 'nova-block'
$DistRoot  = Join-Path $RepoRoot 'dist'
$Stage     = Join-Path $DistRoot "v$Version"
$OutPkg    = Join-Path $DistRoot "nova-v$Version-full.nova-update"
if (-not $ReleaseNotes) {
    $ReleaseNotes = Join-Path $ScriptDir "RELEASE_NOTES_v$Version.md"
}

Write-Step "Release plan"
Write-Ok "RepoRoot      = $RepoRoot"
Write-Ok "Version       = $Version"
Write-Ok "Stage dir     = $Stage"
Write-Ok "Output pkg    = $OutPkg"
Write-Ok "Release notes = $ReleaseNotes"
Write-Ok "Signing key   = $SigningKeyId"

if (-not (Test-Path $ReleaseNotes)) { Die "release notes not found: $ReleaseNotes" }
if (-not (Test-Path $SignKey))      { Die "sign key not found: $SignKey" }

# --- 1. Bump VERSION.txt (optional) ----------------------------------------
$VersionFile = Join-Path $RepoRoot 'VERSION.txt'
if ($BumpVersion) {
    Write-Step "Bumping VERSION.txt -> $Version"
    [IO.File]::WriteAllText($VersionFile, $Version, (New-Object System.Text.UTF8Encoding($false)))
    Write-Ok "VERSION.txt written"
}
$current = (Get-Content $VersionFile -Raw).Trim()
if ($current -ne $Version) { Die "VERSION.txt = '$current' but you asked to release '$Version'. Use -BumpVersion." }
Write-Ok "VERSION.txt confirmed = $Version"

# --- 2. Clean frontend build -----------------------------------------------
Write-Step "Clean rebuild frontend bundle"
if (-not (Test-Path (Join-Path $NovaBlock 'package.json'))) { Die "missing nova-block/package.json" }
$oldDist = Join-Path $NovaBlock 'dist'
if (Test-Path $oldDist) { Remove-Item $oldDist -Recurse -Force }

Push-Location $NovaBlock
try {
    if (-not (Test-Path (Join-Path $NovaBlock 'node_modules\vite'))) {
        Write-Host "    installing deps (first run only)..." -ForegroundColor DarkGray
        npm install --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { Die "npm install failed" }
    }
    npx vite build
    if ($LASTEXITCODE -ne 0) { Die "vite build failed" }
} finally { Pop-Location }

$freshDist = Join-Path $NovaBlock 'dist'
if (-not (Test-Path (Join-Path $freshDist 'index.html'))) { Die "frontend build produced no index.html" }
Write-Ok "frontend bundle = $freshDist"

# --- 3. Stage dist/v$Version ------------------------------------------------
Write-Step "Stage payload at $Stage"
if (Test-Path $Stage) { Remove-Item $Stage -Recurse -Force }
New-Item -ItemType Directory -Force -Path $Stage | Out-Null

# VERSION.txt
Copy-Item $VersionFile (Join-Path $Stage 'VERSION.txt') -Force

# backend/
Write-Host "    copying backend/ ..." -ForegroundColor DarkGray
robocopy (Join-Path $RepoRoot 'backend') (Join-Path $Stage 'backend') /E /XD __pycache__ /XF *.pyc /NFL /NDL /NJH /NJS /NP | Out-Null

# electron/ — bundle source files; runtime/ and most node_modules excluded,
# but ship the small production deps (yaml, chokidar, ...) so the in-app
# updater doesn't crash with "Cannot find module 'yaml'" on installs that
# never ran `npm install`. We allow-list explicit subdirs from the
# `dependencies` block in electron/package.json so devDependencies and the
# huge `electron` runtime stay out of payload.
Write-Host "    copying electron/ ..." -ForegroundColor DarkGray
robocopy (Join-Path $RepoRoot 'electron') (Join-Path $Stage 'electron') /E /XD runtime node_modules /NFL /NDL /NJH /NJS /NP | Out-Null

$ElectronPkgJson = Join-Path $RepoRoot 'electron\package.json'
if (Test-Path $ElectronPkgJson) {
    $pkg = Get-Content $ElectronPkgJson -Raw | ConvertFrom-Json
    $prodDeps = @()
    if ($pkg.dependencies) {
        foreach ($p in $pkg.dependencies.PSObject.Properties.Name) {
            if ($p -ne 'electron') { $prodDeps += $p }
        }
    }
    if ($prodDeps.Count -gt 0) {
        $stageNm = Join-Path $Stage 'electron\node_modules'
        New-Item -ItemType Directory -Force -Path $stageNm | Out-Null
        foreach ($dep in $prodDeps) {
            $srcDep = Join-Path $RepoRoot ("electron\node_modules\" + $dep)
            if (Test-Path $srcDep) {
                Write-Host "      bundling node_modules\$dep" -ForegroundColor DarkGray
                robocopy $srcDep (Join-Path $stageNm $dep) /E /XD .bin __pycache__ /NFL /NDL /NJH /NJS /NP | Out-Null
                # Walk transitive deps lazily — copy whatever this package's
                # own node_modules contains, if any (npm v7+ flattens, so this
                # is rarely populated, but cover nested layouts too).
                $nested = Join-Path $srcDep 'node_modules'
                if (Test-Path $nested) {
                    robocopy $nested (Join-Path (Join-Path $stageNm $dep) 'node_modules') /E /NFL /NDL /NJH /NJS /NP | Out-Null
                }
            } else {
                Write-Host "      WARN: $dep not in electron\node_modules — run npm install --prefix electron" -ForegroundColor Yellow
            }
        }
        # Resolve flat-layout transitive deps the bundled packages may need.
        # We scan their package.json `dependencies` and copy each one from
        # electron\node_modules\<name> if present. One pass is enough for
        # yaml + chokidar (yaml has no runtime deps; chokidar pulls in a few).
        $visited = New-Object System.Collections.Generic.HashSet[string]
        $queue = New-Object System.Collections.Queue
        foreach ($d in $prodDeps) { $queue.Enqueue($d) | Out-Null; [void]$visited.Add($d) }
        while ($queue.Count -gt 0) {
            $cur = $queue.Dequeue()
            $curPkgJson = Join-Path $RepoRoot ("electron\node_modules\" + $cur + "\package.json")
            if (-not (Test-Path $curPkgJson)) { continue }
            $cpkg = Get-Content $curPkgJson -Raw | ConvertFrom-Json
            if (-not $cpkg.dependencies) { continue }
            foreach ($t in $cpkg.dependencies.PSObject.Properties.Name) {
                if ($visited.Contains($t)) { continue }
                [void]$visited.Add($t)
                $queue.Enqueue($t) | Out-Null
                $tSrc = Join-Path $RepoRoot ("electron\node_modules\" + $t)
                $tDst = Join-Path $stageNm $t
                if ((Test-Path $tSrc) -and (-not (Test-Path $tDst))) {
                    Write-Host "      bundling node_modules\$t (transitive)" -ForegroundColor DarkGray
                    robocopy $tSrc $tDst /E /XD .bin __pycache__ /NFL /NDL /NJH /NJS /NP | Out-Null
                }
            }
        }
    }
}

# frontend_dist/ — from the FRESH vite build only
Write-Host "    copying frontend_dist/ (fresh vite bundle) ..." -ForegroundColor DarkGray
robocopy $freshDist (Join-Path $Stage 'frontend_dist') /E /NFL /NDL /NJH /NJS /NP | Out-Null

# start_backend.py — shipped inside payload so new installs don't depend on NovaRoot.
$sbSrc = Join-Path $RepoRoot 'start_backend.py'
if (Test-Path $sbSrc) {
    Copy-Item $sbSrc (Join-Path $Stage 'start_backend.py') -Force
    Write-Ok "  start_backend.py included"
} else {
    Write-Host "    WARN: start_backend.py missing at repo root" -ForegroundColor Yellow
}

# start_updater_cli.py — v0.23.3 shim that mirrors start_backend.py's sys.path
# resolution; lets `python start_updater_cli.py` work without PYTHONPATH.
$ucSrc = Join-Path $RepoRoot 'start_updater_cli.py'
if (Test-Path $ucSrc) {
    Copy-Item $ucSrc (Join-Path $Stage 'start_updater_cli.py') -Force
    Write-Ok "  start_updater_cli.py included"
} else {
    Write-Host "    WARN: start_updater_cli.py missing at repo root" -ForegroundColor Yellow
}

# start_windows.bat — keep installer in lockstep with the runtime it boots.
$bwSrc = Join-Path $RepoRoot 'start_windows.bat'
if (Test-Path $bwSrc) {
    Copy-Item $bwSrc (Join-Path $Stage 'start_windows.bat') -Force
    Write-Ok "  start_windows.bat included"
}

Write-Ok "stage ready"

# --- 4. Sanity check BEFORE expensive sign/package step --------------------
Write-Step "Sanity check: required strings in staged bundle"
$stagedJs = Get-ChildItem (Join-Path $Stage 'frontend_dist\assets') -Filter 'index-*.js' -ErrorAction SilentlyContinue
if (-not $stagedJs) { Die "no index-*.js in staged frontend_dist/assets" }
foreach ($needle in $RequiredStrings) {
    $hit = Select-String -Path $stagedJs.FullName -Pattern $needle -SimpleMatch -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $hit) {
        Die "required string '$needle' NOT found in staged bundle. Release would ship a broken UI."
    }
    Write-Ok "  '$needle' present"
}

# v0.23.4: slot-completeness guard — fails fast if robocopy silently produced
# an empty staging dir (e.g. when electron/ was wiped on the build host).
# Without this, the resulting .nova-update installs a broken slot where
# start_windows.bat rejects the update with "electron\main.js is missing".
Write-Step "Sanity check: required staged files"
$requiredStageFiles = @(
    'VERSION.txt',
    'backend\main.py',
    'backend\services\updater_service.py',
    'backend\services\updater_pkg.py',
    'electron\main.js',
    'electron\preload.js',
    'electron\package.json',
    'frontend_dist\index.html'
)
foreach ($rel in $requiredStageFiles) {
    $p = Join-Path $Stage $rel
    if (-not (Test-Path $p)) {
        Die "staged payload is missing required file: $rel (check source tree on build host)"
    }
    Write-Ok "  $rel"
}
# Production deps that electron's main.js requires at runtime — guard against
# electron\node_modules being partially populated on the build host.
$requiredStageDeps = @('yaml', 'chokidar')
foreach ($dep in $requiredStageDeps) {
    $p = Join-Path $Stage ("electron\node_modules\" + $dep + "\package.json")
    if (-not (Test-Path $p)) {
        Die "staged payload is missing electron\node_modules\$dep — run 'npm install --omit=dev' in electron\ and rebuild"
    }
    Write-Ok "  electron\node_modules\$dep"
}

# --- 5. Build the .nova-update package --------------------------------------
Write-Step "Build .nova-update"
if (Test-Path $OutPkg) { Remove-Item $OutPkg -Force }

$pyArgs = @(
    (Join-Path $ScriptDir 'build_update_package.py'),
    '--source', $Stage,
    '--output', $OutPkg,
    '--release-notes', $ReleaseNotes,
    '--sign-key', $SignKey,
    '--signing-key-id', $SigningKeyId
)
if ($MinBaseVersion) { $pyArgs += @('--min-base-version', $MinBaseVersion) }

python @pyArgs
if ($LASTEXITCODE -ne 0) { Die "build_update_package.py failed (exit=$LASTEXITCODE)" }
if (-not (Test-Path $OutPkg)) { Die "package was not produced at $OutPkg" }
Write-Ok "package produced"

# --- 6. Post-build verification: sanity check INSIDE the .nova-update -----
Write-Step "Post-build verification: inspect the packed bundle"
$Peek = Join-Path $DistRoot ("peek-" + [Guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -ItemType Directory -Force -Path $Peek | Out-Null
try {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($OutPkg, $Peek)
    $peekJs = Get-ChildItem (Join-Path $Peek 'payload\frontend_dist\assets') -Filter 'index-*.js' -ErrorAction SilentlyContinue
    if (-not $peekJs) { Die "packed bundle missing index-*.js" }
    foreach ($needle in $RequiredStrings) {
        $hit = Select-String -Path $peekJs.FullName -Pattern $needle -SimpleMatch -ErrorAction SilentlyContinue | Select-Object -First 1
        if (-not $hit) { Die "packed bundle is missing '$needle' — release would ship broken." }
        Write-Ok "  '$needle' present in packed bundle"
    }
    # start_backend.py shipped?
    if (Test-Path (Join-Path $Peek 'payload\start_backend.py')) {
        Write-Ok "  start_backend.py shipped inside payload"
    } else {
        Write-Host "    WARN: start_backend.py not in payload (new installs will break)" -ForegroundColor Yellow
    }
} finally {
    Remove-Item $Peek -Recurse -Force -ErrorAction SilentlyContinue
}

$sizeMB = [math]::Round(((Get-Item $OutPkg).Length / 1MB), 2)
Write-Host ""
Write-Host "=== release OK: nova-v$Version-full.nova-update ($sizeMB MiB) ===" -ForegroundColor Green
Write-Host "    $OutPkg"
Write-Host ""
Write-Host "Next: commit VERSION.txt + release notes, then tag v$Version."
