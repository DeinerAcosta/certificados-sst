# Convertir cada DOCX en un proceso fresco de Word (evita hangs)
param()
$folder = "C:\Users\Hector\Documents\QR SST\certificados\pdfs"
$done = 0
$total = (Get-ChildItem "$folder\*.docx").Count
foreach ($f in (Get-ChildItem "$folder\*.docx")) {
    $pdf = Join-Path $folder ($f.BaseName + ".pdf")
    if (Test-Path $pdf) {
        $done++
        Write-Host "  [$done/$total] SKIP $($f.BaseName)"
        continue
    }
    $w = New-Object -ComObject Word.Application
    $w.Visible = $false
    $w.DisplayAlerts = 0
    try {
        $doc = $w.Documents.Open($f.FullName)
        $doc.ExportAsFixedFormat($pdf, 17)
        $doc.Close(0)
        $done++
        Write-Host "  [$done/$total] $($f.BaseName).pdf"
    } catch {
        Write-Host "  ERR: $_"
    } finally {
        $w.Quit()
        [System.Runtime.Interopservices.Marshal]::ReleaseComObject($w) | Out-Null
        Remove-Variable w -ErrorAction SilentlyContinue
        [GC]::Collect()
        [GC]::WaitForPendingFinalizers()
    }
}
Write-Host "---"
Write-Host "Total PDFs: $((Get-ChildItem "$folder\*.pdf").Count)"
