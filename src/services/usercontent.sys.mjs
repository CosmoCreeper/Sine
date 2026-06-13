/**
 * @file Window actor for applying styles that emulate userContent.
 * @license
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/** Main child window actor class. */
export class SineUserContentChild extends JSWindowActorChild {
  #contentURI = null;

  /** Initializes message listener abilities. */
  constructor() {
    super();
    Services.cpmm.addMessageListener("RebuildUserStyles", this);
  }

  /** Handles unloading the message listener to prevent memory leaks. */
  didDestroy() {
    Services.cpmm.removeMessageListener("RebuildUserStyles", this);
  }

  /**
   * Handles load events.
   *
   * @param {Event} event - Event that function was triggered for.
   */
  handleEvent(event) {
    if (event.type === "DOMWindowCreated") {
      this.#contentURI = Services.io.newURI("chrome://sine/content/content.css");
      this.injectUserStyle();
    }
  }

  /**
   * Handles received messages, including rebuilding styles.
   *
   * @param {object} message - Message being received.
   */
  receiveMessage(message) {
    if (message.name === "RebuildUserStyles") {
      this.removeUserStyle();
      this.injectUserStyle();
    }
  }

  /** Injects userContent styles into the window. */
  injectUserStyle() {
    try {
      const utils = this.contentWindow.windowUtils;
      utils.loadSheet(this.#contentURI, utils.USER_SHEET);
    } catch (err) {
      console.error("Failed to inject userContent style: ", err);
    }
  }

  /** Unloads userContent styles from the window. */
  removeUserStyle() {
    const utils = this.contentWindow.windowUtils;
    try {
      utils.removeSheet(this.#contentURI, utils.USER_SHEET);
    } catch {}
  }
}
