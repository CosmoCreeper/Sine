#!/usr/bin/env python3
"""
Script to update timestamps in engine.json and sine.uc.mjs files.
Updates the updatedAt property to current date and time.
Optionally updates version in engine.json if specified as command line argument.

Usage:
    python update_timestamps.py              # Update timestamps only
    python update_timestamps.py 1.2.3       # Update timestamps and version
"""

import json
import re
import sys
from datetime import datetime
from pathlib import Path

def get_current_timestamp():
    """Get current date and time in yyyy-mm-dd hr:mn format."""
    now = datetime.now()
    return now.strftime("%Y-%m-%d %H:%M")

def update_engine_json(engine_json_path, new_version=None):
    """Update engine.json with new timestamp and optionally new version."""
    try:
        # Read the JSON file
        with open(engine_json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Update updatedAt
        current_time = get_current_timestamp()
        data['updatedAt'] = current_time
        print(f"Updated engine.json updatedAt to: {current_time}")
        
        # Update version if provided
        if new_version:
            data['version'] = new_version
            print(f"Updated engine.json version to: {new_version}")
        
        # Write back to file with proper formatting
        with open(engine_json_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        
        return True
        
    except FileNotFoundError:
        print(f"Error: engine.json not found at {engine_json_path}")
        return False
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in engine.json - {e}")
        return False
    except Exception as e:
        print(f"Error updating engine.json: {e}")
        return False

def update_sine_file(sine_file_path):
    """Update sine.uc.mjs with new timestamp in updatedAt property."""
    try:
        # Read the file
        with open(sine_file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Pattern to match updatedAt: "any date and time"
        pattern = r'updatedAt:\s*["\'][^"\']*["\']'
        
        # Check if pattern exists
        if not re.search(pattern, content):
            print(f"Warning: updatedAt property not found in {sine_file_path}")
            return False
        
        # Replace first occurrence with new timestamp
        current_time = get_current_timestamp()
        new_content = re.sub(pattern, f'updatedAt: "{current_time}"', content, count=1)
        
        # Write back to file
        with open(sine_file_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        
        print(f"Updated sine.uc.mjs updatedAt to: {current_time}")
        return True
        
    except FileNotFoundError:
        print(f"Error: sine.uc.mjs not found at {sine_file_path}")
        return False
    except Exception as e:
        print(f"Error updating sine.uc.mjs: {e}")
        return False

def main():
    print("\nUpdate Timestamps Script")
    print("=" * 30)
    
    # Get script directory
    script_dir = Path(__file__).parent.absolute()
    parent_dir = script_dir.parent
    
    # Define file paths
    engine_json_path = parent_dir / "data" / "engine.json"
    sine_file_path = parent_dir / "sine.uc.mjs"
    
    print(f"Engine JSON path: {engine_json_path}")
    print(f"Sine file path: {sine_file_path}")
    
    # Check for version argument
    new_version = None
    if len(sys.argv) > 1:
        new_version = sys.argv[1]
        print(f"Version specified: {new_version}")
    
    # Update files
    success_count = 0
    
    # Update engine.json
    if update_engine_json(engine_json_path, new_version):
        success_count += 1
    
    # Update sine.uc.mjs
    if update_sine_file(sine_file_path):
        success_count += 1
    
    # Summary
    print("\n" + "=" * 30)
    if success_count == 2:
        print("All files updated successfully!")
        print(f"Timestamp used: {get_current_timestamp()}")
        if new_version:
            print(f"Version updated to: {new_version}")
    elif success_count == 1:
        print("Partial update completed - some files had errors")
    else:
        print("Update failed - check error messages above")
        exit(1)

if __name__ == "__main__":
    main()