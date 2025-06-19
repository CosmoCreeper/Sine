#!/usr/bin/env python3
"""
Script to import engine files to a profile path specified in .env file.
Reads PROFILE_PATH from ../.env and copies sine.uc.mjs and engine folder
to PROFILE_PATH/chrome/JS/
"""

import os
import shutil
from pathlib import Path
from dotenv import load_dotenv

def load_profile_path():
    """Load PROFILE_PATH from .env file in parent directory."""
    script_dir = Path(__file__).parent.absolute()
    env_file = script_dir.parent / ".env"
    
    if not env_file.exists():
        print(f"Error: .env file not found at {env_file}")
        return None
    
    # Load environment variables from .env file
    load_dotenv(env_file)
    
    profile_path = os.getenv('PROFILE_PATH')
    if not profile_path:
        print("Error: PROFILE_PATH not found in .env file")
        return None
    
    return Path(profile_path)

def copy_files_to_destination(source_dir, destination_dir):
    """Copy sine.uc.mjs and engine folder to destination."""
    sine_file = source_dir / "sine.uc.mjs"
    engine_folder = source_dir / "engine"
    
    # Check if source files exist
    if not sine_file.exists():
        print(f"Error: sine.uc.mjs not found at {sine_file}")
        return False
    
    if not engine_folder.exists():
        print(f"Error: engine folder not found at {engine_folder}")
        return False
    
    if not engine_folder.is_dir():
        print(f"Error: engine is not a directory at {engine_folder}")
        return False
    
    try:
        # Create destination directory if it doesn't exist
        destination_dir.mkdir(parents=True, exist_ok=True)
        print(f"Created/verified destination directory: {destination_dir}")
        
        # Copy sine.uc.mjs file
        dest_sine_file = destination_dir / sine_file.name
        shutil.copy2(sine_file, dest_sine_file)
        print(f"Copied {sine_file.name} to {dest_sine_file}")
        
        # Copy engine folder
        dest_engine_folder = destination_dir / engine_folder.name
        
        # Remove existing engine folder if it exists
        if dest_engine_folder.exists():
            shutil.rmtree(dest_engine_folder)
            print(f"Removed existing engine folder at {dest_engine_folder}")
        
        shutil.copytree(engine_folder, dest_engine_folder)
        print(f"Copied engine folder to {dest_engine_folder}")
        
        return True
        
    except Exception as e:
        print(f"Error copying files: {e}")
        return False

def main():
    print("\nEngine Import Script")
    print("=" * 25)
    
    # Get script directory and source directory
    script_dir = Path(__file__).parent.absolute()
    source_dir = script_dir.parent
    
    print(f"Script directory: {script_dir}")
    print(f"Source directory: {source_dir}")
    
    # Load profile path from .env
    profile_path = load_profile_path()
    if not profile_path:
        print("Failed to load profile path from .env file")
        exit(1)
    
    print(f"Profile path from .env: {profile_path}")
    
    # Construct destination path: PROFILE_PATH/chrome/JS
    chrome_js_path = profile_path / "chrome" / "JS"
    print(f"Destination path: {chrome_js_path}")
    
    # Verify profile path exists
    if not profile_path.exists():
        print(f"Error: Profile path does not exist: {profile_path}")
        exit(1)
    
    # Copy files to destination
    if copy_files_to_destination(source_dir, chrome_js_path):
        print("\nImport completed successfully!")
        print(f"Files imported to: {chrome_js_path}")
    else:
        print("\nImport failed!")
        exit(1)

if __name__ == "__main__":
    main()