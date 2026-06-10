/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

export class SineUserContentChild extends JSWindowActorChild {
  #contentURI = null;

  constructor() {
    super();
    Services.cpmm.addMessageListener("RebuildUserStyles", this);
  }

  didDestroy() {
    Services.cpmm.removeMessageListener("RebuildUserStyles", this);
  }

  handleEvent(event) {
    if (event.type === "DOMWindowCreated") {
      this.#contentURI = Services.io.newURI("chrome://sine/content/content.css");
      this.injectUserStyle();
    }
  }

  receiveMessage(message) {
    if (message.name === "RebuildUserStyles") {
      this.removeUserStyle();
      this.injectUserStyle();
    }
  }

  injectUserStyle() {
    try {
      const utils = this.contentWindow.windowUtils;
      utils.loadSheet(this.#contentURI, utils.USER_SHEET);
    } catch (err) {
      console.error("Failed to inject userContent style: ", err);
    }
  }

  removeUserStyle() {
    const utils = this.contentWindow.windowUtils;
    try {
      utils.removeSheet(this.#contentURI, utils.USER_SHEET);
    } catch {}
  }
}
