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

    delete window.newDOM;

    const executeUserScripts = async () => {
        const utils = ChromeUtils.importESModule("chrome://userscripts/content/engine/core/utils.mjs").default;
        const scripts = await utils.getScripts({
            removeBgModules: true,
            href: window.location.href
        });
        for (const scriptPath of Object.keys(scripts)) {
            if (scriptPath.endsWith(".uc.mjs")) {
                const chromePath = "chrome://sine/content/" + scriptPath;

                let scriptLoaded = false;
                if (window.triggerUnloadListener) {
                    scriptLoaded = await window.triggerUnloadListener(chromePath);
                }

                if (scripts[scriptPath].enabled && !scriptLoaded) {
                    window.addUnloadListener(null, chromePath);
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
