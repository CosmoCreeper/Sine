// => engine/plugins/cmdPalette.js
// ===========================================================
// This plugin allows developers to have an easy-to-use
// command palette for making themes.
// ===========================================================

import appendXUL from "chrome://userscripts/content/engine/utils/XULManager.js";
import manager from "chrome://userscripts/content/engine/utils/manager.js";

const initDev = () => {
    if (Services.prefs.getBoolPref("sine.enable-dev", false)) {
        const palette = appendXUL(ucAPI.globalDoc.body, `
            <div class="sineCommandPalette" hidden="">
                <div class="sineCommandInput" hidden=""></div>
                <div class="sineCommandSearch">
                    <input type="text" placeholder="Enter a command..."/>
                    <hr/>
                    <div></div>
                </div>
            </div>
        `);
        
        const contentDiv = palette.querySelector(".sineCommandInput");
        const searchDiv = palette.querySelector(".sineCommandSearch");
        const input = searchDiv.querySelector("input");
        const optionsContainer = searchDiv.querySelector("div");
        
        const options = [
            {
                "label": "Refresh mod styles",
                "action": () => manager.rebuildMods()
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
        }
    
        const closePalette = () => {
            palette.setAttribute("hidden", "");
            input.value = "";
            searchOptions();
        }
    
        for (const option of options) {
            const optionBtn = appendXUL(optionsContainer, `<button>${option.label}</button>`);
        
            optionBtn.addEventListener("click", () => {
                option.action();
                if (!option.hasOwnProperty("hide") || option.hide) {
                    closePalette();
                }
            });
        }
    
        optionsContainer.children[0].setAttribute("selected", "");
    
        input.addEventListener("input", searchOptions);
        input.addEventListener("keydown", (e) => {
            const selectedChild = optionsContainer.querySelector(":not([hidden])[selected]");
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                let newSelectedChild;
                if (e.key === "ArrowUp") {
                    newSelectedChild = selectedChild.previousElementSibling ||
                        selectedChild.parentElement.lastElementChild;
                } else {
                    newSelectedChild = selectedChild.nextElementSibling ||
                        selectedChild.parentElement.firstElementChild;
                }
                newSelectedChild.setAttribute("selected", "");
                selectedChild.removeAttribute("selected");
            } else if (e.key === "Enter") {
                selectedChild.click();
            }
        });
    
        ucAPI.globalDoc.addEventListener("keydown", (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === "Y") {
                palette.removeAttribute("hidden");
                contentDiv.setAttribute("hidden", "");
                searchDiv.removeAttribute("hidden");
            
                // Wait animation time.
                setTimeout(() => input.focus(), 350);
            } else if (e.key === "Escape") {
                closePalette();
            }
        });
    
        ucAPI.globalDoc.addEventListener("mousedown", (e) => {
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

export default initDev;