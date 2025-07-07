// ==UserScript==
// @include   about:preferences*
// @include   about:settings*
// @ignorecache
// ==/UserScript==

function _setupKeymapSearchUI(groupbox) {
  if (groupbox.querySelector(".zen-keyboard-controls")) return;

  // Create search input container
  const searchContainer = document.createElement("div");
  searchContainer.className = "zen-keyboard-controls";

  const searchInput = document.createElement("input");
  searchInput.placeholder = "Search shortcuts...";
  searchInput.className = "zen-keyboard-search";

  const filterButton = document.createElement("button");
  filterButton.textContent = "Filter";
  filterButton.className = "zen-keyboard-filter-button";

  searchContainer.appendChild(searchInput);
  searchContainer.appendChild(filterButton);

  const firstHBox = groupbox.querySelector("hbox");
  if (firstHBox) groupbox.insertBefore(searchContainer, firstHBox);
  else groupbox.appendChild(searchContainer);

  // Create filter popover
  const filterPopover = document.createElement("div");
  filterPopover.className = "zen-keyboard-filter-popover";
  filterPopover.style.display = "none";
  document.body.appendChild(filterPopover);

  const groupCheckboxes = {};

  const groupHeadings = groupbox.querySelectorAll("h2[data-group]");
  groupHeadings.forEach((h2) => {
    const groupId = h2.getAttribute("data-group");
    const label = h2.textContent.trim();

    if (label) {
      const wrapper = document.createElement("label");
      wrapper.className = "zen-keyboard-filter-checkbox";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = true;
      checkbox.dataset.group = groupId;

      groupCheckboxes[groupId] = checkbox;

      wrapper.appendChild(checkbox);
      wrapper.appendChild(document.createTextNode(label));
      filterPopover.appendChild(wrapper);
    }
  });

  filterButton.addEventListener("click", () => {
    const rect = filterButton.getBoundingClientRect();
    filterPopover.style.top = `${rect.bottom + window.scrollY}px`;
    filterPopover.style.left = `${rect.left + window.scrollX}px`;
    filterPopover.style.display =
      filterPopover.style.display === "none" ? "flex" : "none";
  });

  document.addEventListener("click", (e) => {
    if (!filterPopover.contains(e.target) && e.target !== filterButton) {
      filterPopover.style.display = "none";
    }
  });

  function applyFilters() {
    const searchValue = searchInput.value.toLowerCase();
    const visibleGroups = new Set();

    for (const groupId in groupCheckboxes) {
      if (groupCheckboxes[groupId].checked) {
        visibleGroups.add(groupId.replace("zenCKSOption-group-", ""));
      }
    }

    const allOptions = groupbox.querySelectorAll("hbox.zenCKSOption");
    allOptions.forEach((option) => {
      const input = option.querySelector(".zenCKSOption-input");
      const label = option.querySelector(".zenCKSOption-label");
      const shortcutName = label?.textContent?.toLowerCase() || "";
      const group = input?.getAttribute("data-group");

      const matchesSearch = shortcutName.includes(searchValue);
      const matchesGroup = visibleGroups.has(group);

      option.style.display = matchesSearch && matchesGroup ? "" : "none";
    });

    groupHeadings.forEach((h2) => {
      const groupId = h2
        .getAttribute("data-group")
        .replace("zenCKSOption-group-", "");
      const anyVisible = [
        ...groupbox.querySelectorAll(
          `.zenCKSOption-input[data-group="${groupId}"]`,
        ),
      ].some(
        (input) => input.closest("hbox.zenCKSOption").style.display !== "none",
      );

      h2.style.display = anyVisible ? "" : "none";
    });
  }

  searchInput.addEventListener("input", applyFilters);
  Object.values(groupCheckboxes).forEach((cb) => {
    cb.addEventListener("change", applyFilters);
  });

  applyFilters();
}

function addSettingKeymapSearch() {
  const groupbox = document.getElementById("zenCKSGroup");
  if (!groupbox) return; // If groupbox is not found, cannot proceed.

  if (groupbox.querySelector(".zen-keyboard-controls")) {
    return;
  }

  const checkAndSetup = () => {
    const groupHeadings = groupbox.querySelectorAll("h2[data-group]");
    const options = groupbox.querySelectorAll("hbox.zenCKSOption");

    // Check if there are headings AND if at least one heading has text content
    const hasValidHeadings = Array.from(groupHeadings).some(
      (h2) => h2.textContent.trim().length > 0,
    );

    if (hasValidHeadings && options.length > 0) {
      _setupKeymapSearchUI(groupbox);
      return true;
    }
    return false;
  };

  if (checkAndSetup()) {
    return;
  }

  const contentReadyObserver = new MutationObserver((_, observer) => {
    if (checkAndSetup()) {
      observer.disconnect();
    }
  });

  // Observe the groupbox itself for child additions (including descendants).
  contentReadyObserver.observe(groupbox, { childList: true, subtree: true });
}

addSettingKeymapSearch();

const observer = new MutationObserver((mutations) => {
  let groupboxAppeared = false;
  for (const mutation of mutations) {
    if (mutation.type === "childList") {
      // Check if zenCKSGroup itself was added
      if (
        Array.from(mutation.addedNodes).some(
          (node) =>
            node.nodeType === Node.ELEMENT_NODE && node.id === "zenCKSGroup",
        )
      ) {
        groupboxAppeared = true;
        break;
      }
      // Check if an added node *contains* zenCKSGroup (e.g., a new panel div was added)
      if (
        Array.from(mutation.addedNodes).some(
          (node) =>
            node.nodeType === Node.ELEMENT_NODE &&
            node.querySelector &&
            node.querySelector("#zenCKSGroup"),
        )
      ) {
        groupboxAppeared = true;
        break;
      }
    }
  }

  if (groupboxAppeared) {
    addSettingKeymapSearch();
  }
});

observer.observe(document.body, { childList: true, subtree: true });
