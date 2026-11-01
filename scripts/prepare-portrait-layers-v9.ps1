param([string]$SourceRoot='app/assets/portraits/modular/sources/v9')
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Drawing2D;
using System.Collections.Generic;
public static class PortraitV9Compiler {
  public static void Extract(string path, Rectangle region, Rectangle target, string output) {
    using(var atlas=new Bitmap(path)) using(var cell=atlas.Clone(region,PixelFormat.Format32bppArgb)) {
      int w=cell.Width,h=cell.Height;var seen=new bool[w*h];var components=new List<List<int>>();int largest=0;
      for(int seed=0;seed<w*h;seed++) {
        if(seen[seed]||cell.GetPixel(seed%w,seed/w).A<180)continue;
        var component=new List<int>();var queue=new Queue<int>();seen[seed]=true;queue.Enqueue(seed);
        while(queue.Count>0){int p=queue.Dequeue();component.Add(p);int x=p%w,y=p/w;
          for(int dy=-1;dy<=1;dy++)for(int dx=-1;dx<=1;dx++){int nx=x+dx,ny=y+dy;if(nx<0||nx>=w||ny<0||ny>=h)continue;int q=ny*w+nx;if(!seen[q]&&cell.GetPixel(nx,ny).A>=180){seen[q]=true;queue.Enqueue(q);}}
        }
        largest=Math.Max(largest,component.Count);components.Add(component);
      }
      var keep=new bool[w*h];int left=w,top=h,right=-1,bottom=-1;
      foreach(var component in components)if(component.Count>=Math.Max(12,largest*0.002))foreach(int p in component){int x=p%w,y=p/w;
        for(int dy=-2;dy<=2;dy++)for(int dx=-2;dx<=2;dx++){int nx=x+dx,ny=y+dy;if(nx>=0&&nx<w&&ny>=0&&ny<h){keep[ny*w+nx]=true;left=Math.Min(left,nx);right=Math.Max(right,nx);top=Math.Min(top,ny);bottom=Math.Max(bottom,ny);}}
      }
      if(right<left)throw new Exception("Empty sprite: "+output);
      using(var cleaned=new Bitmap(w,h))using(var final=new Bitmap(512,832)) {
        for(int y=0;y<h;y++)for(int x=0;x<w;x++)if(keep[y*w+x])cleaned.SetPixel(x,y,cell.GetPixel(x,y));
        using(var g=Graphics.FromImage(final)){g.InterpolationMode=InterpolationMode.HighQualityBicubic;g.DrawImage(cleaned,target,new Rectangle(left,top,right-left+1,bottom-top+1),GraphicsUnit.Pixel);}
        final.Save(output,ImageFormat.Png);
      }
    }
  }
  public static void SplitBrigand(string outfitPath,string bodyPath,string destination) {
    using(var outfit=new Bitmap(outfitPath))using(var sourceBody=new Bitmap(bodyPath))using(var front=new Bitmap(512,832))using(var back=new Bitmap(512,832))using(var body=new Bitmap(512,832))using(var neck=new GraphicsPath()) {
      neck.AddPolygon(new PointF[]{new PointF(224,285),new PointF(288,285),new PointF(288,332),new PointF(284,342),new PointF(274,349),new PointF(256,353),new PointF(238,349),new PointF(228,342),new PointF(224,332)});
      using(var opening=new GraphicsPath()) {
      opening.AddPolygon(new PointF[]{new PointF(224,320),new PointF(288,320),new PointF(284,365),new PointF(270,397),new PointF(256,407),new PointF(242,397),new PointF(228,365)});
      for(int y=0;y<832;y++) {int left=512,right=-1;
        for(int x=0;x<512;x++){var p=outfit.GetPixel(x,y);if(p.A>40){left=Math.Min(left,x);right=Math.Max(right,x);}if(neck.IsVisible(x,y)||(opening.IsVisible(x,y)&&p.R<110&&p.G<95&&p.B<80))back.SetPixel(x,y,p);else front.SetPixel(x,y,p);}
        for(int x=0;x<512;x++)if(y<348||(x>left+2&&x<right-2))body.SetPixel(x,y,sourceBody.GetPixel(x,y));
      }
      front.Save(System.IO.Path.Combine(destination,"clothing-8.png"),ImageFormat.Png);back.Save(System.IO.Path.Combine(destination,"clothingBack-8.png"),ImageFormat.Png);body.Save(System.IO.Path.Combine(destination,"body-8.png"),ImageFormat.Png);
      }
    }
  }
}
'@
$project=[System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sources=Join-Path $project $SourceRoot
$root=Join-Path $project 'app/assets/portraits/modular/v9'
function Export-Part($file,$x0,$y0,$x1,$y1,$target,$gender,$part) {
  $path=Join-Path $sources $file
  $image=[System.Drawing.Bitmap]::new($path)
  $left=[int][Math]::Floor($image.Width*$x0);$right=[int][Math]::Floor($image.Width*$x1)
  $top=[int][Math]::Floor($image.Height*$y0);$bottom=[int][Math]::Floor($image.Height*$y1)
  $image.Dispose()
  [PortraitV9Compiler]::Extract($path,[System.Drawing.Rectangle]::new($left,$top,$right-$left,$bottom-$top),[System.Drawing.Rectangle]::new($target[0],$target[1],$target[2],$target[3]),(Join-Path $root "$gender/$part.png"))
}
foreach($gender in @('male','female')) {
  $destination=Join-Path $root $gender
  New-Item -ItemType Directory -Force -Path $destination | Out-Null
  Copy-Item (Join-Path $project "app/assets/portraits/modular/v8/$gender/*.png") $destination -Force
  $file="$gender-features.png"
  $face=if($gender -eq 'male'){@(163,98,185,228)}else{@(164,103,184,215)}
  Export-Part $file 0 0 0.25 0.42 $face $gender 'face-1'
  $eyes=if($gender -eq 'male'){@(204,215,105,31)}else{@(201,217,105,30)}
  Export-Part $file 0.25 0 0.5 0.42 $eyes $gender 'eyes-2'
  Export-Part $file 0.5 0 0.75 0.42 $eyes $gender 'eyes-3'
  $nose=if($gender -eq 'male'){@(245,252,21,29)}else{@(247,253,18,25)}
  Export-Part $file 0.75 0 1 0.42 $nose $gender 'nose-2'
  Export-Part $file 0 0.42 0.25 0.62 $nose $gender 'nose-3'
  $mouth=if($gender -eq 'male'){@(232,289,48,14)}else{@(235,288,42,12)}
  Export-Part $file 0.25 0.42 0.5 0.62 $mouth $gender 'mouth-2'
  Export-Part $file 0.5 0.42 0.75 0.62 $mouth $gender 'mouth-3'
  $hairColumns=if($gender -eq 'male'){3}else{4}
  for($i=0;$i -lt 3;$i++) {
    $target=if($gender -eq 'male'){@(155,87,202,185)}elseif($i -eq 0){@(151,88,210,215)}elseif($i -eq 1){@(156,84,200,190)}else{@(158,90,196,175)}
    $hairLeft=$i/$hairColumns;$hairRight=($i+1)/$hairColumns
    if($gender -eq 'female'){$hairCuts=@(0,0.29,0.54,0.82);$hairLeft=$hairCuts[$i];$hairRight=$hairCuts[$i+1]}
    Export-Part $file $hairLeft 0.62 $hairRight 1 $target $gender "hair-$($i+4)"
    if($gender -eq 'female'){$empty=[System.Drawing.Bitmap]::new(512,832);$empty.Save((Join-Path $destination "hairBack-$($i+4).png"),[System.Drawing.Imaging.ImageFormat]::Png);$empty.Dispose()}
  }
  $cuts=@(0,0.27,0.51,0.75,1)
  $column=if($gender -eq 'male'){0}else{1}
  Export-Part 'equipment.png' $cuts[$column] 0 $cuts[$column+1] 0.64 @(16,320,480,480) $gender 'clothing-full-8'
  [PortraitV9Compiler]::SplitBrigand((Join-Path $destination 'clothing-full-8.png'),(Join-Path $destination 'body-0.png'),$destination)
  Move-Item -LiteralPath (Join-Path $destination 'clothing-full-8.png') -Destination (Join-Path $sources "$gender-clothing-full-8.png") -Force
  $column=if($gender -eq 'male'){2}else{3}
  Export-Part 'equipment.png' $cuts[$column] 0 $cuts[$column+1] 0.64 @(146,72,220,139) $gender 'headwear-1'
  $column=if($gender -eq 'male'){0}else{1}
  $target=if($gender -eq 'male'){@(150,80,212,110)}else{@(169,100,174,80)}
  Export-Part 'equipment.png' $cuts[$column] 0.64 $cuts[$column+1] 1 $target $gender 'headwear-2'
  $column=if($gender -eq 'male'){2}else{3}
  Export-Part 'equipment.png' $cuts[$column] 0.64 $cuts[$column+1] 1 @(193,220,126,31) $gender 'glasses-1'
  $row=if($gender -eq 'male'){0}else{1}
  for($i=0;$i -lt 3;$i++) {
    $width=@(42,84,86)[$i]
    Export-Part 'accessories.png' ($i/4) ($row/2) (($i+1)/4) (($row+1)/2) @((440-[int]($width/2)),120,$width,680) $gender "prop-$($i+1)"
  }
}
Export-Part 'accessories.png' 0.75 0 1 0.5 @(196,264,120,80) 'male' 'accessory-5'
Export-Part 'accessories.png' 0.75 0.5 1 1 @(207,271,98,73) 'male' 'accessory-6'
Write-Output "Prepared portrait v9 layers in $root"
