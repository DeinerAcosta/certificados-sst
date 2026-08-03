param([string]$src)
$dst = $src -replace '\.docx$', '.pdf'
$w = New-Object -ComObject Word.Application
$w.Visible = $false
$doc = $w.Documents.Open($src)
$doc.SaveAs($dst, 17)
$doc.Close(0)
$w.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($w) | Out-Null
Write-Output "OK"
