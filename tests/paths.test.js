// Ensure the chrome.manifest and path for Sine is valid
it("Sine path exists", () => {
  // Will fail if the path is invalid
  ChromeUtils.importESModule("chrome://userscripts/content/sine.sys.mjs");
});
