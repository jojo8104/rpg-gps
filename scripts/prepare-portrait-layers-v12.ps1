$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$previous=Get-Content (Join-Path $PSScriptRoot 'prepare-portrait-layers-v9.ps1') -Raw
$compiler=[regex]::Match($previous,"(?s)TypeDefinition @'\r?\n(.*?)\r?\n'@").Groups[1].Value.Replace('PortraitV9Compiler','PortraitV12Compiler')
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition $compiler
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$root=Join-Path $project 'app/assets/portraits/modular/v12'
$sources=Join-Path $project 'app/assets/portraits/modular/sources/v12'
foreach($gender in @('male','female')) {
 $destination=Join-Path $root $gender
 New-Item -ItemType Directory -Force $destination | Out-Null
 Copy-Item (Join-Path $project "app/assets/portraits/modular/v11/$gender/*.png") $destination -Force
 $helmet=[Drawing.Bitmap]::new((Join-Path $destination 'headwear-1.png'))
 $lower=[Drawing.Bitmap]::new(512,832);$g=[Drawing.Graphics]::FromImage($lower);$g.DrawImageUnscaled($helmet,0,20);$g.Dispose();$helmet.Dispose();$lower.Save((Join-Path $destination 'headwear-1.png'),[Drawing.Imaging.ImageFormat]::Png);$lower.Dispose()
 $source=Join-Path $sources "$gender-soldier.png";$image=[Drawing.Bitmap]::new($source)
 # The male source has detached noise in the unused head region; exclude it before connected-component extraction.
 $top=if($gender -eq 'male'){[int]($image.Height*0.29)}else{0}
 $region=[Drawing.Rectangle]::new(0,$top,$image.Width,$image.Height-$top);$image.Dispose()
 $outfit=Join-Path $sources "$gender-clothing-full-9.png"
 [PortraitV12Compiler]::Extract($source,$region,[Drawing.Rectangle]::new(16,320,480,480),$outfit)
 $split=Join-Path $sources "$gender-split";New-Item -ItemType Directory -Force $split | Out-Null
 [PortraitV12Compiler]::SplitBrigand($outfit,(Join-Path $destination 'body-0.png'),$split)
 foreach($part in @('body','clothing','clothingBack')){Copy-Item (Join-Path $split "$part-8.png") (Join-Path $destination "$part-9.png") -Force}
 $source=Join-Path $sources "$gender-barbarian.png";$image=[Drawing.Bitmap]::new($source)
 $region=[Drawing.Rectangle]::new(0,0,$image.Width,$image.Height);$image.Dispose()
 $outfit=Join-Path $sources "$gender-clothing-full-10.png"
 [PortraitV12Compiler]::Extract($source,$region,[Drawing.Rectangle]::new(16,320,480,480),$outfit)
 [PortraitV12Compiler]::SplitBrigand($outfit,(Join-Path $destination 'body-0.png'),$split)
 foreach($part in @('body','clothing','clothingBack')){Copy-Item (Join-Path $split "$part-8.png") (Join-Path $destination "$part-10.png") -Force}
 $source=Join-Path $sources 'miner-helmet.png';$image=[Drawing.Bitmap]::new($source);$region=[Drawing.Rectangle]::new(0,0,$image.Width,$image.Height);$image.Dispose()
 [PortraitV12Compiler]::Extract($source,$region,[Drawing.Rectangle]::new(146,92,220,139),(Join-Path $destination 'headwear-4.png'))
}
$source=Join-Path $sources 'long-beard.png';$image=[Drawing.Bitmap]::new($source);$region=[Drawing.Rectangle]::new(0,0,$image.Width,$image.Height);$image.Dispose()
[PortraitV12Compiler]::Extract($source,$region,[Drawing.Rectangle]::new(182,255,148,205),(Join-Path $root 'male/accessory-7.png'))
$neutralSource=Get-Content (Join-Path $PSScriptRoot 'prepare-portrait-layers-v11.ps1') -Raw
$neutralCompiler=[regex]::Match($neutralSource,"(?s)Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'\r?\n(.*?)\r?\n'@").Groups[1].Value
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition $neutralCompiler
[PortraitNeutral]::Convert((Join-Path $root 'male/accessory-7.png'),(Join-Path $sources 'neutral-long-beard.png'))
Copy-Item (Join-Path $sources 'neutral-long-beard.png') (Join-Path $root 'male/accessory-7.png') -Force
