# Creates a Silver-ready zip: MUST include .git (full history). Excludes node_modules.
# Run from repo root:  .\scripts\prepare-silver-upload.ps1
# Optional:           .\scripts\prepare-silver-upload.ps1 -ZipName "routine-optimizer.zip"

param(
    [string]$ZipName = "wuloye-silver-upload.zip"
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $root

if (-not (Test-Path ".git")) {
    Write-Error @"
No .git folder in this directory.

Silver requires the full git history inside the zip. Fix:
  1. Work inside a real git clone (git clone <your-repo-url>), not a copied folder.
  2. Do NOT use Windows 'Compress-Archive' — it often omits .git.

Then run this script again from the repo root.
"@
}

$out = Join-Path (Split-Path -Parent $root) $ZipName
if (Test-Path $out) { Remove-Item $out -Force }

$exclude = @(
    "node_modules",
    "dist",
    "build",
    ".expo",
    "__pycache__",
    ".venv",
    "venv"
)

# tar preserves hidden .git on Windows 10+; Compress-Archive does NOT.
$excludeArgs = $exclude | ForEach-Object { "--exclude=$_" }
& tar -a -cf $out @excludeArgs .

# Verify Silver requirement: .git must be inside the archive
$gitEntries = @(tar -tf $out | Where-Object { $_ -match '(^|/)\.git/' })
if ($gitEntries.Count -eq 0) {
    Remove-Item $out -Force
    Write-Error "Zip was created but .git is missing. Silver will reject it. Use tar from repo root, not Compress-Archive."
}

$mb = [math]::Round((Get-Item $out).Length / 1MB, 2)
Write-Host "Created $out ($mb MB)"
Write-Host "Verified: .git is included ($($gitEntries.Count) entries under .git/)"
Write-Host ""
Write-Host "Upload this file on Silver -> Repositories -> Upload repository."
Write-Host "Do not re-zip manually in File Explorer."
