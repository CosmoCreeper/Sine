// => engine/plugins/cmdPalette.js
// ===========================================================
// This plugin allows developers to have an easy-to-use
// command palette for making themes.
// ===========================================================

import domUtils from "../utils/dom.mjs";

const manager = ChromeUtils.importESModule("chrome://userscripts/content/engine/core/manager.mjs").default;
const utils = ChromeUtils.importESModule("chrome://userscripts/content/engine/core/utils.mjs").default;
const ucAPI = ChromeUtils.importESModule("chrome://userscripts/content/engine/utils/uc_api.sys.mjs").default;

export default () => {
    if (Services.prefs.getBoolPref("sine.enable-dev", false)) {
        domUtils.appendXUL(
            windowRoot.ownerGlobal.document.head,
            `<link rel="localization" href="sine-cmdpalette.ftl"/>`
        );

        const palette = domUtils.appendXUL(
            windowRoot.ownerGlobal.document.body,
            `
            <div class="sineCommandPalette" hidden="">
                <div class="sineCommandInput" hidden=""></div>
                <div class="sineCommandSearch">
                    <input type="text" data-l10n-id="sine-cmd-placeholder" data-l10n-attrs="placeholder"/>
                    <hr/>
                    <div></div>
                </div>
            </div>
        `
        );

        const contentDiv = palette.querySelector(".sineCommandInput");
        const searchDiv = palette.querySelector(".sineCommandSearch");
        const input = searchDiv.querySelector("input");
        const optionsContainer = searchDiv.querySelector("div");

        const revealModOptions = async () => {
            const openModFolder = (modId) => {
                const modFolder = utils.getModFolder(modId);
                ucAPI.showInFileManager(modFolder);
            }

            const mods = await utils.getMods();
            const modOptions = Object.values(mods).map((mod) => {
                return { label: mod.name, action: () => openModFolder(mod.id), };
            });
            refreshCmds(modOptions);
        }

        const options = [
            {
                id: "sine-cmd-refresh-mod-styles",
                action: () => manager.rebuildMods(),
            },
            {
                id: "sine-cmd-open-mod-folder",
                action: () => revealModOptions(),
                hide: false,
            },
        ];

        const searchOptions = () => {
            for (const child of optionsContainer.children) {
                if (!child.textContent.toLowerCase().includes(input.value.toLowerCase())) {
                    child.setAttribute("hidden", "");
                } else {
                    child.removeAttribute("hidden");
                }
            }
            optionsContainer.querySelector("[selected]")?.removeAttribute("selected");
            optionsContainer.querySelector(":not([hidden])").setAttribute("selected", "");
        };

        const closePalette = () => {
            palette.setAttribute("hidden", "");
            input.value = "";
            searchOptions();
        };

        const refreshCmds = (options) => {
            optionsContainer.innerHTML = "";

            for (const option of options) {
                const optionBtn = domUtils.appendXUL(optionsContainer, `<button>${option.label ?? ""}</button>`);

                optionBtn.setAttribute("data-l10n-id", option.id);

                optionBtn.addEventListener("click", () => {
                    option.action();
                    if (!option.hasOwnProperty("hide") || option.hide) {
                        closePalette();
                    }
                });
            }

            optionsContainer.children[0].setAttribute("selected", "");
        }

        refreshCmds(options);

        input.addEventListener("input", searchOptions);
        input.addEventListener("keydown", (e) => {
            const selectedChild = optionsContainer.querySelector(":not([hidden])[selected]");
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                let newSelectedChild;
                if (e.key === "ArrowUp") {
                    newSelectedChild = selectedChild.previousElementSibling || selectedChild.parentElement.lastElementChild;
                } else {
                    newSelectedChild = selectedChild.nextElementSibling || selectedChild.parentElement.firstElementChild;
                }
                newSelectedChild.setAttribute("selected", "");
                selectedChild.removeAttribute("selected");
            } else if (e.key === "Enter") {
                selectedChild.click();
            }
        });

        windowRoot.ownerGlobal.document.addEventListener("keydown", (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === "Y") {
                refreshCmds(options);

                palette.removeAttribute("hidden");
                contentDiv.setAttribute("hidden", "");
                searchDiv.removeAttribute("hidden");

                // Wait animation time.
                setTimeout(() => input.focus(), 350);
            } else if (e.key === "Escape") {
                closePalette();
            }
        });

        windowRoot.ownerGlobal.document.addEventListener("mousedown", (e) => {
            let targetEl = e.target;
            while (targetEl) {
                if (targetEl === palette) {
                    return;
                }
                targetEl = targetEl.parentNode;
            }

            closePalette();
        });
    }
}
