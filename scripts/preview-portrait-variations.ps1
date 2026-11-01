param([string]$OutputPath='app/assets/portraits/modular/v8/two-blocks-min70-check.png')
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$project=[System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$root=Join-Path $project 'app/assets/portraits/modular/v8'
$cellWidth=448
$canvas=[System.Drawing.Bitmap]::new(($cellWidth*3),1380)
$graphics=[System.Drawing.Graphics]::FromImage($canvas)
$graphics.Clear([System.Drawing.Color]::FromArgb(238,224,191))
$graphics.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$font=[System.Drawing.Font]::new('Arial',12)
$brush=[System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(42,37,31))
for($row=0;$row -lt 3;$row++) {
  $gender=if($row -eq 2){'female'}else{'male'}
  $outfit=if($gender -eq 'female'){4}else{5}
  for($column=0;$column -lt 3;$column++) {
    $widthPercent=if($row -eq 1){100}else{@(70,100,130)[$column]}
    $headPercent=100+($widthPercent-100)/3
    $opacity=if($row -eq 1){@(40,70,100)[$column]}else{100}
    $parts=@()
    if($gender -eq 'female'){$parts+='hairBack-0'}
    $parts+=@("clothingBack-$outfit","body-$outfit",'face-0',"clothing-$outfit",'eyes-0','nose-0','mouth-0','hair-0')
    if($gender -eq 'male'){$parts+='accessory-1'}
    foreach($part in $parts) {
      $localScale=1;$offsetY=0
      if($part -like 'clothing*') {
        if($gender -eq 'male'){$localScale=1.15}else{$offsetY=-15}
      }
      $blockWidth=if($part -like 'clothing*' -or $part -like 'body-*'){$widthPercent}else{$headPercent}
      $drawWidth=[single](256*$blockWidth/100*$localScale)
      $drawX=[single]($column*$cellWidth+($cellWidth-$drawWidth)/2)
      $drawY=[single]($row*460+28+$offsetY/2)
      $image=[System.Drawing.Bitmap]::new((Join-Path $root "$gender/$part.png"))
      $attributes=[System.Drawing.Imaging.ImageAttributes]::new()
      $matrix=[System.Drawing.Imaging.ColorMatrix]::new()
      if($part -eq 'accessory-1'){$matrix.Matrix33=[single]($opacity/100)}
      $attributes.SetColorMatrix($matrix)
      $destination=[System.Drawing.PointF[]]@([System.Drawing.PointF]::new($drawX,$drawY),[System.Drawing.PointF]::new($drawX+$drawWidth,$drawY),[System.Drawing.PointF]::new($drawX,$drawY+416))
      $graphics.DrawImage($image,$destination,[System.Drawing.RectangleF]::new(0,0,512,832),[System.Drawing.GraphicsUnit]::Pixel,$attributes)
      $attributes.Dispose();$image.Dispose()
    }
    $caption=if($row -eq 1){"Barbe : $opacity %"}else{"Corps : $widthPercent % / Tete : $headPercent %"}
    $graphics.DrawString($caption,$font,$brush,[single]($column*$cellWidth+65),[single]($row*460+5))
  }
}
$destinationPath=Join-Path $project $OutputPath
New-Item -ItemType Directory -Force -Path (Split-Path $destinationPath) | Out-Null
$canvas.Save($destinationPath,[System.Drawing.Imaging.ImageFormat]::Png)
$brush.Dispose();$font.Dispose();$graphics.Dispose();$canvas.Dispose()
Write-Output $destinationPath
