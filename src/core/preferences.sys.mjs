/*
 * This file manages essential preference logic, including parsing preferences.json files
 */

import utils from "./utils.sys.mjs";
import domUtils from "../utils/dom.mjs";
import ucAPI from "../utils/uc_api.sys.mjs";

const tagNames = {
  separator: "vbox",
  checkbox: "hbox",
  dropdown: "hbox",
  text: "hbox",
  string: "hbox",
};
const validTypes = Object.keys(tagNames);

const evaluateCondition = (cond) => {
  const isNot = !!cond.not;
  const condition = cond.if || cond.not;

  let prefValue;
  if (typeof condition.value === "boolean") {
    prefValue = Services.prefs.getBoolPref(condition.property, false);
  } else if (typeof condition.value === "number") {
    prefValue = Services.prefs.getIntPref(condition.property, 0);
  } else {
    prefValue = Services.prefs.getCharPref(condition.property, "");
  }

  return isNot ? prefValue !== condition.value : prefValue === condition.value;
};

const evaluateConditions = (conditions, operator = "AND") => {
  const condArray = Array.isArray(conditions) ? conditions : [conditions];
  if (condArray.length === 0) {
    return true;
  }

  const results = condArray.map((cond) => {
    if (cond.if || cond.not) {
      return evaluateCondition(cond);
    } else if (cond.conditions) {
      return evaluateConditions(cond.conditions, cond.operator || "AND");
    }
    return false;
  });

  return operator === "OR" ? results.some((r) => r) : results.every((r) => r);
};

const updatePrefVisibility = (pref, document) => {
  const identifier = pref.id ?? pref.property;
  const targetId = identifier.replace(/\./g, "-");
  const element = document.getElementById(targetId);

  if (element) {
    const shouldShow = evaluateConditions(pref.conditions, pref.operator || "OR");
    element.style.display = shouldShow ? "flex" : "none";
  }
};

export const setupPrefObserver = (pref, window) => {
  const document = window.document;

  const identifier = pref.id ?? pref.property;
  const targetId = identifier.replace(/\./g, "-");

  // Initially hide the element
  const element = document.getElementById(targetId);
  if (element) {
    element.style.display = "none";
  }

  // Collect all preference properties that need to be observed
  const propsToObserve = new Set();

  const collectProps = (conditions) => {
    const condArray = Array.isArray(conditions) ? conditions : [conditions];
    condArray.forEach((cond) => {
      if (cond.if || cond.not) {
        const condition = cond.if || cond.not;
        propsToObserve.add(condition.property);
      } else if (cond.conditions) {
        collectProps(cond.conditions);
      }
    });
  };

  collectProps(pref.conditions);

  // Create observer callback
  const observer = {
    observe: (_, topic, data) => {
      if (topic === "nsPref:changed" && propsToObserve.has(data)) {
        th.updatePrefVisibility(pref, document);
      }
    },
  };

  // Add observers for each property
  propsToObserve.forEach((prop) => {
    Services.prefs.addObserver(prop, observer);
  });

  window.addEventListener("beforeunload", () => {
    propsToObserve.forEach((prop) => {
      Services.prefs.removeObserver(prop, observer);
    });
  });

  // Initial visibility check
  updatePrefVisibility(pref, document);

  return observer;
};

// Ensures the pref is valid and that parsing should move forward
const validatePref = (pref) => {
  if (pref.disabledOn?.some((os) => os.includes(ucAPI.utils.os))) {
    return false;
  }
  if (!validTypes.includes(pref.type)) {
    return false;
  }
  return true;
};

// Initializes a pref element shell with general properties
const buildPrefElement = (pref, document) => {
  // Could be solved with a simple if, but this is future-proof
  const tagName = tagNames[pref.type];
  const prefEl = document.createXULElement(tagName);

  const foundId = pref.id || pref.property;
  if (foundId) {
    prefEl.id = foundId.replace(/\./g, "-");
  }

  if (pref.label) {
    pref.label = utils.formatLabel(pref.label);
    if (tagName === "hbox") {
      domUtils.appendXUL(prefEl, `<label class="sineItemPreferenceLabel">${pref.label}</label>`);
    }
  } else {
    pref.label = "";
  }

  if (pref.property) {
    if (pref.type !== "separator") {
      prefEl.title = pref.property;
    }
  } else {
    pref.property = "";
  }

  if (pref.margin) prefEl.style.margin = pref.margin;
  if (pref.size) prefEl.style.fontSize = pref.size;

  return prefEl;
};

// Builds utilities to easily apply a preference
const buildPrefContext = (pref) => {
  const hasDefaultValue = Object.hasOwn(pref, "defaultValue");
  const prefExists = Services.prefs.getPrefType(pref.property) > 0;
  const prefActive =
    !pref.force || !hasDefaultValue || Services.prefs.prefHasUserValue(pref.property);

  return {
    prefExists,
    hasDefaultValue,
    placeholderBackup: pref.placeholder ?? "None",
    useStoredValue: prefExists && prefActive,
    backupDefault: pref.defaultValue ?? "",
    showRestartToast: () => {
      if (pref.restart) {
        ucAPI.showToast({
          id: "3",
        });
      }
    },
    convertValueType: (value) => {
      if (!pref.value) return value;
      if (pref.value.includes("num")) {
        return Number(value);
      } else if (pref.value.includes("bool")) {
        return value.toLowerCase() !== "false";
      }
      return value;
    },
  };
};

const applySeparator = (pref, prefEl) => {
  const separator = domUtils.appendXUL(prefEl, "<hr/>");
  if (pref.height) {
    separator.style.borderWidth = pref.height;
  }
  domUtils.appendXUL(prefEl, `<label class="separator-label">${pref.label}</label>`);
};

const applyCheckbox = (pref, prefEl, ctx, window) => {
  prefEl.className = "sineItemPreferenceCheckbox";
  domUtils.appendXUL(prefEl, "<checkbox/>", prefEl.children[0], window.MozXULElement);

  if (pref.defaultValue && !ctx.prefExists) {
    Services.prefs.setBoolPref(pref.property, true);
  }

  const setChecked = (checked) => {
    if (checked) {
      prefEl.setAttribute("checked", true);
    } else {
      prefEl.removeAttribute("checked");
    }
    prefEl.children[0].checked = checked;
  };

  setChecked(Services.prefs.getBoolPref(pref.property, false));

  prefEl.addEventListener("click", (e) => {
    e.preventDefault();
    const makeChecked = !e.currentTarget.getAttribute("checked");
    Services.prefs.setBoolPref(pref.property, makeChecked);
    setChecked(makeChecked);
    ctx.showRestartToast();
  });
};

const applyString = (pref, prefEl, ctx, manager) => {
  const input = domUtils.appendXUL(
    prefEl,
    `<input type="text" placeholder="${pref.placeholder ?? "Type something..."}"/>`
  );

  if (ctx.useStoredValue) {
    input.value = ucAPI.prefs.get(pref.property);
  } else {
    ucAPI.prefs.set(pref.property, ctx.backupDefault);
    input.value = ctx.backupDefault;
  }

  const updateBorder = () => {
    if (pref.border) {
      input.style.borderColor = pref.border === "value" ? input.value : pref.border;
    }
  };
  updateBorder();

  input.addEventListener("change", () => {
    ucAPI.prefs.set(pref.property, ctx.convertValueType(input.value));
    manager.rebuildMods(false, false);
    updateBorder();
    ctx.showRestartToast();
  });
};

const applyDropdown = (pref, prefEl, ctx, manager, window) => {
  const defaultMatch = ctx.hasDefaultValue
    ? pref.options.find((item) => item.value === pref.defaultValue)
    : null;

  domUtils.appendXUL(
    prefEl,
    `<menulist>
        <menupopup class="in-menulist">
          ${
            pref.placeholder !== false
              ? `
            <menuitem value="${defaultMatch ? "" : ctx.backupDefault}"
              label="${ctx.placeholderBackup}" />`
              : ""
          }
          ${pref.options
            .map((option) => `<menuitem value="${option.value}" label="${option.label}" />`)
            .join("")}
        </menupopup>
      </menulist>`,
    null,
    window.MozXULElement
  );

  const menulist = prefEl.querySelector("menulist");
  const menupopup = menulist.children[0];
  const popupChildren = Array.from(menupopup.children);

  if (ucAPI.prefs.get(pref.property) !== "") {
    let value, save;
    if (ctx.useStoredValue) {
      value = ucAPI.prefs.get(pref.property);
      save = false;
    } else if (ctx.hasDefaultValue) {
      value = pref.defaultValue;
      save = true;
    } else if (menupopup.children.length >= 1) {
      value = menupopup.children[0].getAttribute("value");
      save = true;
    } else {
      throw new Error("Failed to parse pref", {
        cause: "No matching value found for dropdown",
      });
    }

    const matchingLabel = popupChildren
      .find((item) => item.getAttribute("value") === value)
      ?.getAttribute("label");
    menulist.setAttribute("label", matchingLabel ?? ctx.placeholderBackup);
    menulist.setAttribute("value", value);
    if (save) ucAPI.prefs.set(pref.property, value);
  }

  menulist.addEventListener("command", () => {
    ucAPI.prefs.set(pref.property, ctx.convertValueType(menulist.getAttribute("value")));
    ctx.showRestartToast();
    manager.rebuildMods(false, false);
  });
};

// Applies the appropriate behavior and DOM to each pref type
const applyPref = (pref, prefEl, manager, window) => {
  const ctx = buildPrefContext(pref);

  switch (pref.type) {
    case "separator":
      applySeparator(pref, prefEl);
      break;
    case "checkbox":
      applyCheckbox(pref, prefEl, ctx, window);
      break;
    case "string":
      applyString(pref, prefEl, ctx, manager);
      break;
    case "dropdown":
      applyDropdown(pref, prefEl, ctx, manager, window);
      break;
  }

  if (pref.conditions) {
    setupPrefObserver(pref, window);
  }
};

export const parsePref = (pref, manager, window) => {
  if (!validatePref(pref)) return null;
  // This function has several side-effects that affect pref properties
  const prefEl = buildPrefElement(pref, window.document);
  applyPref(pref, prefEl, manager, window);
  return prefEl;
};
