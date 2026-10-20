/**
 * @file Native ownership regressions for classic scripts and ES modules.
 * @license
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

// Serial rebuilds and per-fixture state copies are the behavior under test.
/* oxlint-disable eslint/no-await-in-loop, oxc/no-rest-spread-properties */

/**
 * Run a tiny module through the real loader without allocating persistent resources.
 *
 * @param {boolean} unloadable - Whether the module registers cleanup.
 * @param {boolean} delayed - Whether module initialization waits on a gate.
 * @returns {Promise<object>} Observed lifecycle counts.
 */
const reloadFixture = async (unloadable, delayed = false) => {
  if (!Services.prefs.getBoolPref("browsercfg.test.active", false)) {
    throw new Error("isolated test profile required");
  }
  const manager = ChromeUtils.importESModule(
    "chrome://userscripts/content/core/manager.sys.mjs"
  ).default;
  const utils = ChromeUtils.importESModule(
    "chrome://userscripts/content/core/utils.sys.mjs"
  ).default;
  let window = Services.wm.getMostRecentWindow("navigator:browser");
  if (!window?.gBrowserInit?.delayedStartupFinished) {
    window = await new Promise((resolve) => {
      const observer = (subject) => {
        Services.obs.removeObserver(observer, "browser-delayed-startup-finished");
        resolve(subject);
      };
      Services.obs.addObserver(observer, "browser-delayed-startup-finished");
    });
  }
  await manager.rebuildMods();
  const before = await IOUtils.readUTF8(utils.modsDataFile);
  const unsafe = Services.prefs.getBoolPref("sine.allow-unsafe-js", false);
  const id = `test-reload-ownership-${Services.uuid.generateUUID().toString().replaceAll(/[{}]/gu, "")}`;
  const folder = utils.getModFolder(id);
  const ns = "__sineOwnershipTest";
  let release, enter;
  const started = new Promise((resolve) => {
    enter = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  window[ns] = { classic: 0, module: 0, cleaned: 0, gate, enter };
  try {
    Services.prefs.setBoolPref("sine.allow-unsafe-js", true);
    await IOUtils.makeDirectory(folder, { ignoreExisting: true });
    await IOUtils.writeUTF8(PathUtils.join(folder, "classic.uc.js"), `window.${ns}.classic++;`);
    await IOUtils.writeUTF8(
      PathUtils.join(folder, "module.uc.mjs"),
      (delayed ? `window.${ns}.enter();await window.${ns}.gate;` : "") +
        `window.${ns}.module++;` +
        (unloadable ? `window.addUnloadListener(()=>{window.${ns}.cleaned++;});` : "")
    );
    const include = ["chrome://browser/content/browser.xhtml"];
    await IOUtils.writeJSON(utils.modsDataFile, {
      [id]: {
        id,
        name: id,
        enabled: true,
        origin: "local",
        scripts: {
          "classic.uc.js": { include },
          "module.uc.mjs": { include },
        },
      },
    });
    if (delayed) {
      let completed = false;
      const operation = manager.rebuildMods().then(() => {
        completed = true;
        return null;
      });
      await started;
      for (let i = 0; i < 3; i++) await Promise.resolve();
      const early = completed;
      release();
      await operation;
      return { early, module: window[ns].module };
    }
    for (let i = 0; i < 3; i++) {
      await manager.rebuildMods();
      // Allow the legacy unawaited importer to finish too, so baseline failures
      // measure repeated execution rather than merely the old early return.
      await new Promise((resolve) => {
        window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
      });
    }
    return { ...window[ns] };
  } finally {
    release();
    await manager.removeUnloadListeners(id);
    await IOUtils.writeUTF8(utils.modsDataFile, before);
    await IOUtils.remove(folder, { recursive: true, ignoreAbsent: true });
    Services.prefs.setBoolPref("sine.allow-unsafe-js", unsafe);
    Reflect.deleteProperty(window, ns);
  }
};

it("non-unloadable modules remain loaded, like classic scripts", async () => {
  const result = await reloadFixture(false);
  if (result.classic !== 1 || result.module !== 1) {
    throw new Error(`duplicate executions: ${JSON.stringify(result)}`);
  }
});

it("opt-in module reloads call the previous cleanup exactly once", async () => {
  const result = await reloadFixture(true);
  if (result.classic !== 1 || result.module !== 3 || result.cleaned !== 2) {
    throw new Error(`unbalanced module lifecycle: ${JSON.stringify(result)}`);
  }
});

it("rebuild completion waits for asynchronous module initialization", async () => {
  const result = await reloadFixture(false, true);
  if (result.early || result.module !== 1) {
    throw new Error(`early module completion: ${JSON.stringify(result)}`);
  }
});

/**
 * Exercise failed and disabled script ownership in a fresh manager.
 *
 * @param {object} sources - Script filename to source mappings.
 * @param {(state: object) => Promise<void>} body - Assertions against the real loader.
 * @returns {Promise<void>} Fixture completion.
 */
const reloadCase = async (sources, body) => {
  if (!Services.prefs.getBoolPref("browsercfg.test.active", false))
    throw new Error("isolated profile required");
  const singleton = ChromeUtils.importESModule(
    "chrome://userscripts/content/core/manager.sys.mjs"
  ).default;
  const utils = ChromeUtils.importESModule(
    "chrome://userscripts/content/core/utils.sys.mjs"
  ).default;
  await singleton.rebuildMods();
  const manager = new singleton.constructor();
  const window = Services.wm.getMostRecentWindow("navigator:browser");
  const saved = await IOUtils.readUTF8(utils.modsDataFile);
  const unsafe = Services.prefs.getBoolPref("sine.allow-unsafe-js", false);
  const id = `test-lifecycle-${Services.uuid.generateUUID().toString().replaceAll(/[{}]/gu, "")}`;
  const folder = utils.getModFolder(id);
  let enter, release;
  const started = new Promise((resolve) => {
    enter = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  window["__sineLifecycle"] = { runs: 0, cleaned: 0, fixed: false, enter, gate };
  try {
    Services.prefs.setBoolPref("sine.allow-unsafe-js", true);
    await IOUtils.makeDirectory(folder);
    const scripts = {};
    for (const [name, source] of Object.entries(sources)) {
      await IOUtils.writeUTF8(PathUtils.join(folder, name), source);
      scripts[name] = { include: ["chrome://browser/content/browser.xhtml"] };
    }
    await IOUtils.writeJSON(utils.modsDataFile, { [id]: { id, name: id, enabled: true, scripts } });
    await body({ manager, window, state: window["__sineLifecycle"], started, release, id, utils });
  } finally {
    release();
    manager.removeListenersForDOM(window);
    await IOUtils.writeUTF8(utils.modsDataFile, saved);
    await IOUtils.remove(folder, { recursive: true });
    Services.prefs.setBoolPref("sine.allow-unsafe-js", unsafe);
    Reflect.deleteProperty(window, "__sineLifecycle");
  }
};

it("disable and enable cannot execute a still-live non-unloadable module twice", () =>
  reloadCase(
    { "main.uc.mjs": "window.__sineLifecycle.runs++;" },
    async ({ manager, state, id, utils }) => {
      await manager.rebuildMods();
      await manager.toggleTheme(await utils.getMods(), id);
      await manager.rebuildMods();
      await manager.toggleTheme(await utils.getMods(), id);
      await manager.rebuildMods();
      if (state.runs !== 1) throw new Error(`still-live module executed ${state.runs} times`);
    }
  ));

it("failed imports cannot finish a rebuild while another module is initializing", () =>
  reloadCase(
    {
      "bad.uc.mjs": "throw new Error('expected module failure');",
      "slow.uc.mjs": "window.__sineLifecycle.enter(); await window.__sineLifecycle.gate;",
    },
    async ({ manager, started, release }) => {
      let settled = false;
      const operation = manager
        .rebuildMods()
        .catch(() => null)
        .then(() => {
          settled = true;
          return null;
        });
      await started;
      for (let i = 0; i < 12; i++) await Promise.resolve();
      // A task turn lets Gecko deliver the rejected import too.
      await new Promise((resolve) => {
        Services.tm.dispatchToMainThread(resolve);
      });
      const early = settled;
      release();
      await operation;
      if (early) throw new Error("rebuild settled with an import still in flight");
    }
  ));

it("failed modules without cleanup stay failed, not silently loaded or blindly retried", () =>
  reloadCase(
    { "main.uc.mjs": "window.__sineLifecycle.runs++; throw new Error('partial initialization');" },
    async ({ manager, state }) => {
      let failures = 0;
      for (let i = 0; i < 2; i++) {
        try {
          await manager.rebuildMods();
        } catch {
          failures++;
        }
      }
      if (failures !== 2 || state.runs !== 1)
        throw new Error(`failed ownership: ${failures} failures, ${state.runs} executions`);
    }
  ));

it("failed modules with working cleanup can initialize a corrected replacement", () =>
  reloadCase(
    {
      "main.uc.mjs":
        "window.__sineLifecycle.runs++; window.addUnloadListener(()=>{window.__sineLifecycle.cleaned++;}); if(!window.__sineLifecycle.fixed) throw new Error('partial initialization');",
    },
    async ({ manager, state }) => {
      try {
        await manager.rebuildMods();
      } catch {}
      state.fixed = true;
      await manager.rebuildMods();
      if (state.runs !== 2 || state.cleaned !== 1)
        throw new Error("failed module cleanup/retry was unbalanced");
    }
  ));

for (const name of ["bad.uc.js", "bad.sys.mjs"]) {
  it(`${name} initialization errors reach the reload result`, () =>
    reloadCase({ [name]: "throw new Error('expected script failure');" }, async ({ manager }) => {
      let failed = false;
      try {
        await manager.rebuildMods();
      } catch {
        failed = true;
      }
      if (!failed) throw new Error("script failure was swallowed");
    }));
}

it("failed cleanup blocks reexecution of a still-live module", () =>
  reloadCase(
    {
      "main.uc.mjs":
        "window.__sineLifecycle.runs++; window.addUnloadListener(()=>{throw new Error('cleanup failed');});",
    },
    async ({ manager, state }) => {
      await manager.rebuildMods();
      let failed = false;
      try {
        await manager.rebuildMods();
      } catch {
        failed = true;
      }
      if (!failed || state.runs !== 1)
        throw new Error("failed cleanup allowed duplicate initialization");
    }
  ));

it("a failed non-unloadable module can be disabled without blocking independent reloads", () =>
  reloadCase(
    { "bad.uc.mjs": "throw new Error('partial failure');" },
    async ({ manager, id, utils }) => {
      try {
        await manager.rebuildMods();
      } catch {}
      await manager.toggleTheme(await utils.getMods(), id);
      await manager.rebuildMods();
      if ((await utils.getMods())[id].enabled)
        throw new Error("failed script could not be disabled");
    }
  ));
