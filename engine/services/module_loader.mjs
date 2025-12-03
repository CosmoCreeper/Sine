{
    const importScript = (script) => {
        import(script).catch((err) => {
            console.error(new Error(`@ ${script}:${err.lineNumber}`, { cause: err }));
        });
    }

    const scriptName = {
        "/content/browser.xhtml": "main.mjs",
        "/content/messenger.xhtml": "main.mjs",
        settings: "settings.mjs",
        preferences: "settings.mjs",
    }[window.location.pathname];

    if (scriptName) {
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
                importScript("chrome://sine/content/" + scriptPath);
            }
        }
    }
    if (ChromeUtils) {
        executeUserScripts();
    }
}
