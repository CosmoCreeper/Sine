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

foreach ($runtime in $runtimes) {
    Write-Host "Publishing for $runtime..." -ForegroundColor Green
    dotnet publish -c Release -r $runtime --self-contained -p:PublishSingleFile=true -p:PublishTrimmed=true -p:TrimMode=partial -o "publish/$runtime"
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Successfully published for $runtime" -ForegroundColor Green
    } else {
        Write-Host "Failed to publish for $runtime" -ForegroundColor Red
    }
    Write-Host ""
}

Write-Host "Build process completed!" -ForegroundColor Cyan
