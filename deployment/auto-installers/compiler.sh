#!/bin/bash
# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

runtimes=(
    "win-x64"
    "win-arm64"
    "osx-x64"
    "osx-arm64"
    "linux-x64"
    "linux-arm64"
    "linux-musl-x64"
    "linux-musl-arm64"
)

# Function to build a single runtime
build_runtime() {
    local runtime=$1
    echo -e "${GREEN}Publishing for $runtime...${NC}"
    
    if dotnet publish -c Release -r "$runtime" --self-contained -p:PublishSingleFile=true -p:PublishTrimmed=true -p:TrimMode=partial -o "publish/$runtime" 2>/dev/null; then
        echo -e "${GREEN}✓ Successfully published for $runtime${NC}"
        return 0
    else
        echo -e "${RED}✗ Failed to publish for $runtime${NC}"
        return 1
    fi
}

# Export the function so it's available to subshells
export -f build_runtime
export GREEN RED CYAN NC

echo -e "${CYAN}Starting concurrent build process...${NC}"

# Run all builds concurrently and wait for them to complete
for runtime in "${runtimes[@]}"; do
    build_runtime "$runtime" &
done

# Wait for all background processes to complete
wait

echo -e "${CYAN}Build process completed!${NC}"