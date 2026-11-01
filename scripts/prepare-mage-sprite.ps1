param([Parameter(Mandatory=$true)][string]$Source)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$target = Join-Path $root 'app/assets/heroes/mage-male-jrpg-walk-v2.png'
Copy-Item -LiteralPath $Source -Destination $target
$bitmap = [System.Drawing.Bitmap]::new($target)
$cuts = @(0, 0.184, 0.364, 0.547, 0.743, 1)
$poses = @()
$maxHeight = 0
for ($row = 0; $row -lt 5; $row++) {
  $frames = @()
  for ($column = 0; $column -lt 3; $column++) {
    $left = [int][Math]::Floor($column * $bitmap.Width / 3)
    $right = [int][Math]::Floor(($column + 1) * $bitmap.Width / 3) - 1
    $top = [int]($cuts[$row] * $bitmap.Height)
    $bottom = [int]($cuts[$row + 1] * $bitmap.Height) - 1
    $minX = $right; $maxX = $left; $minY = $bottom; $maxY = $top
    for ($y = $top; $y -le $bottom; $y++) {
      for ($x = $left; $x -le $right; $x++) {
        if ($bitmap.GetPixel($x, $y).A -gt 200) {
          $minX = [Math]::Min($minX, $x); $maxX = [Math]::Max($maxX, $x)
          $minY = [Math]::Min($minY, $y); $maxY = [Math]::Max($maxY, $y)
        }
      }
    }
    $height = $maxY - $minY + 1
    $maxHeight = [Math]::Max($maxHeight, $height)
    $frames += [ordered]@{ x=$minX; y=$minY; width=($maxX - $minX + 1); height=$height; axis=(($minX + $maxX) / 2) }
  }
  $poses += ,$frames
}
$sheet = [ordered]@{ image='mage-male-jrpg-walk-v2.png'; width=$bitmap.Width; height=$bitmap.Height; scale=(64.0 / $maxHeight); poses=$poses }
$json = $sheet | ConvertTo-Json -Depth 8
[System.IO.File]::WriteAllText((Join-Path $root 'app/js/map/mage-male-sheet-v2.js'), "/** Rectangles alpha du mage masculin sans chapeau ; ligne de pieds commune. */`nexport const MAGE_MALE_SHEET_V2 = $json;`n", [System.Text.UTF8Encoding]::new($false))
$bitmap.Dispose()
