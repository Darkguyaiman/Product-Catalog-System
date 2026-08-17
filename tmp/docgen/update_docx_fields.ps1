param([Parameter(Mandatory = $true)][string]$InputDocx)

$inputPath = (Resolve-Path -LiteralPath $InputDocx).Path
$word = $null
$document = $null
try {
    $word = New-Object -ComObject Word.Application
    $word.Visible = $false
    $word.DisplayAlerts = 0
    $document = $word.Documents.Open($inputPath, $false, $false)
    foreach ($toc in $document.TablesOfContents) { $toc.Update() }
    foreach ($story in $document.StoryRanges) {
        $range = $story
        while ($range -ne $null) {
            [void]$range.Fields.Update()
            $range = $range.NextStoryRange
        }
    }
    $document.Repaginate()
    $document.Save()
}
finally {
    if ($document -ne $null) {
        $document.Close($false)
        [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($document)
    }
    if ($word -ne $null) {
        $word.Quit()
        [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($word)
    }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
