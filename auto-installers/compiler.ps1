$runtimes = @("win-x64", "win-arm64", "osx-x64", "osx-arm64", "linux-x64", "linux-arm64")
foreach ($runtime in $runtimes) {
    Write-Host "Publishing for $runtime..."
    dotnet publish -c Release -r $runtime --self-contained -p:PublishSingleFile=true -p:PublishTrimmed=true -p:TrimMode=partial -o "publish/$runtime"
}
