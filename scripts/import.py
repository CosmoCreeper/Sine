#!/usr/bin/env python3
"""
Imports engine files to the profile path specified in the .env file.
"""

import shutil
import sine_utils

print("\nImporting...")
print("=" * 25)

contents_to_copy = [
    sine_utils.source_dir / "sine.sys.mjs",
    sine_utils.source_dir / "engine"
]
sine_utils.verify_content(contents_to_copy)

destination_dir = sine_utils.get_profile_path() / "chrome" / "JS"

try:
    for item in contents_to_copy:
        destination = destination_dir / item.name

        if destination.exists():
            if destination.is_file():
                destination.unlink()
            else:
                shutil.rmtree(destination)

        if item.is_file():
            shutil.copy2(item, destination)
        else:
            shutil.copytree(item, destination)

        print(f"Copied {item.name} to {sine_utils.censor(destination)}")

    print(f"Files imported to: {sine_utils.censor(destination_dir)}")  
except Exception as e:
    print(f"Error copying files: {e}")
