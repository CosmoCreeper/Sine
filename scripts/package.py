#!/usr/bin/env python3
"""
Script to package engine files into a zip archive.
"""

import os
import zipfile
from pathlib import Path
import sine_utils

print("\nPackaging...")
print("=" * 25)

# Define and verify target files/folders
zip_content = [
    sine_utils.source_dir / "sine.sys.mjs",
    sine_utils.source_dir / "engine"
]
sine_utils.verify_content(zip_content)

# Define zip location
output_zip = sine_utils.source_dir / "deployment" / "engine.zip"
# Delete any pre-existing zip files
if output_zip.exists():
    output_zip.unlink()
    print(f"Removed existing {sine_utils.censor(output_zip)}")

# Create the zip file
try:
    with zipfile.ZipFile(output_zip, "w", zipfile.ZIP_DEFLATED) as zipf:
        for item in zip_content:
            if item.is_dir():
                for root, dirs, files in os.walk(item):
                    for file in files:
                        file_path = Path(root) / file
                        arcname = file_path.relative_to(sine_utils.source_dir)
                        zipf.write(file_path, arcname)
                        print(f"Added {arcname}")
            else:
                zipf.write(item, item.name)
                print(f"Added {item.name}")
    
    print(f"\nSuccessfully created {sine_utils.censor(output_zip)}")
    print(f"Archive size: {output_zip.stat().st_size:,} bytes")
except Exception as e:
    print(f"Error creating zip file: {e}")
