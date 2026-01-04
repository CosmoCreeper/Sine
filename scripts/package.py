#!/usr/bin/env python3
"""
Script to package engine files into a zip archive.
"""

import os
import zipfile
from pathlib import Path
import sine_utils

print("\nPackaging engine...")
print("=" * 25)

def package_zip(output_zip, zip_content, top_level_folder=None):
    sine_utils.verify_content(zip_content)

    if output_zip.exists():
        output_zip.unlink()
        print(f"Removed existing {sine_utils.censor(output_zip)}")

    try:
        with zipfile.ZipFile(output_zip, "w", zipfile.ZIP_DEFLATED) as zipf:
            for item in zip_content:
                if item.is_dir():
                    for root, dirs, files in os.walk(item):
                        for file in files:
                            file_path = Path(root) / file
                            # Make the path inside the zip
                            rel_path = file_path.relative_to(sine_utils.source_dir)
                            if top_level_folder:
                                arcname = Path(top_level_folder) / rel_path
                            else:
                                arcname = rel_path
                            zipf.write(file_path, arcname)
                            print(f"Added {arcname}")
                else:
                    if top_level_folder:
                        arcname = Path(top_level_folder) / item.name
                    else:
                        arcname = item.name
                    zipf.write(item, arcname)
                    print(f"Added {arcname}")

        print(f"\nSuccessfully created {sine_utils.censor(output_zip)}")
        print(f"Archive size: {output_zip.stat().st_size:,} bytes")
    except Exception as e:
        print(f"Error creating zip file: {e}")

engine_content = [
    sine_utils.source_dir / "sine.sys.mjs",
    sine_utils.source_dir / "engine"
]
engine_location = sine_utils.source_dir / "engine.zip"
package_zip(engine_location, engine_content, top_level_folder="JS")

print("\nPackaging locales...")
print("=" * 25)
locales_content = [
    sine_utils.source_dir / "locales"
]
locales_location = sine_utils.source_dir / "locales.zip"
package_zip(locales_location, locales_content)
