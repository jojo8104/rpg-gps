param([string]$BodyAtlas, [string]$MaleClothingAtlas, [string]$FemaleClothingAtlas)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'prepare-portrait-assets.ps1')
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../app/assets/portraits/modular'))
$sourceRoot = Join-Path $root 'sources/v3'
New-Item -ItemType Directory -Force -Path $sourceRoot | Out-Null
$layout = Get-Content -LiteralPath (Join-Path $root 'v3/layout.json') -Raw | ConvertFrom-Json

function Save-Atlas($source, $name) {
  $target = Join-Path $sourceRoot $name
  if ((Resolve-Path -LiteralPath $source).Path -ne [System.IO.Path]::GetFullPath($target)) { Copy-Item -LiteralPath $source -Destination $target }
}

function Transform-Layer($sourcePath, $targetPath, $scale, $origin, $targetOrigin, $isFace = $false) {
  $image = [System.Drawing.Bitmap]::new($sourcePath)
  $output = [System.Drawing.Bitmap]::new($layout.width, $layout.height)
  $graphics = [System.Drawing.Graphics]::FromImage($output)
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $rect = [System.Drawing.RectangleF]::new(($targetOrigin[0] - $origin[0] * $scale), ($targetOrigin[1] - $origin[1] * $scale), ($image.Width * $scale), ($image.Height * $scale))
  $graphics.DrawImage($image, $rect)
  $graphics.Dispose()
  if ($isFace) {
    # L'ancienne base incluait des épaules : ne garder que la tête et le raccord du cou.
    for ($y=334; $y -lt $layout.height; $y++) {
      for ($x=0; $x -lt $layout.width; $x++) {
        if ($x -lt 208 -or $x -ge 304 -or $y -ge 366) {
          $output.SetPixel($x, $y, [System.Drawing.Color]::Transparent)
        } elseif ($y -ge 350) {
          $pixel = $output.GetPixel($x, $y)
          $alpha = [int]($pixel.A * (366 - $y) / 16)
          $output.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($alpha, $pixel.R, $pixel.G, $pixel.B))
        }
      }
    }
  }
  $output.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $output.Dispose(); $image.Dispose()
}

foreach ($gender in @('male', 'female')) {
  $destination = Join-Path $root "v3/$gender"
  New-Item -ItemType Directory -Force -Path $destination | Out-Null
  $names = @('face-0', 'eyes-0', 'eyes-1', 'nose-0', 'nose-1', 'mouth-0', 'mouth-1', 'hair-0', 'hair-1', 'hair-2', 'hair-3')
  if ($gender -eq 'female') { $names += @('hairBack-0', 'hairBack-1', 'hairBack-2', 'hairBack-3') }
  $count = if ($gender -eq 'male') { 4 } else { 3 }
  for ($i=1; $i -le $count; $i++) { $names += "accessory-$i" }
  foreach ($name in $names) {
    $isNecklace = $name -eq $(if ($gender -eq 'male') { 'accessory-4' } else { 'accessory-3' })
    if ($isNecklace) {
      $source = $layout.necklace.source; $target = $layout.necklace.target
      $scale = $target[3] / $source[3]
      # Le pendentif suit le torse ; ses dimensions restent proportionnées.
      Transform-Layer (Join-Path $root "v2/$gender/$name.png") (Join-Path $destination "$name.png") $scale @(256, 416) @(256, ($target[1] + (416 - $source[1]) * $scale))
    } else {
      Transform-Layer (Join-Path $root "v2/$gender/$name.png") (Join-Path $destination "$name.png") $layout.head.scale $layout.head.sourceAnchor $layout.head.targetAnchor ($name -eq 'face-0')
    }
  }
}

if ($BodyAtlas) {
  Save-Atlas $BodyAtlas 'body-bases-v3.png'
  $atlas = [System.Drawing.Bitmap]::new((Resolve-Path -LiteralPath $BodyAtlas).Path)
  # Séparation mesurée dans l'espace transparent entre les deux silhouettes.
  $split = [int]($atlas.Width * 820 / 1536)
  foreach ($gender in @('male', 'female')) {
    $left = if ($gender -eq 'male') { 0 } else { $split }
    $width = if ($gender -eq 'male') { $split } else { $atlas.Width - $split }
    $cell = $atlas.Clone([System.Drawing.Rectangle]::new($left, 0, $width, $atlas.Height), [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $bounds = Get-PartBounds $cell 0 0 1 1
    if ($bounds.Left -lt 2 -or $bounds.Right -gt $cell.Width - 2) { throw "Corps coupé sur un bord : $gender" }
    $fullBodyPath = Join-Path $sourceRoot "$gender-body-full.png"
    Export-ImageRect $cell $bounds $fullBodyPath $layout.width $layout.height $layout.body.target
    # Les épaules et les bras suivent la coupe du vêtement. Le dessous assure le cou et le torse.
    $fullBody = [System.Drawing.Bitmap]::new($fullBodyPath)
    $body = [System.Drawing.Bitmap]::new($layout.width, $layout.height)
    $bodyGraphics = [System.Drawing.Graphics]::FromImage($body)
    $bodyGraphics.Clear([System.Drawing.Color]::Transparent)
    $polygon = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $points = [System.Drawing.PointF[]]@($layout.body.visiblePolygon | ForEach-Object { [System.Drawing.PointF]::new($_[0], $_[1]) })
    $polygon.AddPolygon($points)
    $bodyGraphics.SetClip($polygon)
    $bodyGraphics.DrawImage($fullBody, 0, 0, $layout.width, $layout.height)
    $body.Save((Join-Path $root "v3/$gender/body-0.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $polygon.Dispose(); $bodyGraphics.Dispose(); $body.Dispose(); $fullBody.Dispose()
    $cell.Dispose()
  }
  $atlas.Dispose()
}

foreach ($gender in @('male', 'female')) {
  $sourcePath = if ($gender -eq 'male') { $MaleClothingAtlas } else { $FemaleClothingAtlas }
  if (!$sourcePath) { continue }
  Save-Atlas $sourcePath "$gender-clothing-atlas-v3.png"
  $atlas = [System.Drawing.Bitmap]::new((Resolve-Path -LiteralPath $sourcePath).Path)
  $originalPath = Join-Path $sourceRoot "$gender-clothing-original-v3.png"
  if (!(Test-Path $originalPath)) { throw "Atlas original manquant : $originalPath" }
  $original = [System.Drawing.Bitmap]::new($originalPath)
  for ($i=0; $i -lt 8; $i++) {
    $column = $i % 2; $row = [int][Math]::Floor($i / 2)
    $selected = if ($i -in @(3, 6)) { $atlas } else { $original }
    $isolated = $null
    if ($i -eq 3) {
      # Le manteau voisin atteint la gouttiere ; isoler la tenue dans son espace transparent.
      $top = if ($gender -eq 'female') { 378 } else { 384 }
      $bottom = if ($gender -eq 'female') { 780 } else { 766 }
      $isolated = $atlas.Clone([System.Drawing.Rectangle]::new(540, $top, 484, ($bottom - $top)), [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
      $selected = $isolated
      $bounds = Get-PartBounds $selected 0 0 1 1
    } else { $bounds = Get-PartBounds $selected $column $row 2 4 }
    $cellLeft = [int][Math]::Floor($column * $atlas.Width / 2)
    $cellRight = [int][Math]::Floor(($column + 1) * $atlas.Width / 2)
    if ($isolated) { $cellLeft = 0; $cellRight = $selected.Width }
    if ($bounds.Left -le $cellLeft + 2 -or $bounds.Right -ge $cellRight - 2) { throw "Épaule coupée ou chevauchement de cellule : $gender/$i" }
    Export-ImageRect $selected $bounds (Join-Path $root "v3/$gender/clothing-$i.png") $layout.width $layout.height $layout.clothing.target
    if ($isolated) { $isolated.Dispose() }
  }
  $original.Dispose()
  $atlas.Dispose()
}

# Nettoyer les fragments de cellules voisines sans modifier la silhouette principale.
if ($MaleClothingAtlas -or $FemaleClothingAtlas) { & (Join-Path $PSScriptRoot 'clean-portrait-islands-v3.ps1') }
