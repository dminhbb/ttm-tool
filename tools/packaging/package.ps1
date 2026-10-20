<#
.SYNOPSIS
  Đóng gói mã nguồn TTM Monitor thành file .zip, tuân theo .gitignore — không cần AI agent.

.DESCRIPTION
  Option 1 (Full)        : đóng gói TOÀN BỘ ứng dụng.
  Option 2 (Incremental) : chỉ đóng gói các file MỚI / THAY ĐỔI so với lần đóng gói trước (đối chiếu bằng mã băm
                           SHA-256), kèm danh sách file đã xoá.

  Danh sách file lấy từ git: mọi file đang được theo dõi + file mới chưa commit, bỏ những gì .gitignore loại trừ
  (node_modules, .next, .env*, …) — đúng như khi đẩy lên repo. Mỗi lần đóng gói ghi một manifest (danh sách đầy đủ
  file + mã băm tại thời điểm đó) vào <OutputDir>\manifests và vào trong chính file zip (_package\manifest.json);
  Option 2 so với manifest mới nhất (của lần đóng gói gần nhất, Full hay Incremental đều được).

.PARAMETER Mode
  Full | Incremental. Bỏ trống để chọn bằng menu.

.PARAMETER OutputDir
  Thư mục chứa file zip và manifest. Mặc định: <thư mục mã nguồn>\release-packages (đã có trong .gitignore).

.PARAMETER Baseline
  (Tuỳ chọn, Option 2) manifest .json hoặc file .zip của một lần đóng gói trước để so sánh, thay cho manifest mới nhất.

.EXAMPLE
  .\package.ps1
  .\package.ps1 -Mode Full
  .\package.ps1 -Mode Incremental
  .\package.ps1 -Mode Incremental -Baseline D:\goi-cu\ttm-tool-full-261020.0852-20261020-091500.zip
#>
[CmdletBinding()]
param(
  [ValidateSet('Full', 'Incremental', '')]
  [string]$Mode = '',
  [string]$OutputDir = '',
  [string]$Baseline = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if (-not $OutputDir) { $OutputDir = Join-Path $RepoRoot 'release-packages' }
$ManifestDir = Join-Path $OutputDir 'manifests'
$PackagePrefix = 'ttm-tool'

function Write-Step([string]$Text) { Write-Host "==> $Text" -ForegroundColor Cyan }

function Select-Mode {
  Write-Host ''
  Write-Host 'Đóng gói mã nguồn TTM Monitor' -ForegroundColor Green
  Write-Host '  1 - Đóng gói TOÀN BỘ ứng dụng'
  Write-Host '  2 - Đóng gói phần code MỚI / THAY ĐỔI so với lần đóng gói trước'
  Write-Host '  Q - Thoát'
  while ($true) {
    $choice = (Read-Host 'Chọn 1 / 2 / Q').Trim().ToUpperInvariant()
    if ($choice -eq '1') { return 'Full' }
    if ($choice -eq '2') { return 'Incremental' }
    if ($choice -eq 'Q') { return '' }
  }
}

# Files git would ship: tracked + untracked-but-not-ignored, as repo-relative paths with '/'.
function Get-PackageFiles {
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Không tìm thấy lệnh git. Cài Git for Windows rồi chạy lại.' }
  $previousEncoding = [Console]::OutputEncoding
  try {
    # -z: raw UTF-8 names (folders such as "Các màn hình"), never C-quoted.
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $raw = & git -C $RepoRoot -c core.quotepath=off ls-files --cached --others --exclude-standard -z
    if ($LASTEXITCODE -ne 0) { throw "git ls-files thất bại (mã $LASTEXITCODE). Thư mục $RepoRoot có phải repo git không?" }
  } finally {
    [Console]::OutputEncoding = $previousEncoding
  }
  $outputRelative = ''
  if ($OutputDir.StartsWith($RepoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    $outputRelative = $OutputDir.Substring($RepoRoot.Length).TrimStart('\', '/').Replace('\', '/') + '/'
  }
  $files = New-Object System.Collections.Generic.List[string]
  foreach ($path in (($raw -join '') -split "`0")) {
    if (-not $path) { continue }
    if ($outputRelative -and $path.StartsWith($outputRelative, [System.StringComparison]::OrdinalIgnoreCase)) { continue }
    # Tracked but deleted in the working tree (not committed yet): nothing to ship.
    if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot $path) -PathType Leaf)) { continue }
    $files.Add($path)
  }
  return ($files | Sort-Object -Unique)
}

function Get-Sha256([string]$FullPath) {
  $stream = [System.IO.File]::OpenRead($FullPath)
  try {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { return ([System.BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
  } finally { $stream.Dispose() }
}

function Get-BuildStamp {
  $versionFile = Join-Path $RepoRoot 'version.json'
  if (Test-Path -LiteralPath $versionFile) {
    try { return [string]((Get-Content -LiteralPath $versionFile -Raw -Encoding UTF8 | ConvertFrom-Json).build) } catch { }
  }
  return 'nobuild'
}

function Get-GitCommit {
  $commit = & git -C $RepoRoot rev-parse --short HEAD 2>$null
  if ($LASTEXITCODE -ne 0) { return '' }
  return [string]$commit
}

function Read-ManifestFile([string]$Path) {
  if ($Path.EndsWith('.zip', [System.StringComparison]::OrdinalIgnoreCase)) {
    $zip = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $Path).Path)
    try {
      $entry = $zip.GetEntry('_package/manifest.json')
      if (-not $entry) { throw "File $Path không có _package/manifest.json (không phải gói do script này tạo)." }
      $reader = New-Object System.IO.StreamReader($entry.Open(), [System.Text.Encoding]::UTF8)
      try { return ($reader.ReadToEnd() | ConvertFrom-Json) } finally { $reader.Dispose() }
    } finally { $zip.Dispose() }
  }
  return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json)
}

function Find-LatestManifest {
  if (-not (Test-Path -LiteralPath $ManifestDir)) { return $null }
  $latest = Get-ChildItem -LiteralPath $ManifestDir -Filter '*.json' | Sort-Object Name -Descending | Select-Object -First 1
  if (-not $latest) { return $null }
  return $latest.FullName
}

function Add-TextEntry($Zip, [string]$Name, [string]$Text) {
  $entry = $Zip.CreateEntry($Name, [System.IO.Compression.CompressionLevel]::Optimal)
  $writer = New-Object System.IO.StreamWriter($entry.Open(), (New-Object System.Text.UTF8Encoding($false)))
  try { $writer.Write($Text) } finally { $writer.Dispose() }
}

# ---------------------------------------------------------------------------------------------

if (-not $Mode) { $Mode = Select-Mode }
if (-not $Mode) { Write-Host 'Đã thoát.'; exit 0 }

Write-Step "Thư mục mã nguồn: $RepoRoot"
Write-Step 'Lấy danh sách file theo .gitignore...'
$files = @(Get-PackageFiles)
Write-Step ("{0} file — đang tính mã băm SHA-256..." -f $files.Count)
$current = [ordered]@{}
foreach ($path in $files) {
  $full = Join-Path $RepoRoot $path
  $current[$path] = [ordered]@{ path = $path; sha256 = (Get-Sha256 $full); size = (Get-Item -LiteralPath $full).Length }
}

$toPack = @($files)
$deleted = @()
$baselineName = ''
if ($Mode -eq 'Incremental') {
  $baselinePath = $Baseline
  if (-not $baselinePath) { $baselinePath = Find-LatestManifest }
  if (-not $baselinePath) {
    throw "Chưa có lần đóng gói nào để so sánh (không thấy manifest trong $ManifestDir). Chạy Option 1 trước, hoặc truyền -Baseline <file manifest .json / gói .zip cũ>."
  }
  $previous = Read-ManifestFile $baselinePath
  $baselineName = if ($previous.PSObject.Properties['packageName']) { [string]$previous.packageName } else { Split-Path $baselinePath -Leaf }
  Write-Step "So sánh với lần đóng gói: $baselineName"
  $previousHash = @{}
  foreach ($item in $previous.files) { $previousHash[[string]$item.path] = [string]$item.sha256 }
  $toPack = @($files | Where-Object { -not $previousHash.ContainsKey($_) -or $previousHash[$_] -ne $current[$_].sha256 })
  $deleted = @($previousHash.Keys | Where-Object { -not $current.Contains($_) } | Sort-Object)
  if ($toPack.Count -eq 0 -and $deleted.Count -eq 0) {
    Write-Host 'Không có file nào mới, thay đổi hay bị xoá so với lần đóng gói trước — không tạo gói mới.' -ForegroundColor Yellow
    exit 0
  }
}

$build = Get-BuildStamp
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$kind = if ($Mode -eq 'Full') { 'full' } else { 'incr' }
$packageName = "$PackagePrefix-$kind-$build-$stamp"
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
New-Item -ItemType Directory -Force -Path $ManifestDir | Out-Null
$zipPath = Join-Path $OutputDir "$packageName.zip"

$manifest = [ordered]@{
  packageName = $packageName
  mode        = $Mode
  createdAt   = (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz')
  build       = $build
  gitCommit   = (Get-GitCommit)
  baseline    = $baselineName
  fileCount   = $files.Count
  packedCount = $toPack.Count
  deleted     = $deleted
  # Always the FULL file list of this moment, so the next Option 2 compares against it.
  files       = @($files | ForEach-Object { $current[$_] })
}
$manifestJson = $manifest | ConvertTo-Json -Depth 5

Write-Step ("Tạo gói {0} ({1} file)..." -f "$packageName.zip", $toPack.Count)
$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($path in $toPack) {
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Join-Path $RepoRoot $path), $path, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
  Add-TextEntry $zip '_package/manifest.json' $manifestJson
  $readme = @(
    "Gói: $packageName",
    "Kiểu: $(if ($Mode -eq 'Full') { 'Toàn bộ ứng dụng' } else { "Phần thay đổi so với $baselineName" })",
    "Build (version.json): $build    Git commit: $($manifest.gitCommit)",
    "Tạo lúc: $($manifest.createdAt)",
    '',
    'Giải nén vào thư mục mã nguồn (Option 2: chép đè lên bản trước, rồi xoá các file trong _package/DELETED_FILES.txt).',
    'Sau đó: npm ci  ->  node scripts/migrate-db.js --target=local (nếu có migration mới)  ->  npm run build  ->  npm start.'
  ) -join "`r`n"
  Add-TextEntry $zip '_package/README.txt' $readme
  if ($Mode -eq 'Incremental') {
    Add-TextEntry $zip '_package/CHANGED_FILES.txt' (($toPack -join "`r`n") + "`r`n")
    Add-TextEntry $zip '_package/DELETED_FILES.txt' (($deleted -join "`r`n") + "`r`n")
  }
} catch {
  $zip.Dispose(); $zip = $null
  Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
  throw
} finally {
  if ($zip) { $zip.Dispose() }
}

# The manifest is recorded only once the zip is complete, so a failed run never becomes the baseline.
[System.IO.File]::WriteAllText((Join-Path $ManifestDir "$packageName.json"), $manifestJson, (New-Object System.Text.UTF8Encoding($false)))

$sizeMb = [Math]::Round((Get-Item -LiteralPath $zipPath).Length / 1MB, 2)
Write-Host ''
Write-Host "Xong: $zipPath ($sizeMb MB)" -ForegroundColor Green
Write-Host ("  File trong gói: {0} / {1}" -f $toPack.Count, $files.Count)
if ($Mode -eq 'Incremental') { Write-Host ("  File đã xoá so với lần trước: {0} (xem _package/DELETED_FILES.txt)" -f $deleted.Count) }
Write-Host "  Manifest: $(Join-Path $ManifestDir "$packageName.json")"
