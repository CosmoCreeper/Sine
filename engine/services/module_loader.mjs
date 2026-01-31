{
    const importScript = (script) => {
        import(`${script}?v=${Date.now()}`).catch((err) => {
            console.error(new Error(`@ ${script}:${err.lineNumber}`, { cause: err }));
        });
    }

    const scriptName = {
        "/content/browser.xhtml": "main.mjs",
        "/content/messenger.xhtml": "main.mjs",
        settings: "settings.mjs",
        preferences: "settings.mjs",
    }[window.location.pathname];

    if (scriptName && window.newDOM) {
        importScript("chrome://userscripts/content/engine/core/" + scriptName);
    }

    const executeUserScripts = async () => {
        const utils = ChromeUtils.importESModule("chrome://userscripts/content/engine/core/utils.mjs").default;
        const scripts = await utils.getScripts({
            removeBgModules: true,
            href: window.location.href
        });
        for (const scriptPath of Object.keys(scripts)) {
            if (scriptPath.endsWith(".uc.mjs")) {
                const chromePath = "chrome://sine/content/" + scriptPath;
                const scriptOptions = scripts[scriptPath];

                if (window.triggerUnloadListener) {
                    await window.triggerUnloadListener(chromePath, scriptOptions.enabled);
                }

                if (scriptOptions.enabled) {
                    importScript(chromePath);
                }
            }
        }
        delete window.triggerUnloadListener;
    }
    if (ChromeUtils) {
        executeUserScripts();
    }
}
