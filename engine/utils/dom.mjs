const parseMD = (element, markdown, relativeURL, window = window) => {
    const document = window.document;

    if (!document.querySelector("style.marked-styles")) {
        appendXUL(
            document.head,
            '<link rel="stylesheet" href="chrome://userscripts/content/engine/assets/imports/marked_styles.css"/>'
        );
    }

    Services.scriptloader.loadSubScriptWithOptions(
        "chrome://userscripts/content/engine/assets/imports/marked_parser.js",
        { target: window }
    );

    const renderer = new window.marked.Renderer();

    renderer.image = (href, title, text) => {
        if (!href.match(/^https?:\/\//) && !href.startsWith("//")) href = `${relativeURL}/${href}`;
        const titleAttr = title ? `title="${title}"` : "";
        return `<img src="${href}" alt="${text}" ${titleAttr} />`;
    };

    renderer.link = (href, title, text) => {
        if (!href.match(/^https?:\/\//) && !href.startsWith("//")) {
            const isRelativePath = href.includes("/") || /\.(md|html|htm|png|jpg|jpeg|gif|svg|pdf)$/i.test(href);
            if (isRelativePath) href = `${relativeURL}/${href}`;
            else href = `https://${href}`;
        }
        const titleAttr = title ? `title="${title}"` : "";
        return `<a href="${href}" ${titleAttr}>${text}</a>`;
    };

    window.marked.setOptions({
        gfm: true,
        renderer: renderer,
    });

    element.innerHTML = window.marked.parse(markdown).replace(/<(img|hr|br|input)([^>]*?)(?<!\/)>/gi, "<$1$2 />");

    delete window.marked;
};

const appendXUL = (parentElement, xulString, insertBefore = null, XUL = false) => {
    let element;
    if (XUL) {
        element = (typeof XUL === "function" ? XUL : window.MozXULElement).parseXULToFragment(
            xulString
        );
    } else {
        element = new DOMParser().parseFromString(xulString, "text/html");
        if (element.body.children.length) {
            element = element.body.firstChild;
        } else {
            element = element.head.firstChild;
        }
    }

    element = parentElement.ownerDocument.importNode(element, true);

    if (insertBefore) {
        parentElement.insertBefore(element, insertBefore);
    } else {
        parentElement.appendChild(element);
    }

    return element;
};

const waitForElm = (selector) => {
    return new Promise((resolve) => {
        if (document.querySelector(selector)) {
            return resolve(document.querySelector(selector));
        }

        const observer = new MutationObserver(() => {
            if (document.querySelector(selector)) {
                observer.disconnect();
                resolve(document.querySelector(selector));
            }
        });

        observer.observe(document, {
            childList: true,
            subtree: true,
        });
    });
};

const supportedLocales = ["en-US", "en"];

const injectLocale = (file, doc = document) => {
    const register = () => {
        let locale = Services.locale.appLocaleAsLangTag;
        if (!supportedLocales.includes(locale)) {
            locale = "en-US";
        }
        appendXUL(doc.head, `<link rel="localization" href="${locale}/${file}.ftl"/>`);
    }
    register();

    const pref = "intl.locale.requested";
    const observer = {
        observe() {
            register();
        }
    };
    Services.prefs.addObserver(pref, observer);
    window.addEventListener("beforeunload", () => {
        Services.prefs.removeObserver(pref, observer);
    });
}

export default { parseMD, appendXUL, waitForElm, injectLocale };
