/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

// ===========================================================
// Initializes utilities related to the DOM, including parsing
// markdown and injecting locales.
// ===========================================================

/**
 * @param {HTMLElement} element - Element to append markdown to.
 * @param {string} markdown - Markdown string.
 * @param {string} relativeURL - Base url to prepend to link paths.
 */
const parseMD = (element, markdown, relativeURL) => {
  const doc = element.documentGlobal.defaultView;

  if (!doc.querySelector('link[href*="marked_styles.css"]')) {
    const link = doc.createElement("link");
    link.rel = "stylesheet";
    link.className = "marked-styles";
    link.href = "chrome://userscripts/content/assets/imports/marked_styles.css";
    doc.head.append(link);
  }

  if (!windowObj.marked) {
    Services.scriptloader.loadSubScriptWithOptions(
      "chrome://userscripts/content/assets/imports/marked_parser.js",
      {
        target: windowObj,
      }
    );
  }

  const renderer = new windowObj.marked.Renderer();

  const fixURL = (href) => {
    if (/^(https?:\/\/|\/\/)/iu.test(href)) return href;
    return `${relativeURL.replace(/\/$/u, "")}/${href.replace(/^\//u, "")}`;
  };

  renderer.image = (href, title, text) => {
    const titleAttr = title ? ` title="${title}"` : "";
    return `<img src="${fixURL(href)}" alt="${text}"${titleAttr} />`;
  };

  renderer.link = (href, title, text) => {
    let finalHref = href;
    if (!/^(https?:\/\/|\/\/)/iu.test(href)) {
      const isRelativePath =
        href.includes("/") || /\.(md|html|htm|png|jpg|jpeg|gif|svg|pdf)$/iu.test(href);
      finalHref = isRelativePath ? fixURL(href) : `https://${href}`;
    }
    const titleAttr = title ? ` title="${title}"` : "";
    return `<a href="${finalHref}"${titleAttr}>${text}</a>`;
  };

  windowObj.marked.setOptions({
    gfm: true,
    renderer,
  });

  // TODO: Find a reliable way to sanitize output
  // eslint-disable-next-line eslint-js/no-restricted-syntax
  element.innerHTML = windowObj.marked
    .parse(markdown)
    .replaceAll(/<(img|hr|br|input)([^>]*?)\s*\/?>/giu, "<$1$2 />")
    .replaceAll(/&(?![\w#]+;)/gu, "&amp;");
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
    parentElement.append(element);
  }

  return element;
};

const waitForElm = (selector) => {
  return new Promise((resolve) => {
    const existing = document.querySelector(selector);
    if (existing) resolve(existing);

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

const supportedLocales = new Set(["en-US", "en", "pl", "ru"]);

const injectLocale = (file, doc = document) => {
  const pref = "intl.locale.requested";
  let link = null;

  const getLocale = () => {
    const appLocale = Services.locale.appLocaleAsLangTag;
    return supportedLocales.has(appLocale) ? appLocale : "en-US";
  };

  const register = () => {
    const locale = getLocale();

    if (link) {
      link.remove();
    }

    link = doc.createElement("link");
    link.setAttribute("rel", "localization");
    link.setAttribute("href", `${locale}/${file}.ftl`);
    doc.head.append(link);
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
