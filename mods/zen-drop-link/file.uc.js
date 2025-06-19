class ZenSplitViewLinkDrop {
  #zenViewSplitter = gZenViewSplitter;
  _linkDropZone = null;
  _lastSplitSide = 'right';
  init() {
    const tabBox = document.getElementById('tabbrowser-tabbox');

    tabBox.addEventListener('dragenter', this._handleLinkDragEnter.bind(this));
    tabBox.addEventListener('dragleave', this._handleLinkDragLeave.bind(this));
    tabBox.addEventListener('drop', this._handleLinkDragDrop.bind(this));
    tabBox.addEventListener('dragend', this._handleLinkDragEnd.bind(this));
  }

  _createLinkDropZone() {
    this._linkDropZone = document.createXULElement('box');
    this._linkDropZone.id = 'zen-drop-link-zone';

    const content = document.createXULElement('vbox');
    content.setAttribute('align', 'center');
    content.setAttribute('pack', 'center');
    content.setAttribute('flex', '1');

    const text = document.createXULElement('description');
    text.setAttribute('value', 'Drop link to split');

    content.appendChild(text);
    this._linkDropZone.appendChild(content);

    this._linkDropZone.addEventListener('dragover', this._handleDragOver.bind(this));
    this._linkDropZone.addEventListener('dragleave', this._handleDragLeave.bind(this));
    this._linkDropZone.addEventListener('drop', this._handleDropForSplit.bind(this));

    const tabBox = document.getElementById('tabbrowser-tabbox');
    tabBox.appendChild(this._linkDropZone);

    gZenUIManager.motion.animate(this._linkDropZone, {
      opacity: [0, 1],
      x: ['-50%', '-50%'],
      y: ['-40%', '-50%'],
      scale: [0.1, 1],
      duration: 0.15,
      ease: [0.16, 1, 0.3, 1],
    });
  }
  _handleDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'link';
    const side = this._calculateDropSide(event, this._linkDropZone);
    this._linkDropZone.setAttribute('drop-side', side);

    if (!this._linkDropZone.hasAttribute('has-focus')) {
      this._linkDropZone.setAttribute('has-focus', 'true');
    }
  }

  _handleDragLeave(event) {
    event.stopPropagation();
    if (!this._linkDropZone.contains(event.relatedTarget)) {
      this._linkDropZone.removeAttribute('drop-side');
      this._linkDropZone.removeAttribute('has-focus');
    }
  }
  _removeLinkDropZone() {
    if (!this._linkDropZone) return;

    gZenUIManager.motion
      .animate(this._linkDropZone, {
        opacity: [1, 0],
        x: ['-50%', '-50%'],
        y: ['-40%', '-50%'],
        scale: [1, 0.1],
        duration: 0.15,
        ease: [0.16, 1, 0.3, 1],
      })
      .then(() => {
        this._linkDropZone.remove();
        this._linkDropZone = null;
      });
  }

  _validateURI(dataTransfer) {
    let dt = dataTransfer;

    const URL_TYPES = ['text/uri-list', 'text/x-moz-url', 'text/plain'];

    let fixupFlags =
      Ci.nsIURIFixup.FIXUP_FLAG_FIX_SCHEME_TYPOS | Ci.nsIURIFixup.FIXUP_FLAG_ALLOW_KEYWORD_LOOKUP;

    const matchedType = URL_TYPES.find((type) => {
      const raw = dt.getData(type);
      return typeof raw === 'string' && raw.trim().length > 0;
    });

    const uriString = dt.getData(matchedType).trim();

    if (!uriString) {
      return null;
    }

    const info = Services.uriFixup.getFixupURIInfo(uriString, fixupFlags);

    if (!info || !info.fixedURI) {
      return null;
    }

    return info.fixedURI.spec;
  }

  _handleLinkDragEnter(event) {
    event.preventDefault();
    event.stopPropagation();

    // If rearrangeViewEnabled - don't do anything
    if (this.#zenViewSplitter.rearrangeViewEnabled) {
      return;
    }

    const shouldBeDisabled = !this.#zenViewSplitter.canOpenLinkInSplitView();
    if (shouldBeDisabled) return;

    // If _linkDropZone is already created, we don't want to do anything
    if (this._linkDropZone) {
      return;
    }

    // If the data is not a valid URI, we don't want to do anything
    if (!this._validateURI(event.dataTransfer)) {
      return;
    }

    this._createLinkDropZone();
  }

  _handleLinkDragLeave(event) {
    if (
      event.target === document.documentElement ||
      (event.clientX <= 0 && event.clientY <= 0) ||
      event.clientX >= window.innerWidth ||
      event.clientY >= window.innerHeight
    ) {
      if (this._linkDropZone && !this._linkDropZone.contains(event.relatedTarget)) {
        this._removeLinkDropZone();
      }
    }
  }

  _handleLinkDragDrop(event) {
    if (!this._linkDropZone || !this._linkDropZone.contains(event.target)) {
      this._removeLinkDropZone();
    }
  }

  _handleLinkDragEnd(event) {
    this._removeLinkDropZone();
  }

  _handleDropForSplit(event) {
    let linkDropZone = this._linkDropZone;
    event.preventDefault();
    event.stopPropagation();

    const url = this._validateURI(event.dataTransfer);

    if (!url) {
      this._removeLinkDropZone();
      return;
    }

    const currentTab = gZenGlanceManager.getTabOrGlanceParent(gBrowser.selectedTab);
    const newTab = this.#zenViewSplitter.openAndSwitchToTab(url, { inBackground: false });

    if (!newTab) {
      this._removeLinkDropZone();
      return;
    }

    const linkDropSide = this._calculateDropSide(event, linkDropZone);

    this._dispatchSplitAction(currentTab, newTab, linkDropSide);

    this._removeLinkDropZone();
  }

  _calculateDropSide(event, linkDropZone) {
    const rect = linkDropZone.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const width = rect.width;
    const height = rect.height;

    // Defines the size of the "active" zone near the edges (30%)
    const EDGE_SIZE_RATIO = 0.3;
    const hEdge = width * EDGE_SIZE_RATIO;
    const vEdge = height * EDGE_SIZE_RATIO;

    const isInLeftEdge = x < hEdge;
    const isInRightEdge = x > width - hEdge;
    const isInTopEdge = y < vEdge;
    const isInBottomEdge = y > height - vEdge;

    if (isInTopEdge) {
      // If the cursor is in a top corner, determine which side it's proportionally "closer" to
      // This comparison decides if it's a side drop or a top drop
      if (isInLeftEdge && x / width < y / height) return 'left';
      if (isInRightEdge && (width - x) / width < y / height) return 'right';
      return 'top';
    }
    if (isInBottomEdge) {
      // Similar logic for the bottom corners
      if (isInLeftEdge && x / width < (height - y) / height) return 'left';
      if (isInRightEdge && (width - x) / width < (height - y) / height) return 'right';
      return 'bottom';
    }
    if (isInLeftEdge) {
      return 'left';
    }
    if (isInRightEdge) {
      return 'right';
    }

    // If the cursor is not in any edge zone, it's considered the center
    return 'center';
  }

  _dispatchSplitAction(currentTab, newTab, linkDropSide) {
    const groupIndex = this.#zenViewSplitter._data.findIndex((group) =>
      group.tabs.includes(currentTab)
    );

    if (groupIndex > -1) {
      this._addToExistingGroup(groupIndex, currentTab, newTab, linkDropSide);
    } else {
      this._createNewSplitGroup(currentTab, newTab, linkDropSide);
    }
  }

  _addToExistingGroup(groupIndex, currentTab, newTab, linkDropSide) {
    const group = this.#zenViewSplitter._data[groupIndex];
    const splitViewGroup = this.#zenViewSplitter._getSplitViewGroup(group.tabs);

    if (splitViewGroup && newTab.group !== splitViewGroup) {
      this.#zenViewSplitter._moveTabsToContainer([newTab], currentTab);
      gBrowser.moveTabToGroup(newTab, splitViewGroup);
    }

    if (!group.tabs.includes(newTab)) {
      group.tabs.push(newTab);

      const targetNode = this.#zenViewSplitter.getSplitNodeFromTab(currentTab);
      const parentNode = targetNode?.parent || group.layoutTree;
      const isValidSide = ['left', 'right', 'top', 'bottom'].includes(linkDropSide);

      if (targetNode && isValidSide) {
        this._lastSplitSide = linkDropSide;

        this.#zenViewSplitter.splitIntoNode(
          targetNode,
          new SplitLeafNode(newTab),
          linkDropSide,
          0.5
        );

        // Rebalance sizes
        const newSize = 100 / parentNode.children.length;
        parentNode.children.forEach((child) => {
          child.sizeInParent = newSize;
        });
      } else {
        // If linkDropSide is center, then open a new tab at the start/end
        const shouldPrepend = ['left', 'top'].includes(this._lastSplitSide);
        this.#zenViewSplitter.addTabToSplit(newTab, parentNode, shouldPrepend);
      }

      this.#zenViewSplitter.activateSplitView(group, true);
    }
  }

  _createNewSplitGroup(currentTab, newTab, linkDropSide) {
    const splitConfig = {
      left: { tabs: [newTab, currentTab], gridType: 'vsep', initialIndex: 0 },
      right: { tabs: [currentTab, newTab], gridType: 'vsep', initialIndex: 1 },
      top: { tabs: [newTab, currentTab], gridType: 'hsep', initialIndex: 0 },
      bottom: { tabs: [currentTab, newTab], gridType: 'hsep', initialIndex: 1 },
    };

    const defaultConfig = {
      tabs: [currentTab, newTab],
      gridType: 'vsep',
      initialIndex: 1,
    };

    const {
      tabs: tabsToSplit,
      gridType,
      initialIndex,
    } = splitConfig[linkDropSide] || defaultConfig;

    this._lastSplitSide = linkDropSide;
    this.#zenViewSplitter.splitTabs(tabsToSplit, gridType, initialIndex);
  }
}

(function () {
  if (!globalThis.zenDropLinkInstance) {
    window.addEventListener(
      "load",
      () => {
        globalThis.zenDropLinkInstance = new ZenSplitViewLinkDrop();
        globalThis.zenDropLinkInstance.init();
      },
      { once: true },
    );
  }
})();
