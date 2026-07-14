# Submits URLs to IndexNow (notifies Bing, Yandex, Seznam, Naver in one call).
# Usage:
#   .\indexnow_submit_urls.ps1 -UrlFile "urls.txt"     # one full URL per line
#   .\indexnow_submit_urls.ps1 -FromSitemap            # every URL in the live sitemap
# Unlike the Bing URL Submission API (~10/day free tier), IndexNow accepts
# up to 10,000 URLs per request with no meaningful daily quota.

param(
    [string]$UrlFile,
    [switch]$FromSitemap
)

$siteHost = "painbeacon.com"
# The key is public by design -- IndexNow verifies ownership by fetching
# keyLocation and checking its contents match. Source of truth is the file
# in public/, which deploys to the site root.
$key = "271df337a665a3a3018c576484c6c7d2"
$keyLocation = "https://$siteHost/$key.txt"

[string[]]$urls = @()

if ($FromSitemap) {
    Write-Host "Fetching sitemap..."
    [xml]$sitemap = (Invoke-WebRequest -Uri "https://$siteHost/sitemap.xml" -UseBasicParsing).Content

    if ($sitemap.sitemapindex) {
        # Sitemap index: fetch each child sitemap and collect its URLs.
        foreach ($child in $sitemap.sitemapindex.sitemap) {
            Write-Host "  Fetching $($child.loc)..."
            [xml]$childMap = (Invoke-WebRequest -Uri $child.loc -UseBasicParsing).Content
            $urls += $childMap.urlset.url | ForEach-Object { $_.loc }
        }
    } else {
        $urls = $sitemap.urlset.url | ForEach-Object { $_.loc }
    }
} elseif ($UrlFile) {
    if (-not (Test-Path $UrlFile)) {
        Write-Error "URL file not found: $UrlFile"
        exit 1
    }
    $urls = Get-Content $UrlFile | Where-Object { $_.Trim() -ne "" }
} else {
    Write-Error "Provide -UrlFile <path> or -FromSitemap."
    exit 1
}

if ($urls.Count -eq 0) {
    Write-Error "No URLs to submit."
    exit 1
}

# Verify the key file is live before submitting -- a missing key file makes
# IndexNow silently ignore every submission.
try {
    $keyCheck = Invoke-WebRequest -Uri $keyLocation -UseBasicParsing
    if ($keyCheck.Content.Trim() -ne $key) {
        Write-Error "Key file at $keyLocation does not match the key. Deploy public/$key.txt first."
        exit 1
    }
} catch {
    Write-Error "Key file not reachable at $keyLocation. Deploy public/$key.txt first."
    exit 1
}

$endpoint = "https://api.indexnow.org/indexnow"
$batchSize = 10000
$submitted = 0

for ($i = 0; $i -lt $urls.Count; $i += $batchSize) {
    $end = [Math]::Min($i + $batchSize, $urls.Count) - 1
    [string[]]$batch = $urls[$i..$end]

    $bodyObject = [ordered]@{
        host        = $siteHost
        key         = $key
        keyLocation = $keyLocation
        urlList     = $batch
    }
    $jsonBody = $bodyObject | ConvertTo-Json -Depth 5 -Compress

    # Send as raw UTF-8 bytes -- avoids PowerShell's default encoding mangling
    # the JSON payload.
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($jsonBody)

    Write-Host "Submitting $($batch.Count) URL(s) to IndexNow..."
    try {
        Invoke-RestMethod -Uri $endpoint -Method Post -Body $bytes -ContentType "application/json; charset=utf-8" | Out-Null
        $submitted += $batch.Count
        Write-Host "  OK ($submitted/$($urls.Count))"
    } catch {
        Write-Host "Error submitting batch:"
        Write-Host $_.Exception.Message
        if ($_.ErrorDetails.Message) {
            Write-Host $_.ErrorDetails.Message
        }
        exit 1
    }
}

Write-Host "Done. $submitted URL(s) submitted."
