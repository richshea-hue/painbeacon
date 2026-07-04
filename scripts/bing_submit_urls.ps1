# Submits a batch of URLs to Bing's URL Submission API.
# Usage: .\bing_submit_urls.ps1 -UrlFile "urls.txt"
# urls.txt = one full URL per line, max ~10/day on free tier

param(
    [Parameter(Mandatory=$true)]
    [string]$UrlFile
)

if (-not $env:BING_API_KEY) {
    Write-Error "BING_API_KEY environment variable not set. Run: `$env:BING_API_KEY = 'your-key'"
    exit 1
}

if (-not (Test-Path $UrlFile)) {
    Write-Error "URL file not found: $UrlFile"
    exit 1
}

$siteUrl = "https://painbeacon.com"

# Explicitly cast as a string array so ConvertTo-Json always serializes it
# as a JSON array, even if it ends up with just one URL.
[string[]]$urls = Get-Content $UrlFile | Where-Object { $_.Trim() -ne "" }

if ($urls.Count -eq 0) {
    Write-Error "No URLs found in $UrlFile"
    exit 1
}

Write-Host "Submitting $($urls.Count) URL(s) to Bing..."

$bodyObject = [ordered]@{
    siteUrl = $siteUrl
    urlList = $urls
}
$jsonBody = $bodyObject | ConvertTo-Json -Depth 5 -Compress

# Send as raw UTF-8 bytes -- avoids PowerShell's default encoding mangling
# the JSON in a way that confuses Bing's older WCF-based parser.
$bytes = [System.Text.Encoding]::UTF8.GetBytes($jsonBody)

$endpoint = "https://ssl.bing.com/webmaster/api.svc/json/SubmitUrlBatch?apikey=$env:BING_API_KEY"

try {
    $response = Invoke-RestMethod -Uri $endpoint -Method Post -Body $bytes -ContentType "application/json; charset=utf-8"
    Write-Host "Success. Response:"
    $response | ConvertTo-Json -Depth 5
} catch {
    Write-Host "Error submitting URLs:"
    Write-Host $_.Exception.Message
    if ($_.ErrorDetails.Message) {
        Write-Host $_.ErrorDetails.Message
    }
}