/**
 * @file Defines child window actor class for Sine store and Zen Mods site. This Source Code Form is
 *   subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not
 *   distributed with this file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/**
 * Child window actor class for Sine store and Zen Mods mod installation from site.
 *
 * @class
 */
export class SineModsMarketplaceChild extends JSWindowActorChild {
  /**
   * Main entrypoint of class. Handles new window loading.
   *
   * @param {object} event - Event to handle.
   * @param {string} event.type - The name of the event. (only care if DOMContentLoaded)
   */
  handleEvent(event) {
    if (event.type === "DOMContentLoaded") {
      const verifier = this.contentWindow.document.querySelector(
        'meta[name="zen-content-verified"]'
      );

      if (verifier) {
        verifier.setAttribute("content", "verified");
      }

      this.initiateModsMarketplace();
    }
  }

  /** Executes main functions to load main child actor functionality. */
  initiateModsMarketplace() {
    this.contentWindow.setTimeout(() => {
      this.addButtons();
      this.injectMarketplaceAPI();
    }, 0);
  }

  /**
   * Returns install theme button on Zen Mods site.
   *
   * @returns {HTMLElement} Install theme button on Zen Mods site.
   */
  get actionButton() {
    return this.contentWindow.document.querySelector("#install-theme");
  }

  /**
   * Returns uninstall theme button on Zen Mods site.
   *
   * @returns {HTMLElement} Uninstall theme button on Zen Mods site.
   */
  get actionButtonUninstall() {
    return this.contentWindow.document.querySelector("#install-theme-uninstall");
  }

  /**
   * Checks if a theme with an id is installed.
   *
   * @param {string} themeId - Theme id to check installation status of.
   * @returns {boolean} Is theme installed boolean.
   */
  async isThemeInstalled(themeId) {
    return await this.sendQuery("SineModsMarketplace:IsModInstalled", { themeId });
  }

  /**
   * Extracts mod id from event.
   *
   * @param {object} event - Event to extract mod id from.
   * @returns {string} Mod id.
   */
  static getModId(event) {
    if (event.target) {
      const button = event.target;
      button.disabled = true;

      return button.getAttribute("theme-id") ?? button.getAttribute("zen-theme-id");
    }

    // Backwards compatibility is... Interesting
    return event.themeId ?? event.modId ?? event.id;
  }

  /**
   * Returns a single mod install button, given a mod id.
   *
   * @param {string} modId - Mod id to fetch install button of.
   * @returns {HTMLElement} Install button element.
   */
  getInstallButton(modId) {
    return (
      this.contentWindow.document.querySelector(`.action-install[theme-id="${modId}"]`) ??
      this.contentWindow.document.querySelector("#install-theme")
    );
  }

  /**
   * Message handler.
   *
   * @param {object} message - Message received.
   * @param {string} message.name - Name of message received.
   * @param {object} message.data - Optional data received for message.
   */
  async receiveMessage(message) {
    switch (message.name) {
      case "SineModsMarketplace:ModChanged": {
        const modId = message.data.modId;
        const actionButton = this.getInstallButton(modId);

        if (actionButton) {
          const actionButtonInstalled = actionButton.nextElementSibling;

          actionButton.disabled = false;
          actionButtonInstalled.disabled = false;

          if (await this.isThemeInstalled(modId)) {
            actionButton.classList.add("hidden");
            actionButtonInstalled.classList.remove("hidden");
          } else {
            actionButton.classList.remove("hidden");
            actionButtonInstalled.classList.add("hidden");
          }
        }

        break;
      }

      case "SineModsMarketplace:CheckForUpdatesFinished": {
        const updates = message.data.updates;

        this.contentWindow.document.dispatchEvent(
          new CustomEvent("SineModsMarketplace:CheckForUpdatesFinished", { detail: { updates } })
        );

        break;
      }

      default: {
        console.error("[Sine:MarketplaceChild]: Unknown message received.");
        break;
      }
    }
  }

  /** Injects installation API into site. */
  injectMarketplaceAPI() {
    // Remove the original Zen variable for injection.
    delete window.ZenInstallMod;

    Cu.exportFunction(this.handleModInstallationEvent.bind(this), this.contentWindow, {
      defineAs: "SineInstallMod",
    });
  }

  /** Displays and adds functionality to install and uninstall buttons. */
  async addButtons() {
    this.contentWindow.document.querySelector("#install-theme-error").classList.add("hidden");

    const actionButtons = [
      ...this.contentWindow.document.querySelectorAll(".action-install"),
      this.contentWindow.document.querySelector("#install-theme"),
    ];
    const promises = [];
    for (const actionButton of actionButtons) {
      if (!actionButton) {
        continue;
      }
      const actionButtonUninstall = actionButton.nextElementSibling;

      const modId =
        actionButton.getAttribute("theme-id") ?? actionButton.getAttribute("zen-theme-id");

      promises.push(
        (async () => {
          if (await this.isThemeInstalled(modId)) {
            actionButtonUninstall.classList.remove("hidden");
          } else {
            actionButton.classList.remove("hidden");
          }
        })()
      );

      actionButton.addEventListener("click", this.handleModInstallationEvent.bind(this));
      actionButtonUninstall.addEventListener("click", this.handleModUninstallEvent.bind(this));
    }
    await Promise.all(promises);
  }

  /**
   * Handles uninstall event for the corresponding buttons.
   *
   * @param {object} event - Event to extract mod id from.
   */
  handleModUninstallEvent(event) {
    const modId = this.constructor.getModId(event);
    this.sendAsyncMessage("SineModsMarketplace:UninstallMod", { modId });
  }

  /**
   * Handles install event for the corresponding buttons.
   *
   * @param {object} event - Event to extract mod id from.
   */
  handleModInstallationEvent(event) {
    // Object can be an event or a theme id
    const modId = this.constructor.getModId(event);
    this.sendAsyncMessage("SineModsMarketplace:InstallMod", { modId });
  }
}
