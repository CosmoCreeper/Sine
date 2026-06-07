#!/usr/bin/env python3

# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""
Utility functions for Sine automation scripts.
"""

from pathlib import Path
import time

BLUE = "\033[94m"
RESET = "\033[0m"


def timestamp(start_time):
  elapsed = int(time.time() - start_time)
  minutes = elapsed // 60
  seconds = elapsed % 60
  return f"{BLUE}{minutes:02d}:{seconds:02d}{RESET}"


def log(start_time, msg):
  print(f"{timestamp(start_time)} {msg}")


def verify_content(content):
  for item in content:
    if not item.exists():
      print(f"Error: {item} does not exist.")
      exit(1)


source_dir = Path(__file__).parent.absolute().parent
