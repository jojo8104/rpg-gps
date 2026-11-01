param([string]$SourceRoot='app/assets/portraits/modular/sources/v10')
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
# Reutiliser uniquement le compilateur de decoupe v9, sans relancer sa preparation.
$previous=Get-Content (Join-Path $PSScriptRoot 'prepare-portrait-layers-v9.ps1') -Raw
$compiler=[regex]::Match($previous,"(?s)TypeDefinition @'\r?\n(.*?)\r?\n'@").Groups[1].Value.Replace('PortraitV9Compiler','PortraitV10Compiler')
if(!$compiler){throw 'Compilateur de decoupe introuvable'}
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition $compiler
$project=[System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sources=Join-Path $project $SourceRoot
$root=Join-Path $project 'app/assets/portraits/modular/v10'
function Export-Part($file,$x0,$y0,$x1,$y1,$target,$gender,$part) {
  $path=Join-Path $sources $file
  $image=[System.Drawing.Bitmap]::new($path)
  $left=[int][Math]::Floor($image.Width*$x0);$right=[int][Math]::Floor($image.Width*$x1)
  $top=[int][Math]::Floor($image.Height*$y0);$bottom=[int][Math]::Floor($image.Height*$y1)
  $image.Dispose()
  [PortraitV10Compiler]::Extract($path,[System.Drawing.Rectangle]::new($left,$top,$right-$left,$bottom-$top),[System.Drawing.Rectangle]::new($target[0],$target[1],$target[2],$target[3]),(Join-Path $root "$gender/$part.png"))
}
foreach($gender in @('male','female')) {
  $destination=Join-Path $root $gender
  New-Item -ItemType Directory -Force -Path $destination | Out-Null
  Copy-Item (Join-Path $project "app/assets/portraits/modular/v9/$gender/*.png") $destination -Force
  $offset=if($gender -eq 'male'){0}else{2}
  $face=if($gender -eq 'male'){@(163,98,185,228)}else{@(164,103,184,215)}
  Export-Part 'shapes.png' ($offset/4) 0 (($offset+1)/4) 0.35 $face $gender 'face-2'
  $chubby=if($gender -eq 'male'){@(160,98,192,228)}else{@(160,103,192,215)}
  Export-Part 'shapes.png' (($offset+1)/4) 0 (($offset+2)/4) 0.35 $chubby $gender 'face-3'
  $column=if($gender -eq 'male'){0}else{1}
  $mask=if($gender -eq 'male'){@(171,252,170,112)}else{@(174,252,164,105)}
  Export-Part 'shapes.png' ($column/4) 0.35 (($column+1)/4) 0.65 $mask $gender 'mask-1'
  Export-Part 'shapes.png' (($column+2)/4) 0.35 (($column+3)/4) 0.65 @(145,72,224,140) $gender 'headwear-3'
  $hair=if($gender -eq 'male'){@(155,87,202,185)}else{@(151,89,210,200)}
  Export-Part 'shapes.png' ($column/4) 0.65 (($column+1)/4) 1 $hair $gender 'hair-7'
  if($gender -eq 'female'){$empty=[System.Drawing.Bitmap]::new(512,832);$empty.Save((Join-Path $destination 'hairBack-7.png'),[System.Drawing.Imaging.ImageFormat]::Png);$empty.Dispose()}
  $file="$gender-expressions.png"
  $cuts=@(0,0.25,0.515,0.75,1)
  $eyes=if($gender -eq 'male'){@(204,212,105,35)}else{@(201,214,105,33)}
  for($i=0;$i -lt 4;$i++) {Export-Part $file $cuts[$i] 0 $cuts[$i+1] 0.4 $eyes $gender "eyes-$($i+4)"}
  $laugh=if($gender -eq 'male'){@(225,282,62,30)}else{@(228,281,56,29)}
  Export-Part $file 0 0.4 0.25 0.7 $laugh $gender 'mouth-4'
  $mouth=if($gender -eq 'male'){@(231,289,50,16)}else{@(232,288,48,15)}
  Export-Part $file 0.25 0.4 0.515 0.7 $mouth $gender 'mouth-5'
  Export-Part $file 0.515 0.4 0.75 0.7 $mouth $gender 'mouth-6'
  Export-Part $file 0 0.7 0.25 1 @(205,172,102,26) $gender 'forehead-1'
  Export-Part $file 0.25 0.7 0.515 1 @(211,266,90,49) $gender 'mouthLines-1'
  Export-Part $file 0.515 0.7 0.6325 1 @(188,229,17,21) $gender 'eyeWrinkles-left'
  Export-Part $file 0.6325 0.7 0.75 1 @(307,229,17,21) $gender 'eyeWrinkles-right'
  $combined=[System.Drawing.Bitmap]::new(512,832);$graphics=[System.Drawing.Graphics]::FromImage($combined)
  foreach($side in @('left','right')){$partPath=Join-Path $destination "eyeWrinkles-$side.png";$partImage=[System.Drawing.Bitmap]::new($partPath);$graphics.DrawImageUnscaled($partImage,0,0);$partImage.Dispose();Move-Item -LiteralPath $partPath -Destination (Join-Path $sources "$gender-eyeWrinkles-$side.png") -Force}
  $graphics.Dispose();$combined.Save((Join-Path $destination 'eyeWrinkles-1.png'),[System.Drawing.Imaging.ImageFormat]::Png);$combined.Dispose()
}
Write-Output "Prepared portrait v10 layers in $root"
