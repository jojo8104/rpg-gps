param([ValidateSet('v3','v4')][string]$Version = 'v3', [switch]$Anatomy)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Collections.Generic;
public static class PortraitIslands {
  public static void Clean(string path) {
    using (var source = new Bitmap(path)) {
      int w=source.Width, h=source.Height, n=w*h;
      var seen=new bool[n]; var keep=new List<int>();
      for(int seed=0; seed<n; seed++) {
        if(seen[seed] || source.GetPixel(seed%w,seed/w).A<8) continue;
        var component=new List<int>(); var queue=new Queue<int>();
        queue.Enqueue(seed); seen[seed]=true;
        while(queue.Count>0) {
          int p=queue.Dequeue(); component.Add(p); int x=p%w,y=p/w;
          for(int dy=-1;dy<=1;dy++) for(int dx=-1;dx<=1;dx++) {
            int nx=x+dx,ny=y+dy;
            if(nx<0||nx>=w||ny<0||ny>=h) continue;
            int q=ny*w+nx;
            if(!seen[q]&&source.GetPixel(nx,ny).A>=8) {seen[q]=true;queue.Enqueue(q);}
          }
        }
        if(component.Count>keep.Count) keep=component;
      }
      var retained=new bool[n]; foreach(int p in keep) retained[p]=true;
      using(var output=new Bitmap(w,h)) {
        for(int y=0;y<h;y++) for(int x=0;x<w;x++)
          if(retained[y*w+x]) output.SetPixel(x,y,source.GetPixel(x,y));
        source.Dispose(); output.Save(path,System.Drawing.Imaging.ImageFormat.Png);
      }
    }
  }
}
'@
$root = Join-Path $PSScriptRoot "../app/assets/portraits/modular/$Version"
foreach ($gender in @('male','female')) {
  for ($index=0; $index -lt 8; $index++) {
    [PortraitIslands]::Clean([System.IO.Path]::GetFullPath((Join-Path $root "$gender/clothing-$index.png")))
  }
  if ($Anatomy) { foreach ($part in @('face-0','neck-0')) { [PortraitIslands]::Clean([System.IO.Path]::GetFullPath((Join-Path $root "$gender/$part.png"))) } }
}
