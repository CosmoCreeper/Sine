#!/usr/bin/env python3
"""
Script to package engine files into a zip archive.
Grabs sine.uc.mjs file and engine folder from parent directory,
then packages them into ../deployment/engine.zip
"""

import os
import zipfile
from pathlib import Path

def create_engine_zip():
    # Get the script's directory
    script_dir = Path(__file__).parent.absolute()
    
    # Define source directory (one level up from script)
    source_dir = script_dir.parent
    
    # Define target files/folders
    sine_file = source_dir / "sine.uc.mjs"
    engine_folder = source_dir / "engine"
    
    # Define output directory and file
    deployment_dir = script_dir.parent / "deployment"
    output_zip = deployment_dir / "engine.zip"
    
    # Create deployment directory if it doesn't exist
    deployment_dir.mkdir(exist_ok=True)
    
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
    
    # Remove existing zip file if it exists
    if output_zip.exists():
        output_zip.unlink()
        print(f"Removed existing {output_zip}")
    
    # Create the zip file
    try:
        with zipfile.ZipFile(output_zip, 'w', zipfile.ZIP_DEFLATED) as zipf:
            # Add sine.uc.mjs file
            zipf.write(sine_file, sine_file.name)
            print(f"Added {sine_file.name}")
            
            # Add engine folder and all its contents
            for root, dirs, files in os.walk(engine_folder):
                for file in files:
                    file_path = Path(root) / file
                    # Calculate relative path from source directory
                    arcname = file_path.relative_to(source_dir)
                    zipf.write(file_path, arcname)
                    print(f"Added {arcname}")
        
        print(f"\nSuccessfully created {output_zip}")
        print(f"Archive size: {output_zip.stat().st_size:,} bytes")
        return True
        
    except Exception as e:
        print(f"Error creating zip file: {e}")
        return False

def main():
    print("\nEngine Packaging Script")
    print("=" * 30)
    
    if create_engine_zip():
        print("\nPackaging completed successfully!")
    else:
        print("\nPackaging failed!")
        exit(1)

if __name__ == "__main__":
    main()