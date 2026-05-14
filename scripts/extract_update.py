import json
import sine_utils

def run():
    engine_file = sine_utils.source_dir / "engine.json"
    with open(engine_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    tmp = sine_utils.source_dir / "engine.tmp.json"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data["updates"][0], f, indent=2)

if __name__ == "__main__":
    run()

