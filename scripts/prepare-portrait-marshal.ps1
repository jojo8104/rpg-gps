$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$previous=Get-Content (Join-Path $PSScriptRoot 'prepare-portrait-layers-v9.ps1') -Raw
$compiler=[regex]::Match($previous,"(?s)TypeDefinition @'\r?\n(.*?)\r?\n'@").Groups[1].Value.Replace('PortraitV9Compiler','PortraitMarshalCompiler')
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition $compiler
$neutralSource=Get-Content (Join-Path $PSScriptRoot 'prepare-portrait-layers-v11.ps1') -Raw
$neutralCompiler=[regex]::Match($neutralSource,"(?s)Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'\r?\n(.*?)\r?\n'@").Groups[1].Value
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition $neutralCompiler
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$root=Join-Path $project 'app/assets/portraits/modular/v12/male'
$sources=Join-Path $project 'app/assets/portraits/modular/sources/v12'
foreach($part in @('outfit','hair')) {
 $source=Join-Path $sources "marshal-$part.png";$image=[Drawing.Bitmap]::new($source)
 $region=[Drawing.Rectangle]::new(0,0,$image.Width,$image.Height);$image.Dispose()
 $target=if($part -eq 'outfit'){[Drawing.Rectangle]::new(16,320,480,480)}else{[Drawing.Rectangle]::new(155,90,202,150)}
 [PortraitMarshalCompiler]::Extract($source,$region,$target,(Join-Path $sources "marshal-$part-fit.png"))
}
$split=Join-Path $sources 'marshal-split';New-Item -ItemType Directory -Force $split | Out-Null
[PortraitMarshalCompiler]::SplitBrigand((Join-Path $sources 'marshal-outfit-fit.png'),(Join-Path $root 'body-0.png'),$split)
foreach($part in @('body','clothing','clothingBack')){Copy-Item (Join-Path $split "$part-8.png") (Join-Path $root "$part-11.png") -Force}
[PortraitNeutral]::Convert((Join-Path $sources 'marshal-hair-fit.png'),(Join-Path $root 'hair-8.png'))
[PortraitNeutral]::Convert((Join-Path $root 'accessory-7.png'),(Join-Path $sources 'neutral-long-beard.png'))
Copy-Item (Join-Path $sources 'neutral-long-beard.png') (Join-Path $root 'accessory-7.png') -Force
