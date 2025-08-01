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
      case 'SineModsMarketplace:InstallMod': {
        const modId = message.data.modId;
        const mod = await (await fetch(`https://raw.githubusercontent.com/zen-browser/theme-store/main/themes/${modId}/theme.json`)).json();

        console.log(`[SineModsMarketplaceParent]: Installing mod ${mod.id}`);

        mod.enabled = true;

        const mods = await this.modsManager.utils.getMods();
        mods[mod.id] = mod;
        await IOUtils.writeJSON(this.modsManager.utils.modsDataFile, mods);

        const modFolder = this.modsManager.utils.getModFolder(mod.id);

        await IOUtils.writeUTF8(
          PathUtils.join(modFolder, 'chrome.css'),
          await (await fetch(mod.style)).text()
        );
        await IOUtils.writeUTF8(
          PathUtils.join(modFolder, 'readme.md'),
          await (await fetch(mod.readme)).text()
        );
        if (mod.preferences) {
            await IOUtils.writeUTF8(
              PathUtils.join(modFolder, 'preferences.json'),
              await (await fetch(mod.preferences)).text()
            );
        }

        this.modsManager.manager.rebuildMods();
        await this.updateChildProcesses(mod.id);

        break;
      }
      case 'SineModsMarketplace:UninstallMod': {
        const modId = message.data.modId;
        console.log(`[SineModsMarketplaceParent]: Uninstalling mod ${modId}`);

        const mods = await this.modsManager.utils.getMods();

        delete mods[modId];

        await this.modsManager.manager.removeMod(modId);
        await this.modsManager.manager.rebuildMods();

        await this.updateChildProcesses(modId);

        break;
      }
      case 'SineModsMarketplace:IsModInstalled': {
        const themeId = message.data.themeId;
        const themes = await this.modsManager.utils.getMods();

        return Boolean(themes?.[themeId]);
      }
    }
  }

  async updateChildProcesses(modId) {
    this.sendAsyncMessage('SineModsMarketplace:ModChanged', { modId });
  }
}