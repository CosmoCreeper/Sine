#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Default runtimes
all_runtimes=(
    "win-x64"
    "win-arm64"
    "osx-x64"
    "osx-arm64"
    "linux-x64"
    "linux-arm64"
    "linux-musl-x64"
    "linux-musl-arm64"
)

# Variable to store the specific runtime if provided
specific_runtime=""

# Function to display help message
show_help() {
    echo -e "${CYAN}Usage: $0 [OPTIONS]${NC}"
    echo ""
    echo -e "${CYAN}Options:${NC}"
    echo -e "  ${YELLOW}--runtime=<RUNTIME>${NC}  Specify a single runtime to publish for (e.g., win-x64, osx-arm64)."
    echo -e "                       If not specified, the script will publish for all predefined runtimes."
    echo -e "  ${YELLOW}--help${NC}                 Display this help message."
    echo ""
    echo -e "${CYAN}Available Runtimes:${NOC}"
    for rt in "${all_runtimes[@]}"; do
        echo -e "  - $rt"
    done
    echo ""
    echo -e "${CYAN}Example:${NC}"
    echo -e "  $0"
    echo -e "  $0 --runtime=linux-x64"
    echo ""
}

# Parse command line arguments
for i in "$@"; do
    case $i in
        --runtime=*)
        specific_runtime="${i#*=}"
        shift # past argument=value
        ;;
        --help)
        show_help
        exit 0
        ;;
        *)
        echo -e "${RED}Error: Unknown option '$i'${NC}"
        show_help
        exit 1
        ;;
    esac
done

# Determine which runtimes to process
runtimes_to_process=()
if [ -n "$specific_runtime" ]; then
    # Validate if the specific runtime is in our list of known runtimes
    found=false
    for rt in "${all_runtimes[@]}"; do
        if [ "$rt" == "$specific_runtime" ]; then
            found=true
            break
        fi
    done

    if [ "$found" = true ]; then
        runtimes_to_process+=("$specific_runtime")
    else
        echo -e "${RED}Error: Invalid runtime specified: '$specific_runtime'${NC}"
        echo -e "${YELLOW}Available runtimes:${NC}"
        for rt in "${all_runtimes[@]}"; do
            echo -e "  - $rt"
        done
        exit 1
    fi
else
    # If no specific runtime, process all
    runtimes_to_process=("${all_runtimes[@]}")
fi

# Loop through the runtimes and publish
for runtime in "${runtimes_to_process[@]}"; do
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
