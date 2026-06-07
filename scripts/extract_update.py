#!/usr/bin/env python3

# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

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
