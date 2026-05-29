# Creates a Silver-ready zip: includes .git, excludes node_modules and build artifacts.
# Run from the repo root (Wuloye-):  .\scripts\prepare-silver-upload.ps1

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $root

if (-not (Test-Path ".git")) {
    Write-Error "No .git directory here. Silver requires full git history in the upload zip."
}

$out = Join-Path (Split-Path -Parent $root) "wuloye-silver-upload.zip"
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

# Windows tar (built-in) preserves .git and is faster than Compress-Archive for large trees.
$excludeArgs = $exclude | ForEach-Object { "--exclude=$_" }
& tar -a -cf $out @excludeArgs .

$mb = [math]::Round((Get-Item $out).Length / 1MB, 2)
Write-Host "Created $out ($mb MB)"
Write-Host "Upload this zip on Silver Repositories -> Upload repository."
