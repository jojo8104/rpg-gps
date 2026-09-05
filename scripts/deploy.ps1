param(
  [string]$Server = "rpg-gps-server"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$releaseId = Get-Date -Format "yyyyMMdd-HHmmss"
$archiveName = "rpg-gps-$releaseId.tar.gz"
$archivePath = Join-Path ([System.IO.Path]::GetTempPath()) $archiveName
$remoteInstaller = "install-rpg-gps-release.sh"

function Invoke-CheckedCommand {
  param(
    [Parameter(Mandatory = $true)][string]$Command,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments
  )

  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "La commande '$Command' a échoué avec le code $LASTEXITCODE."
  }
}

try {
  Set-Location $projectRoot
  Write-Host "[1/4] Exécution des tests..."
  Invoke-CheckedCommand npm test

  Write-Host "[2/4] Création de l'archive $archiveName..."
  Invoke-CheckedCommand tar.exe -czf $archivePath --exclude=.git --exclude=node_modules --exclude="rpg-gps-*.tar.gz" .

  Write-Host "[3/4] Transfert vers $Server..."
  Invoke-CheckedCommand scp $archivePath "${Server}:$archiveName"
  Invoke-CheckedCommand scp (Join-Path $PSScriptRoot $remoteInstaller) "${Server}:$remoteInstaller"

  Write-Host "[4/4] Installation de la version $releaseId..."
  Invoke-CheckedCommand ssh -t $Server "sudo bash ~/$remoteInstaller $releaseId $archiveName"

  Write-Host "Déploiement $releaseId terminé avec succès." -ForegroundColor Green
} finally {
  if (Test-Path -LiteralPath $archivePath) {
    Remove-Item -LiteralPath $archivePath -Force
  }
  Set-Location $projectRoot
}
