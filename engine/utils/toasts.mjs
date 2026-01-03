// => engine/utils/toasts.mjs
// ===========================================================
// This module contains the basic logic behind toast
// implementation, used in uc_api.sys.mjs.
// ===========================================================

import ucAPI from "./uc_api.sys.mjs";
import domUtils from "./dom.mjs";

export default class Toast {
    timeout = 3000;

    constructor(options = {}, win = window) {
        this.preset = options.preset ?? 1;
        this.init(options, win);
    }

    async init(options, win) {
        const duplicates = Array.from(win.document.querySelectorAll(".sineToast")).filter(
            (toast) => toast.dataset.id === options.id || toast.children[0].children[0].textContent === options.title
        );

        await Promise.all(duplicates.map((duplicate) => this.remove(duplicate)));

        this.toast = domUtils.appendXUL(
            win.document.querySelector(".sineToastManager"),
            `
                <div class="sineToast" data-id="${options.id}">
                    <div>
                        <span data-l10n-id="sine-toast-${options.id}"
                            ${options.version ? `data-l10n-args='{"version": "${options.version}"}'` : ""}></span>
                        ${options.id !== "3" ? `
                            <span class="description" data-l10n-id="sine-toast-${options.id}-desc"
                                ${options.name ? `data-l10n-args='{"name": "${options.name}"}'` : ""}></span>
                        ` : ""}
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

    #animateEntry() {
        this.toast._entryAnimation = this.toast.animate(
          [
            { transform: "translateY(120%) scale(0.8)" },
            { transform: "translateY(0%) scale(1)" }
          ],
          { duration: 500, fill: "forwards", easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
        );

        const description = this.toast.querySelector(".description");
        if (description) {
            description.animate(
              [
                { opacity: 0, transform: "translateY(5px)" },
                { opacity: 1, transform: "translateY(0px)" }
              ],
              { delay: 200, duration: 300, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" }
            );
        }
    }

    #setupHover() {
        let hoverAnimation = null;

        const animationBehavior = { duration: 200, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" };
        const initialState = { transform: "translate(0px, 0px) scale(1)" };
        const finalState = { transform: "translate(-6px, -2px) scale(1.05)" };

        this.toast.addEventListener("mouseenter", () => {
            if (hoverAnimation) hoverAnimation.cancel();
            hoverAnimation = this.toast.animate([initialState, finalState], animationBehavior);
        });

        this.toast.addEventListener("mouseleave", () => {
            if (hoverAnimation) hoverAnimation.cancel();
            hoverAnimation = this.toast.animate(this.toast.animate([finalState, initialState], animationBehavior));
        });
    }

    #setupButton(clickEvent, win) {
        const button = this.toast.querySelector("button");
        if (!button) return;

        let buttonAnimation = null;
        const hoverScale = { transform: "scale(1.05)" };
        const animationBehavior = { easing: "cubic-bezier(0.68, -0.55, 0.27, 1.55)", duration: 200, fill: "forwards" };

        const animationSetup = () => {
          if (buttonAnimation) buttonAnimation.pause();
          const currentTransform = win.getComputedStyle(button).transform;
          if (buttonAnimation) buttonAnimation.cancel();
          return currentTransform;
        }

        const hoverAnimation = () => {
            const currentTransform = animationSetup();
            buttonAnimation = button.animate([{ transform: currentTransform }, hoverScale], animationBehavior);
        }

        button.addEventListener("mouseenter", () => hoverAnimation());
        button.addEventListener("mouseup", () => hoverAnimation());

        button.addEventListener("mouseleave", () => {
          const currentTransform = animationSetup();
          buttonAnimation = button.animate(
            [
              { transform: currentTransform },
              { transform: `scale(1)` }
            ],
            animationBehavior
          );
        });

        button.addEventListener("mousedown", () => {
          const currentTransform = animationSetup();
          buttonAnimation = button.animate(
            [
              { transform: currentTransform },
              { transform: `scale(0.95)` }
            ],
            { ...animationBehavior, duration: 100 }
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

    async remove(toast = this.toast) {
        toast.dataset.removing = "true";

        toast._entryAnimation?.cancel();

        await toast.animate(
          [
            { transform: "translateY(0%) scale(1)" },
            { transform: "translateY(120%) scale(0.8)" }
          ],
          { duration: 400, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" }
        ).finished;

        toast.remove();
    }
}
