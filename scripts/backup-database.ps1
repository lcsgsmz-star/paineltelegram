$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$backupDir = Join-Path $root "backups"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$candidateDatabases = @(
  (Join-Path $root "data\dev.db"),
  (Join-Path $root "backend\dev.db"),
  (Join-Path $root "prisma\dev.db")
)

New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

$copied = 0
foreach ($database in $candidateDatabases) {
  if (Test-Path -LiteralPath $database) {
    $name = [System.IO.Path]::GetFileNameWithoutExtension($database)
    $parent = Split-Path -Leaf (Split-Path -Parent $database)
    $destination = Join-Path $backupDir "$parent-$name-$timestamp.db"
    Copy-Item -LiteralPath $database -Destination $destination -Force
    Write-Host "Backup criado: $destination"
    $copied += 1
  }
}

if ($copied -eq 0) {
  throw "Nenhum banco SQLite encontrado para backup."
}
