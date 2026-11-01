param([string]$OutputPath = 'output/portraits/assembly-check-v2.png')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Join-Path $PSScriptRoot '../app/assets/portraits/modular'
$absoluteOutput = [System.IO.Path]::GetFullPath((Join-Path (Join-Path $PSScriptRoot '..') $OutputPath))
New-Item -ItemType Directory -Force -Path (Split-Path $absoluteOutput) | Out-Null
$output = [System.Drawing.Bitmap]::new(1024, 640)
$graphics = [System.Drawing.Graphics]::FromImage($output)
$graphics.Clear([System.Drawing.Color]::FromArgb(238, 224, 191))
for ($i = 0; $i -lt 8; $i++) {
  $x = ($i % 4) * 256
  $y = [int][Math]::Floor($i / 4) * 320
  $gender = if ($i -lt 4) { 'male' } else { 'female' }
  $parts = @()
  if ($gender -eq 'female') { $parts += "hairBack-$($i % 4)" }
  $parts += @('face-0', 'clothing-4', 'eyes-0', 'nose-0', 'mouth-0', "hair-$($i % 4)")
  foreach ($part in $parts) {
    $image = [System.Drawing.Bitmap]::new((Join-Path $root "v2/$gender/$part.png"))
    $graphics.DrawImage($image, [System.Drawing.Rectangle]::new($x, $y, 256, 320))
    $image.Dispose()
  }
}
$output.Save($absoluteOutput, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$output.Dispose()
Write-Output $absoluteOutput
