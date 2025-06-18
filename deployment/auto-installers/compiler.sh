#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

runtimes=(
    "win-x64"
    "win-arm64"
    "win-arm"
    "osx-x64"
    "osx-arm64"
    "linux-x64"
    "linux-arm64"
    "linux-arm"
    "linux-musl-x64"
    "linux-musl-arm64"
    "linux-musl-arm"
)

for runtime in "${runtimes[@]}"; do
    echo -e "${GREEN}Publishing for $runtime...${NC}"
    
    dotnet publish -c Release -r "$runtime" --self-contained -p:PublishSingleFile=true -p:PublishTrimmed=true -p:TrimMode=partial -o "publish/$runtime"
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Successfully published for $runtime${NC}"
    else
        echo -e "${RED}✗ Failed to publish for $runtime${NC}"
    fi
    echo ""
done

echo -e "${CYAN}Build process completed!${NC}"