[CmdletBinding()]
param(
    [Parameter(Mandatory=$false)]
    [string]$Runtime,

    [Parameter(Mandatory=$false)]
    [switch]$Help
)

$all_runtimes = @(
    "win-x64",
    "win-arm64",
    "osx-x64",
    "osx-arm64",
    "linux-x64",
    "linux-arm64",
    "linux-musl-x64",
    "linux-musl-arm64"
)

function Show-Help {
    Write-Host "Usage: ." -ForegroundColor $Cyan
    Write-Host ""
    Write-Host "Options:" -ForegroundColor $Cyan
    Write-Host "  -Runtime <RUNTIME>  Specify a single runtime to publish for (e.g., win-x64, osx-arm64)." -ForegroundColor $Yellow
    Write-Host "                      If not specified, the script will publish for all predefined runtimes."
    Write-Host "  -Help               Display this help message." -ForegroundColor $Yellow
    Write-Host ""
    Write-Host "Available Runtimes:" -ForegroundColor $Cyan
    foreach ($rt in $all_runtimes) {
        Write-Host "  - $rt" -ForegroundColor $NoColor # Using $NoColor for the list items
    }
    Write-Host ""
    Write-Host "Example:" -ForegroundColor $Cyan
    Write-Host "  .compile.ps1"
    Write-Host "  .compile.ps1 -Runtime linux-x64"
    Write-Host ""
}

# Check for -Help switch
if ($Help) {
    Show-Help
    exit 0
}

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

$runtimes_to_process = @()
if (-not [string]::IsNullOrEmpty($Runtime)) {
    # Validate if the specific runtime is in our list of known runtimes
    $found = $false
    foreach ($rt in $all_runtimes) {
        if ($rt -eq $Runtime) {
            $found = $true
            break
        }
    }

    if ($found) {
        $runtimes_to_process += $Runtime
    } else {
        Write-Host "Error: Invalid runtime specified: '$Runtime'" -ForegroundColor $Red
        Write-Host "Available runtimes:" -ForegroundColor $Yellow
        foreach ($rt in $all_runtimes) {
            Write-Host "  - $rt"
        }
        exit 1
    }
} else {
    # If no specific runtime, process all
    $runtimes_to_process = $all_runtimes
}

# Loop through the runtimes and publish
foreach ($runtime in $runtimes_to_process) {
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
