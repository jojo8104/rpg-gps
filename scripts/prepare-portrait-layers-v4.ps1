param([Parameter(Mandatory=$true)][string]$HeadNeckAtlas)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'prepare-portrait-assets.ps1')
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../app/assets/portraits/modular'))
$sources = Join-Path $root 'sources/v4'
$layout = Get-Content -LiteralPath (Join-Path $root 'v4/layout.json') -Raw | ConvertFrom-Json
New-Item -ItemType Directory -Force -Path $sources | Out-Null
$savedAtlas = Join-Path $sources 'head-neck-atlas-v4.png'
if ((Resolve-Path -LiteralPath $HeadNeckAtlas).Path -ne $savedAtlas) { Copy-Item -LiteralPath $HeadNeckAtlas -Destination $savedAtlas -Force }
$atlas = [System.Drawing.Bitmap]::new((Resolve-Path -LiteralPath $HeadNeckAtlas).Path)

function Place-Layer($inputPath, $outputPath, $offsetY = 0, $scaleY = 1, $splitEyes = 0, $chestOnly = $false) {
  $inputImage = [System.Drawing.Bitmap]::new($inputPath)
  $outputImage = [System.Drawing.Bitmap]::new(512, 832)
  $graphics = [System.Drawing.Graphics]::FromImage($outputImage)
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  if ($splitEyes) {
    foreach ($half in @(0,1)) {
      $x = $half * 256
      $shift = if ($half -eq 0) { -$splitEyes } else { $splitEyes }
      $graphics.DrawImage($inputImage, [System.Drawing.Rectangle]::new(($x + $shift), 0, 256, 832), [System.Drawing.Rectangle]::new($x, 0, 256, 832), [System.Drawing.GraphicsUnit]::Pixel)
    }
  } else {
    # Le col reste ancre a y=320, le torse masculin cesse d'etre etire en hauteur.
    $top = $offsetY + $layout.torsoAnchorY * (1 - $scaleY)
    $graphics.DrawImage($inputImage, [System.Drawing.RectangleF]::new(0, $top, 512, (832 * $scaleY)))
  }
  $graphics.Dispose()
  if ($chestOnly) {
    for ($y=0; $y -lt $layout.chestStartY; $y++) { for ($x=0; $x -lt 512; $x++) { $outputImage.SetPixel($x,$y,[System.Drawing.Color]::Transparent) } }
  }
  $outputImage.Save($outputPath,[System.Drawing.Imaging.ImageFormat]::Png)
  $outputImage.Dispose(); $inputImage.Dispose()
}

foreach ($gender in @('male','female')) {
  $destination = Join-Path $root "v4/$gender"
  New-Item -ItemType Directory -Force -Path $destination | Out-Null
  foreach ($file in Get-ChildItem -LiteralPath (Join-Path $root "v3/$gender") -Filter '*.png') {
    if ($file.Name -eq 'face-0.png') { continue }
    $offsetY = if ($file.Name -like 'hair-*') { $layout.hairOffsetY } elseif ($file.Name -like 'hairBack-*') { $layout.hairBackOffsetY } else { 0 }
    $scaleY = if ($gender -eq 'male' -and ($file.Name -like 'clothing-*' -or $file.Name -eq 'accessory-4.png')) { $layout.maleTorsoScaleY } else { 1 }
    $splitEyes = if ($gender -eq 'female' -and $file.Name -like 'eyes-*') { $layout.femaleEyeOffsetXPerSide } else { 0 }
    Place-Layer $file.FullName (Join-Path $destination $file.Name) $offsetY $scaleY $splitEyes ($file.Name -eq 'body-0.png')
  }
  $column = if ($gender -eq 'male') { 0 } else { 1 }
  $faceTarget = $layout.face.$gender
  $neckTarget = $layout.neck.$gender
  $faceBounds = Get-PartBounds $atlas $column 0 2 2 @(0,0.63,1)
  $neckBounds = Get-PartBounds $atlas $column 1 2 2 @(0,0.63,1)
  Export-ImageRect $atlas $faceBounds (Join-Path $destination 'face-0.png') 512 832 $faceTarget
  Export-ImageRect $atlas $neckBounds (Join-Path $destination 'neck-0.png') 512 832 $neckTarget
}
$atlas.Dispose()
& (Join-Path $PSScriptRoot 'clean-portrait-islands-v3.ps1') -Version v4 -Anatomy
