param([Parameter(Mandatory=$true)][string]$BodyAtlas,[Parameter(Mandatory=$true)][string]$MaleClothingAtlas,[Parameter(Mandatory=$true)][string]$FemaleClothingAtlas)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'prepare-portrait-assets.ps1')
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
public static class PortraitV7Compiler {
  public static Bitmap Largest(Bitmap source) {
    int w=source.Width,h=source.Height;
    var seen=new bool[w*h];var keep=new System.Collections.Generic.List<int>();
    for(int seed=0;seed<w*h;seed++) {
      if(seen[seed]||source.GetPixel(seed%w,seed/w).A<180)continue;
      var component=new System.Collections.Generic.List<int>();var queue=new System.Collections.Generic.Queue<int>();
      seen[seed]=true;queue.Enqueue(seed);
      while(queue.Count>0) {
        int p=queue.Dequeue();component.Add(p);int x=p%w,y=p/w;
        for(int dy=-1;dy<=1;dy++)for(int dx=-1;dx<=1;dx++) {
          int nx=x+dx,ny=y+dy;if(nx<0||nx>=w||ny<0||ny>=h)continue;
          int q=ny*w+nx;if(!seen[q]&&source.GetPixel(nx,ny).A>=180){seen[q]=true;queue.Enqueue(q);}
        }
      }
      if(component.Count>keep.Count)keep=component;
    }
    var retained=new bool[w*h];foreach(int p in keep){int x=p%w,y=p/w;for(int dy=-2;dy<=2;dy++)for(int dx=-2;dx<=2;dx++){int nx=x+dx,ny=y+dy;if(nx>=0&&nx<w&&ny>=0&&ny<h)retained[ny*w+nx]=true;}}
    var result=new Bitmap(w,h);for(int y=0;y<h;y++)for(int x=0;x<w;x++)if(retained[y*w+x])result.SetPixel(x,y,source.GetPixel(x,y));return result;
  }
  public static void Split(Bitmap clothing, Bitmap fullBody, GraphicsPath neck, int envelopeY, string destination, int index) {
    using(var front=new Bitmap(512,832)) using(var back=new Bitmap(512,832)) using(var body=new Bitmap(512,832)) {
      for(int y=285;y<832;y++) {
        int minX=512,maxX=-1;
        for(int x=0;x<512;x++) {
          Color pixel=clothing.GetPixel(x,y);
          if(pixel.A>40){minX=System.Math.Min(minX,x);maxX=System.Math.Max(maxX,x);}
          if(neck.IsVisible(x,y))back.SetPixel(x,y,pixel);else front.SetPixel(x,y,pixel);
        }
        if(y<525)for(int x=0;x<512;x++)if(y<envelopeY||(x>minX+2&&x<maxX-2))body.SetPixel(x,y,fullBody.GetPixel(x,y));
      }
      front.Save(System.IO.Path.Combine(destination,"clothing-"+index+".png"),ImageFormat.Png);
      back.Save(System.IO.Path.Combine(destination,"clothingBack-"+index+".png"),ImageFormat.Png);
      body.Save(System.IO.Path.Combine(destination,"body-"+index+".png"),ImageFormat.Png);
    }
  }
}
'@
$root=[System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../app/assets/portraits/modular'))
$layout=Get-Content -LiteralPath (Join-Path $root 'v7/layout.json') -Raw | ConvertFrom-Json
$sources=Join-Path $root 'sources/v7'
New-Item -ItemType Directory -Force -Path $sources | Out-Null
function Save-Source($source,$name) {$saved=Join-Path $sources $name;if((Resolve-Path -LiteralPath $source).Path -ne $saved){Copy-Item -LiteralPath $source -Destination $saved -Force}}
Save-Source $BodyAtlas 'body-atlas-v7.png'
Save-Source $MaleClothingAtlas 'male-clothing-atlas-v7.png'
Save-Source $FemaleClothingAtlas 'female-clothing-atlas-v7.png'
$bodies=[System.Drawing.Bitmap]::new((Resolve-Path -LiteralPath $BodyAtlas).Path)
$neck=[System.Drawing.Drawing2D.GraphicsPath]::new()
$neck.AddPolygon([System.Drawing.PointF[]]@($layout.neckProtectedPolygon | ForEach-Object{[System.Drawing.PointF]::new($_[0],$_[1])}))
foreach($gender in @('male','female')) {
  $destination=Join-Path $root "v7/$gender"
  New-Item -ItemType Directory -Force -Path $destination | Out-Null
  foreach($file in Get-ChildItem -LiteralPath (Join-Path $root "v6/$gender") -Filter '*.png') {
    if($file.Name -like 'clothing-*' -or $file.Name -like 'body-*' -or $file.Name -like 'neck-*'){continue}
    Copy-Item -LiteralPath $file.FullName -Destination $destination -Force
  }
  $bodyLeft=if($gender -eq 'male'){0}else{$layout.bodyAtlasSplitX}
  $bodyWidth=if($gender -eq 'male'){$layout.bodyAtlasSplitX}else{$bodies.Width-$layout.bodyAtlasSplitX}
  $bodyCell=$bodies.Clone([System.Drawing.Rectangle]::new($bodyLeft,0,$bodyWidth,$bodies.Height),[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $bodySource=[PortraitV7Compiler]::Largest($bodyCell);$bodyCell.Dispose()
  $bounds=Get-PartBounds $bodySource 0 0 1 1
  $fullBodyPath=Join-Path $sources "$gender-body-full.png"
  $neckY=$bounds.Top+[int]($bounds.Height*0.1);$neckLeft=$bodySource.Width;$neckRight=0
  for($x=0;$x -lt $bodySource.Width;$x++){if($bodySource.GetPixel($x,$neckY).A -ge 200){$neckLeft=[Math]::Min($neckLeft,$x);$neckRight=[Math]::Max($neckRight,$x)}}
  $target=@($layout.bodyTarget.$gender)
  $target[0]=[int][Math]::Round(256-((($neckLeft+$neckRight)/2-$bounds.Left)/$bounds.Width)*$target[2])
  Export-ImageRect $bodySource $bounds $fullBodyPath 512 832 $target
  $bodySource.Dispose()
  $fullBody=[System.Drawing.Bitmap]::new($fullBodyPath)
  $clothingPath=if($gender -eq 'male'){$MaleClothingAtlas}else{$FemaleClothingAtlas}
  $atlas=[System.Drawing.Bitmap]::new((Resolve-Path -LiteralPath $clothingPath).Path)
  for($index=0;$index -lt 8;$index++) {
    $column=$index%4;$row=[int][Math]::Floor($index/4)
    $cellLeft=[int][Math]::Floor($column*$atlas.Width/4);$cellRight=[int][Math]::Floor(($column+1)*$atlas.Width/4)
    $cellTop=[int][Math]::Floor($row*$atlas.Height/2);$cellBottom=[int][Math]::Floor(($row+1)*$atlas.Height/2)
    $cell=$atlas.Clone([System.Drawing.Rectangle]::new($cellLeft,$cellTop,($cellRight-$cellLeft),($cellBottom-$cellTop)),[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    if($gender -eq 'female' -and $index -eq 3) {
      # Le bord de la cape verte voisine entre dans cette cellule ; retirer ce fragment de gouttiere.
      for($y=[int]($cell.Height*0.5);$y -lt $cell.Height;$y++){for($x=0;$x -lt [int]($cell.Width*0.12);$x++){$pixel=$cell.GetPixel($x,$y);if($pixel.G -gt $pixel.R+3 -and $pixel.G -gt $pixel.B+5){$cell.SetPixel($x,$y,[System.Drawing.Color]::Transparent)}}}
    }
    $cleaned=[PortraitV7Compiler]::Largest($cell);$cell.Dispose()
    $bounds=Get-PartBounds $cleaned 0 0 1 1
    $left=0;$right=$cleaned.Width
    # Les capes peuvent atteindre le bord au niveau de l'ourlet ; les epaules restent entieres.
    for($y=$bounds.Top;$y -lt ($bounds.Top+[int]($bounds.Height*0.4));$y++) {
      if($cleaned.GetPixel($left,$y).A -gt 200 -or $cleaned.GetPixel(($right-1),$y).A -gt 200){throw "Epaule au bord de cellule : $gender/$index"}
    }
    $fullClothingPath=Join-Path $sources "$gender-clothing-$index.png"
    Export-ImageRect $cleaned $bounds $fullClothingPath 512 832 $layout.clothingTarget
    $cleaned.Dispose()
    $clothing=[System.Drawing.Bitmap]::new($fullClothingPath)
    [PortraitV7Compiler]::Split($clothing,$fullBody,$neck,$layout.bodyEnvelopeFromY,$destination,$index)
    $clothing.Dispose()
  }
  $fullBody.Dispose();$atlas.Dispose()
}
$neck.Dispose();$bodies.Dispose()
