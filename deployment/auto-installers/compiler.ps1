$runtimes = @(
    "win-x64",
    "win-arm64",
    "osx-x64",
    "osx-arm64",
    "linux-x64",
    "linux-arm64",
    "linux-musl-x64",
    "linux-musl-arm64"
)

# Function to build a single runtime
function Build-Runtime {
    param($runtime)
    $runtimes = @(
    "win-x64",
    "win-arm64",
    "osx-x64",
    "osx-arm64",
    "linux-x64",
    "linux-arm64",
    "linux-musl-x64",
    "linux-musl-arm64"
)

# Function to build a single runtime
function Build-Runtime {
    param($runtime)
    
    Write-Host "Publishing for $runtime..." -ForegroundColor Green
    
    $process = Start-Process -FilePath "dotnet" -ArgumentList @(
        "publish", "-c", "Release", "-r", $runtime, "--self-contained", 
        "-p:PublishSingleFile=true", "-p:PublishTrimmed=true", "-p:TrimMode=partial", 
        "-o", "publish/$runtime"
    ) -PassThru -Wait -WindowStyle Hidden
    
    if ($process.ExitCode -eq 0) {
        Write-Host "✓ Successfully published for $runtime" -ForegroundColor Green
        return $true
    } else {
        Write-Host "✗ Failed to publish for $runtime" -ForegroundColor Red
        return $false
    }
}

# Do a single restore first to avoid conflicts
Write-Host "Restoring packages..." -ForegroundColor Cyan
dotnet restore

Write-Host "Starting concurrent build process..." -ForegroundColor Cyan

# Limit concurrent jobs to prevent system overload
$maxConcurrentJobs = 3  # Adjust based on your system
$jobs = @()

foreach ($runtime in $runtimes) {
    # Wait if we've hit the concurrent job limit
    while (($jobs | Where-Object { $_.State -eq 'Running' }).Count -ge $maxConcurrentJobs) {
        Start-Sleep -Milliseconds 500
        $jobs | Where-Object { $_.State -ne 'Running' } | ForEach-Object { 
            Receive-Job $_
            Remove-Job $_
        }
        $jobs = $jobs | Where-Object { $_.State -eq 'Running' }
    }
    
    $job = Start-Job -ScriptBlock ${function:Build-Runtime} -ArgumentList $runtime
    $jobs += $job
}

# Wait for remaining jobs to complete
$jobs | Wait-Job | Receive-Job

# Clean up jobs
$jobs | Remove-Job

Write-Host "Build process completed!" -ForegroundColor Cyan
    Write-Host "Publishing for $runtime..." -ForegroundColor Green
    
    $process = Start-Process -FilePath "dotnet" -ArgumentList @(
        "publish", "-c", "Release", "-r", $runtime, "--self-contained", 
        "-p:PublishSingleFile=true", "-p:PublishTrimmed=true", "-p:TrimMode=partial", 
        "-o", "publish/$runtime"
    ) -PassThru -Wait -WindowStyle Hidden
    
    if ($process.ExitCode -eq 0) {
        Write-Host "✓ Successfully published for $runtime" -ForegroundColor Green
        return $true
    } else {
        Write-Host "✗ Failed to publish for $runtime" -ForegroundColor Red
        return $false
    }
}

Write-Host "Starting concurrent build process..." -ForegroundColor Cyan

# Start all builds concurrently using jobs
$jobs = @()
foreach ($runtime in $runtimes) {
    $job = Start-Job -ScriptBlock ${function:Build-Runtime} -ArgumentList $runtime
    $jobs += $job
}

# Wait for all jobs to complete and get results
$jobs | Wait-Job | Receive-Job

# Clean up jobs
$jobs | Remove-Job

Write-Host "Build process completed!" -ForegroundColor Cyan