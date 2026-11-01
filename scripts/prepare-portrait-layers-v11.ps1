$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$previous=Get-Content (Join-Path $PSScriptRoot 'prepare-portrait-layers-v9.ps1') -Raw
$compiler=[regex]::Match($previous,"(?s)TypeDefinition @'\r?\n(.*?)\r?\n'@").Groups[1].Value.Replace('PortraitV9Compiler','PortraitV11Compiler')
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition $compiler
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System; using System.Drawing; using System.Drawing.Imaging; using System.Runtime.InteropServices;
public static class PortraitNeutral {
 public static void Convert(string input,string output) {
 using(var b=new Bitmap(input)) {
 var rect=new Rectangle(0,0,b.Width,b.Height); var data=b.LockBits(rect,ImageLockMode.ReadWrite,PixelFormat.Format32bppArgb);
 var bytes=new byte[data.Stride*b.Height];Marshal.Copy(data.Scan0,bytes,0,bytes.Length);
 int[] histogram=new int[256]; int count=0;
 for(int i=0;i<bytes.Length;i+=4) if(bytes[i+3]>180){histogram[(int)Math.Round(.2126*bytes[i+2]+.7152*bytes[i+1]+.0722*bytes[i])]++; count++;}
 int low=0,high=255,sum=0;
 for(int j=0;j<256;j++){sum+=histogram[j];if(sum>=count*.02){low=j;break;}}
 sum=0;for(int j=255;j>=0;j--){sum+=histogram[j];if(sum>=count*.02){high=j;break;}}
 for(int i=0;i<bytes.Length;i+=4){double l=.2126*bytes[i+2]+.7152*bytes[i+1]+.0722*bytes[i];byte v=(byte)Math.Max(16,Math.Min(230,16+(l-low)*214/Math.Max(1,high-low)));bytes[i]=bytes[i+1]=bytes[i+2]=v;}
 Marshal.Copy(bytes,0,data.Scan0,bytes.Length);b.UnlockBits(data);b.Save(output,ImageFormat.Png);
 }}
}
'@
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$root=Join-Path $project 'app/assets/portraits/modular/v11'
$source=Join-Path $project 'app/assets/portraits/modular/sources/v11/headwear.png'
foreach($gender in @('male','female')) {
 $destination=Join-Path $root $gender
 New-Item -ItemType Directory -Force $destination | Out-Null
 Copy-Item (Join-Path $project "app/assets/portraits/modular/v10/$gender/*.png") $destination -Force
 foreach($file in Get-ChildItem (Join-Path $project "app/assets/portraits/modular/v10/$gender") -Filter '*.png') {
 if($file.Name -match '^hair(Back)?-' -or ($gender -eq 'male' -and $file.Name -match '^accessory-(1|5|6)\.png$')) {[PortraitNeutral]::Convert($file.FullName,(Join-Path $destination $file.Name))}
 }
 $column=if($gender -eq 'male'){0}else{768}
 [PortraitV11Compiler]::Extract($source,[Drawing.Rectangle]::new($column,0,768,560),[Drawing.Rectangle]::new(146,72,220,139),(Join-Path $destination 'headwear-1.png'))
}
[PortraitV11Compiler]::Extract($source,[Drawing.Rectangle]::new(0,560,768,464),[Drawing.Rectangle]::new(150,80,212,110),(Join-Path $root 'male/headwear-2.png'))
[PortraitV11Compiler]::Extract($source,[Drawing.Rectangle]::new(768,560,768,464),[Drawing.Rectangle]::new(169,100,174,80),(Join-Path $root 'female/headwear-2.png'))
