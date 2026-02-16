// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// => engine/actors/MarketplaceParent.sys.mjs
// ===========================================================
// This module allows the JS Window Actor for the Zen Mods
// site to interact with global variables.
// ===========================================================

export class SineModsMarketplaceParent extends JSWindowActorParent {
    constructor() {
        super();
    }

    get modsManager() {
        return this.browsingContext.topChromeWindow.SineAPI;
    }

    async receiveMessage(message) {
        switch (message.name) {
            case "SineModsMarketplace:InstallMod": {
                const modId = message.data.modId;

                console.log(`[SineModsMarketplaceParent]: Installing mod ${modId}`);

                await this.modsManager.manager.installMod(`zen-browser/theme-store/tree/main/themes/${modId}/`);

                this.modsManager.manager.rebuildMods(false);
                await this.updateChildProcesses(modId);

                break;
            }
            case "SineModsMarketplace:UninstallMod": {
                const modId = message.data.modId;
                console.log(`[SineModsMarketplaceParent]: Uninstalling mod ${modId}`);

                const mods = await this.modsManager.utils.getMods();

                delete mods[modId];

                await this.modsManager.manager.removeMod(modId);
                await this.modsManager.manager.rebuildMods(false);

                await this.updateChildProcesses(modId);

                break;
            }
            case "SineModsMarketplace:IsModInstalled": {
                const themeId = message.data.themeId;
                const themes = await this.modsManager.utils.getMods();

                return Boolean(themes?.[themeId]);
            }
        }
    }

    async updateChildProcesses(modId) {
        this.sendAsyncMessage("SineModsMarketplace:ModChanged", { modId });
    }
}
