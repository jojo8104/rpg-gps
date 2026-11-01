param([Parameter(Mandatory=$true)][string]$ChestAtlas)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'prepare-portrait-assets.ps1')
$root=[System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../app/assets/portraits/modular'))
$sources=Join-Path $root 'sources/v5'
$layout=Get-Content -LiteralPath (Join-Path $root 'v5/layout.json') -Raw | ConvertFrom-Json
New-Item -ItemType Directory -Force -Path $sources | Out-Null
$saved=Join-Path $sources 'upper-chest-atlas-v5.png'
if ((Resolve-Path -LiteralPath $ChestAtlas).Path -ne $saved) {Copy-Item -LiteralPath $ChestAtlas -Destination $saved}
$atlas=[System.Drawing.Bitmap]::new((Resolve-Path -LiteralPath $ChestAtlas).Path)
foreach($gender in @('male','female')) {
  $destination=Join-Path $root "v5/$gender"
  New-Item -ItemType Directory -Force -Path $destination | Out-Null
  Copy-Item -Path (Join-Path $root "v4/$gender/*.png") -Destination $destination -Force
  $column=if($gender -eq 'male'){0}else{1}
  $bounds=Get-PartBounds $atlas $column 0 2 1
  $full=Join-Path $sources "$gender-chest-full.png"
  Export-ImageRect $atlas $bounds $full 512 832 $layout.upperChest
  $chest=[System.Drawing.Bitmap]::new($full)
  for($index=0;$index -lt 8;$index++) {
    $clothing=[System.Drawing.Bitmap]::new((Join-Path $destination "clothing-$index.png"))
    $body=[System.Drawing.Bitmap]::new(512,832)
    # Ne conserver le dessous que dans l'enveloppe de la tenue, sans bras fantomes.
    for($y=$layout.upperChest[1];$y -lt ($layout.upperChest[1]+$layout.upperChest[3]);$y++) {
      $left=512;$right=-1
      for($x=0;$x -lt 512;$x++){if($clothing.GetPixel($x,$y).A -gt 40){$left=[Math]::Min($left,$x);$right=[Math]::Max($right,$x)}}
      for($x=($left+2);$x -lt ($right-2);$x++){$body.SetPixel($x,$y,$chest.GetPixel($x,$y))}
    }
    $body.Save((Join-Path $destination "body-$index.png"),[System.Drawing.Imaging.ImageFormat]::Png)
    $body.Dispose();$clothing.Dispose()
  }
  $chest.Dispose()
  foreach($file in Get-ChildItem -LiteralPath $destination -Filter 'hair*.png') {
    $inputImage=[System.Drawing.Bitmap]::new($file.FullName)
    $outputImage=[System.Drawing.Bitmap]::new(512,832)
    $graphics=[System.Drawing.Graphics]::FromImage($outputImage)
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $growth=$layout.hairScale-1
    $graphics.DrawImage($inputImage,[System.Drawing.RectangleF]::new((-$layout.hairOrigin[0]*$growth),(-$layout.hairOrigin[1]*$growth),(512*$layout.hairScale),(832*$layout.hairScale)))
    $graphics.Dispose();$inputImage.Dispose()
    $outputImage.Save($file.FullName,[System.Drawing.Imaging.ImageFormat]::Png);$outputImage.Dispose()
  }
}
$atlas.Dispose()
