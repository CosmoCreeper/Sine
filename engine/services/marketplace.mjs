import ucAPI from "../utils/uc_api.sys.mjs";
import utils from "../core/utils.mjs";
import domUtils from "../utils/dom.mjs";

export default {
    items: null,
    filteredItems: null,
    page: 0,

    async loadPage(window = null, manager = null) {
        const pages = utils.getProcesses(window, ["settings", "preferences"]);
        for (const window of pages) {
            const document = window.document;

            const newList = document.querySelector("#sineInstallationList");

            // Clear the list
            newList.innerHTML = "";

            // Calculate pagination
            const itemsPerPage = 6;
            const installedMods = await utils.getMods();
            const availableItems = Object.fromEntries(
                Object.entries(this.filteredItems).filter(([key, _value]) => !installedMods[key])
            );
            const totalItems = Object.entries(availableItems).length;
            const totalPages = Math.ceil(totalItems / itemsPerPage);
            const currentPage = Math.max(0, Math.min(this.page, totalPages - 1));
            const start = currentPage * itemsPerPage;
            const end = Math.min(start + itemsPerPage, totalItems);
            const currentItems = Object.fromEntries(Object.entries(availableItems).slice(start, end));

            // Render items for the current page
            for (const [key, data] of Object.entries(currentItems)) {
                const githubLink = `
                    <a href="https://github.com/${data.homepage}" target="_blank">
                        <button class="github-link"></button>
                    </a>
                `;

                // Create item
                const newItem = domUtils.appendXUL(
                    newList,
                    `
                    <hbox class="sineInstallationItem">
                        ${data.image ? `<img src="${data.image}"/>` : ""}
                        <hbox class="sineMarketplaceItemHeader">
                            <label>
                                <h3 class="sineMarketplaceItemTitle">${data.name} (v${data.version})</h3>
                            </label>
                        </hbox>
                        <description class="sineMarketplaceItemDescription">${data.description}</description>
                        ${
                            data.readme
                                ? `
                            <dialog class="sineItemPreferenceDialog">
                                <div class="sineItemPreferenceDialogTopBar">
                                    ${githubLink}
                                    <button data-l10n-id="sine-dialog-close"></button>
                                </div>
                                <div class="sineItemPreferenceDialogContent">
                                    <div class="markdown-body"></div>
                                </div>
                            </dialog>
                        `
                                : ""
                        }
                        <vbox class="sineMarketplaceButtonContainer">
                            ${
                                data.readme
                                    ? `
                                <button class="sineMarketplaceOpenButton"></button>
                            `
                                    : githubLink
                            }
                            <button class="sineMarketplaceItemButton" data-l10n-id="sine-mod-install-title"></button>
                        </vbox>
                    </hbox>
                `
                );

                // Add image
                if (data.image) {
                    const newItemImage = newItem.querySelector("img");
                    newItemImage.addEventListener("click", () => {
                        if (newItemImage.hasAttribute("zoomed")) {
                            newItemImage.removeAttribute("zoomed");
                        } else {
                            newItemImage.setAttribute("zoomed", "true");
                        }
                    });
                }

                // Add readme dialog
                if (data.readme) {
                    const dialog = newItem.querySelector("dialog");
                    newItem
                        .querySelector(".sineItemPreferenceDialogTopBar > button")
                        .addEventListener("click", () => dialog.close());

                    const newOpenButton = newItem.querySelector(".sineMarketplaceOpenButton");
                    newOpenButton.addEventListener("click", async () => {
                        const themeMD = await ucAPI.fetch(data.readme).catch((err) => console.error(err));
                        const relativeURL = data.readme.substring(0, data.readme.lastIndexOf("/") + 1);

                        domUtils.parseMD(newItem.querySelector(".markdown-body"), themeMD, relativeURL, window);
                        dialog.showModal();
                    });
                }

                // Add install button
                const newItemButton = newItem.querySelector(".sineMarketplaceItemButton");
                newItemButton.addEventListener("click", async (e) => {
                    newItemButton.disabled = true;
                    await manager.installMod(key, "store");
                    this.loadPage(null, manager);
                });

                // Check if installed
                if (installedMods[key]) {
                    newItem.setAttribute("installed", "true");
                }
            }

            // Update navigation controls
            const navContainer = document.querySelector("#navigation-container");
            if (navContainer) {
                navContainer.remove();
            }
            if (totalPages > 1) {
                const navContainer = domUtils.appendXUL(
                    document.querySelector("#sineInstallationGroup"),
                    `
                        <hbox id="navigation-container">
                            <button ${currentPage === 0 ? 'disabled=""' : ""}
                                data-l10n-id="sine-store-previous-button"></button>
                            <button ${currentPage >= totalPages - 1 ? 'disabled=""' : ""}
                                data-l10n-id="sine-store-next-button"></button>
                        </hbox>
                    `,
                    document.querySelectorAll("#sineInstallationGroup .description-deemphasized")[1]
                );

                navContainer.children[0].addEventListener("click", () => {
                    if (this.page > 0) {
                        this.page--;
                        this.loadPage(null, manager);
                    }
                });

                navContainer.children[1].addEventListener("click", () => {
                    if (this.page < totalPages - 1) {
                        this.page++;
                        this.loadPage(null, manager);
                    }
                });
            }
        }
    },

    async init(window = null, manager = null) {
        let marketplaceURL = "https://sineorg.github.io/store/marketplace.json";
        if (Services.prefs.getBoolPref("sine.allow-external-marketplace", false)) {
            marketplaceURL = Services.prefs.getStringPref("sine.marketplace-url", marketplaceURL) || marketplaceURL;
        }

        const data = await ucAPI
            .fetch(marketplaceURL)
            .then((res) => {
                if (res) {
                    res = Object.fromEntries(
                        Object.entries(res).filter(
                            ([key, data]) =>
                                ((data.os && data.os.some((os) => os.includes(ucAPI.utils.os))) || !data.os) &&
                                ((data.fork && data.fork.some((fork) => fork.includes(ucAPI.utils.fork))) || !data.fork) &&
                                ((data.notFork && !data.notFork.some((fork) => fork.includes(ucAPI.utils.fork))) ||
                                    !data.notFork)
                        )
                    );
                }
                return res;
            })
            .catch((err) => console.warn(err));

        if (data) {
            this.items = data;
            this.filteredItems = data;
            this.loadPage(window, manager);
        }
    }
}
