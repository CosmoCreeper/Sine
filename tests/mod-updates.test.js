/**
 * @file Native regression tests for mod update decisions and replacement failures.
 * @license
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

// Promise-returning network doubles and ordered native-I/O fixtures are intentional.
/* oxlint-disable eslint/require-await, eslint/no-await-in-loop, oxc/no-rest-spread-properties */

const updater = ChromeUtils.importESModule(
  "chrome://userscripts/content/core/manager.sys.mjs"
).default;
const modUtils = ChromeUtils.importESModule(
  "chrome://userscripts/content/core/utils.sys.mjs"
).default;
const updateAPI = ChromeUtils.importESModule(
  "chrome://userscripts/content/utils/uc_api.sys.mjs"
).default;

/**
 * Assert a consumer-visible invariant.
 *
 * @param {unknown} value - Invariant result.
 * @param {string} message - Failure description.
 */
const check = (value, message) => {
  if (!value) throw new Error(message);
};

/**
 * A metadata fixture with a real source URL shape.
 *
 * @param {string} id - Fixture mod ID.
 * @param {object} extra - Metadata overrides.
 * @returns {object} Installed metadata.
 */
const entry = (id, extra = {}) => {
  return {
    id,
    name: id,
    homepage: `https://github.com/example/${id}`,
    enabled: true,
    version: "1.0.0",
    updatedAt: "2026-01-01",
    style: { chrome: "userChrome.css" },
    ...extra,
  };
};

/**
 * Run only in the isolated test profile; restore registry and network hooks.
 *
 * @param {(state: object) => Promise<unknown>} callback - Test body.
 * @returns {Promise<unknown>} Test result after cleanup.
 */
const fixture = async (callback) => {
  check(
    Services.prefs.getBoolPref("browsercfg.test.active", false),
    "isolated test profile required"
  );
  const before = await IOUtils.readUTF8(modUtils.modsDataFile);
  const hooks = { fetch: updateAPI.fetch, unpackRemoteArchive: updateAPI.unpackRemoteArchive };
  const manager = new updater.constructor();
  const ids = [];
  const state = {
    manager,
    async seed(id, extra) {
      ids.push(id);
      const current = entry(id, extra);
      const folder = modUtils.getModFolder(id);
      await IOUtils.makeDirectory(folder, { ignoreExisting: true });
      await IOUtils.writeUTF8(PathUtils.join(folder, "userChrome.css"), "/* last working */");
      const registry = await modUtils.getMods();
      registry[id] = current;
      await IOUtils.writeJSON(modUtils.modsDataFile, registry);
      return current;
    },
  };
  try {
    await IOUtils.writeJSON(modUtils.modsDataFile, {});
    return await callback(state);
  } finally {
    Object.assign(updateAPI, hooks);
    await IOUtils.writeUTF8(modUtils.modsDataFile, before);
    for (const id of ids) {
      for (const name of [id, `tmp-${id}`]) {
        await IOUtils.remove(modUtils.getModFolder(name), { recursive: true, ignoreAbsent: true });
      }
    }
  }
};

/**
 * Stand in only for archive transport; keep filesystem and registry changes real.
 *
 * @param {object} options - Actual extraction destination and ID from Sine.
 * @returns {Promise<string[]>} Extracted entry names.
 */
const payload = async (options) => {
  const folder = PathUtils.join(options.extractDir, options.id);
  await IOUtils.makeDirectory(folder, { ignoreExisting: true });
  await IOUtils.writeUTF8(PathUtils.join(folder, "userChrome.css"), "/* new payload */");
  return [`${options.id}/userChrome.css`];
};

it("registry and internal transaction names cannot be used as mod IDs", () => {
  for (const id of [
    "mods.json",
    "MODS.JSON",
    "mods.json.tmp",
    "chrome.css",
    "content.css",
    ".sine-update-test",
  ]) {
    let rejected = false;
    try {
      modUtils.getModFolder(id);
    } catch {
      rejected = true;
    }
    check(rejected, `reserved mod ID was accepted: ${id}`);
  }
});

for (const id of ["previous", "selected", "download.zip"]) {
  it(`mod ID ${id} cannot collide with internal staging paths`, () =>
    fixture(async ({ manager, seed }) => {
      const current = await seed(id, {
        homepage: "https://github.com/example/test/tree/main/nested",
      });
      updateAPI.unpackRemoteArchive = async (options) => {
        await IOUtils.writeUTF8(options.zipPath, "fixture archive transport");
        const root = PathUtils.join(options.extractDir, options.id, "nested");
        await IOUtils.makeDirectory(root, { ignoreExisting: true });
        await IOUtils.writeUTF8(PathUtils.join(root, "userChrome.css"), "/* staged */");
        return [`${options.id}/nested/userChrome.css`];
      };
      await manager.syncModData(
        current.homepage,
        { [id]: current },
        { ...current, version: "2.0.0" },
        current
      );
      check(
        (await modUtils.getMods())[id].version === "2.0.0",
        "staging name collision prevented update"
      );
      check(
        (await IOUtils.getChildren(modUtils.getModFolder(id))).length === 1,
        "internal backup files leaked into the activated payload"
      );
    }));
}

it("store commits detect updates without dates", () =>
  fixture(async ({ manager, seed }) => {
    const current = await seed("test-store-date", { origin: "store", commit: "a".repeat(40) });
    delete current.updatedAt;
    let synced = false;
    manager.syncModData = async () => {
      synced = true;
      return false;
    };
    await manager.processModUpdate(
      current,
      { [current.id]: current },
      {
        [current.id]: { ...current, version: "2.0.0", commit: "b".repeat(40) },
      }
    );
    check(synced, "different store commit was silently skipped");
  }));

it("unchanged store commits do not redownload", () =>
  fixture(async ({ manager, seed }) => {
    const current = await seed("test-store-current", { origin: "store", commit: "a".repeat(40) });
    delete current.updatedAt;
    manager.syncModData = async () => {
      throw new Error("unnecessary download");
    };
    const result = await manager.processModUpdate(
      current,
      { [current.id]: current },
      { [current.id]: current }
    );
    check(!result.changed, "unchanged commit reported updated");
  }));

it("store origin selects the store even without a homepage", () =>
  fixture(async ({ manager, seed }) => {
    const current = await seed("test-store-origin", {
      origin: "store",
      homepage: "",
      commit: "a".repeat(40),
    });
    updateAPI.fetch = async () => {
      throw new Error("wrong source requested");
    };
    let source;
    manager.syncModData = async (value) => {
      source = value;
      return false;
    };
    await manager.processModUpdate(
      current,
      { [current.id]: current },
      {
        [current.id]: {
          ...current,
          homepage: "https://github.com/example/test",
          commit: "b".repeat(40),
        },
      }
    );
    check(source === "{store}", "store source was not preserved");
  }));

it("removed store entries are failures, not up-to-date", () =>
  fixture(async ({ manager, seed }) => {
    const current = await seed("test-store-missing", { origin: "store" });
    let rejected = false;
    try {
      await manager.processModUpdate(current, { [current.id]: current }, {});
    } catch {
      rejected = true;
    }
    check(rejected, "missing store entry reported unchanged");
  }));

it("newer explicit versions are detected on the same date", () =>
  fixture(async ({ manager, seed }) => {
    const current = await seed("test-same-day");
    updateAPI.fetch = async () => ({ ...current, version: "1.0.1" });
    let synced = false;
    manager.syncModData = async () => {
      synced = true;
      return false;
    };
    await manager.processModUpdate(current, { [current.id]: current }, null);
    check(synced, "same-day release was skipped");
  }));

it("missing archive subfolders never report an update", () =>
  fixture(async ({ manager, seed }) => {
    const current = await seed("test-missing-folder", {
      homepage: "https://github.com/example/test/tree/main/missing",
    });
    updateAPI.fetch = async () => ({ ...current, version: "2.0.0", updatedAt: "2026-02-01" });
    updateAPI.unpackRemoteArchive = payload;
    let changed = false;
    try {
      changed = (await manager.processModUpdate(current, { [current.id]: current }, null)).changed;
    } catch {}
    check(!changed, "rollback was reported as a successful update");
    check(
      (await IOUtils.readUTF8(
        PathUtils.join(modUtils.getModFolder(current.id), "userChrome.css")
      )) === "/* last working */",
      "working files were not preserved"
    );
  }));

it("archive transport failure preserves the working installation", () =>
  fixture(async ({ manager, seed }) => {
    const current = await seed("test-download-failed");
    updateAPI.unpackRemoteArchive = async () => {
      throw new Error("injected transport failure");
    };
    try {
      await manager.syncModData(
        current.homepage,
        { [current.id]: current },
        { ...current, version: "2.0.0" },
        current
      );
    } catch {}
    check(
      await IOUtils.exists(PathUtils.join(modUtils.getModFolder(current.id), "userChrome.css")),
      "failed download removed the live installation"
    );
    check(
      (await modUtils.getMods())[current.id].version === "1.0.0",
      "failed download changed registry"
    );
  }));

it("invalid replacement payload preserves the old entrypoint", () =>
  fixture(async ({ manager, seed }) => {
    const current = await seed("test-empty-payload");
    updateAPI.unpackRemoteArchive = async (options) => {
      await IOUtils.makeDirectory(PathUtils.join(options.extractDir, options.id), {
        ignoreExisting: true,
      });
      return [];
    };
    try {
      await manager.syncModData(
        current.homepage,
        { [current.id]: current },
        { ...current, version: "2.0.0" },
        current
      );
    } catch {}
    check(
      await IOUtils.exists(PathUtils.join(modUtils.getModFolder(current.id), "userChrome.css")),
      "empty payload replaced a working mod"
    );
  }));

it("registry write failure restores files and old metadata", () =>
  fixture(async ({ manager, seed }) => {
    const current = await seed("test-registry-failure");
    updateAPI.unpackRemoteArchive = payload;
    let rejected = false;
    await IOUtils.setPermissions(modUtils.modsDataFile, 0o444);
    try {
      try {
        await manager.syncModData(
          current.homepage,
          { [current.id]: current },
          { ...current, version: "2.0.0" },
          current
        );
      } catch {
        rejected = true;
      }
    } finally {
      await IOUtils.setPermissions(modUtils.modsDataFile, 0o666);
    }
    check(rejected, "test environment did not reject a read-only registry write");
    check(
      (await IOUtils.readUTF8(
        PathUtils.join(modUtils.getModFolder(current.id), "userChrome.css")
      )) === "/* last working */",
      "registry failure did not roll back the payload"
    );
  }));

it("failed checks do not suppress healthy updates or their reload", () =>
  fixture(async ({ manager, seed }) => {
    await seed("test-bad");
    await seed("test-good");
    let rebuilt = false,
      loaded = false;
    manager.processModUpdate = async (current) => {
      if (current.id === "test-bad") throw new Error("injected metadata failure");
      return { changed: true, id: current.id, modHasJS: false };
    };
    manager.rebuildMods = async () => {
      rebuilt = true;
    };
    manager.loadMods = async () => {
      loaded = true;
    };
    let result;
    try {
      result = await manager.updateMods("manual");
    } catch {}
    check(rebuilt && loaded, "healthy mod was not reloaded after another mod failed");
    check(
      result.failed.length === 1 && result.updated.includes("test-good"),
      "partial failure was not reported"
    );
  }));

it("concurrent manual checks share one update operation", () =>
  fixture(async ({ manager, seed }) => {
    await seed("test-single-flight");
    let finish,
      entered,
      calls = 0;
    const started = new Promise((resolve) => {
      entered = resolve;
    });
    const release = new Promise((resolve) => {
      finish = resolve;
    });
    manager.processModUpdate = async () => {
      calls++;
      entered();
      await release;
      return { changed: false };
    };
    const first = manager.updateMods("manual");
    await started;
    const second = manager.updateMods("manual");
    // If a second operation starts, release both through a shared completion promise.
    finish();
    await Promise.all([first, second]);
    check(calls === 1, "duplicate update operation started");
  }));

it("independent registry commits preserve both updates", () =>
  fixture(async ({ manager, seed }) => {
    const a = await seed("test-merge-a"),
      b = await seed("test-merge-b");
    const dependency = await seed("test-merge-dependency");
    updateAPI.unpackRemoteArchive = payload;
    const snapshot = await modUtils.getMods();
    await Promise.all(
      [a, b].map((current) =>
        manager.syncModData(
          current.homepage,
          snapshot,
          { ...current, version: "2.0.0", modules: [dependency.homepage] },
          current
        )
      )
    );
    const saved = await modUtils.getMods();
    check(
      saved[a.id].version === "2.0.0" && saved[b.id].version === "2.0.0",
      "one registry commit was lost"
    );
  }));

it("update commit preserves a disable made while downloading", () =>
  fixture(async ({ manager, seed }) => {
    const current = await seed("test-disable-race");
    let finish, entered;
    const started = new Promise((resolve) => {
      entered = resolve;
    });
    const release = new Promise((resolve) => {
      finish = resolve;
    });
    updateAPI.unpackRemoteArchive = async (options) => {
      entered();
      await release;
      return payload(options);
    };
    const install = manager.syncModData(
      current.homepage,
      { [current.id]: current },
      { ...current, version: "2.0.0" },
      current
    );
    await started;
    const saved = await modUtils.getMods();
    saved[current.id].enabled = false;
    saved[current.id]["no-updates"] = true;
    await IOUtils.writeJSON(modUtils.modsDataFile, saved);
    finish();
    await install;
    const result = (await modUtils.getMods())[current.id];
    check(!result.enabled && result["no-updates"], "update overwrote the user's current choices");
  }));

it("successful update waits for reload completion", () =>
  fixture(async ({ manager, seed }) => {
    await seed("test-await-reload");
    manager.processModUpdate = async (current) => ({
      changed: true,
      id: current.id,
      modHasJS: false,
    });
    let finish, entered;
    const started = new Promise((resolve) => {
      entered = resolve;
    });
    const release = new Promise((resolve) => {
      finish = resolve;
    });
    manager.rebuildMods = () => {
      entered();
      return release;
    };
    manager.loadMods = async () => null;
    let completed = false;
    const operation = manager.updateMods("manual").then(() => {
      completed = true;
      return null;
    });
    await started;
    // Drain the metadata microtasks; release the gate even when the assertion fails.
    for (let i = 0; i < 12; i++) await Promise.resolve();
    const early = completed;
    finish();
    await operation;
    check(!early, "update completed before rebuild");
  }));

it("metadata transport failures produce an actionable failure, not a TypeError", () =>
  fixture(async ({ manager, seed }) => {
    const current = await seed("test-metadata-failure");
    // A swallowed transport failure returns no data in the existing API.
    // oxlint-disable-next-line eslint/no-empty-function
    updateAPI.fetch = async () => {};
    let error;
    try {
      await manager.processModUpdate(current, { [current.id]: current }, null);
    } catch (caught) {
      error = caught;
    }
    check(error && error.name !== "TypeError", "metadata failure did not retain its stage");
  }));

it("unusable metadata never reports up-to-date", () =>
  fixture(async ({ manager, seed }) => {
    await seed("test-invalid-date");
    updateAPI.fetch = async () => ({ version: "1.0.0", updatedAt: "not-a-date" });
    const result = await manager.updateMods("manual");
    check(
      result.failed.length === 1 && !result.updated.length,
      "invalid identity was reported current"
    );
  }));

it("missing theme.json remains supported for plain CSS repositories", () =>
  fixture(async ({ manager, seed }) => {
    const current = await seed("test-no-theme-json");
    updateAPI.fetch = async (url) =>
      url.endsWith("theme.json")
        ? "404: Not Found"
        : { description: "CSS repository", updated_at: "2026-02-01T00:00:00Z" };
    let synced = false;
    manager.syncModData = async () => {
      synced = true;
      return false;
    };
    await manager.processModUpdate(current, { [current.id]: current }, null);
    check(synced, "optional theme.json became mandatory");
  }));

it("explicit version 1.0.0 is not replaced with the installed version", () =>
  fixture(async ({ manager, seed }) => {
    const current = await seed("test-explicit-version", { version: "2.0.0" });
    updateAPI.fetch = async () => ({
      ...current,
      version: "1.0.0",
      updatedAt: "2026-02-01",
      description: "Explicit reset",
    });
    let version;
    manager.syncModData = async (_source, _mods, next) => {
      version = next.version;
      return false;
    };
    await manager.processModUpdate(current, { [current.id]: current }, null);
    check(version === "1.0.0", "explicit upstream version was overwritten");
  }));

it("single-mod subfolder archives install their scripts relative to the selected folder", () =>
  fixture(async ({ manager, seed }) => {
    const current = await seed("test-subfolder", {
      homepage: "https://github.com/example/test/tree/main/nested",
    });
    updateAPI.unpackRemoteArchive = async (options) => {
      const root = PathUtils.join(options.extractDir, options.id, "nested");
      await IOUtils.makeDirectory(root, { ignoreExisting: true });
      await IOUtils.writeUTF8(PathUtils.join(root, "userChrome.css"), "/* nested */");
      await IOUtils.writeUTF8(PathUtils.join(root, "main.uc.js"), "// nested script");
      return ["userChrome.css", "main.uc.js", "theme.json"].map(
        (name) => `${options.id}/nested/${name}`
      );
    };
    await manager.syncModData(
      current.homepage,
      { [current.id]: current },
      {
        ...current,
        scripts: { "main.uc.js": { include: ["chrome://browser/content/browser.xhtml"] } },
      },
      current
    );
    check(
      await IOUtils.exists(PathUtils.join(modUtils.getModFolder(current.id), "main.uc.js")),
      "script left under an unexpected nested folder"
    );
  }));

it("encoded folder names and absolute stylesheet URLs resolve within the selected mod", () =>
  fixture(async ({ manager, seed }) => {
    const current = await seed("test-encoded-folder", {
      homepage: "https://github.com/example/test/tree/main/nested%20mod",
    });
    updateAPI.unpackRemoteArchive = async (options) => {
      const root = PathUtils.join(options.extractDir, options.id, "nested mod");
      await IOUtils.makeDirectory(root, { ignoreExisting: true });
      await IOUtils.writeUTF8(PathUtils.join(root, "alternate.css"), "/* custom entrypoint */");
      return [`${options.id}/nested mod/alternate.css`, `${options.id}/nested mod/theme.json`];
    };
    await manager.syncModData(
      current.homepage,
      { [current.id]: current },
      {
        ...current,
        style: {
          chrome: "https://raw.githubusercontent.com/example/test/main/nested%20mod/alternate.css",
        },
      },
      current
    );
    const saved = (await modUtils.getMods())[current.id];
    check(saved.style.chrome === "alternate.css", "explicit stylesheet path was not resolved");
    check(
      await IOUtils.exists(PathUtils.join(modUtils.getModFolder(current.id), "alternate.css")),
      "selected payload missing"
    );
  }));

it("disabled mods and opted-out updates are not checked", () =>
  fixture(async ({ manager, seed }) => {
    await seed("test-disabled", { enabled: false });
    await seed("test-opted-out", { "no-updates": true });
    manager.processModUpdate = async () => {
      throw new Error("opt-out ignored");
    };
    const result = await manager.updateMods("manual");
    check(!result.failed.length && !result.updated.length, "excluded mods were checked");
  }));

it("generated fallback metadata preserves installed labels and version", () =>
  fixture(async ({ manager, seed }) => {
    const current = await seed("test-generated-version", { version: "2.3.4" });
    updateAPI.fetch = async (url) =>
      url.endsWith("theme.json") ? { updatedAt: "2026-02-01" } : {};
    let candidate;
    manager.syncModData = async (_source, _mods, next) => {
      candidate = next;
      return false;
    };
    await manager.processModUpdate(current, { [current.id]: current }, null);
    check(
      candidate.version === "2.3.4" && candidate.name === current.name,
      "generated metadata replaced installed author information"
    );
  }));

it("a real release tagged 1.0.0 is not mistaken for a generated fallback", () =>
  fixture(async ({ manager, seed }) => {
    const current = await seed("test-release-version", { version: "2.3.4" });
    updateAPI.fetch = async (url) => {
      if (url.endsWith("theme.json")) return "404: Not Found";
      if (url.endsWith("releases/latest")) return { tag_name: "v1.0.0" };
      return { updated_at: "2026-02-01", description: "Release" };
    };
    let candidate;
    manager.syncModData = async (_source, _mods, next) => {
      candidate = next;
      return false;
    };
    await manager.processModUpdate(current, { [current.id]: current }, null);
    check(candidate.version === "1.0.0", "explicit release version was overwritten");
  }));

it("uninstall registry failures restore the installed payload", () =>
  fixture(async ({ manager, seed }) => {
    const current = await seed("test-remove-write-failure");
    let rejected = false;
    await IOUtils.setPermissions(modUtils.modsDataFile, 0o444);
    try {
      await manager.removeMod(current.id);
    } catch {
      rejected = true;
    } finally {
      await IOUtils.setPermissions(modUtils.modsDataFile, 0o666);
    }
    check(rejected, "read-only registry did not reject removal");
    check(
      await IOUtils.exists(PathUtils.join(modUtils.getModFolder(current.id), "userChrome.css")),
      "uninstall removed files despite a failed registry commit"
    );
    check((await modUtils.getMods())[current.id], "failed uninstall erased metadata");
  }));

for (const declaration of [
  { scripts: { nested: { "main.uc.mjs": {} } } },
  { chromeManifest: "missing.manifest" },
]) {
  it(`missing declared ${declaration.scripts ? "script" : "manifest"} rejects replacement`, () =>
    fixture(async ({ manager, seed }) => {
      const current = await seed("test-declared-entrypoint");
      updateAPI.unpackRemoteArchive = payload;
      let rejected = false;
      try {
        await manager.syncModData(
          current.homepage,
          { [current.id]: current },
          { ...current, ...declaration, version: "2.0.0" },
          current
        );
      } catch {
        rejected = true;
      }
      check(rejected, "nonexistent declared entrypoint was accepted");
      check(
        (await modUtils.getMods())[current.id].version === "1.0.0",
        "invalid payload committed"
      );
    }));
}

it("activation failure retains committed update IDs and refreshes the list", () =>
  fixture(async ({ manager, seed }) => {
    await seed("test-reload-report");
    manager.processModUpdate = async (current) => ({ changed: true, id: current.id });
    manager.rebuildMods = async () => {
      throw new Error("injected reload failure");
    };
    let refreshed = false;
    manager.loadMods = async () => {
      refreshed = true;
    };
    const result = await manager.updateMods("manual");
    check(
      result.updated.includes("test-reload-report") && result.failed.some((x) => x.id === "reload"),
      "activation failure lost the committed update outcome"
    );
    check(refreshed, "activation failure suppressed settings refresh");
  }));

it("imports install canonical metadata without restoring stale exported fields", () =>
  fixture(async ({ manager, seed }) => {
    const current = await seed("test-import");
    const exported = {
      ...current,
      origin: "store",
      version: "0.1.0",
      enabled: false,
      "no-updates": true,
      scripts: { "obsolete.uc.js": {} },
    };
    let source;
    manager.installMod = async (repo, origin, reload) => {
      source = [repo, origin, reload];
      await modUtils.mutateMods((latest) => {
        latest[current.id] = { ...current, version: "2.0.0" };
      });
      return current.id;
    };
    manager.rebuildMods = async () => null;
    manager.loadMods = async () => null;
    await manager.importMods({ [current.id]: exported });
    const installed = (await modUtils.getMods())[current.id];
    check(
      source[0] === current.id && source[1] === "store" && !source[2],
      "store import bypassed catalog"
    );
    check(
      installed.version === "2.0.0" && !installed.scripts,
      "import overwrote canonical metadata"
    );
    check(!installed.enabled && installed["no-updates"], "import lost explicit user choices");
  }));

for (const committed of [false, true]) {
  it(`startup reconciles an interrupted update ${committed ? "after" : "before"} registry commit`, () =>
    fixture(async ({ seed }) => {
      const current = await seed("test-recover-update");
      const next = { ...current, version: "2.0.0" };
      const stage = PathUtils.join(
        modUtils.modsDir,
        `.sine-update-test-${Services.uuid.generateUUID()}`
      );
      await IOUtils.makeDirectory(stage);
      try {
        await IOUtils.writeJSON(PathUtils.join(stage, "transaction.json"), {
          id: current.id,
          previous: current,
          next,
        });
        await IOUtils.move(modUtils.getModFolder(current.id), PathUtils.join(stage, "previous"));
        await IOUtils.makeDirectory(modUtils.getModFolder(current.id));
        await IOUtils.writeUTF8(
          PathUtils.join(modUtils.getModFolder(current.id), "userChrome.css"),
          "/* new */"
        );
        if (committed) await IOUtils.writeJSON(modUtils.modsDataFile, { [current.id]: next });
        await modUtils.recoverModTransactions();
        const text = await IOUtils.readUTF8(
          PathUtils.join(modUtils.getModFolder(current.id), "userChrome.css")
        );
        check(
          text === (committed ? "/* new */" : "/* last working */"),
          "startup chose the wrong payload"
        );
        check(
          (await modUtils.getMods())[current.id].version === (committed ? "2.0.0" : "1.0.0"),
          "recovery metadata mismatch"
        );
        check(!(await IOUtils.exists(stage)), "reconciled transaction was not cleaned");
      } finally {
        await IOUtils.remove(stage, { recursive: true, ignoreAbsent: true });
      }
    }));
}

it("startup restores a directory interrupted before candidate activation", () =>
  fixture(async ({ seed }) => {
    const current = await seed("test-recover-missing-live");
    const stage = PathUtils.join(
      modUtils.modsDir,
      `.sine-remove-test-${Services.uuid.generateUUID()}`
    );
    await IOUtils.makeDirectory(stage);
    try {
      await IOUtils.writeJSON(PathUtils.join(stage, "transaction.json"), {
        id: current.id,
        previous: current,
        next: null,
      });
      await IOUtils.move(modUtils.getModFolder(current.id), PathUtils.join(stage, "previous"));
      await modUtils.recoverModTransactions();
      check(
        await IOUtils.exists(PathUtils.join(modUtils.getModFolder(current.id), "userChrome.css")),
        "interrupted removal was not restored"
      );
    } finally {
      await IOUtils.remove(stage, { recursive: true, ignoreAbsent: true });
    }
  }));
