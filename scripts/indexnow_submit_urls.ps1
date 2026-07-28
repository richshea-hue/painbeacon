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
# We FETCH (sitemap + key preflight) from the Cloudflare Pages *.pages.dev
# origin instead of the custom domain: Cloudflare's Bot Fight Mode challenges
# datacenter IPs (e.g. GitHub Actions runners) on painbeacon.com, returning an
# HTML challenge page instead of the XML and breaking the parse. pages.dev
# serves byte-identical content but isn't behind the custom zone's bot
# protection. Everything we SUBMIT stays canonical painbeacon.com (the URLs in
# the sitemap already are, and keyLocation below is verified by Bing, a
# verified bot Cloudflare lets through).
$fetchHost = "painbeacon.pages.dev"
# The key is public by design -- IndexNow verifies ownership by fetching
# keyLocation and checking its contents match. Source of truth is the file
# in public/, which deploys to the site root.
$key = "271df337a665a3a3018c576484c6c7d2"
$keyLocation = "https://$siteHost/$key.txt"

[string[]]$urls = @()

if ($FromSitemap) {
    Write-Host "Fetching sitemap..."
    [xml]$sitemap = (Invoke-WebRequest -Uri "https://$fetchHost/sitemap.xml" -UseBasicParsing).Content

    if ($sitemap.sitemapindex) {
        # Sitemap index: fetch each child sitemap and collect its URLs.
        # Child <loc>s are canonical painbeacon.com URLs; swap the host so these
        # fetches also bypass Bot Fight Mode (see $fetchHost note above).
        foreach ($child in $sitemap.sitemapindex.sitemap) {
            $childUri = $child.loc -replace "://$siteHost/", "://$fetchHost/"
            Write-Host "  Fetching $childUri..."
            [xml]$childMap = (Invoke-WebRequest -Uri $childUri -UseBasicParsing).Content
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
# IndexNow silently ignore every submission. Fetch via $fetchHost (same reason
# as the sitemap); the deployed file is identical on both hosts.
$keyCheckUrl = "https://$fetchHost/$key.txt"
try {
    $keyCheck = Invoke-WebRequest -Uri $keyCheckUrl -UseBasicParsing
    if ($keyCheck.Content.Trim() -ne $key) {
        Write-Error "Key file at $keyCheckUrl does not match the key. Deploy public/$key.txt first."
        exit 1
    }
} catch {
    Write-Error "Key file not reachable at $keyCheckUrl. Deploy public/$key.txt first."
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
