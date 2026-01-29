// => engine/injectAPI.js
// ===========================================================
// This module allows the script to inject an API for
// installing mods through the Zen Mods store.
// ===========================================================

try {
    ChromeUtils.registerWindowActor("SineModsMarketplace", {
        parent: {
            esModuleURI: "chrome://userscripts/content/engine/actors/MarketplaceParent.sys.mjs",
        },
        child: {
            esModuleURI: "chrome://userscripts/content/engine/actors/MarketplaceChild.sys.mjs",
            events: {
                DOMContentLoaded: {},
            },
        },
        matches: ["https://sineorg.github.io/store/*", "https://zen-browser.app/*", "https://share.zen-browser.app/*"],
    });
} catch (err) {
    console.warn(`Failed to register JSWindowActor: ${err}`);
}
