param([string]$MaleHairAtlas, [string]$FemaleHairAtlas, [string]$FemaleClothingAtlas, [string]$FemaleFrontHairAtlas)
$ErrorActionPreference = 'Stop'
# Utiliser les mêmes opérations de découpage ; les illustrations v1 restent intactes.
. (Join-Path $PSScriptRoot 'prepare-portrait-assets.ps1')
$portraitRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../app/assets/portraits/modular'))
$sourceRoot = Join-Path $portraitRoot 'sources'
$foundation = [System.Drawing.Bitmap]::new((Join-Path $sourceRoot 'foundations-atlas-v1.png'))
$details = [System.Drawing.Bitmap]::new((Join-Path $sourceRoot 'details-atlas-v1.png'))
function Save-SourceAtlas($source, $filename) {
  $destination = Join-Path $sourceRoot $filename
  if ((Resolve-Path -LiteralPath $source).Path -ne [System.IO.Path]::GetFullPath($destination)) {
    Copy-Item -LiteralPath $source -Destination $destination
  }
}

foreach ($gender in @('male', 'female')) {
  $targetRoot = Join-Path $portraitRoot "v2/$gender"
  New-Item -ItemType Directory -Force -Path $targetRoot | Out-Null
  $faceColumns = if ($gender -eq 'male') { @(0, 2) } else { @(1, 3) }
  $detailColumns = if ($gender -eq 'male') { @(@(0, 2), @(1, 3), @(0, 2)) } else { @(@(1, 3), @(0, 2), @(1, 3)) }
  # Largeur de tête, cou et implantation des traits propres à chaque bibliothèque.
  $faceTarget = if ($gender -eq 'male') { @(90, 60, 332, 410) } else { @(112, 66, 288, 405) }
  $detailTargets = if ($gender -eq 'male') {
    @(@(182, 221, 148, 44), @(241, 272, 30, 42), @(222, 325, 68, 20))
  } else {
    @(@(192, 225, 128, 42), @(243, 275, 26, 35), @(226, 323, 60, 18))
  }
  for ($index = 0; $index -lt 2; $index++) {
    $rect = Get-PartBounds $foundation $faceColumns[$index] 0 4 3 @(0, 0.378, 0.700, 1)
    Export-ImageRect $foundation $rect (Join-Path $targetRoot "face-$index.png") 512 640 $faceTarget
  }
  $parts = @('eyes', 'nose', 'mouth')
  for ($row = 0; $row -lt 3; $row++) {
    for ($index = 0; $index -lt 2; $index++) {
      $rect = Get-PartBounds $details $detailColumns[$row][$index] $row 4 4 @(0, 0.25, 0.5, 0.684, 1)
      Export-ImageRect $details $rect (Join-Path $targetRoot "$($parts[$row])-$index.png") 512 640 $detailTargets[$row]
    }
  }
  $accessoryColumns = if ($gender -eq 'male') { @(0, 1, 2, 3) } else { @(1, 2, 3) }
  $accessoryTargets = if ($gender -eq 'male') {
    @(@(169, 311, 174, 112), @(316, 266, 12, 58), @(364, 274, 15, 25), @(213, 416, 86, 68))
  } else {
    @(@(306, 269, 10, 51), @(350, 276, 13, 23), @(220, 414, 72, 62))
  }
  for ($index = 0; $index -lt $accessoryColumns.Length; $index++) {
    $rect = Get-PartBounds $details $accessoryColumns[$index] 3 4 4 @(0, 0.25, 0.5, 0.684, 1)
    Export-ImageRect $details $rect (Join-Path $targetRoot "accessory-$($index + 1).png") 512 640 $accessoryTargets[$index]
  }
  if ($gender -eq 'male') {
    for ($index = 0; $index -lt 8; $index++) {
      Copy-Item -LiteralPath (Join-Path $portraitRoot "v1/clothing-$index.png") -Destination (Join-Path $targetRoot "clothing-$index.png")
    }
  }
}
$foundation.Dispose()
$details.Dispose()

if ($MaleHairAtlas) {
  $bitmap = [System.Drawing.Bitmap]::new((Resolve-Path -LiteralPath $MaleHairAtlas).Path)
  Save-SourceAtlas $MaleHairAtlas 'male-hair-atlas-v2.png'
  $hairTargets = @(@(122, 40, 268, 245), @(128, 46, 256, 195), @(129, 48, 254, 185), @(130, 44, 252, 195))
  for ($index = 0; $index -lt 4; $index++) {
    $rect = Get-PartBounds $bitmap ($index % 2) ([int][Math]::Floor($index / 2)) 2 2
    Export-ImageRect $bitmap $rect (Join-Path $portraitRoot "v2/male/hair-$index.png") 512 640 $hairTargets[$index]
  }
  $bitmap.Dispose()
}
if ($FemaleHairAtlas) {
  $bitmap = [System.Drawing.Bitmap]::new((Resolve-Path -LiteralPath $FemaleHairAtlas).Path)
  Save-SourceAtlas $FemaleHairAtlas 'female-hair-atlas-v2.png'
  for ($index = 0; $index -lt 4; $index++) {
    # Le devant est préparé séparément avec FemaleFrontHairAtlas ; ne pas rogner les mèches.
    $back = Get-PartBounds $bitmap $index 1 4 2
    Export-ImageRect $bitmap $back (Join-Path $portraitRoot "v2/female/hairBack-$index.png") 512 640 @(119, 55, 274, 437)
  }
  $bitmap.Dispose()
}
if ($FemaleClothingAtlas) {
  $bitmap = [System.Drawing.Bitmap]::new((Resolve-Path -LiteralPath $FemaleClothingAtlas).Path)
  Save-SourceAtlas $FemaleClothingAtlas 'female-clothing-atlas-v2.png'
  for ($index = 0; $index -lt 8; $index++) {
    $rect = Get-PartBounds $bitmap ($index % 4) ([int][Math]::Floor($index / 4)) 4 2
    Export-ImageRect $bitmap $rect (Join-Path $portraitRoot "v2/female/clothing-$index.png") 512 640 @(44, 359, 424, 281)
  }
  $bitmap.Dispose()
}
if ($FemaleFrontHairAtlas) {
  $bitmap = [System.Drawing.Bitmap]::new((Resolve-Path -LiteralPath $FemaleFrontHairAtlas).Path)
  Save-SourceAtlas $FemaleFrontHairAtlas 'female-hair-front-atlas-v2.png'
  for ($index = 0; $index -lt 4; $index++) {
    # La deuxième rangée commence à y=503, avant la moitié théorique (512).
    # Découper dans l'espace transparent y=495..502, sans embarquer la coiffure voisine.
    $rect = Get-PartBounds $bitmap ($index % 2) ([int][Math]::Floor($index / 2)) 2 2 @(0, 0.48828125, 1)
    Export-ImageRect $bitmap $rect (Join-Path $portraitRoot "v2/female/hair-$index.png") 512 640 @(132, 42, 248, 227)
  }
  $bitmap.Dispose()
}
