/**
 * @file Injects necessary userscripts and Sine scripts into any DOM it's loaded in. This Source
 *   Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL
 *   was not distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

{
  // eslint-disable-next-line consistent-function-scoping
  const importScript = (script) => {
    // TODO: Sandbox
    // eslint-disable-next-line eslint-js/no-restricted-syntax
    import(`${script}?v=${Date.now()}`).catch((err) => {
      console.error(new Error(`@ ${script}:${err.lineNumber}`, { cause: err }));
    });
  };

  const scriptName = {
    "/content/browser.xhtml": "browser.mjs",
    "/content/messenger.xhtml": "browser.mjs",
    settings: "settings.mjs",
    preferences: "settings.mjs",
  }[window.location.pathname];

  if (scriptName && window.newDOM) {
    importScript(`chrome://userscripts/content/core/${scriptName}`);
  }

  delete window.newDOM;

  const executeUserScripts = async () => {
    const utils = ChromeUtils.importESModule(
      "chrome://userscripts/content/core/utils.sys.mjs"
    ).default;
    const scripts = await utils.getScripts({
      removeBgModules: true,
      href: window.location.href,
    });

    const promises = [];
    for (const scriptPath of Object.keys(scripts)) {
      if (scriptPath.endsWith(".uc.mjs")) {
        const chromePath = `chrome://sine/content/${scriptPath}`;

        promises.push(
          (async () => {
            let scriptLoaded = false;
            if (window.triggerUnloadListener) {
              scriptLoaded = await window.triggerUnloadListener(chromePath, window);
            }

            if (scripts[scriptPath].enabled && !scriptLoaded) {
              window.addUnloadListener(null, chromePath);
              importScript(chromePath);
            }
          })()
        );
      }
    }
    await Promise.all(promises);

    delete window.triggerUnloadListener;
  };
  if (ChromeUtils) {
    executeUserScripts();
  }
}
