<#
.SYNOPSIS
    One-command Nova release packager for .nova-update files.

.DESCRIPTION
    Builds a clean frontend bundle, stages a versioned payload, verifies that no
    local runtime state leaked into the payload, builds a .nova-update package,
    validates the final package, and writes a detailed diagnostic log for every
    run.

.EXAMPLE
    .\scripts\package_release.ps1 -Version 0.24.0 -UnsignedDevPackage

.EXAMPLE
    .\scripts\package_release.ps1 -Version 0.24.0 -SignKey C:\keys\nova-release.pem -SigningKeyId nova-release-2026a
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [ValidatePattern('^\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?$')]
    [string]$Version,

    [string]$ReleaseNotes = '',
    [string]$MinBaseVersion = '',
    [ValidateSet('stable', 'beta', 'dev')]
    [string]$Channel = 'stable',
    [string]$SignKey = '',
    [string]$SigningKeyId = '',
    [switch]$UnsignedDevPackage,
    [switch]$NoVersionBump,
    [switch]$SkipTests,
    [string]$PublicBaseUrl = '',
    [int]$WarnIfPackageLargerThanMB = 250,
    [string[]]$RequiredStrings = @('updater:verify', 'revisions')
)

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $PSCommandPath
$RepoRoot = Split-Path -Parent $ScriptDir
$NovaBlock = Join-Path $RepoRoot 'nova-block'
$DistRoot = Join-Path $RepoRoot 'dist'
$ReleaseRoot = Join-Path $DistRoot 'releases'
$Stage = Join-Path $DistRoot "stage-v$Version"
$OutPkg = Join-Path $ReleaseRoot "nova-v$Version-full.nova-update"
$LogRoot = Join-Path $RepoRoot 'logs\package-release'
$LogPath = Join-Path $LogRoot ("package-v{0}-{1}.log" -f $Version, (Get-Date -Format 'yyyyMMdd-HHmmss'))

New-Item -ItemType Directory -Force -Path $DistRoot, $ReleaseRoot, $LogRoot | Out-Null

function Write-Log {
    param(
        [string]$Message,
        [string]$Level = 'INFO'
    )
    $line = '[{0}] [{1}] {2}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $Message
    Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
    $color = switch ($Level) {
        'OK' { 'Green' }
        'WARN' { 'Yellow' }
        'ERROR' { 'Red' }
        'STEP' { 'Cyan' }
        default { 'Gray' }
    }
    Write-Host $line -ForegroundColor $color
}

function Write-Utf8NoBom {
    param(
        [string]$Path,
        [string]$Content
    )
    [IO.File]::WriteAllText($Path, $Content, [Text.UTF8Encoding]::new($false))
}

function Read-PackageManifest {
    param([string]$PackagePath)

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead($PackagePath)
    try {
        $entry = $zip.GetEntry('manifest.json')
        if (-not $entry) {
            Fail-Stage -StageName 'Release feed' -Reason 'manifest.json is missing from built package' -Path $PackagePath -Fix 'Rebuild the package and inspect build_update_package.py output.'
        }
        $stream = $entry.Open()
        try {
            $reader = New-Object IO.StreamReader($stream, [Text.Encoding]::UTF8)
            $raw = $reader.ReadToEnd()
        } finally {
            $stream.Dispose()
        }
        $envelope = $raw | ConvertFrom-Json
        if ($envelope.manifest) {
            return $envelope.manifest
        }
        return $envelope
    } finally {
        $zip.Dispose()
    }
}

function Write-ReleaseFeed {
    param(
        [string]$PackagePath,
        [string]$FeedPath
    )

    $pkgItem = Get-Item -LiteralPath $PackagePath
    $pkgLeaf = Split-Path -Leaf $PackagePath
    $pkgHash = (Get-FileHash -LiteralPath $PackagePath -Algorithm SHA256).Hash.ToLowerInvariant()
    $manifest = Read-PackageManifest -PackagePath $PackagePath
    $base = $PublicBaseUrl.Trim().TrimEnd('/')
    $packageUrl = if ($base) { "$base/$pkgLeaf" } else { $pkgLeaf }
    if (-not $base) {
        Write-Log 'PublicBaseUrl was not provided; latest.json will use a relative package_url. Serve latest.json and the package from the same directory.' 'WARN'
    }

    $feed = [ordered]@{
        schema_version = 1
        version = $manifest.target_version
        channel = $manifest.release_channel
        package_url = $packageUrl
        package_file = $pkgLeaf
        package_sha256 = $pkgHash
        package_size_bytes = $pkgItem.Length
        package_id = $manifest.package_id
        min_base_version = $manifest.min_base_version
        released_at = $manifest.released_at
        release_notes_md = $manifest.release_notes_md
        generated_at = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    }

    Write-Utf8NoBom -Path $FeedPath -Content (($feed | ConvertTo-Json -Depth 20) + [Environment]::NewLine)
    Write-Log "Release feed created: $FeedPath" 'OK'
}

function Fail-Stage {
    param(
        [string]$StageName,
        [string]$Reason,
        [string]$Fix = '',
        [string]$Path = '',
        [string]$Command = ''
    )
    Write-Log "FAILED stage=$StageName" 'ERROR'
    Write-Log "Reason: $Reason" 'ERROR'
    if ($Path) { Write-Log "Path: $Path" 'ERROR' }
    if ($Command) { Write-Log "Command: $Command" 'ERROR' }
    if ($Fix) { Write-Log "Suggested fix: $Fix" 'ERROR' }
    Write-Log "Full diagnostic log: $LogPath" 'ERROR'
    throw "Package release failed at [$StageName]: $Reason"
}

function Invoke-LoggedCommand {
    param(
        [string]$StageName,
        [string]$FilePath,
        [string[]]$Arguments,
        [string]$WorkingDirectory,
        [string]$Fix,
        [int[]]$AllowedExitCodes = @(0)
    )
    $cmdLine = "$FilePath $($Arguments -join ' ')"
    Write-Log "Running: $cmdLine" 'STEP'
    Write-Log "WorkingDirectory: $WorkingDirectory"
    Push-Location $WorkingDirectory
    $oldErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $output = & $FilePath @Arguments 2>&1
        $exit = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $oldErrorActionPreference
        Pop-Location
    }
    foreach ($line in $output) { Write-Log $line }
    if ($AllowedExitCodes -notcontains $exit) {
        Fail-Stage -StageName $StageName -Reason "Command exited with code $exit" -Command $cmdLine -Path $WorkingDirectory -Fix $Fix
    }
}

function Assert-FileExists {
    param(
        [string]$StageName,
        [string]$Path,
        [string]$Fix
    )
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        Fail-Stage -StageName $StageName -Reason 'Required file is missing' -Path $Path -Fix $Fix
    }
    Write-Log "Found file: $Path" 'OK'
}

function Assert-DirectoryExists {
    param(
        [string]$StageName,
        [string]$Path,
        [string]$Fix
    )
    if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
        Fail-Stage -StageName $StageName -Reason 'Required directory is missing' -Path $Path -Fix $Fix
    }
    Write-Log "Found directory: $Path" 'OK'
}

function Copy-Tree {
    param(
        [string]$StageName,
        [string]$Source,
        [string]$Destination,
        [string[]]$ExcludeDirectory = @(),
        [string[]]$ExcludeFile = @()
    )
    Assert-DirectoryExists -StageName $StageName -Path $Source -Fix 'Check the repository layout.'
    if (Test-Path -LiteralPath $Destination) { Remove-Item -LiteralPath $Destination -Recurse -Force }
    $args = @($Source, $Destination, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NP')
    if ($ExcludeDirectory.Count -gt 0) { $args += @('/XD') + $ExcludeDirectory }
    if ($ExcludeFile.Count -gt 0) { $args += @('/XF') + $ExcludeFile }
    Invoke-LoggedCommand -StageName $StageName -FilePath 'robocopy' -Arguments $args -WorkingDirectory $RepoRoot -Fix 'Inspect the robocopy source/destination paths and permissions.' -AllowedExitCodes @(0,1,2,3,4,5,6,7)
}

function Copy-ElectronProductionDeps {
    $electronDir = Join-Path $RepoRoot 'electron'
    $electronPackageJson = Join-Path $electronDir 'package.json'
    $electronNodeModules = Join-Path $electronDir 'node_modules'
    $stageNodeModules = Join-Path $Stage 'electron\node_modules'

    Assert-FileExists -StageName 'Stage electron dependencies' -Path $electronPackageJson -Fix 'Restore electron/package.json.'
    Assert-DirectoryExists -StageName 'Stage electron dependencies' -Path $electronNodeModules -Fix 'Run npm install in the electron directory, then rerun package_release.ps1.'

    try {
        $electronPackage = Get-Content -LiteralPath $electronPackageJson -Raw | ConvertFrom-Json
    } catch {
        Fail-Stage -StageName 'Stage electron dependencies' -Reason "Failed to parse electron/package.json: $($_.Exception.Message)" -Path $electronPackageJson -Fix 'Fix electron/package.json JSON syntax.'
    }

    $queue = New-Object System.Collections.Generic.Queue[string]
    $seen = New-Object 'System.Collections.Generic.HashSet[string]'
    $rootDeps = @($electronPackage.dependencies.PSObject.Properties | ForEach-Object { $_.Name } | Where-Object { $_ -and $_ -ne 'electron' })
    foreach ($dep in $rootDeps) { $queue.Enqueue($dep) }

    while ($queue.Count -gt 0) {
        $dep = $queue.Dequeue()
        if (-not $seen.Add($dep)) { continue }

        $depSource = Join-Path $electronNodeModules $dep
        $depTarget = Join-Path $stageNodeModules $dep
        if (-not (Test-Path -LiteralPath $depSource -PathType Container)) {
            Fail-Stage -StageName 'Stage electron dependencies' -Reason "Missing electron production dependency '$dep' in electron/node_modules." -Path $depSource -Fix 'Run npm install in the electron directory, then rerun package_release.ps1.'
        }

        Copy-Tree -StageName "Stage electron dependency $dep" -Source $depSource -Destination $depTarget -ExcludeDirectory @('.bin', '__pycache__') -ExcludeFile @('*.pyc', '*.bak*')

        $depPackageJson = Join-Path $depSource 'package.json'
        if (-not (Test-Path -LiteralPath $depPackageJson -PathType Leaf)) { continue }

        try {
            $depPackage = Get-Content -LiteralPath $depPackageJson -Raw | ConvertFrom-Json
            if ($depPackage.dependencies) {
                foreach ($child in @($depPackage.dependencies.PSObject.Properties | ForEach-Object { $_.Name })) {
                    if ($child -and -not $seen.Contains($child)) {
                        $queue.Enqueue($child)
                    }
                }
            }
        } catch {
            Fail-Stage -StageName 'Stage electron dependencies' -Reason "Failed to parse dependency package.json for '$dep': $($_.Exception.Message)" -Path $depPackageJson -Fix 'Reinstall electron dependencies, then rerun package_release.ps1.'
        }
    }

    Write-Log "Electron production dependencies staged: $($seen.Count)" 'OK'
}

function Test-ForbiddenPayloadContent {
    param([string]$PayloadRoot)
    $forbidden = @(
        'data',
        'cache',
        'current',
        'versions',
        'electron\runtime',
        'backend.before-switch-20260506-111514',
        'backend.before-switch-20260506-112438',
        'backend.broken.20260506-105417',
        'backup_electron_pre_v0234_20260507_111809',
        'backup_electron_v0234_20260507_133439',
        'backup_pre_revision_restore_20260506_190047'
    )
    foreach ($rel in $forbidden) {
        $p = Join-Path $PayloadRoot $rel
        if (Test-Path -LiteralPath $p) {
            Fail-Stage -StageName 'Payload leak check' -Reason 'Forbidden runtime or backup content was staged' -Path $p -Fix 'Remove this item from staging rules. Runtime state must be generated on the user machine.'
        }
    }
    $bak = Get-ChildItem -LiteralPath $PayloadRoot -Recurse -File -ErrorAction SilentlyContinue | Where-Object {
        $_.Name -like '*.bak*' -or $_.Name -like '*.pyc'
    } | Select-Object -First 1
    if ($bak) {
        Fail-Stage -StageName 'Payload leak check' -Reason 'Backup or bytecode file was staged' -Path $bak.FullName -Fix 'Exclude .bak and .pyc files from the release payload.'
    }
    Write-Log 'No forbidden runtime, cache, version, backup, or bytecode content found in payload.' 'OK'
}

try {
    Write-Log "Nova package release started for version $Version" 'STEP'
    Write-Log "RepoRoot: $RepoRoot"
    Write-Log "LogPath: $LogPath"

    if ($UnsignedDevPackage -and ($SignKey -or $SigningKeyId)) {
        Fail-Stage -StageName 'Argument validation' -Reason 'UnsignedDevPackage cannot be combined with SignKey or SigningKeyId' -Fix 'Choose either signed release mode or unsigned development mode.'
    }
    if (-not $UnsignedDevPackage -and (-not $SignKey -or -not $SigningKeyId)) {
        Fail-Stage -StageName 'Argument validation' -Reason 'Signed release mode requires both SignKey and SigningKeyId' -Fix 'Pass -SignKey and -SigningKeyId, or use -UnsignedDevPackage for local testing only.'
    }
    if ($SignKey) {
        Assert-FileExists -StageName 'Argument validation' -Path $SignKey -Fix 'Pass the full path to the Ed25519 PEM private key.'
    }

    if (-not $ReleaseNotes) {
        $ReleaseNotes = Join-Path $ScriptDir "RELEASE_NOTES_v$Version.md"
    }
    Assert-FileExists -StageName 'Release notes' -Path $ReleaseNotes -Fix 'Create release notes or pass -ReleaseNotes <path>.'

    $versionFile = Join-Path $RepoRoot 'VERSION.txt'
    Assert-FileExists -StageName 'Version bump' -Path $versionFile -Fix 'Restore VERSION.txt at repo root.'
    if (-not $NoVersionBump) {
        Write-Utf8NoBom -Path $versionFile -Content ($Version + [Environment]::NewLine)
        $pkgJsonPath = Join-Path $NovaBlock 'package.json'
        Assert-FileExists -StageName 'Version bump' -Path $pkgJsonPath -Fix 'Restore nova-block/package.json.'
        $pkgJsonText = Get-Content -LiteralPath $pkgJsonPath -Raw
        try {
            $pkgJson = $pkgJsonText | ConvertFrom-Json
        } catch {
            Fail-Stage -StageName 'Version bump' -Reason "nova-block/package.json is not valid JSON: $($_.Exception.Message)" -Path $pkgJsonPath -Fix 'Fix package.json before packaging.'
        }
        if (-not ($pkgJson.PSObject.Properties.Name -contains 'version')) {
            Fail-Stage -StageName 'Version bump' -Reason 'Could not find package.json version field to update' -Path $pkgJsonPath -Fix 'Add a top-level version field to nova-block/package.json.'
        }
        if ($pkgJson.version -ne $Version) {
            $updatedPkgJsonText = [regex]::Replace($pkgJsonText, '("version"\s*:\s*")[^"]+(")', "`${1}$Version`${2}", 1)
            Write-Utf8NoBom -Path $pkgJsonPath -Content $updatedPkgJsonText
        } else {
            Write-Log "Package.json already at $Version" 'OK'
        }
        Write-Log "Updated VERSION.txt and nova-block/package.json to $Version" 'OK'
    }
    $actualVersion = (Get-Content -LiteralPath $versionFile -Raw).Trim()
    if ($actualVersion -ne $Version) {
        Fail-Stage -StageName 'Version bump' -Reason "VERSION.txt is '$actualVersion', expected '$Version'" -Path $versionFile -Fix 'Run without -NoVersionBump or update VERSION.txt manually.'
    }

    if (-not $SkipTests) {
        Invoke-LoggedCommand -StageName 'Backend tests' -FilePath 'python' -Arguments @('-m', 'pytest', 'backend', '-q', '-W', 'error') -WorkingDirectory $RepoRoot -Fix 'Fix backend test failures before packaging.'
    }

    Assert-DirectoryExists -StageName 'Frontend build' -Path $NovaBlock -Fix 'Restore nova-block directory.'
    $oldDist = Join-Path $NovaBlock 'dist'
    if (Test-Path -LiteralPath $oldDist) { Remove-Item -LiteralPath $oldDist -Recurse -Force }
    Invoke-LoggedCommand -StageName 'Frontend build' -FilePath 'npm' -Arguments @('run', 'build') -WorkingDirectory $NovaBlock -Fix 'Fix frontend TypeScript/Vite build errors before packaging.'
    $freshDist = Join-Path $NovaBlock 'dist'
    Assert-FileExists -StageName 'Frontend build' -Path (Join-Path $freshDist 'index.html') -Fix 'npm run build did not produce dist/index.html.'

    Write-Log "Preparing clean stage: $Stage" 'STEP'
    if (Test-Path -LiteralPath $Stage) { Remove-Item -LiteralPath $Stage -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $Stage | Out-Null

    Copy-Item -LiteralPath $versionFile -Destination (Join-Path $Stage 'VERSION.txt') -Force
    Copy-Tree -StageName 'Stage backend' -Source (Join-Path $RepoRoot 'backend') -Destination (Join-Path $Stage 'backend') -ExcludeDirectory @('__pycache__') -ExcludeFile @('*.pyc', '*.bak*')
    Copy-Tree -StageName 'Stage electron' -Source (Join-Path $RepoRoot 'electron') -Destination (Join-Path $Stage 'electron') -ExcludeDirectory @('runtime', 'node_modules') -ExcludeFile @('*.bak*')
    Copy-ElectronProductionDeps
    Copy-Tree -StageName 'Stage frontend' -Source $freshDist -Destination (Join-Path $Stage 'frontend_dist')

    foreach ($rootFile in @('start_backend.py', 'start_updater_cli.py', 'start_windows.bat')) {
        $src = Join-Path $RepoRoot $rootFile
        Assert-FileExists -StageName 'Stage root files' -Path $src -Fix "Restore $rootFile at repo root."
        Copy-Item -LiteralPath $src -Destination (Join-Path $Stage $rootFile) -Force
    }

    Test-ForbiddenPayloadContent -PayloadRoot $Stage

    $requiredStageFiles = @(
        'VERSION.txt',
        'backend\main.py',
        'backend\services\updater_service.py',
        'backend\services\updater_pkg.py',
        'backend\services\updater_cli.py',
        'electron\main.js',
        'electron\preload.js',
        'electron\updaterBridge.js',
        'electron\node_modules\chokidar\package.json',
        'electron\node_modules\yaml\package.json',
        'frontend_dist\index.html',
        'start_backend.py',
        'start_updater_cli.py',
        'start_windows.bat'
    )
    foreach ($rel in $requiredStageFiles) {
        Assert-FileExists -StageName 'Stage completeness' -Path (Join-Path $Stage $rel) -Fix "The release payload is missing $rel. Check copy/exclude rules."
    }

    $stagedJs = Get-ChildItem -LiteralPath (Join-Path $Stage 'frontend_dist\assets') -Filter 'index-*.js' -ErrorAction SilentlyContinue
    if (-not $stagedJs) {
        Fail-Stage -StageName 'Frontend bundle guard' -Reason 'No index-*.js exists in staged frontend_dist/assets' -Path (Join-Path $Stage 'frontend_dist\assets') -Fix 'Rebuild frontend and check Vite output.'
    }
    foreach ($needle in $RequiredStrings) {
        $hit = Select-String -Path $stagedJs.FullName -Pattern $needle -SimpleMatch -ErrorAction SilentlyContinue | Select-Object -First 1
        if (-not $hit) {
            Fail-Stage -StageName 'Frontend bundle guard' -Reason "Required UI marker '$needle' was not found in the staged bundle" -Path $stagedJs.FullName -Fix 'The frontend bundle may be stale or the marker list is wrong.'
        }
        Write-Log "Bundle marker present: $needle" 'OK'
    }

    if (Test-Path -LiteralPath $OutPkg) { Remove-Item -LiteralPath $OutPkg -Force }
    $pyArgs = @(
        (Join-Path $ScriptDir 'build_update_package.py'),
        '--source', $Stage,
        '--output', $OutPkg,
        '--release-notes', $ReleaseNotes,
        '--channel', $Channel
    )
    if ($MinBaseVersion) { $pyArgs += @('--min-base-version', $MinBaseVersion) }
    if (-not $UnsignedDevPackage) {
        $pyArgs += @('--sign-key', $SignKey, '--signing-key-id', $SigningKeyId)
    } else {
        $pyArgs += @('--no-validate')
        Write-Log 'Building unsigned development package. Current signed clients will reject this package during in-app update.' 'WARN'
        Write-Log 'Use signed mode for software Settings -> Update workflows.' 'WARN'
    }
    Invoke-LoggedCommand -StageName 'Build .nova-update' -FilePath 'python' -Arguments $pyArgs -WorkingDirectory $RepoRoot -Fix 'Inspect manifest/signing errors above. Check signing key, release notes, and payload completeness.'
    Assert-FileExists -StageName 'Build .nova-update' -Path $OutPkg -Fix 'build_update_package.py exited successfully but did not create the output package.'

    $sizeMB = [math]::Round(((Get-Item -LiteralPath $OutPkg).Length / 1MB), 2)
    if ($sizeMB -gt $WarnIfPackageLargerThanMB) {
        Write-Log "Package size is $sizeMB MiB, above warning threshold $WarnIfPackageLargerThanMB MiB. Check for accidentally bundled runtime or backups." 'WARN'
    }
    $feedPath = Join-Path $ReleaseRoot 'latest.json'
    Write-ReleaseFeed -PackagePath $OutPkg -FeedPath $feedPath

    $peek = Join-Path $DistRoot ("peek-" + [Guid]::NewGuid().ToString('N').Substring(0, 8))
    New-Item -ItemType Directory -Force -Path $peek | Out-Null
    try {
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        [IO.Compression.ZipFile]::ExtractToDirectory($OutPkg, $peek)
        Test-ForbiddenPayloadContent -PayloadRoot (Join-Path $peek 'payload')
        foreach ($rel in $requiredStageFiles) {
            Assert-FileExists -StageName 'Post-build package verification' -Path (Join-Path $peek "payload\$rel") -Fix "The final package is missing payload/$rel."
        }
    } finally {
        Remove-Item -LiteralPath $peek -Recurse -Force -ErrorAction SilentlyContinue
    }

    Write-Log "Release package created: $OutPkg" 'OK'
    Write-Log "Release feed: $feedPath" 'OK'
    Write-Log "Package size: $sizeMB MiB" 'OK'
    Write-Host ''
    Write-Host "Package release OK:" -ForegroundColor Green
    Write-Host "  $OutPkg"
    Write-Host "Release feed:"
    Write-Host "  $feedPath"
    Write-Host "Diagnostic log:"
    Write-Host "  $LogPath"
} catch {
    Write-Log "Unhandled error: $($_.Exception.Message)" 'ERROR'
    Write-Log "Full diagnostic log: $LogPath" 'ERROR'
    exit 1
}
