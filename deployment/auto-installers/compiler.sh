#!/bin/bash
# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

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

specific_runtime=""

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

# Do a single restore first to avoid conflicts
echo -e "${CYAN}Restoring packages...${NC}"
dotnet restore

echo -e "${CYAN}Starting concurrent build process...${NC}"

# Limit concurrent jobs to prevent system overload
maxConcurrentJobs=3  # Adjust based on your system
runningJobs=0

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

for runtime in "${runtimes_to_process[@]}"; do
    # Wait if we've hit the concurrent job limit
    while [ $runningJobs -ge $maxConcurrentJobs ]; do
        wait -n  # Wait for any background job to finish
        ((runningJobs--))
    done
    
    build_runtime "$runtime" &
    ((runningJobs++))
done

# Wait for all remaining background processes to complete
wait

echo -e "${CYAN}Build process completed!${NC}"
