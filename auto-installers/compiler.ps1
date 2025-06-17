$runtimes = @("win-x64", "win-arm64", "osx-x64", "osx-arm64", "linux-x64", "linux-arm64")
foreach ($runtime in $runtimes) {
    dotnet publish -c Release -r $runtime --self-contained true -o "publish/$runtime"
}