<#
.SYNOPSIS
    Prepare the clean app directory used by electron-builder.

.DESCRIPTION
    The normal Nova runtime contains current/, versions/, data/, cache/, and
    other mutable state. A Windows installer must not package that state, so this
    script stages only the application payload into dist/installer-app.
#>
[CmdletBinding()]
param(
    [string]$Version = ''
)

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $PSCommandPath
$RepoRoot = Split-Path -Parent $ScriptDir
$Stage = Join-Path $RepoRoot 'dist\installer-app'
$FrontendDist = Join-Path $RepoRoot 'nova-block\dist'
$BuildDir = Join-Path $RepoRoot 'build'

if (-not $Version) {
    $Version = (Get-Content -LiteralPath (Join-Path $RepoRoot 'VERSION.txt') -Raw).Trim()
}

function Copy-CleanDirectory {
    param(
        [Parameter(Mandatory=$true)][string]$Source,
        [Parameter(Mandatory=$true)][string]$Destination,
        [string[]]$ExcludeDirs = @(),
        [string[]]$ExcludeFiles = @()
    )
    if (-not (Test-Path -LiteralPath $Source)) {
        throw "Missing source directory: $Source"
    }
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    $args = @($Source, $Destination, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NP')
    if ($ExcludeDirs.Count -gt 0) {
        $args += '/XD'
        $args += $ExcludeDirs
    }
    if ($ExcludeFiles.Count -gt 0) {
        $args += '/XF'
        $args += $ExcludeFiles
    }
    & robocopy @args | Out-Host
    if ($LASTEXITCODE -gt 7) {
        throw "robocopy failed with code $LASTEXITCODE from $Source to $Destination"
    }
}

Remove-Item -LiteralPath $Stage -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $Stage | Out-Null

Copy-CleanDirectory -Source (Join-Path $RepoRoot 'backend') -Destination (Join-Path $Stage 'backend') -ExcludeDirs @('__pycache__') -ExcludeFiles @('*.pyc', '*.bak*')
Copy-CleanDirectory -Source (Join-Path $RepoRoot 'electron') -Destination (Join-Path $Stage 'electron') -ExcludeDirs @('runtime') -ExcludeFiles @('*.bak*')
Copy-CleanDirectory -Source $FrontendDist -Destination (Join-Path $Stage 'frontend_dist')
Copy-CleanDirectory -Source $BuildDir -Destination (Join-Path $Stage 'build')

foreach ($file in @('start_backend.py', 'start_updater_cli.py', 'start_windows.bat', 'VERSION.txt', 'requirements.txt', 'requirements-core.txt')) {
    $source = Join-Path $RepoRoot $file
    if (Test-Path -LiteralPath $source) {
        Copy-Item -LiteralPath $source -Destination (Join-Path $Stage $file) -Force
    }
}

$appPackage = [ordered]@{
    name = 'qingzhi-notes'
    version = $Version
    main = 'electron/main.js'
    type = 'commonjs'
    private = $true
    dependencies = [ordered]@{
        chokidar = '^3.6.0'
        yaml = '^2.8.1'
    }
}
$appPackageJson = $appPackage | ConvertTo-Json -Depth 8
[IO.File]::WriteAllText((Join-Path $Stage 'package.json'), $appPackageJson, [Text.UTF8Encoding]::new($false))

Write-Host "[OK] Installer app staged at $Stage"
