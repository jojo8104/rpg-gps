param([string]$BeardImage)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'prepare-portrait-assets.ps1')
$root=[System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../app/assets/portraits/modular'))
$layout=Get-Content -LiteralPath (Join-Path $root 'v6/layout.json') -Raw | ConvertFrom-Json
$sources=Join-Path $root 'sources/v6'
New-Item -ItemType Directory -Force -Path $sources | Out-Null
$measurements=@()
function Scale-Layer($source,$destination,$scaleX,$offsetX=0,$offsetY=0) {
  $inputImage=[System.Drawing.Bitmap]::new($source)
  $outputImage=[System.Drawing.Bitmap]::new(512,832)
  $graphics=[System.Drawing.Graphics]::FromImage($outputImage)
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.DrawImage($inputImage,[System.Drawing.RectangleF]::new(($layout.clothingOriginX*(1-$scaleX)+$offsetX),$offsetY,(512*$scaleX),832))
  $graphics.Dispose();$inputImage.Dispose()
  $outputImage.Save($destination,[System.Drawing.Imaging.ImageFormat]::Png);$outputImage.Dispose()
}
foreach($gender in @('male','female')) {
  $destination=Join-Path $root "v6/$gender"
  New-Item -ItemType Directory -Force -Path $destination | Out-Null
  Copy-Item -Path (Join-Path $root "v5/$gender/*.png") -Destination $destination -Force
  for($index=0;$index -lt 8;$index++) {
    $clothingPath=Join-Path $root "v5/$gender/clothing-$index.png"
    $image=[System.Drawing.Bitmap]::new($clothingPath)
    $widths=@()
    for($y=$layout.clothingBand[0];$y -le $layout.clothingBand[1];$y++) {
      $left=512;$right=-1
      for($x=0;$x -lt 512;$x++) {if($image.GetPixel($x,$y).A -gt 180){$left=[Math]::Min($left,$x);$right=[Math]::Max($right,$x)}}
      if($right -gt $left){$widths+=($right-$left+1)}
    }
    $image.Dispose()
    $ordered=@($widths | Sort-Object)
    $median=$ordered[[int][Math]::Floor($ordered.Count/2)]
    $scale=$layout.clothingWidth.$gender/$median
    Scale-Layer $clothingPath (Join-Path $destination "clothing-$index.png") $scale
    Scale-Layer (Join-Path $root "v5/$gender/body-$index.png") (Join-Path $destination "body-$index.png") $scale
    $measurements+=@{gender=$gender;clothing=$index;originalWidth=$median;targetWidth=$layout.clothingWidth.$gender;scaleX=$scale}
  }
}
Scale-Layer (Join-Path $root 'v5/female/eyes-0.png') (Join-Path $root 'v6/female/eyes-0.png') 1 $layout.femaleEyes0Offset[0] $layout.femaleEyes0Offset[1]
if($BeardImage) {
  $saved=Join-Path $sources 'beard-v6.png'
  if((Resolve-Path -LiteralPath $BeardImage).Path -ne $saved){Copy-Item -LiteralPath $BeardImage -Destination $saved}
  $image=[System.Drawing.Bitmap]::new((Resolve-Path -LiteralPath $BeardImage).Path)
  $bounds=Get-PartBounds $image 0 0 1 1
  Export-ImageRect $image $bounds (Join-Path $root 'v6/male/accessory-1.png') 512 832 $layout.beardTarget
  $image.Dispose()
}
$measurements | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $sources 'clothing-measurements.json') -Encoding utf8
