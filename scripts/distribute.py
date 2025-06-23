#!/usr/bin/env python3
"""
Script to reorganize SineInstaller files from subdirectories.
- Finds SineInstaller or SineInstaller.exe files in subdirectories
- Renames them as "sine-{folder_name}" (preserving .exe extension if present)
- Moves renamed files to the root publish directory
- Deletes the now-empty subdirectories
"""

import os
import shutil
from pathlib import Path

def main():
    # Define the target directory
    script_dir = Path(__file__).parent.absolute()
    publish_dir = script_dir.parent / "deployment" / "auto-installers" / "publish"
    
    # Check if the directory exists
    if not publish_dir.exists():
        print(f"Error: Directory {publish_dir} does not exist!")
        return
    
    print(f"Processing directory: {publish_dir.resolve()}")
    
    # Track processed folders for cleanup
    folders_to_remove = []
    files_processed = 0
    
    # Iterate through all subdirectories
    for item in publish_dir.iterdir():
        if item.is_dir():
            folder_name = item.name
            print(f"\nChecking folder: {folder_name}")
            
            # Look for SineInstaller files in this folder
            installer_files = []
            
            # Check for both SineInstaller and SineInstaller.exe
            sine_installer = item / "SineInstaller"
            sine_installer_exe = item / "SineInstaller.exe"
            
            if sine_installer.exists() and sine_installer.is_file():
                installer_files.append(sine_installer)
            
            if sine_installer_exe.exists() and sine_installer_exe.is_file():
                installer_files.append(sine_installer_exe)
            
            # Process found installer files
            for installer_file in installer_files:
                # Determine new filename
                if installer_file.suffix.lower() == '.exe':
                    new_filename = f"sine-{folder_name}.exe"
                else:
                    new_filename = f"sine-{folder_name}"
                
                new_filepath = publish_dir / new_filename
                
                try:
                    # Move and rename the file
                    shutil.move(str(installer_file), str(new_filepath))
                    print(f"  ✓ Moved {installer_file.name} -> {new_filename}")
                    files_processed += 1
                    
                except Exception as e:
                    print(f"  ✗ Error moving {installer_file.name}: {e}")
                    continue
            
            # Mark folder for removal if we found installer files
            if installer_files:
                folders_to_remove.append(item)
            else:
                print(f"  - No SineInstaller files found in {folder_name}")
    
    # Remove the processed folders
    print(f"\nCleaning up folders...")
    for folder in folders_to_remove:
        try:
            shutil.rmtree(folder)
            print(f"  ✓ Removed folder: {folder.name}")
        except Exception as e:
            print(f"  ✗ Error removing folder {folder.name}: {e}")
    
    print(f"\nProcess completed!")
    print(f"Files processed: {files_processed}")
    print(f"Folders removed: {len(folders_to_remove)}")
    
    # List the final contents of the publish directory
    print(f"\nFinal contents of {publish_dir}:")
    try:
        for item in sorted(publish_dir.iterdir()):
            if item.is_file():
                print(f"  📄 {item.name}")
            elif item.is_dir():
                print(f"  📁 {item.name}/")
    except Exception as e:
        print(f"Error listing directory contents: {e}")

if __name__ == "__main__":
    main()