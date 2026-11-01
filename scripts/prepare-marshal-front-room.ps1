$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sources=Join-Path $project 'app/assets/portraits/modular/sources/v12'
$previous=Get-Content (Join-Path $PSScriptRoot 'prepare-portrait-layers-v9.ps1') -Raw
$compiler=[regex]::Match($previous,"(?s)TypeDefinition @'\r?\n(.*?)\r?\n'@").Groups[1].Value.Replace('PortraitV9Compiler','MarshalFrontCompiler')
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition $compiler
$neutral=Get-Content (Join-Path $PSScriptRoot 'prepare-portrait-layers-v11.ps1') -Raw
$compiler=[regex]::Match($neutral,"(?s)Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'\r?\n(.*?)\r?\n'@").Groups[1].Value
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition $compiler
$image=[Drawing.Bitmap]::new((Join-Path $sources 'marshal-hair-front.png'))
$region=[Drawing.Rectangle]::new(0,0,$image.Width,$image.Height);$image.Dispose()
[MarshalFrontCompiler]::Extract((Join-Path $sources 'marshal-hair-front.png'),$region,[Drawing.Rectangle]::new(155,90,202,150),(Join-Path $sources 'marshal-hair-front-fit.png'))
[PortraitNeutral]::Convert((Join-Path $sources 'marshal-hair-front-fit.png'),(Join-Path $project 'app/assets/portraits/modular/v12/male/hair-8-front.png'))
$image=[Drawing.Bitmap]::new((Join-Path $sources 'marshal-room.png'))
$final=[Drawing.Bitmap]::new(512,640,[Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g=[Drawing.Graphics]::FromImage($final);$g.InterpolationMode=[Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($image,[Drawing.Rectangle]::new(0,0,512,640));$g.Dispose();$image.Dispose()
$final.Save((Join-Path $project 'app/assets/portraits/modular/v1/background-marshal-room.png'),[Drawing.Imaging.ImageFormat]::Png);$final.Dispose()
