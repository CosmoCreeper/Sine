// => engine/prefs.js
// ===========================================================
// This module sets up default/required preferences for Sine
// at script startup.
// ===========================================================

// Allow writing outside of the resources folder.
UC_API.Prefs.set("userChromeJS.allowUnsafeWrites", true);

// Allow script to run on about:preferences/settings page.
UC_API.Prefs.set("userChromeJS.persistent_domcontent_callback", true);

// Set default parameters for the functioning of Sine.
const prefs = [
    ["sine.is-cosine", false],
    ["sine.mods.disable-all", false],
    ["sine.auto-updates", true],
    ["sine.script.auto-update", true],
    ["sine.is-cool", true],
    ["sine.allow-external-marketplace", false],
    ["sine.marketplace-url", "https://cosmocreeper.github.io/Sine/data/marketplace.json"]
]

for (const [name, value] of prefs) {
    if (!UC_API.Prefs.get(name).exists()) {
        UC_API.Prefs.set(name, value);
    }
}