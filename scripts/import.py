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

shouldWatch = "--watch" in sys.argv
shouldRestart = "--restart" in sys.argv

print(f"\n{"Listening" if shouldWatch else "Importing"}...")
print("=" * 25)

contents_to_copy = [
    sine_utils.source_dir / "sine.sys.mjs",
    sine_utils.source_dir / "engine"
]
sine_utils.verify_content(contents_to_copy)

destination_dir = sine_utils.get_env_path("PROFILE") / "chrome" / "JS"

def log(string):
    if not shouldWatch:
        print(string)

class WatchHandler(FileSystemEventHandler):
    timer = None

    def on_modified(self, event):
        root_item = os.path.relpath(event.src_path, sine_utils.source_dir).split(os.sep)[0]
        watch_items = ["engine", "sine.sys.mjs"]
        if not root_item in watch_items:
            return

        if self.timer:
            self.timer.cancel()

        import threading
        self.timer = threading.Timer(4.5 if shouldRestart else 3, import_engine)
        self.timer.start()

def import_engine():
    if shouldWatch:
        start_time = time.time()
        print(f"\nChange detected, importing engine...")

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

            log(f"Copied {item.name} to {sine_utils.censor(destination)}")

        log(f"Files imported to: {sine_utils.censor(destination_dir)}")  
    except Exception as e:
        print(f"Error copying files: {e}")

    if shouldRestart:
        try:
            executable_name = re.sub(r"^.*[\\/]", "", str(sine_utils.get_env_path("EXE")))

            processState = 0
            for proc in psutil.process_iter():
                if proc.name() == executable_name:
                    processState = 1
                    if pywinctl.getActiveWindow().getAppName() != executable_name:
                        processState = 2
                        proc.kill()

            if processState == 0 or processState == 2:
                subprocess.Popen(
                    [sine_utils.get_env_path("EXE")],
                    stderr=subprocess.DEVNULL
                )

            log(f"Successfully restarted {executable_name}")
        except Exception as e:
            print(f"Error restarting: {e}")
    
    if shouldWatch:
        import_time = time.time() - start_time
        print(f"Imported engine in {round(import_time, 2)}s.\n")

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