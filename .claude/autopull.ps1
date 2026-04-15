# Auto-pull script for workflow-app — runs via Windows Scheduled Task
$ErrorActionPreference = 'Continue'
$repo    = "C:\CLAUDE\workflow-app"
$logFile = Join-Path $repo ".claude\autopull.log"
$stamp   = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

# Redirect stderr to stdout (git writes progress to stderr, not an actual error)
$output = (& cmd.exe /c "git -C `"$repo`" pull --ff-only origin master 2>&1") | Out-String
$output = $output.Trim()

if ($output -match "Already up to date") {
    Add-Content -Path $logFile -Value "[$stamp] up-to-date"
} else {
    Add-Content -Path $logFile -Value "[$stamp] $output"
    Add-Content -Path $logFile -Value "---"
}

# Trim log to last 200 lines
if (Test-Path $logFile) {
    $lines = Get-Content $logFile -Tail 200
    Set-Content -Path $logFile -Value $lines
}
