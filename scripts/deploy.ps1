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
    [Parameter(Mandatory = $true)][string]$Executable,
    [string[]]$ArgumentList = @()
  )

  & $Executable @ArgumentList
  if ($LASTEXITCODE -ne 0) {
    throw "La commande '$Executable' a echoue avec le code $LASTEXITCODE."
  }
}

try {
  Set-Location $projectRoot
  Write-Host "[1/4] Execution des tests..."
  Invoke-CheckedCommand -Executable "npm.cmd" -ArgumentList @("test")

  Write-Host "[2/4] Creation de l'archive $archiveName..."
  Invoke-CheckedCommand -Executable "tar.exe" -ArgumentList @(
    "-czf",
    $archivePath,
    "--exclude=.git",
    "--exclude=node_modules",
    "--exclude=rpg-gps-*.tar.gz",
    "."
  )

  Write-Host "[3/4] Transfert vers $Server..."
  Invoke-CheckedCommand -Executable "scp.exe" -ArgumentList @($archivePath, "${Server}:$archiveName")
  Invoke-CheckedCommand -Executable "scp.exe" -ArgumentList @(
    (Join-Path $PSScriptRoot $remoteInstaller),
    "${Server}:$remoteInstaller"
  )

  Write-Host "[4/4] Installation de la version $releaseId..."
  Invoke-CheckedCommand -Executable "ssh.exe" -ArgumentList @(
    "-t",
    $Server,
    "sudo bash ~/$remoteInstaller $releaseId $archiveName"
  )

  Write-Host "Deploiement $releaseId termine avec succes." -ForegroundColor Green
} finally {
  if (Test-Path -LiteralPath $archivePath) {
    Remove-Item -LiteralPath $archivePath -Force
  }
  Set-Location $projectRoot
}
