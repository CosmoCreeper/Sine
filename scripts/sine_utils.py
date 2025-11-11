#!/usr/bin/env python3
"""
Utility functions for Sine automation scripts.
"""

import sys
import re
from dotenv import load_dotenv
import os
import getpass
from pathlib import Path

def censor(path):
    censored_path = path
    if "--censor" in sys.argv:
        censored_path = re.sub(
            r"(\\Users\\|/home/)[^/\\]*([/\\])",
            r"\1...\2",
            str(path)
        )
    return censored_path

def verify_content(content):
    for item in content:
        if not item.exists():
            print(f"Error: {item} does not exist.")
            exit(1)

def get_env_path(key):
    load_dotenv(source_dir / ".env")
    path = os.getenv(key + "_PATH")
    if not path:
        print("Error: PROFILE_PATH not found in .env file")
        exit(1)
    
    path = Path(re.sub(r"^~/", f"/home/{getpass.getuser()}/", path))
    if not path.exists():
        print(f"Error: Profile path does not exist: {censor(path)}")
        exit(1)
    
    return path

source_dir = Path(__file__).parent.absolute().parent
