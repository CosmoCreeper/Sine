#!/usr/bin/env python3
"""
Script to update timestamps in engine metadata.
Updates the updatedAt property to current date and time.
Optionally updates version in engine.json if specified as command line argument.

Usage:
    python update_timestamps.py              # Update timestamps only
    python update_timestamps.py --version=1.2.3       # Update timestamps and version
"""

import json
import sys
from datetime import datetime
import sine_utils

print("\nUpdating...")
print("=" * 25)

engine_json_path = sine_utils.source_dir / "deployment" / "engine.json"

current_time = datetime.now().strftime("%Y-%m-%d %H:%M")

# Check for version argument
new_version = None
for arg in sys.argv:
    if arg.startswith("--version="):
        new_version = arg.removeprefix("--version=")
        print(f"Version specified: {new_version}")

# Update engine.json
try:
    # Read the JSON file
    with open(engine_json_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    # Update updatedAt
    data["updatedAt"] = current_time
    print(f"Updated engine.json updatedAt to: {current_time}")
    
    # Update version if provided
    if new_version:
        data["version"] = new_version
        print(f"Updated engine.json version to: {new_version}")
    
    # Write back to file with proper formatting
    with open(engine_json_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)  
except FileNotFoundError:
    print(f"Error: engine.json not found at {sine_utils.censor(engine_json_path)}")
except json.JSONDecodeError as e:
    print(f"Error: Invalid JSON in engine.json - {e}")
except Exception as e:
    print(f"Error updating engine.json: {e}")

# Summary
print("\n" + "=" * 25)
print("All files updated successfully!")
print(f"Timestamp used: {current_time}")
if new_version:
    print(f"Version updated to: {new_version}")
