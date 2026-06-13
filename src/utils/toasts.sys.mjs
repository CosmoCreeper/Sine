/**
 * @file Manages and defines toast logic. This Source Code Form is subject to the terms of the
 *   Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You
 *   can obtain one at http://mozilla.org/MPL/2.0/.
 */

import ucAPI from "./uc_api.sys.mjs";
import * as domUtils from "./dom.mjs";

/** Main class for managing toasts. */
export default class Toast {
  timeout = 3000;

  /**
   * Triggers toast initialization.
   *
   * @param {object} options - Options to use to define toast.
   * @param {Window} win - Window to inject toast in.
   */
  constructor(options = {}, win) {
    this.preset = options.preset ?? 1;
    this.init(options, win);
  }

  /**
   * Initializes toast in DOM.
   *
   * @param {object} options - Options to use to define toast.
   * @param {Window} win - Window to inject toast in.
   */
  async init(options, win) {
    const duplicates = Array.from(win.document.querySelectorAll(".sineToast")).filter(
      (toast) =>
        toast.dataset.id === options.id ||
        toast.children[0].children[0].textContent === options.title
    );
    await Promise.all(duplicates.map((duplicate) => this.remove(duplicate)));

    // options.version and the desc might not exist, but there is no adverse effect if they do not.
    // The version argument won't do anything if it doesn't exist, and same for the description.
    this.toast = domUtils.appendXUL(
      win.document.querySelector(".sineToastManager"),
      `
        <div class="sineToast" data-id="${options.id}">
          <div>
            <span data-l10n-id="sine-toast-${options.id}"
              data-l10n-args='{"version": "${options.version}"}'></span>
            <span class="description"
              data-l10n-args='{"name": "${options.name}"}'
              data-l10n-id="sine-toast-${options.id}-desc"></span>
          </div>
          ${this.preset > 0 ? `<button data-l10n-id="sine-toast-preset-${this.preset}"></button>` : ""}
        </div>
      `
    );

    this.#animateEntry();
    this.#setupHover();
    if (this.preset > 0) {
      this.#setupButton(options.clickEvent, win);
    }
    this.#setupTimeout(win);
  }

  /** Animates the entry of the toast into the user's viewport. */
  #animateEntry() {
    this.toast.entryAnimation = this.toast.animate(
      [{ transform: "translateY(120%) scale(0.8)" }, { transform: "translateY(0%) scale(1)" }],
      { duration: 500, fill: "forwards", easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
    );

    const description = this.toast.querySelector(".description");
    if (description) {
      description.animate(
        [
          { opacity: 0, transform: "translateY(5px)" },
          { opacity: 1, transform: "translateY(0px)" },
        ],
        { delay: 200, duration: 300, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" }
      );
    }
  }

  /** Sets up the hover effects of the toast. */
  #setupHover() {
    let hoverAnimation = null;

    const animationBehavior = {
      duration: 200,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      fill: "forwards",
    };
    const initialState = { transform: "translate(0px, 0px) scale(1)" };
    const finalState = { transform: "translate(-6px, -2px) scale(1.05)" };

    this.toast.addEventListener("mouseenter", () => {
      if (hoverAnimation) hoverAnimation.cancel();
      hoverAnimation = this.toast.animate([initialState, finalState], animationBehavior);
    });

    this.toast.addEventListener("mouseleave", () => {
      if (hoverAnimation) hoverAnimation.cancel();
      hoverAnimation = this.toast.animate(
        this.toast.animate([finalState, initialState], animationBehavior)
      );
    });
  }

  /**
   * Sets up the toast button for a quick action.
   *
   * @param {() => void} clickEvent - Event to trigger on click.
   * @param {Window} win - Window that the toast lives in.
   */
  #setupButton(clickEvent, win) {
    const button = this.toast.querySelector("button");
    if (!button) return;

    let buttonAnimation = null;
    const hoverScale = { transform: "scale(1.05)" };
    const animationBehavior = {
      easing: "cubic-bezier(0.68, -0.55, 0.27, 1.55)",
      duration: 200,
      fill: "forwards",
    };

    const animationSetup = () => {
      if (buttonAnimation) buttonAnimation.pause();
      const currentTransform = win.getComputedStyle(button).transform;
      if (buttonAnimation) buttonAnimation.cancel();
      return currentTransform;
    };

    const hoverAnimation = () => {
      const currentTransform = animationSetup();
      buttonAnimation = button.animate(
        [{ transform: currentTransform }, hoverScale],
        animationBehavior
      );
    };

    button.addEventListener("mouseenter", () => hoverAnimation());
    button.addEventListener("mouseup", () => hoverAnimation());

    button.addEventListener("mouseleave", () => {
      const currentTransform = animationSetup();
      buttonAnimation = button.animate(
        [{ transform: currentTransform }, { transform: `scale(1)` }],
        animationBehavior
      );
    });

    button.addEventListener("mousedown", () => {
      const currentTransform = animationSetup();
      buttonAnimation = button.animate(
        [{ transform: currentTransform }, { transform: `scale(0.95)` }],
        Object.assign({}, animationBehavior, { duration: 100 })
      );
    });

    button.addEventListener("click", () => {
      if (this.preset === 1) {
        ucAPI.utils.restart();
      } else if (this.preset === 2) {
        clickEvent();
        this.remove();
      }
    });
  }

  /**
   * Sets up the timeout for when the toast should disappear from the user's viewport.
   *
   * @param {Window} win - Window that the toast lives in.
   */
  #setupTimeout(win) {
    let timeoutId = null;

    const startTimeout = () => {
      if (timeoutId) win.clearTimeout(timeoutId);
      timeoutId = win.setTimeout(() => {
        this.remove();
      }, this.timeout);
    };

    this.toast.addEventListener("mouseenter", () => {
      if (timeoutId) win.clearTimeout(timeoutId);
    });

    this.toast.addEventListener("mouseleave", () => {
      startTimeout();
    });

    startTimeout();
  }

  /**
   * Removes a toast from the DOM, with it's removal animation.
   *
   * @param {HTMLElement} toast - Toast element to remove.
   */
  async remove(toast) {
    const targetToast = toast ?? this.toast;

    targetToast.dataset.removing = "true";
    targetToast.entryAnimation?.cancel();

    await targetToast.animate(
      [{ transform: "translateY(0%) scale(1)" }, { transform: "translateY(120%) scale(0.8)" }],
      {
        duration: 400,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        fill: "forwards",
      }
    ).finished;

    targetToast.remove();
  }
}
