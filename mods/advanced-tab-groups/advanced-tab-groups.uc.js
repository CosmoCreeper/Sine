class ZenGroups {
  #initialized = false;
  #animationState = null;
  #mouseTimer = null;
  #activeGroup = null;
  #iconsPrefName = "mod.zen-groups.icon.emoji";
  menuPopup = window.MozXULElement.parseXULToFragment(`
    <menupopup id="tab-group-button-popup">
    <menuitem id="zenGroupsRenameGroup" label="Rename" tooltiptext="Rename Group" command="cmd_zenGroupsRenameGroup"/>
      <menuitem id="zenGroupsChangeIcon" label="Change Icon" tooltiptext="Change Icon" command="cmd_zenGroupsChangeIcon"/>
      <menuitem id="zenGroupsUngroupGroup" label="Ungroup" tooltiptext="Ungroup Group" command="cmd_zenGroupsUngroupGroup"/>
      <menuitem id="zenGroupsDeleteGroup" label="Delete" tooltiptext="Delete Group" command="cmd_zenGroupsDeleteGroup"/>
    </menupopup>
  `);
  folderSVG = new DOMParser().parseFromString(
    `
    <svg width="40px" height="40px" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" viewBox="-67.409 -14.145 29.279 28.92">
      <defs>
        <linearGradient gradientUnits="userSpaceOnUse" x1="-53.05" y1="-3.8" x2="-53.05" y2="8.998" id="gradient-1">
          <stop offset="0" style="stop-color: rgb(255, 255, 255);"/>
          <stop offset="1" style="stop-color: rgb(0% 0% 0%)"/>
        </linearGradient>
        <linearGradient gradientUnits="userSpaceOnUse" x1="-40.286" y1="-3.091" x2="-40.286" y2="13.31" id="gradient-0" gradientTransform="matrix(1, 0, 0, 1, -12.717999, -4.409)">
          <stop offset="0" style="stop-color: rgb(255, 255, 255);"/>
          <stop offset="1" style="stop-color: rgb(0% 0% 0%)"/>
        </linearGradient>
      </defs>
    <!--Back Folder (path)-->
      <path d="M -61.3 -5.25 C -61.3 -6.492 -60.293 -7.5 -59.05 -7.5 L -55.102 -7.5 C -54.591 -7.5 -54.096 -7.326 -53.697 -7.007 L -52.84 -6.321 C -52.175 -5.79 -51.349 -5.5 -50.498 -5.5 L -47.05 -5.5 C -45.807 -5.5 -44.8 -4.492 -44.8 -3.25 L -44.731 4.42 L -44.708 6.651 C -44.708 7.894 -45.715 8.901 -46.958 8.901 L -58.958 8.901 C -60.201 8.901 -61.208 7.894 -61.208 6.651 L -61.3 4.752 L -61.3 -5.25 Z" style="stroke-width: 0.5px; transform-box: fill-box; transform-origin: 50% 50%; fill: var(--zen-workspace-color-bg); stroke: var(--zen-workspace-color-stroke);">
        <animateTransform begin="0s" type="skewX" additive="sum" attributeName="transform" values="0;17" dur="0.3s" fill="freeze" keyTimes="0; 1" calcMode="spline" keySplines="0.42 0 0.58 1"/>
        <animateTransform begin="0s" type="translate" additive="sum" attributeName="transform" values="0 0;-1 -1.2" dur="0.3s" fill="freeze" keyTimes="0; 1" calcMode="spline" keySplines="0.42 0 0.58 1"/>
        <animateTransform begin="0s" type="scale" additive="sum" attributeName="transform" values="1 1;0.95 0.95" dur="0.3s" fill="freeze" keyTimes="0; 1" calcMode="spline" keySplines="0.42 0 0.58 1"/>
      </path>
      <path d="M -61.3 -5.25 C -61.3 -6.492 -60.293 -7.5 -59.05 -7.5 L -55.102 -7.5 C -54.591 -7.5 -54.096 -7.326 -53.697 -7.007 L -52.84 -6.321 C -52.175 -5.79 -51.349 -5.5 -50.498 -5.5 L -47.05 -5.5 C -45.807 -5.5 -44.8 -4.492 -44.8 -3.25 L -44.731 4.42 L -44.708 6.651 C -44.708 7.894 -45.715 8.901 -46.958 8.901 L -58.958 8.901 C -60.201 8.901 -61.208 7.894 -61.208 6.651 L -61.3 4.752 L -61.3 -5.25 Z" style="stroke-width: 0.5px; fill-opacity: 0.15; fill: url(&quot;#gradient-0&quot;); transform-origin: -53.004px 0.701px;">
        <animateTransform begin="0s" type="skewX" additive="sum" attributeName="transform" values="0;17" dur="0.3s" fill="freeze" keyTimes="0; 1" calcMode="spline" keySplines="0.42 0 0.58 1"/>
        <animateTransform begin="0s" type="translate" additive="sum" attributeName="transform" values="0 0;-1 -1.2" dur="0.3s" fill="freeze" keyTimes="0; 1" calcMode="spline" keySplines="0.42 0 0.58 1"/>
        <animateTransform begin="0s" type="scale" additive="sum" attributeName="transform" values="1 1;0.95 0.95" dur="0.3s" fill="freeze" keyTimes="0; 1" calcMode="spline" keySplines="0.42 0 0.58 1"/>
      </path>
    <!--Front Folder (rect)-->
      <rect x="-61.301" y="-3.768" width="16.5" height="12.798" rx="2.25" style="stroke-width: 0.5px; transform-box: fill-box; transform-origin: 50% 50%; fill: var(--zen-workspace-color-fg); stroke: var(--zen-workspace-color-stroke);" id="object-0">
        <animateTransform begin="0s" type="skewX" additive="sum" attributeName="transform" values="0;-17" dur="0.3s" fill="freeze" keyTimes="0; 1" calcMode="spline" keySplines="0.42 0 0.58 1"/>
        <animateTransform begin="0s" type="translate" additive="sum" attributeName="transform" values="0 0;3 -0.5" dur="0.3s" fill="freeze" keyTimes="0; 1" calcMode="spline" keySplines="0.42 0 0.58 1"/>
        <animateTransform begin="0s" type="scale" additive="sum" attributeName="transform" values="1 1;0.9 0.9" dur="0.3s" fill="freeze" keyTimes="0; 1" calcMode="spline" keySplines="0.42 0 0.58 1"/>
      </rect>
    <!--Emoji (text)-->
      <text x="-53.051" y="2.631" fill="black" font-size="8" text-anchor="middle" dominant-baseline="middle">
        <animateTransform begin="0s" type="skewX" additive="sum" attributeName="transform" values="0;-17" dur="0.3s" fill="freeze" keyTimes="0; 1" calcMode="spline" keySplines="0.42 0 0.58 1"/>
        <animateTransform begin="0s" type="translate" additive="sum" attributeName="transform" values="0 0;-1 0" dur="0.3s" fill="freeze" keyTimes="0; 1" calcMode="spline" keySplines="0.42 0 0.58 1"/>
        <animateTransform begin="0s" type="scale" additive="sum" attributeName="transform" values="1 1;0.9 0.9" dur="0.3s" fill="freeze" keyTimes="0; 1" calcMode="spline" keySplines="0.42 0 0.58 1"/>
        </text>
      <rect x="-61.3" y="-3.8" width="16.5" height="12.798" style="stroke-width: 0.5px; fill-opacity: 0.15; transform-origin: -53.05px 2.599px; fill: url(&quot;#gradient-1&quot;);" id="rect-1" rx="2.25">
        <animateTransform begin="0s" type="skewX" additive="sum" attributeName="transform" values="0;-17" dur="0.3s" fill="freeze" keyTimes="0; 1" calcMode="spline" keySplines="0.42 0 0.58 1"/>
        <animateTransform begin="0s" type="translate" additive="sum" attributeName="transform" values="0 0;3 -0.5" dur="0.3s" fill="freeze" keyTimes="0; 1" calcMode="spline" keySplines="0.42 0 0.58 1"/>
        <animateTransform begin="0s" type="scale" additive="sum" attributeName="transform" values="1 1;0.9 0.9" dur="0.3s" fill="freeze" keyTimes="0; 1" calcMode="spline" keySplines="0.42 0 0.58 1"/>
      </rect>
    </svg>
    `,
    "image/svg+xml",
  ).documentElement;
  init() {
    if (this.#initialized) return;
    this.#initialized = true;
    this.handlers = new WeakMap();
    this.#initHandlers();

    const groups = this._groups();
    console.log("Setting up initial groups:", groups.length);
    for (const group of groups) {
      this.#setupGroup(group);
    }
  }

  #initHandlers() {
    // Add the new attribute change observer
    window.addEventListener(
      "TabAttrModified",
      this.#onTabGroupAttributeChanged.bind(this)
    );

    window.addEventListener(
      "TabGroupCreate",
      this.#onTabGroupCreate.bind(this),
    );
    window.addEventListener("TabUngrouped", this.#onTabUngrouped.bind(this));
    window.addEventListener(
      "TabGroupRemoved",
      this.#onTabGroupRemoved.bind(this),
    );
    window.addEventListener("TabGrouped", this.#onTabGrouped.bind(this));
    window.addEventListener(
      "TabGroupExpand",
      this.#onTabGroupExpand.bind(this),
    );
    window.addEventListener(
      "TabGroupCollapse",
      this.#onTabGroupCollapse.bind(this),
    );

    gBrowser.tabContainer.addEventListener(
      "TabSelect",
      this.#handleGlobalTabSelect.bind(this),
    );
  }

  // Add new method to handle attribute changes
  #onTabGroupAttributeChanged(event) {
    const group = event.target;
    if (!group.tagName || group.tagName !== "tabgroup") return;

    const attrName = event.detail.changed[0];
    console.log("Attribute changed:", {
      group: group.id,
      attribute: attrName,
      hasHeader: group.hasAttribute("header"),
      hasSplitView: group.hasAttribute("split-view-group")
    });

    // Handle both header and split-view-group attributes
    if (attrName === "header" || attrName === "split-view-group") {
      if (group.hasAttribute("header") || group.hasAttribute("split-view-group")) {
        console.log("Removing customizations for filtered group:", group.id);
        this._resetGroupState(group);
        this.#removeGroupIcon(group);
        const handlers = this.handlers.get(group);
        if (handlers) {
          group.removeEventListener("mouseenter", handlers.handleMouseEnter);
          group.removeEventListener("mouseleave", handlers.handleMouseLeave);
          const labelContainer = group.querySelector(".tab-group-label-container");
          if (labelContainer) {
            labelContainer.removeEventListener("click", handlers.handleClick);
          }
          this.handlers.delete(group);
        }
      } else {
        console.log("Re-applying customizations for unfiltered group:", group.id);
        this.#setupGroup(group);
      }
    }
  }

  _groups() {
    const groups = gBrowser.getAllTabGroups();
    console.log("All groups:", groups.length);
    
    const filteredGroups = groups.filter(group => {
      const hasHeader = group.hasAttribute("header");
      const hasSplitView = group.hasAttribute("split-view-group");
      console.log(`Group ${group.id}:`, {
        hasHeader,
        hasSplitView
      });
      return !hasSplitView && !hasHeader;
    });
    
    console.log("Filtered groups:", filteredGroups.length);
    return filteredGroups;
  }

  _resetTabsStyle(group) {
    for (const tab of group.tabs) {
      tab.style.removeProperty("display");
      tab.style.removeProperty("transform");
    }
  }

  _hideTab(tab) {
    tab.style.setProperty("display", "none", "important");
  }

  _hasSelectedTabs(group) {
    return group.tabs.some((tab) => 
      tab.matches("[selected], [visuallyselected], [multiselected]")
    );
  }
  _updateTabVisibility(group) {
    const isHoverOpened = group.hasAttribute("has-focus");

    this._resetTabsStyle(group);

    for (const tab of group.tabs) {
      let shouldBeHidden = false;
      tab.style.setProperty("display", "flex", "important");

      if (isHoverOpened) {
        shouldBeHidden = !tab.matches("[selected], [visuallyselected], [multiselected]");
      }

      if (shouldBeHidden) {
        this._hideTab(tab);
      }
    }
  }

  _resetGroupState(group) {
    const wasCollapsed = group.hasAttribute("was-collapsed");

    group.removeAttribute("was-collapsed");
    group.removeAttribute("has-focus");

    if (wasCollapsed) {
      group.collapsed = true;
    }

    if (group.collapsed) {
      this._resetTabsStyle(group);
    } else {
      this._updateTabVisibility(group);
    }
  }

  _renameGroup() {
    const label = this.#activeGroup.querySelector(".tab-group-label");
    const originalText = label.textContent;

    const input = document.createElement("input");
    input.id = "tab-group-rename-input";
    input.value = originalText;
    const labelEditing = (saveChanges) => {
      if (saveChanges) {
        const newValue = input.value.trim();
        if (newValue.length > 0 && newValue !== originalText) {
          this.#activeGroup.label = newValue;
        } else {
          label.textContent = originalText;
        }
      } else {
        label.textContent = originalText;
      }
      input.remove();
    };

    input.addEventListener("keydown", (event) => {
      switch (event.key) {
        case "Enter":
          labelEditing(true);
          break;
        case "Escape":
          labelEditing(false);
          break;
      }
    });

    input.addEventListener("blur", () => {
      labelEditing(false);
    });

    label.textContent = "";
    label.appendChild(input);

    input.focus();
    input.select();
  }

  #setupGroup(group) {
    console.log("Attempting to setup group:", group.id);
    
    if (this.handlers.has(group)) {
      console.log("Group already has handlers:", group.id);
      return;
    }

    if (group.hasAttribute("header")) {
      console.log("Group has header attribute - skipping setup:", group.id);
      // Still set up observer even if we don't apply customizations initially
      this.#setupGroupObserver(group);
      return;
    }

    this.#setupGroupObserver(group);
    this.#applyGroupCustomizations(group);
  }

  #setupGroupObserver(group) {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "attributes" && 
            (mutation.attributeName === "header" || 
             mutation.attributeName === "split-view-group")) {
          console.log(`Group ${group.id} attribute changed:`, {
            attributeName: mutation.attributeName,
            hasHeader: group.hasAttribute("header"),
            hasSplitView: group.hasAttribute("split-view-group")
          });

          if (group.hasAttribute("header") || group.hasAttribute("split-view-group")) {
            console.log("Removing customizations due to attribute addition");
            this._resetGroupState(group);
            this.#removeGroupIcon(group);
            this.#removeGroupHandlers(group);
          } else {
            console.log("Re-applying customizations due to attribute removal");
            this.#applyGroupCustomizations(group);
          }
        }
      });
    });

    // Start observing the group for attribute changes
    observer.observe(group, {
      attributes: true,
      attributeFilter: ["header", "split-view-group"]
    });
  }

  #applyGroupCustomizations(group) {
    console.log("Applying customizations to group:", group.id);
    this.#createFolderIcon(group);
    this.#createGroupButton(group);

    const groupHandlers = {
      handleMouseEnter: this.#handleMouseEnter.bind(this),
      handleMouseLeave: this.#handleMouseLeave.bind(this),
      handleClick: this.#handleClick.bind(this),
    };
    this.handlers.set(group, groupHandlers);

    group.addEventListener("mouseenter", groupHandlers.handleMouseEnter);
    group.addEventListener("mouseleave", groupHandlers.handleMouseLeave);

    const labelContainer = group.querySelector(".tab-group-label-container");
    if (labelContainer) {
      labelContainer.addEventListener("click", groupHandlers.handleClick);
    }
  }

  #removeGroupHandlers(group) {
    const handlers = this.handlers.get(group);
    if (handlers) {
      group.removeEventListener("mouseenter", handlers.handleMouseEnter);
      group.removeEventListener("mouseleave", handlers.handleMouseLeave);
      const labelContainer = group.querySelector(".tab-group-label-container");
      if (labelContainer) {
        labelContainer.removeEventListener("click", handlers.handleClick);
      }
      this.handlers.delete(group);
    }
  }

  #onTabGroupCreate(event) {
    const group = event.target;
    console.log("New group created:", {
      id: group.id,
      hasHeader: group.hasAttribute("header"),
      hasSplitView: group.hasAttribute("split-view-group")
    });

    // Check if group should be filtered out
    if (group.hasAttribute("header") || group.hasAttribute("split-view-group")) {
      console.log("Skipping setup for filtered group:", group.id);
      return;
    }

    this.#setupGroup(group);
  }

  #onTabUngrouped(event) {
    const tab = event.target;
    tab.style.removeProperty("display");
  }

  #onTabGrouped(event) {
    // TODO: WRITE ME PLZ
  }

  #onTabGroupRemoved(event) {
    const group = event.target;
    this._resetGroupState(group);
    this.#removeGroupIcon(group);
  }
  async #onTabGroupExpand(event) {
    const group = event.target;
    const animations = [];

    animations.push(...this.#handleGroupAnimation(group, this.#animationState));

    await Promise.all(animations);
    this.#animationState = null;
  }
  async #onTabGroupCollapse(event) {
    const group = event.target;
    const animations = [];
    animations.push(...this.#handleGroupAnimation(group, this.#animationState));

    await Promise.all(animations);
    this.#animationState = null;
  }

  #handleMouseEnter(event) {
    const group = event.target;

    if (group.collapsed && this._hasSelectedTabs(group)) {
      this.#mouseTimer = setTimeout(() => {
        group.setAttribute("has-focus", "");
        group.setAttribute("was-collapsed", "");
        this._updateTabVisibility(group);
        group.collapsed = false;
      }, 300);
    }
  }

  #handleMouseLeave(event) {
    const group = event.target;

    clearTimeout(this.#mouseTimer);
    if (this._hasSelectedTabs(group)) {
      this._updateTabVisibility(group);
    } else {
      this._resetGroupState(group);
    }
  }

  #handleClick(event) {
    if (event.button !== 0) return;
    const group = event.currentTarget.parentElement;
    event.stopImmediatePropagation();
    event.preventDefault();

    if (this._hasSelectedTabs(group)) {
      group.toggleAttribute("has-focus");
      group.toggleAttribute("was-collapsed");
      this._updateTabVisibility(group);
      if (
        !group.hasAttribute("was-collapsed") &&
        !group.hasAttribute("has-focus")
      ) {
        this.#animationState = "open";
      } else {
        this.#animationState = "close";
      }
      group.collapsed = false;
      return;
    }

    this._resetGroupState(group);
  }

  #handleGlobalTabSelect(event) {
    const selectedTab = event.target;

    for (const group of this._groups()) {
      if (!group.tabs.includes(selectedTab)) {
        this._resetGroupState(group);
      }
    }
  }

  #createFolderIcon(group) {
    const labelContainer = group.querySelector(".tab-group-label-container");
    if (labelContainer.querySelector(".tab-group-icon")) return;

    const iconContainer = document.createElement("div");
    iconContainer.classList.add("tab-group-icon");
    const svgElem = this.folderSVG.cloneNode(true);
    iconContainer.appendChild(svgElem);
    labelContainer.insertBefore(iconContainer, labelContainer.firstChild);

    svgElem
      .querySelectorAll("animate, animateTransform, animateMotion")
      .forEach((anim) => {
        const vals = anim.getAttribute("values");
        if (vals) {
          anim.dataset.origValues = vals;
        }
      });

    const savedIcon = this.#loadGroupIcon(group);
    if (savedIcon) {
      this.#setGroupIconText(group, savedIcon);
    }

    iconContainer.addEventListener("dblclick", (event) => {
      event.stopImmediatePropagation();
      event.preventDefault();
      this.#handleChangeGroupIcon(event, group);
    });

    this.#handleGroupAnimation(group, this.#animationState, false);
  }

  #createGroupButton(group) {
    const labelContainer = group.querySelector(".tab-group-label-container");
    if (labelContainer.querySelector(".tab-group-button")) {
      return;
    }

    const button = document.createXULElement("toolbarbutton");
    button.classList.add("toolbarbutton-1", "tab-group-button");
    button.setAttribute("tooltiptext", "Group button");

    button.addEventListener("click", this.activeGroupPopup.bind(this));

    labelContainer.appendChild(button);

    this.#createGroupButtonPopup(group);
  }

  activeGroupPopup(event) {
    event.stopPropagation();
    this.#activeGroup = event.currentTarget.parentElement.parentElement;
    const popup = document.getElementById("tab-group-button-popup");
    const target = event.target;
    target.setAttribute("open", "true");
    const handlePopupHidden = (event) => {
      if (event.target !== popup) return;
      target.removeAttribute("open");
      popup.removeEventListener("popuphidden", handlePopupHidden);
    };
    popup.addEventListener("popuphidden", handlePopupHidden);
    popup.openPopup(event.target, "after_start");
  }

  #createGroupButtonPopup() {
    if (document.getElementById("tab-group-button-popup")) return;

    const popup = this.menuPopup.cloneNode(true);

    document.querySelector("#mainPopupSet").appendChild(popup);

    const commandButtons = {
      zenGroupsChangeIcon: document.querySelector("#zenGroupsChangeIcon"),
      zenGroupsRenameGroup: document.querySelector("#zenGroupsRenameGroup"),
      zenGroupsUngroupGroup: document.querySelector("#zenGroupsUngroupGroup"),
      zenGroupsDeleteGroup: document.querySelector("#zenGroupsDeleteGroup"),
    };
    commandButtons.zenGroupsChangeIcon.addEventListener("click", (event) => {
      this.#handleChangeGroupIcon(event, this.#activeGroup);
    });
    commandButtons.zenGroupsRenameGroup.addEventListener(
      "click",
      this._renameGroup.bind(this),
    );
    commandButtons.zenGroupsUngroupGroup.addEventListener("click", (event) => {
      this.#activeGroup.ungroupTabs({
        isUserTriggered: true,
      });
    });
    commandButtons.zenGroupsDeleteGroup.addEventListener("click", (event) => {
      gBrowser.removeTabGroup(this.#activeGroup);
    });
  }

  #setGroupIconText(group, text) {
    const svgText = group.querySelector(".tab-group-icon svg text");
    if (!svgText) return;

    let textNode = null;
    for (const node of svgText.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        textNode = node;
        break;
      }
    }

    if (textNode) {
      textNode.nodeValue = text;
    } else {
      const newTextNode = document.createTextNode(text);
      svgText.insertBefore(newTextNode, svgText.firstChild);
    }
  }

  #handleChangeGroupIcon(event, group) {
    if (!group) {
      return;
    }

    gZenEmojiPicker
      .open(group)
      .then(async (emoji) => {
        this.#setGroupIconText(group, emoji);
        await this.#saveGroupIcon(group, emoji); // Write real method to save group icon
      })
      .catch((error) => {
        return;
      });
  }

  #handleGroupAnimation(group, state, playAnimation = true) {
    const svgElement = group.querySelector("svg");
    if (!svgElement) return [];

    const isCollapsed = group.collapsed;

    svgElement.unpauseAnimations();

    if (!playAnimation) {
      svgElement.pauseAnimations();

      switch (state) {
        case "open":
          svgElement.setCurrentTime(0.3);
          break;
        case "close":
          svgElement.setCurrentTime(0);
          break;
        default:
          svgElement.setCurrentTime(isCollapsed ? 0 : 0.3);
          break;
      }
      return [];
    }

    const animations = svgElement.querySelectorAll(
      "animate, animateTransform, animateMotion",
    );

    animations.forEach((anim) => {
      const origValues = anim.dataset.origValues;
      const [fromVal, toVal] = origValues.split(";");

      let newValues;

      switch (state) {
        case "open":
          newValues = `${fromVal};${toVal}`;
          break;
        case "close":
          newValues = `${toVal};${fromVal}`;
          break;
        default:
          newValues = isCollapsed
            ? `${toVal};${fromVal}`
            : `${fromVal};${toVal}`;
          break;
      }

      anim.setAttribute("values", newValues);
      anim.beginElement();
    });
    return [];
  }

  // FIX: This is a hack to save group icons to prefs
  #getAllIconsObject() {
    try {
      const jsonString = Services.prefs.getStringPref(this.#iconsPrefName);
      return jsonString ? JSON.parse(jsonString) : {};
    } catch (e) {
      return {};
    }
  }

  async #saveGroupIcon(group, emoji) {
    try {
      const allIcons = this.#getAllIconsObject();
      allIcons[group.id] = emoji;
      const newJsonString = JSON.stringify(allIcons);
      Services.prefs.setStringPref(this.#iconsPrefName, newJsonString);
    } catch (e) {
      console.error("Failed to save group icons JSON:", e);
    }
  }

  #removeGroupIcon(group) {
    console.log("Removing group icon for:", group.id);
    const iconContainer = group.querySelector(".tab-group-icon");
    if (iconContainer) {
      iconContainer.remove();
    }
    
    // Also remove button if it exists
    const button = group.querySelector(".tab-group-button");
    if (button) {
      button.remove();
    }

    try {
      const allIcons = this.#getAllIconsObject();
      delete allIcons[group.id];
      const newJsonString = JSON.stringify(allIcons);
      Services.prefs.setStringPref(this.#iconsPrefName, newJsonString);
    } catch (e) {
      console.error("Failed to remove group icon from prefs:", e);
    }
  }

  #loadGroupIcon(group) {
    const allIcons = this.#getAllIconsObject();
    return allIcons[group.id] || "";
  }
}

(function () {
  if (!globalThis.zenGroupsInstance) {
    window.addEventListener(
      "load",
      () => {
        globalThis.zenGroupsInstance = new ZenGroups();
        globalThis.zenGroupsInstance.init();
      },
      { once: true },
    );
  }
})();