#!/usr/bin/env python3
"""
Imports engine files to the profile path specified in the .env file.
"""

import shutil
import psutil
import sine_utils
import sys
import subprocess
import re
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
import time
import os
import pywinctl
import threading

shouldWatch = "--watch" in sys.argv
shouldRestart = "--restart" in sys.argv

print(f"\n{'Listening' if shouldWatch else 'Importing'}...")
print("=" * 25)

# Source paths
engine_src = sine_utils.source_dir / "engine"
sine_src = sine_utils.source_dir / "sine.sys.mjs"
locales_src = sine_utils.source_dir / "locales"

contents_to_copy = [sine_src, engine_src]
sine_utils.verify_content(contents_to_copy)

# Destination paths
destination_dir = sine_utils.get_env_path("PROFILE") / "chrome" / "JS"
locales_dst = destination_dir.parent / "locales"


def log(msg):
    if not shouldWatch:
        print(msg)


class WatchHandler(FileSystemEventHandler):
    timer = None

    def on_any_event(self, event):
        if self.timer:
            self.timer.cancel()

        self.timer = threading.Timer(
            4.5 if shouldRestart else 3,
            import_engine
        )
        self.timer.start()


def import_engine():
    if shouldWatch:
        start_time = time.time()
        print("\nChange detected, importing engine...")

    try:
        # Ensure destination exists
        destination_dir.mkdir(parents=True, exist_ok=True)

        # Copy engine + sine.sys.mjs into JS/
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

            log(f"Copied {item.name} to {sine_utils.censor(destination)}")

        # Copy locales one directory ABOVE JS/
        if locales_src.exists():
            if locales_dst.exists():
                shutil.rmtree(locales_dst)

            shutil.copytree(locales_src, locales_dst)
            log(f"Copied locales to {sine_utils.censor(locales_dst)}")

        log(f"Files imported to: {sine_utils.censor(destination_dir)}")

    except Exception as e:
        print(f"Error copying files: {e}")

    # Restart logic
    if shouldRestart:
        try:
            exe_path = sine_utils.get_env_path("EXE")
            executable_name = re.sub(r"^.*[\\/]", "", str(exe_path))

            processState = 0

            for proc in psutil.process_iter():
                if proc.name() == executable_name:
                    processState = 1
                    try:
                        active = pywinctl.getActiveWindow()
                        if not active or active.getAppName() != executable_name:
                            processState = 2
                            proc.kill()
                    except Exception:
                        processState = 2
                        proc.kill()

            if processState in (0, 2):
                subprocess.Popen([exe_path], stderr=subprocess.DEVNULL)

            log(f"Successfully restarted {executable_name}")

        except Exception as e:
            print(f"Error restarting: {e}")

    if shouldWatch:
        elapsed = round(time.time() - start_time, 2)
        print(f"Imported engine in {elapsed}s.\n")


if shouldWatch:
    observer = Observer()
    observer.schedule(WatchHandler(), sine_utils.source_dir, recursive=True)
    observer.start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()

    observer.join()
else:
    import_engine()

