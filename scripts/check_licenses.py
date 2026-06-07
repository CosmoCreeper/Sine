#!/usr/bin/env python3

# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import os
import re
import sys

TARGET_EXTENSIONS = {".css", ".html", ".py", ".sh"}
EXCLUDE_PATTERNS = [
  r"node_modules/",
  r"\.config\.js$",
  r"dist/",
  r"\.git/",
  r"\.browsercfg/",
  r"\.venv/",
  r"src/assets/imports/",
]

EXPECTED_PHRASES = [
  "This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.",
  "If a copy of the MPL was not distributed with this file, You can obtain one at http:mozilla.org/MPL/2.0/.",
]

RED = "\033[31m"
GREEN = "\033[32m"
YELLOW = "\033[33m"
RESET = "\033[0m"


def is_excluded(filepath):
  return any(re.search(pattern, filepath) for pattern in EXCLUDE_PATTERNS)


def normalize_text(raw_text):
  top_chunk = raw_text[:1200]

  clean = re.sub(r"^#![^\r\n]*", "", top_chunk)
  clean = re.sub(r"<!--|-->", "", clean)
  clean = re.sub(r"\/\*|\*\/|\/\/|\*", "", clean)
  clean = re.sub(r"#", "", clean)
  clean = re.sub(r"\s+", " ", clean)
  return clean.strip()


def main():
  has_errors = False
  scanned_count = 0

  for root, _, files in os.walk("."):
    for file in files:
      filepath = os.path.join(root, file)
      normalized_path = filepath.replace("\\", "/")

      _, ext = os.path.splitext(file)
      if ext.lower() not in TARGET_EXTENSIONS:
        continue
      if is_excluded(normalized_path):
        continue

      scanned_count += 1

      try:
        with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
          raw_text = f.read()
      except Exception as e:
        print(f"{RED}Error reading file {filepath}: {e}{RESET}")
        has_errors = True
        continue

      normalized_top = normalize_text(raw_text)
      has_first = EXPECTED_PHRASES[0] in normalized_top
      has_second = EXPECTED_PHRASES[1] in normalized_top

      if not has_first or not has_second:
        if not has_errors:
          print("Missing MPL 2.0 header in:")
        print(filepath)
        has_errors = True

  print(f"\n--- Checked {scanned_count} files. ---")
  if has_errors:
    print(f"{RED}License checker failed. Please fix the above manually.{RESET}")
    sys.exit(1)
  else:
    print(f"{GREEN}All matching files contain a valid MPL 2.0 license header.{RESET}")
    sys.exit(0)


if __name__ == "__main__":
  main()
