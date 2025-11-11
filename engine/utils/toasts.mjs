// => engine/utils/toasts.mjs
// ===========================================================
// This module contains the basic logic behind toast
// implementation, used in uc_api.sys.mjs.
// ===========================================================

import ucAPI from "./uc_api.sys.mjs";
import domUtils from "./dom.mjs";

export default class Toast {
    timeout = 3000;
    animations = {
        entry: {
            initial: { y: "120%", scale: 0.8 },
            animate: { y: "0%", scale: 1 },
            transition: { type: "spring", stiffness: 300, damping: 30, mass: 0.8, duration: 0.5 },
        },
        exit: {
            animate: { y: "120%", scale: 0.8 },
            transition: { type: "spring", stiffness: 400, damping: 40, mass: 0.6, duration: 0.4 },
        },
        hover: {
            animate: { x: "-6px", y: "-2px", scale: 1.05 },
            transition: { type: "spring", stiffness: 400, damping: 25, duration: 0.2 },
        },
        button: {
            hover: { scale: 1.05 },
            tap: { scale: 0.95 },
            transition: { type: "spring", stiffness: 400, damping: 25, duration: 0.2 },
        },
        layout: {
            transition: { type: "spring", stiffness: 300, damping: 30, mass: 0.8, duration: 0.4 },
        },
    };

    constructor(options = {}, win = window) {
        this.preset = options.preset ?? 1;
        this.Motion = win.MotionLib;

        if (options.title.includes("Sine engine")) {
            this.id = "2";
        } else if (options.title.includes("A mod utilizing JS")) {
            this.id = "1";
        } else {
            this.id = "0";
        }

        this.init(options, win);
    }

    async init(options, win) {
        const duplicates = Array.from(win.document.querySelectorAll(".sineToast")).filter(
            (toast) => toast.dataset.id === this.id || toast.children[0].children[0].textContent === options.title
        );

        await Promise.all(duplicates.map((duplicate) => this.remove(duplicate)));

        this.toast = domUtils.appendXUL(
            win.document.querySelector(".sineToastManager"),
            `
            <div class="sineToast" data-id="${this.id}">
                <div>
                    <span>${options.title}</span>
                    ${options.description ? `<span class="description">${options.description}</span>` : ""}
                </div>
                ${this.preset > 0 ? `<button>${this.preset === 2 ? "Enable" : "Restart"}</button>` : ""}
            </div>
        `
        );

        this.#animateEntry();
        this.#setupHover();
        if (this.preset > 0) {
            this.#setupButton(options.clickEvent);
        }
        this.#setupTimeout(win);
    }

    #animateEntry() {
        this.toast.style.transform = `translateY(${this.animations.entry.initial.y}) scale(${this.animations.entry.initial.scale})`;

        this.toast._entryAnimation = this.Motion.animate(
            this.toast,
            this.animations.entry.animate,
            this.animations.entry.transition
        );

        const description = this.toast.querySelector(".description");
        if (description) {
            description.style.opacity = "0";
            description.style.transform = "translateY(5px)";
            this.Motion.animate(
                description,
                { opacity: "1", translateY: "0px" },
                { delay: 0.2, type: "spring", stiffness: 300, damping: 30, duration: 0.3 }
            );
        }
    }

    #setupHover() {
        let hoverAnimation = null;

        this.toast.addEventListener("mouseenter", () => {
            if (hoverAnimation) hoverAnimation.stop();
            hoverAnimation = this.Motion.animate(
                this.toast,
                this.animations.hover.animate,
                this.animations.hover.transition
            );
        });

        this.toast.addEventListener("mouseleave", () => {
            if (hoverAnimation) hoverAnimation.stop();
            hoverAnimation = this.Motion.animate(
                this.toast,
                { x: "0px", y: "0px", scale: 1 },
                this.animations.hover.transition
            );
        });
    }

    #setupButton(clickEvent) {
        const button = this.toast.querySelector("button");
        if (!button) return;

        let buttonAnimation = null;

        button.addEventListener("mouseenter", () => {
            if (buttonAnimation) buttonAnimation.stop();
            buttonAnimation = this.Motion.animate(
                button,
                this.animations.button.hover,
                this.animations.button.transition
            );
        });

        button.addEventListener("mouseleave", () => {
            if (buttonAnimation) buttonAnimation.stop();
            buttonAnimation = this.Motion.animate(button, { scale: 1 }, this.animations.button.transition);
        });

        button.addEventListener("mousedown", () => {
            if (buttonAnimation) buttonAnimation.stop();
            buttonAnimation = this.Motion.animate(button, this.animations.button.tap, {
                ...this.animations.button.transition,
                duration: 0.1,
            });
        });

        button.addEventListener("mouseup", () => {
            if (buttonAnimation) buttonAnimation.stop();
            buttonAnimation = this.Motion.animate(
                button,
                this.animations.button.hover,
                this.animations.button.transition
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

        toast._entryAnimation?.stop();

        await this.Motion.animate(toast, this.animations.exit.animate, this.animations.exit.transition).finished;

        toast.remove();
    }
}
