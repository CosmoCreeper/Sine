// => engine/prefs.js
// ===========================================================
// This module sets up default/required preferences for Sine
// at script startup.
// ===========================================================

// Allow writing outside of the resources folder.
Services.prefs.setBoolPref("userChromeJS.allowUnsafeWrites", true);

// Allow script to run on about:preferences/settings page.
Services.prefs.setBoolPref("userChromeJS.persistent_domcontent_callback", true);

// Reset the pending restart and fetch url prefs.
if (ucAPI.mainProcess) {
    Services.prefs.setBoolPref("sine.engine.pending-restart", false);
}

// Convert old script pref to new engine pref if it exists.
const scriptPref = "sine.script.auto-update";
if (Services.prefs.getPrefType(scriptPref) > 0) {
    // Set new pref to old pref value.
    Services.prefs.setBoolPref("sine.engine.auto-update",
        Services.prefs.getBoolPref(scriptPref)
    );
    
    // Remove old pref.
    Services.prefs.clearUserPref(scriptPref);
}

// Set default parameters for the functioning of Sine.
const prefs = [
    ["sine.is-cosine", false],
    ["sine.auto-updates", true],
    ["sine.engine.auto-update", true],
    ["sine.is-cool", true],
]

for (const [name, value] of prefs) {
    if (!Services.prefs.getPrefType(name) > 0) {
        Services.prefs.setBoolPref(name, value);
    }
}