param([switch]$MaleOnly, [string]$OutputPath = 'output/portraits/proportions-v3.png', [ValidateSet('v3','v4','v5','v6','v7','v8')][string]$Version = 'v3', [switch]$HeadStudy, [switch]$Beards)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "../app/assets/portraits/modular/$Version"))
$outputPathAbsolute = [System.IO.Path]::GetFullPath((Join-Path (Join-Path $PSScriptRoot '..') $OutputPath))
New-Item -ItemType Directory -Force -Path (Split-Path $outputPathAbsolute) | Out-Null
$count = if ($MaleOnly) { 8 } else { 16 }
$cellWidth=if($Version -eq 'v8'){320}else{256}
$output = [System.Drawing.Bitmap]::new(($cellWidth*4), ([int]($count / 4) * 416))
$graphics = [System.Drawing.Graphics]::FromImage($output)
$graphics.Clear([System.Drawing.Color]::FromArgb(238, 224, 191))
for ($i=0; $i -lt $count; $i++) {
  $gender = if ($i -lt 8) { 'male' } else { 'female' }
  $parts = @()
  $hair = if ($HeadStudy) { $i % 4 } else { 0 }
  $eyes = if ($HeadStudy) { [int][Math]::Floor(($i % 8) / 4) } else { 0 }
  $clothing = if ($HeadStudy) { 6 } else { $i % 8 }
  if ($gender -eq 'female') { $parts += "hairBack-$hair" }
  $bodyIndex=if($Version -in @('v5','v6','v7','v8')){$clothing}else{0}
  if ($Version -in @('v7','v8')) { $parts += "clothingBack-$clothing" }
  $parts += "body-$bodyIndex"
  if ($Version -in @('v4','v5','v6')) { $parts += 'neck-0' }
  $parts += @('face-0', "clothing-$clothing", "eyes-$eyes", 'nose-0', 'mouth-0', "hair-$hair")
  if ($Beards -and $gender -eq 'male') { $parts += 'accessory-1' }
  foreach ($part in $parts) {
    $image = [System.Drawing.Bitmap]::new((Join-Path $root "$gender/$part.png"))
    $scale=if($Version -eq 'v8' -and $gender -eq 'male' -and $clothing -in @(0,1,2,5,7) -and $part -like 'clothing*'){1.15}else{1}
    $offsetX=0;$offsetY=0
    if($Version -eq 'v8' -and $gender -eq 'female' -and $part -like 'clothing*') {
      if($clothing -eq 0){$offsetX=-5}
      if($clothing -eq 4){$offsetY=-15}
      if($clothing -in @(3,5)){$scale=0.9;$offsetX=-3;$offsetY=-12}
      if($clothing -eq 7){$offsetY=16}
    }
    $drawWidth=[single](256*$scale)
    $drawX=[single](($i%4)*$cellWidth+($cellWidth-$drawWidth)/2+$offsetX/2)
    $drawY=[single]([int][Math]::Floor($i/4)*416+$offsetY/2)
    $graphics.DrawImage($image, [System.Drawing.RectangleF]::new($drawX, $drawY, $drawWidth, 416))
    $image.Dispose()
  }
}
$output.Save($outputPathAbsolute, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose(); $output.Dispose()
Write-Output $outputPathAbsolute

