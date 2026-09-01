/**
 * @file Defines DOM-related utilties.
 * @license
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/**
 * Parses markdown into valid HTML and appends it.
 *
 * @param {HTMLElement} element - Element to append markdown to.
 * @param {string} markdown - Markdown string.
 * @param {string} relativeURL - Base url to prepend to link paths.
 */
export const parseMD = (element, markdown, relativeURL) => {
  const win = element.documentGlobal;
  const doc = win.defaultView;

  if (!doc.querySelector('link[href*="marked_styles.css"]')) {
    const link = doc.createElement("link");
    link.rel = "stylesheet";
    link.className = "marked-styles";
    link.href = "chrome://userscripts/content/assets/imports/marked_styles.css";
    doc.head.append(link);
  }

  if (!win.marked) {
    Services.scriptloader.loadSubScriptWithOptions(
      "chrome://userscripts/content/assets/imports/marked_parser.js",
      {
        target: win,
      }
    );
  }

  const renderer = new win.marked.Renderer();

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

  win.marked.setOptions({
    gfm: true,
    renderer,
  });

  // TODO: Find a reliable way to sanitize output
  // eslint-disable-next-line eslint-js/no-restricted-syntax
  element.innerHTML = win.marked
    .parse(markdown)
    .replaceAll(/<(img|hr|br|input)([^>]*?)\s*\/?>/giu, "<$1$2 />")
    .replaceAll(/&(?![\w#]+;)/gu, "&amp;");
};

/**
 * Appends XUL string into parent element.
 *
 * @param {HTMLElement} parentElement - Element to append XUL in.
 * @param {string} xulString - XUL string to parse.
 * @param {HTMLElement} insertBefore - If specified, will insert XUL before this element.
 * @param {object | boolean} XUL - XUL object used for parsing.
 * @returns {HTMLElement} Element appended.
 */
export const appendXUL = (parentElement, xulString, insertBefore = null, XUL = false) => {
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

/**
 * Waits for an element to match the selector passed, instantly returning if it already exists.
 *
 * @param {string} selector - Selector to wait for.
 * @returns {HTMLElement} Element found that matches selector.
 */
export const waitForElm = (selector) => {
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
/**
 * Injects a locale into a document.
 *
 * @param {string} file - Relative locale path to inject. (without the lang tag)
 * @param {HTMLDocument} doc - Document to inject locale into.
 */
export const injectLocale = (file, doc = document) => {
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
