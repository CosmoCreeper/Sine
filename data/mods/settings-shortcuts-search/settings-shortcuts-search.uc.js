// ==UserScript==
// @include   about:preferences*
// @include   about:settings*
// @ignorecache
// ==/UserScript==

function addSettingKeymapSearch() {
  const groupbox = document.getElementById("zenCKSGroup");

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

  // Insert before first hbox (e.g., Reset button)
  const firstHBox = groupbox.querySelector("hbox");
  groupbox.insertBefore(searchContainer, firstHBox);

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
}

setTimeout(addSettingKeymapSearch, 1000);
