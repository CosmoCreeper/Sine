#!/usr/bin/env python3
"""
Script to package engine files into a zip archive.
"""

import os
import zipfile
from pathlib import Path
import sine_utils
import time
import extract_update

print("\nPackaging engine...")
print("=" * 25)

start_time = time.time()
def log(msg):
    sine_utils.log(start_time, msg)

def package_zip(output_zip, zip_content, top_level_folder):
    sine_utils.verify_content([item for item, _ in zip_content])

    if output_zip.exists():
        output_zip.unlink()
        log(f"Removed existing {output_zip}")

    try:
        with zipfile.ZipFile(output_zip, "w", zipfile.ZIP_DEFLATED) as zipf:
            for item, item_prefix in zip_content:
                base = Path(top_level_folder) if top_level_folder else Path()
                if item_prefix:
                    base = base / item_prefix

                if item.is_dir():
                    for root, dirs, files in os.walk(item):
                        for file in files:
                            file_path = Path(root) / file
                            rel_path = file_path.relative_to(item)
                            arcname = base / rel_path
                            zipf.write(file_path, arcname)
                            log(f"Added {arcname}")
                else:
                    arcname = base / item.name

                    if item.parts[-1].endswith(".json"):
                        extract_update.run()
                        tmp = sine_utils.source_dir / "engine.tmp.json"
                        zipf.write(tmp, arcname)
                        tmp.unlink()
                    else:
                        zipf.write(item, arcname)

                    log(f"Added {arcname}")

        log(f"Successfully created {output_zip}")
        print(f"    {sine_utils.BLUE}>{sine_utils.RESET} Archive size: {output_zip.stat().st_size:,} bytes")
    except Exception as e:
        log(f"Error creating zip file: {e}")

engine_content = [
    (sine_utils.source_dir / "src", None),
    (sine_utils.source_dir / "locales", "locales"),
    (sine_utils.source_dir / "engine.json", None),
]
engine_location = sine_utils.source_dir / "engine.zip"
package_zip(engine_location, engine_content, "JS")

