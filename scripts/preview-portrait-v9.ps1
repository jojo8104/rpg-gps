param([string]$OutputPath='app/assets/portraits/modular/v9/assembly-check.png',[string]$ManifestPath='output/portraits/v9-assemblies.json')
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System.Drawing;using System.Drawing.Imaging;using System.Runtime.InteropServices;
public static class PortraitProofTint {
 public static void Apply(Bitmap image,int[] table) {
 var data=image.LockBits(new Rectangle(0,0,image.Width,image.Height),ImageLockMode.ReadWrite,PixelFormat.Format32bppArgb);
 var bytes=new byte[data.Stride*image.Height];Marshal.Copy(data.Scan0,bytes,0,bytes.Length);
 for(int i=0;i<bytes.Length;i+=4){int index=bytes[i+2]*3;bytes[i+2]=(byte)table[index];bytes[i+1]=(byte)table[index+1];bytes[i]=(byte)table[index+2];}
 Marshal.Copy(bytes,0,data.Scan0,bytes.Length);image.UnlockBits(data);
 }
}
'@
$project=[System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$examples=Get-Content (Join-Path $project $ManifestPath) -Raw | ConvertFrom-Json
$canvas=[System.Drawing.Bitmap]::new(([Math]::Min(4,$examples.Count)*320),([int][Math]::Ceiling($examples.Count/4)*440))
$graphics=[System.Drawing.Graphics]::FromImage($canvas)
$graphics.Clear([System.Drawing.Color]::FromArgb(238,224,191))
$font=[System.Drawing.Font]::new('Arial',11)
$brush=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(42,37,31))
for($i=0;$i -lt $examples.Count;$i++) {
  $example=$examples[$i];$column=$i%4;$row=[int][Math]::Floor($i/4)
  if($example.backgroundPath) {
    $background=[Drawing.Bitmap]::new((Join-Path $project "app/$($example.backgroundPath)"))
    $graphics.DrawImage($background,[Drawing.Rectangle]::new($column*320,$row*440+22,320,416),[Drawing.Rectangle]::new(10,0,492,640),[Drawing.GraphicsUnit]::Pixel)
    $background.Dispose()
  }
  $outfit=[int]($example.appearance.clothing.Split('-')[-1])
  foreach($layer in $example.layers) {
    $localScale=1;$offsetX=0;$offsetY=0
    if($layer.part -in @('clothing','clothingBack')) {
      if($example.gender -eq 'male' -and $outfit -in @(0,1,2,5,7)){$localScale=1.15}
      if($example.gender -eq 'female') {
        if($outfit -eq 0){$offsetX=-5}
        if($outfit -in @(3,5)){$localScale=0.9;$offsetX=-3;$offsetY=-12}
        if($outfit -eq 4){$offsetY=-15}
        if($outfit -eq 7){$offsetY=16}
      }
    }
    $blockPercent=if($layer.block -eq 'head'){$example.proportions.headPercent}else{$example.proportions.bodyPercent}
    $drawWidth=[single](256*$blockPercent/100*$localScale)
    $drawX=[single]($column*320+(320-$drawWidth)/2+$offsetX/2*$blockPercent/100)
    $drawY=[single]($row*440+22+$offsetY/2)
    $image=[System.Drawing.Bitmap]::new((Join-Path $project "app/$($layer.path)"))
    if($layer.lookup) {
      $table=[int[]]@($layer.lookup | ForEach-Object {foreach($channel in $_){[int]$channel}})
      [PortraitProofTint]::Apply($image,$table)
    }
    if($layer.part -in @('hair','hairBack') -and $example.appearance.headwear -match '-headwear-(1|4)$') {
      $hairGraphics=[Drawing.Graphics]::FromImage($image)
      $hairGraphics.CompositingMode=[Drawing.Drawing2D.CompositingMode]::SourceCopy
      $hairGraphics.FillRectangle([Drawing.Brushes]::Transparent,0,0,512,117)
      $hairGraphics.Dispose()
    }
    $attributes=[System.Drawing.Imaging.ImageAttributes]::new()
    $matrix=[System.Drawing.Imaging.ColorMatrix]::new()
    if($layer.part -eq 'accessory' -and $example.beard){$matrix.Matrix33=[single]($example.appearance.beardOpacity/100)}
    $attributes.SetColorMatrix($matrix)
    $destination=[System.Drawing.PointF[]]@([System.Drawing.PointF]::new($drawX,$drawY),[System.Drawing.PointF]::new($drawX+$drawWidth,$drawY),[System.Drawing.PointF]::new($drawX,$drawY+416))
    $graphics.DrawImage($image,$destination,[System.Drawing.RectangleF]::new(0,0,512,832),[System.Drawing.GraphicsUnit]::Pixel,$attributes)
    $attributes.Dispose();$image.Dispose()
  }
  $caption="$($example.gender) $($example.index+1) / $($example.appearance.widthPercent)%"
  $graphics.DrawString($caption,$font,$brush,[single]($column*320+70),[single]($row*440+3))
}
$canvas.Save((Join-Path $project $OutputPath),[System.Drawing.Imaging.ImageFormat]::Png)
$brush.Dispose();$font.Dispose();$graphics.Dispose();$canvas.Dispose()
Write-Output (Join-Path $project $OutputPath)
