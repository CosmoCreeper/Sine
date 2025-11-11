{
    const scriptName = {
        "/content/browser.xhtml": "main.mjs",
        "/content/messenger.xhtml": "main.mjs",
        settings: "settings.mjs",
        preferences: "settings.mjs",
    }[window.location.pathname];

    if (scriptName) {
        const scriptPath = "chrome://userscripts/content/engine/core/" + scriptName;
        import(scriptPath).catch((err) => {
            console.error(new Error(`@ ${scriptPath}:${err.lineNumber}`, { cause: err }));
        });
    }
}
