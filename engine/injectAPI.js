// => engine/injectAPI.js
// ===========================================================
// This module allows the script to inject an API for
// installing mods through the Zen Mods store.
// ===========================================================

const _actors = new Set();
let _lazy = {};

ChromeUtils.defineESModuleGetters(_lazy, {
    ActorManagerParent: 'resource://gre/modules/ActorManagerParent.sys.mjs', 
});

ChromeUtils.unregisterWindowActor("ZenModsMarketplace");

const injectAPI = () => {
    if (_actors.has("SineModsMarketplace")) {
        return;
    }

    const decl = {};
    decl["SineModsMarketplace"] = {
        parent: {
            esModuleURI: 'chrome://userscripts/content/engine/actors/MarketplaceParent.sys.mjs',
        },
        child: {
            esModuleURI: 'chrome://userscripts/content/engine/actors/MarketplaceChild.sys.mjs',
            events: {
                DOMContentLoaded: {},
            },
        },
        matches: [
            "https://zen-browser.app/*",
            "https://share.zen-browser.app/*",
        ],
    };

    try {
        _lazy.ActorManagerParent.addJSWindowActors(decl);
        _actors.add("SineModsMarketplace");
    } catch (e) {
        console.warn(`Failed to register JSWindowActor: ${e}`);
    }
}

export default injectAPI;