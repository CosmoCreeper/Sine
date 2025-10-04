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

def get_profile_path():
    load_dotenv(source_dir / ".env")
    profile_path = os.getenv("PROFILE_PATH")
    if not profile_path:
        print("Error: PROFILE_PATH not found in .env file")
        exit(1)
    
    profile_path = Path(re.sub(r"^~/", f"/home/{getpass.getuser()}/", profile_path))
    if not profile_path.exists():
        print(f"Error: Profile path does not exist: {censor(profile_path)}")
        exit(1)
    
    return profile_path

source_dir = Path(__file__).parent.absolute().parent
