param(
  [string]$HeroAtlas,
  [string]$FoundationAtlas,
  [string]$DetailAtlas,
  [string]$CivilianAtlas,
  [string]$BackgroundAtlas
)
# Découpage et placement des assets dessinés : aucune génération de dessin ici.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$assetRoot = Join-Path $PSScriptRoot '../app/assets/portraits'
$layerRoot = Join-Path $assetRoot 'modular/v1'
New-Item -ItemType Directory -Force -Path $layerRoot | Out-Null

function Export-ImageRect($source, $rect, $path, $width, $height, $target) {
  $output = [System.Drawing.Bitmap]::new($width, $height)
  $graphics = [System.Drawing.Graphics]::FromImage($output)
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.DrawImage($source, [System.Drawing.Rectangle]::new($target[0], $target[1], $target[2], $target[3]), $rect, [System.Drawing.GraphicsUnit]::Pixel)
  $output.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $output.Dispose()
}

function Get-PartBounds($bitmap, $column, $row, $columns, $rows, $rowCuts = $null) {
  $left = [int][Math]::Floor($column * $bitmap.Width / $columns)
  $top = [int][Math]::Floor($row * $bitmap.Height / $rows)
  $right = [int][Math]::Floor(($column + 1) * $bitmap.Width / $columns) - 1
  $bottom = [int][Math]::Floor(($row + 1) * $bitmap.Height / $rows) - 1
  if ($rowCuts) {
    $top = [int]($rowCuts[$row] * $bitmap.Height)
    $bottom = [int]($rowCuts[$row + 1] * $bitmap.Height) - 1
  }
  $minX = $right; $maxX = $left; $minY = $bottom; $maxY = $top
  for ($y = $top; $y -le $bottom; $y++) {
    for ($x = $left; $x -le $right; $x++) {
      if ($bitmap.GetPixel($x, $y).A -ge 200) {
        $minX = [Math]::Min($x, $minX); $maxX = [Math]::Max($x, $maxX)
        $minY = [Math]::Min($y, $minY); $maxY = [Math]::Max($y, $maxY)
      }
    }
  }
  if ($maxX -lt $minX) { throw "Cellule vide : $column, $row" }
  return [System.Drawing.Rectangle]::new($minX, $minY, $maxX - $minX + 1, $maxY - $minY + 1)
}

if ($HeroAtlas) {
  $bitmap = [System.Drawing.Bitmap]::new((Resolve-Path -LiteralPath $HeroAtlas).Path)
  $names = @('warrior-male', 'mage-male', 'ranger-male', 'warrior-female', 'mage-female', 'ranger-female')
  for ($i = 0; $i -lt 6; $i++) {
    $column = $i % 3; $row = [int][Math]::Floor($i / 3)
    $rect = [System.Drawing.Rectangle]::new([int]($column * $bitmap.Width / 3), [int]($row * $bitmap.Height / 2), [int]($bitmap.Width / 3), [int]($bitmap.Height / 2))
    Export-ImageRect $bitmap $rect (Join-Path $assetRoot "hero-$($names[$i])-anime-v2.png") 512 512 @(0, 0, 512, 512)
  }
  $bitmap.Dispose()
}

if ($FoundationAtlas) {
  $bitmap = [System.Drawing.Bitmap]::new((Resolve-Path -LiteralPath $FoundationAtlas).Path)
  $parts = @('face', 'hair', 'clothing')
  # Points d'ancrage communs, sur une toile transparente 512 x 640.
  $targets = @(@(90, 60, 332, 410), @(122, 40, 268, 245), @(24, 355, 464, 285))
  for ($row = 0; $row -lt 3; $row++) {
    for ($column = 0; $column -lt 4; $column++) {
      $rect = Get-PartBounds $bitmap $column $row 4 3 @(0, 0.378, 0.700, 1)
      Export-ImageRect $bitmap $rect (Join-Path $layerRoot "$($parts[$row])-$column.png") 512 640 $targets[$row]
    }
  }
  $bitmap.Dispose()
}

if ($DetailAtlas) {
  $bitmap = [System.Drawing.Bitmap]::new((Resolve-Path -LiteralPath $DetailAtlas).Path)
  $parts = @('eyes', 'nose', 'mouth', 'accessory')
  $targets = @(@(182, 221, 148, 44), @(241, 272, 30, 42), @(222, 325, 68, 20))
  $accessories = @(@(169, 311, 174, 112), @(316, 266, 12, 58), @(364, 274, 15, 25), @(213, 416, 86, 68))
  for ($row = 0; $row -lt 4; $row++) {
    for ($column = 0; $column -lt 4; $column++) {
      $rect = Get-PartBounds $bitmap $column $row 4 4 @(0, 0.25, 0.5, 0.684, 1)
      $index = if ($row -eq 3) { $column + 1 } else { $column }
      $target = if ($row -eq 3) { $accessories[$column] } else { $targets[$row] }
      Export-ImageRect $bitmap $rect (Join-Path $layerRoot "$($parts[$row])-$index.png") 512 640 $target
    }
  }
  $bitmap.Dispose()
}

if ($CivilianAtlas) {
  $bitmap = [System.Drawing.Bitmap]::new((Resolve-Path -LiteralPath $CivilianAtlas).Path)
  for ($i = 0; $i -lt 4; $i++) {
    $rect = Get-PartBounds $bitmap ($i % 2) ([int][Math]::Floor($i / 2)) 2 2
    Export-ImageRect $bitmap $rect (Join-Path $layerRoot "clothing-$($i + 4).png") 512 640 @(24, 355, 464, 285)
  }
  $bitmap.Dispose()
}

if ($BackgroundAtlas) {
  $bitmap = [System.Drawing.Bitmap]::new((Resolve-Path -LiteralPath $BackgroundAtlas).Path)
  $names = @('village', 'town', 'fort', 'mine', 'quarry', 'forest', 'tavern', 'forge')
  for ($i = 0; $i -lt 8; $i++) {
    $rect = [System.Drawing.Rectangle]::new([int](($i % 4) * $bitmap.Width / 4), [int]([Math]::Floor($i / 4) * $bitmap.Height / 2), [int]($bitmap.Width / 4), [int]($bitmap.Height / 2))
    Export-ImageRect $bitmap $rect (Join-Path $layerRoot "background-$($names[$i]).png") 512 640 @(0, 0, 512, 640)
  }
  $bitmap.Dispose()
}
