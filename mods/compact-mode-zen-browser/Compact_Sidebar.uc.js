// ==UserScript==
// @name        Compact Sidebar Toggle
// @description Adds a toggle button for compact sidebar functionality
// @include     main
// ==/UserScript==

(async function () {
  const IconSVG = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="bgGradientGrey" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#000000;stop-opacity:0.1" /><stop offset="100%" style="stop-color:#000000;stop-opacity:0.05" /></linearGradient><linearGradient id="arrowGradientGrey" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" style="stop-color:#ffffff" /><stop offset="100%" style="stop-color:#f1f5f9" /></linearGradient></defs><rect x="1" y="1" width="22" height="22" rx="4" ry="4" fill="url(#bgGradientGrey)" stroke="rgba(255, 255, 255, 0.2)" stroke-width="1"/><path d="M14 18L7 12L14 6" stroke="url(#arrowGradientGrey)" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 18L11 12L18 6" stroke="url(#arrowGradientGrey)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" opacity="0.6"/></svg>`;
  const IconDataUri = `data:image/svg+xml;utf8,${encodeURIComponent(IconSVG)}`;

  try {
    if (typeof UC_API !== "undefined" && UC_API.Utils && typeof UC_API.Utils.createWidget === "function") {
      UC_API.Utils.createWidget({
        id: "compact-sidebar-toggle-widget",
        type: "toolbarbutton",
        label: "Compact Sidebar",
        tooltip: "Toggle Compact Sidebar",
        class: "chromeclass-toolbar-additional subviewbutton-nav",
        image: IconDataUri,
        command: "cmd_zenCompactModeToggle"
      });
    }
  } catch (e) {
    console.warn("[Compact Sidebar] Could not register widget in customization UI:", e);
  }
})();1
