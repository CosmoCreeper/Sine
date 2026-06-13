/**
 * @file Defines parent window actor class for Sine store and Zen Mods site. This Source Code Form
 *   is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not
 *   distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/**
 * Parent window actor class for Sine store and Zen Mods mod installation from site.
 *
 * @class
 */
export class SineModsMarketplaceParent extends JSWindowActorParent {
  /**
   * Returns mod manager API.
   *
   * @returns {object} Mod manager API in the form of { utils, manager }.
   */
  get modsManager() {
    return this.browsingContext.topChromeWindow.SineAPI;
  }

  /**
   * Message handler.
   *
   * @param {object} message - Received message.
   * @param {string} message.name - Name of received message.
   * @param {object} message.data - Optional message data.
   * @returns {boolean | null} Returns boolean for theme installation status, or null for other
   *   messages.
   */
  async receiveMessage(message) {
    switch (message.name) {
      case "SineModsMarketplace:InstallMod": {
        const modId = message.data.modId;

        // TODO: Pass urls from sites instead or determine url from site url
        await this.modsManager.manager.installMod(
          `zen-browser/theme-store/tree/main/themes/${modId}/`
        );

        this.modsManager.manager.rebuildMods(false);
        await this.updateChildProcesses(modId);

        break;
      }
      case "SineModsMarketplace:UninstallMod": {
        const modId = message.data.modId;

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
      default: {
        console.error("[Sine:MarketplaceParent]: Unknown message received.");
        break;
      }
    }
    return null;
  }

  /**
   * Triggers a mod changed event on the parent class.
   *
   * @param {string} modId - Mod id to trigger mod changed event on.
   */
  updateChildProcesses(modId) {
    this.sendAsyncMessage("SineModsMarketplace:ModChanged", { modId });
  }
}
