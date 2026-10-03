Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Assets = Join-Path $Root 'assets'

function New-Bitmap([int]$Width, [int]$Height) {
  $bitmap = [System.Drawing.Bitmap]::new($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  return @($bitmap, $graphics)
}

function Save-Png($Bitmap, [string]$Path) {
  $Bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
}

function New-Pen([string]$Color, [float]$Width) {
  $pen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml($Color), $Width)
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  return $pen
}

function Draw-RoundedRect($Graphics, [float]$X, [float]$Y, [float]$W, [float]$H, [float]$R, $Brush) {
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $d = $R * 2
  $path.AddArc($X, $Y, $d, $d, 180, 90)
  $path.AddArc($X + $W - $d, $Y, $d, $d, 270, 90)
  $path.AddArc($X + $W - $d, $Y + $H - $d, $d, $d, 0, 90)
  $path.AddArc($X, $Y + $H - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  $Graphics.FillPath($Brush, $path)
  $path.Dispose()
}

function Draw-SahelPosSymbol($Graphics, [float]$X, [float]$Y, [float]$Size, [bool]$Mono = $false) {
  $orange1 = if ($Mono) { '#142337' } else { '#ffb21a' }
  $orange2 = if ($Mono) { '#142337' } else { '#f97316' }
  $navy = '#142337'
  $white = '#ffffff'

  $thick = $Size * 0.045
  $motionPen = New-Pen $orange2 $thick
  $handlePen = New-Pen $orange2 ($Size * 0.06)
  $accentPen = New-Pen $white ($Size * 0.028)

  $Graphics.DrawLine($motionPen, $X + $Size * 0.06, $Y + $Size * 0.32, $X + $Size * 0.30, $Y + $Size * 0.32)
  $Graphics.DrawLine($motionPen, $X + $Size * 0.10, $Y + $Size * 0.45, $X + $Size * 0.33, $Y + $Size * 0.45)
  $Graphics.DrawLine($motionPen, $X + $Size * 0.15, $Y + $Size * 0.58, $X + $Size * 0.34, $Y + $Size * 0.58)

  $cart = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $cart.AddLine($X + $Size * 0.36, $Y + $Size * 0.25, $X + $Size * 0.88, $Y + $Size * 0.25)
  $cart.AddLine($X + $Size * 0.88, $Y + $Size * 0.25, $X + $Size * 0.78, $Y + $Size * 0.65)
  $cart.AddLine($X + $Size * 0.78, $Y + $Size * 0.65, $X + $Size * 0.42, $Y + $Size * 0.65)
  $cart.CloseFigure()
  $cartBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    [System.Drawing.RectangleF]::new($X + $Size * 0.34, $Y + $Size * 0.22, $Size * 0.56, $Size * 0.48),
    [System.Drawing.ColorTranslator]::FromHtml($orange1),
    [System.Drawing.ColorTranslator]::FromHtml($orange2),
    90
  )
  $Graphics.FillPath($cartBrush, $cart)
  $Graphics.DrawLine($accentPen, $X + $Size * 0.43, $Y + $Size * 0.42, $X + $Size * 0.78, $Y + $Size * 0.42)

  $Graphics.DrawLines($handlePen, @(
    [System.Drawing.PointF]::new($X + $Size * 0.28, $Y + $Size * 0.15),
    [System.Drawing.PointF]::new($X + $Size * 0.36, $Y + $Size * 0.16),
    [System.Drawing.PointF]::new($X + $Size * 0.44, $Y + $Size * 0.72),
    [System.Drawing.PointF]::new($X + $Size * 0.78, $Y + $Size * 0.72)
  ))

  $wheelBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($navy))
  $Graphics.FillEllipse($wheelBrush, $X + $Size * 0.42, $Y + $Size * 0.78, $Size * 0.10, $Size * 0.10)
  $Graphics.FillEllipse($wheelBrush, $X + $Size * 0.70, $Y + $Size * 0.78, $Size * 0.10, $Size * 0.10)

  $motionPen.Dispose()
  $handlePen.Dispose()
  $accentPen.Dispose()
  $cart.Dispose()
  $cartBrush.Dispose()
  $wheelBrush.Dispose()
}

function Save-LauncherAssets {
  $items = @(
    @{ Path = 'icon.png'; Size = 1024; Tile = $true; Mono = $false },
    @{ Path = 'android-icon-foreground.png'; Size = 1024; Tile = $false; Mono = $false },
    @{ Path = 'android-icon-monochrome.png'; Size = 1024; Tile = $false; Mono = $true },
    @{ Path = 'splash-icon.png'; Size = 1024; Tile = $false; Mono = $false },
    @{ Path = 'favicon.png'; Size = 256; Tile = $true; Mono = $false }
  )

  foreach ($item in $items) {
    $pair = New-Bitmap $item.Size $item.Size
    $bitmap = $pair[0]
    $graphics = $pair[1]
    $graphics.Clear([System.Drawing.Color]::Transparent)

    if ($item.Tile) {
      $background = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
        [System.Drawing.RectangleF]::new(0, 0, $item.Size, $item.Size),
        [System.Drawing.ColorTranslator]::FromHtml('#fff8ef'),
        [System.Drawing.ColorTranslator]::FromHtml('#ffffff'),
        45
      )
      Draw-RoundedRect $graphics ($item.Size * 0.10) ($item.Size * 0.10) ($item.Size * 0.80) ($item.Size * 0.80) ($item.Size * 0.20) $background
      $background.Dispose()
      Draw-SahelPosSymbol $graphics ($item.Size * 0.18) ($item.Size * 0.22) ($item.Size * 0.64) $item.Mono
    } else {
      Draw-SahelPosSymbol $graphics ($item.Size * 0.16) ($item.Size * 0.18) ($item.Size * 0.68) $item.Mono
    }

    Save-Png $bitmap (Join-Path $Assets $item.Path)
    $graphics.Dispose()
    $bitmap.Dispose()
  }

  $bgPair = New-Bitmap 1024 1024
  $bg = $bgPair[0]
  $g = $bgPair[1]
  $brush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    [System.Drawing.RectangleF]::new(0, 0, 1024, 1024),
    [System.Drawing.ColorTranslator]::FromHtml('#fff4e6'),
    [System.Drawing.ColorTranslator]::FromHtml('#f6fbff'),
    45
  )
  $g.FillRectangle($brush, 0, 0, 1024, 1024)
  Save-Png $bg (Join-Path $Assets 'android-icon-background.png')
  $brush.Dispose()
  $g.Dispose()
  $bg.Dispose()
}

function Save-Wordmark {
  $pair = New-Bitmap 1024 320
  $bitmap = $pair[0]
  $graphics = $pair[1]
  $graphics.Clear([System.Drawing.Color]::Transparent)
  Draw-SahelPosSymbol $graphics 24 42 232 $false

  $fontBold = [System.Drawing.Font]::new('Arial', 92, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $fontSmall = [System.Drawing.Font]::new('Arial', 28, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $navyBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#142337'))
  $blueBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#0b77ff'))
  $orangeBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#f97316'))
  $mutedBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#516484'))

  $graphics.DrawString('Sahel', $fontBold, $blueBrush, 300, 78)
  $graphics.DrawString('POS', $fontBold, $orangeBrush, 590, 78)
  $graphics.DrawString('Votre commerce, plus simple', $fontSmall, $mutedBrush, 306, 188)

  Save-Png $bitmap (Join-Path $Assets 'logo.png')
  Save-Png $bitmap (Join-Path $Assets 'logo-master.png')

  $fontBold.Dispose()
  $fontSmall.Dispose()
  $navyBrush.Dispose()
  $blueBrush.Dispose()
  $orangeBrush.Dispose()
  $mutedBrush.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

Save-LauncherAssets
Save-Wordmark
