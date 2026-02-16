const parseMD = (element, markdown, relativeURL, windowObj = window) => {
    const document = windowObj.document;

    if (!document.querySelector('link[href*="marked_styles.css"]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.className = "marked-styles";
        link.href = "chrome://userscripts/content/engine/assets/imports/marked_styles.css";
        document.head.appendChild(link);
    }

    if (!windowObj.marked) {
        Services.scriptloader.loadSubScriptWithOptions(
            "chrome://userscripts/content/engine/assets/imports/marked_parser.js",
            { target: windowObj }
        );
    }

    const renderer = new windowObj.marked.Renderer();

    const fixURL = (href) => {
        if (/^(https?:\/\/|\/\/)/i.test(href)) return href;
        return `${relativeURL.replace(/\/$/, "")}/${href.replace(/^\//, "")}`;
    };

    renderer.image = (href, title, text) => {
        const titleAttr = title ? ` title="${title}"` : "";
        return `<img src="${fixURL(href)}" alt="${text}"${titleAttr} />`;
    };

    renderer.link = (href, title, text) => {
        let finalHref = href;
        if (!/^(https?:\/\/|\/\/)/i.test(href)) {
            const isRelativePath = href.includes("/") || /\.(md|html|htm|png|jpg|jpeg|gif|svg|pdf)$/i.test(href);
            finalHref = isRelativePath ? fixURL(href) : `https://${href}`;
        }
        const titleAttr = title ? ` title="${title}"` : "";
        return `<a href="${finalHref}"${titleAttr}>${text}</a>`;
    };

    windowObj.marked.setOptions({
        gfm: true,
        renderer: renderer,
    });

    element.innerHTML = windowObj.marked.parse(markdown).replace(/<(img|hr|br|input)([^>]*?)(?<!\/)>/gi, "<$1$2 />");
};

const appendXUL = (parentElement, xulString, insertBefore = null, XUL = false) => {
    let element;
    if (XUL) {
        element = (typeof XUL === "function" ? XUL : window.MozXULElement).parseXULToFragment(xulString);
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
        const existing = document.querySelector(selector);
        if (existing) return resolve(existing);

        const observer = new MutationObserver(() => {
            const elm = document.querySelector(selector);
            if (elm) {
                observer.disconnect();
                resolve(elm);
            }
        });

        observer.observe(document, {
            childList: true,
            subtree: true,
        });
    });
};

const supportedLocales = ["en-US", "en", "pl", "ru"];

const injectLocale = (file, doc = document) => {
    const pref = "intl.locale.requested";
    let link = null;

    const getLocale = () => {
        const appLocale = Services.locale.appLocaleAsLangTag;
        return supportedLocales.includes(appLocale) ? appLocale : "en-US";
    };

    const register = () => {
        const locale = getLocale();

        if (link) {
            link.remove();
        }

        link = doc.createElement("link");
        link.setAttribute("rel", "localization");
        link.setAttribute("href", `${locale}/${file}.ftl`);
        doc.head.appendChild(link);
    };

    register();

    const observer = {
        observe() {
            register();
        },
    };
    Services.prefs.addObserver(pref, observer);
    window.addEventListener(
        "beforeunload",
        () => {
            Services.prefs.removeObserver(pref, observer);
        },
        { once: true }
    );
};

export default { parseMD, appendXUL, waitForElm, injectLocale };
