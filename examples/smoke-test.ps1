$ErrorActionPreference = 'Stop'

$baseUrl = 'http://localhost:3000/mcp'

function Invoke-Mcp {
  param(
    [int]$Id,
    [string]$Method,
    [hashtable]$Params
  )

  $body = @{
    jsonrpc = '2.0'
    id = $Id
    method = $Method
    params = $Params
  } | ConvertTo-Json -Depth 10

  Invoke-RestMethod -Method Post -Uri $baseUrl -ContentType 'application/json' -Body $body
}

Write-Host '1) initialize'
$init = Invoke-Mcp -Id 1 -Method 'initialize' -Params @{}
$init | ConvertTo-Json -Depth 10 | Write-Host

Write-Host '2) newSession'
$newSession = Invoke-Mcp -Id 2 -Method 'tools/call' -Params @{
  name = 'browser.newSession'
  arguments = @{}
}
$newSession | ConvertTo-Json -Depth 10 | Write-Host

$sessionId = $newSession.result.structuredContent.sessionId
if (-not $sessionId) {
  throw 'sessionId not found from browser.newSession response'
}

Write-Host '3) navigate https://example.com'
$navigate = Invoke-Mcp -Id 3 -Method 'tools/call' -Params @{
  name = 'browser.navigate'
  arguments = @{
    sessionId = $sessionId
    url = 'https://example.com'
  }
}
$navigate | ConvertTo-Json -Depth 10 | Write-Host

Write-Host '4) screenshot'
$screenshot = Invoke-Mcp -Id 4 -Method 'tools/call' -Params @{
  name = 'browser.screenshot'
  arguments = @{
    sessionId = $sessionId
    fullPage = $true
  }
}

$base64 = $screenshot.result.structuredContent.data
if (-not $base64) {
  throw 'base64 screenshot data not found'
}

$outputPath = Join-Path $PSScriptRoot 'smoke-shot.png'
[System.IO.File]::WriteAllBytes($outputPath, [Convert]::FromBase64String($base64))
Write-Host "Screenshot saved to: $outputPath"

Write-Host '5) waitFor h1 visible'
$waitFor = Invoke-Mcp -Id 5 -Method 'tools/call' -Params @{
  name = 'browser.waitFor'
  arguments = @{
    sessionId = $sessionId
    selector = 'h1'
    state = 'visible'
    timeoutMs = 10000
  }
}
$waitFor | ConvertTo-Json -Depth 10 | Write-Host

Write-Host '6) press PageDown on body'
$press = Invoke-Mcp -Id 6 -Method 'tools/call' -Params @{
  name = 'browser.press'
  arguments = @{
    sessionId = $sessionId
    selector = 'body'
    key = 'PageDown'
    timeoutMs = 10000
  }
}
$press | ConvertTo-Json -Depth 10 | Write-Host

Write-Host '7) closeSession'
$closeSession = Invoke-Mcp -Id 7 -Method 'tools/call' -Params @{
  name = 'browser.closeSession'
  arguments = @{
    sessionId = $sessionId
  }
}
$closeSession | ConvertTo-Json -Depth 10 | Write-Host

Write-Host 'Smoke test completed successfully.'
