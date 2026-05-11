param(
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

function Write-Step([string]$Message) {
    Write-Host "[STEP] $Message" -ForegroundColor Cyan
}

function Write-Info([string]$Message) {
    Write-Host "[INFO] $Message" -ForegroundColor Gray
}

function Write-Ok([string]$Message) {
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Fail([string]$Message, [string]$Fix = '') {
    Write-Host "[ERROR] $Message" -ForegroundColor Red
    if ($Fix) {
        Write-Host "[FIX] $Fix" -ForegroundColor Yellow
    }
    exit 1
}

function Resolve-ExistingDirectory([string]$Path, [string]$Name) {
    if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
        Fail "$Name does not exist: $Path"
    }
    return (Resolve-Path -LiteralPath $Path).Path
}

function Assert-ChildPath([string]$Parent, [string]$Child, [string]$Name) {
    $parentResolved = (Resolve-Path -LiteralPath $Parent).Path.TrimEnd('\')
    $childResolved = if (Test-Path -LiteralPath $Child) {
        (Resolve-Path -LiteralPath $Child).Path.TrimEnd('\')
    } else {
        [System.IO.Path]::GetFullPath($Child).TrimEnd('\')
    }

    if (-not ($childResolved.Equals($parentResolved, [System.StringComparison]::OrdinalIgnoreCase) -or
        $childResolved.StartsWith("$parentResolved\", [System.StringComparison]::OrdinalIgnoreCase))) {
        Fail "$Name is outside repo root: $childResolved" "Check RepoRoot before syncing."
    }
}

$RepoRoot = Resolve-ExistingDirectory $RepoRoot 'Repo root'
$NovaBlock = Join-Path $RepoRoot 'nova-block'
$FreshDist = Join-Path $NovaBlock 'dist'
$CurrentSlot = Join-Path $RepoRoot 'current'
$TargetDist = Join-Path $CurrentSlot 'frontend_dist'

Write-Step "Sync development frontend bundle"
Write-Info "RepoRoot: $RepoRoot"
Write-Info "NovaBlock: $NovaBlock"
Write-Info "Target: $TargetDist"

Resolve-ExistingDirectory $NovaBlock 'nova-block' | Out-Null
Resolve-ExistingDirectory $CurrentSlot 'current slot' | Out-Null
Assert-ChildPath -Parent $RepoRoot -Child $FreshDist -Name 'Fresh frontend dist'
Assert-ChildPath -Parent $RepoRoot -Child $TargetDist -Name 'Target frontend_dist'

if (-not $SkipBuild) {
    Write-Step "Build nova-block"
    Push-Location $NovaBlock
    try {
        npm run build
        if ($LASTEXITCODE -ne 0) {
            Fail "npm run build failed with exit code $LASTEXITCODE" "Fix the frontend build error above, then run this script again."
        }
    } finally {
        Pop-Location
    }
} else {
    Write-Info "SkipBuild was set; using existing nova-block/dist."
}

if (-not (Test-Path -LiteralPath (Join-Path $FreshDist 'index.html') -PathType Leaf)) {
    Fail "Fresh frontend dist is missing index.html: $FreshDist" "Run npm run build in nova-block first."
}

$assetsDir = Join-Path $FreshDist 'assets'
if (-not (Test-Path -LiteralPath $assetsDir -PathType Container)) {
    Fail "Fresh frontend dist is missing assets directory: $assetsDir" "Check Vite build output."
}

$indexChunks = Get-ChildItem -LiteralPath $assetsDir -Filter 'index-*.js' -ErrorAction SilentlyContinue
if (-not $indexChunks) {
    Fail "Fresh frontend dist has no index-*.js chunk in assets." "Check Vite output and build configuration."
}

Write-Step "Mirror nova-block/dist to current/frontend_dist"
New-Item -ItemType Directory -Force -Path $TargetDist | Out-Null
robocopy $FreshDist $TargetDist /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
$robocopyExit = $LASTEXITCODE
if ($robocopyExit -ge 8) {
    Fail "robocopy failed with exit code $robocopyExit" "Check file locks, permissions, and whether Nova is currently reading frontend_dist."
}

if (-not (Test-Path -LiteralPath (Join-Path $TargetDist 'index.html') -PathType Leaf)) {
    Fail "Synced frontend_dist is missing index.html after copy: $TargetDist" "Re-run the script and inspect robocopy output."
}

$targetChunks = Get-ChildItem -LiteralPath (Join-Path $TargetDist 'assets') -Filter 'index-*.js' -ErrorAction SilentlyContinue
if (-not $targetChunks) {
    Fail "Synced frontend_dist has no index-*.js chunk." "The target copy is incomplete."
}

Write-Ok "Frontend synced to the active start_windows.bat slot."
Write-Info "Restart Nova with start_windows.bat to see the latest UI changes."
