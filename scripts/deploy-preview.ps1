param(
    [Parameter(Mandatory = $true)]
    [int]$PrNumber
)

$ErrorActionPreference = "Stop"

function Load-DotEnv {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    if (-not (Test-Path $Path)) {
        throw "Env file not found: $Path"
    }

    Get-Content $Path | ForEach-Object {
        $line = $_.Trim()

        if (-not $line -or $line.StartsWith("#")) {
            return
        }

        $eqIndex = $line.IndexOf("=")
        if ($eqIndex -lt 1) {
            return
        }

        $key = $line.Substring(0, $eqIndex).Trim()
        $value = $line.Substring($eqIndex + 1).Trim()

        if (
        ($value.StartsWith('"') -and $value.EndsWith('"')) -or
                ($value.StartsWith("'") -and $value.EndsWith("'"))
        ) {
            $value = $value.Substring(1, $value.Length - 2)
        }

        [System.Environment]::SetEnvironmentVariable($key, $value, "Process")
    }
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

Write-Host "Loading .env.preview..."
Load-DotEnv -Path ".env.preview"

if (-not $env:FIREBASE_PROJECT_ID) {
    throw "FIREBASE_PROJECT_ID is missing from .env.preview"
}

$channelId = "pr-$PrNumber"

Write-Host "Installing dependencies..."
npm ci

Write-Host "Installing function dependencies..."
Push-Location
Set-Location (Join-Path $root "functions")
npm ci
Pop-Location

Write-Host "Deploying Firebase functions..."
$jsonFunctionsOutputPath = Join-Path $root ".firebase\firebase-functions-output.json"
firebase deploy --only functions `
    --project $env:FIREBASE_PROJECT_ID `
    --json | Out-File -FilePath $jsonFunctionsOutputPath -Encoding utf8

Write-Host ""
Write-Host "Raw Firebase functions output saved to: $jsonFunctionsOutputPath"

Write-Host "Building preview..."
npx vite build --mode preview

Write-Host "Deploying Firebase preview channel: $channelId"
$jsonPreviewOutputPath = Join-Path $root ".firebase\firebase-preview-output.json"

firebase hosting:channel:deploy $channelId `
    --project $env:FIREBASE_PROJECT_ID `
    --json | Out-File -FilePath $jsonPreviewOutputPath -Encoding utf8

Write-Host ""
Write-Host "Raw Firebase output saved to: $jsonPreviewOutputPath"

$data = Get-Content $jsonPreviewOutputPath -Raw | ConvertFrom-Json

$previewUrl = $null
$expireTime = $null

if ($data.result -and $data.result.url) {
    $previewUrl = $data.result.url
    $expireTime = $data.result.expireTime
}
elseif ($data.result -and $data.result.oauth -and $data.result.oauth.url) {
    $previewUrl = $data.result.oauth.url
    $expireTime = $data.result.oauth.expireTime
}

Write-Host ""
if ($previewUrl) {
    Write-Host "Preview URL: $previewUrl" -ForegroundColor Green
    if ($expireTime) {
        Write-Host "Expires: $expireTime" -ForegroundColor Yellow
    }
} else {
    Write-Warning "Could not extract preview URL from Firebase output."
    Write-Host "Full output:"
    Get-Content $jsonPreviewOutputPath
}