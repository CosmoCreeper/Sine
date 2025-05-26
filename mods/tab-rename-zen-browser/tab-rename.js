// Tab Rename ver 1.0.0 : Zen Browser
console.log("TabRenamer_v1.0.0: Starting up...");

(() => {
    // --- Protection against multiple executions ---
    if (window.TabRenamer) {
        console.warn("TabRenamer: Attempting to destroy previous instance before re-initializing.");
        try { window.TabRenamer.destroy(); } catch (e) { console.error("TabRenamer: Error destroying previous instance:", e); }
    }

    window.TabRenamer = {
        _tabEdited: null,      // The tab currently being edited
        _originalLabel: null,  // The original label of the tab being edited
        _boundCommandHandler: null, // Stores the bound event handler for the command
        _boundOnPopupShowing: null, // Stores the bound event handler for the context menu
        _boundHandleKeydown: null,  // Stores the bound event handler for input keydown
        _boundHandleBlur: null,     // Stores the bound event handler for input blur

        // --- Initialize ---
        init: function () {
            // console.log("TabRenamer: Initializing..."); // Optional: Keep for debugging startup flow
            try {
                this.createUIElements();
                this.addContextMenuListener();
                window.addEventListener('unload', this.destroy.bind(this), { once: true });
                // console.log("TabRenamer: Initialized successfully."); // Optional: Keep for debugging startup flow
            } catch (e) {
                console.error("TabRenamer: Error during initialization:", e);
                this.destroy(); // Attempt cleanup on initialization error
            }
        },

        // --- Destroy / Cleanup ---
        destroy: function () {
            // console.log("TabRenamer: Destroying..."); // Optional: Keep for debugging shutdown flow
             try {
                 const menuitem = document.getElementById('context_renameTab');
                 menuitem?.remove();

                 const command = document.getElementById('cmd_renameTab');
                 if (command && this._boundCommandHandler) {
                     command.removeEventListener('command', this._boundCommandHandler);
                 }
                 command?.remove();

                 const contextMenu = document.getElementById('tabContextMenu');
                 if (contextMenu && this._boundOnPopupShowing) {
                     contextMenu.removeEventListener('popupshowing', this._boundOnPopupShowing);
                 }

                 // Clean up input listeners if they exist (though haltRename should handle this)
                 const input = document.getElementById('tab-label-input');
                 if (input && this._boundHandleBlur) {
                     input.removeEventListener('blur', this._boundHandleBlur);
                 }
                 if (input && this._boundHandleKeydown) {
                    input.removeEventListener('keydown', this._boundHandleKeydown);
                 }

                 // Ensure any active rename UI is cleaned up
                 if (this._tabEdited) {
                     this.haltRename(false); // Pass false as it wasn't saved via destroy
                 }
             } catch (e) {
                 console.error("TabRenamer: Error during destroy:", e);
             } finally {
                // Clear references even if errors occurred during UI removal
                this._boundCommandHandler = null;
                this._boundOnPopupShowing = null;
                this._boundHandleKeydown = null;
                this._boundHandleBlur = null;
                this._tabEdited = null;
                this._originalLabel = null;
                delete window.TabRenamer;
                // console.log("TabRenamer: Instance destroyed."); // Optional: Keep for debugging shutdown flow
             }
        },

        // --- Create UI Elements ---
        createUIElements: function () {
            if (document.getElementById('context_renameTab') || document.getElementById('cmd_renameTab')) {
                console.warn("TabRenamer: Menu item or command element already exists. Skipping creation.");
                return;
            }

            const renameLabel = "Rename Tab...";
            const accessKey = "R";

            // 1. Create Command Element
            const command = document.createXULElement('command');
            command.id = 'cmd_renameTab';

            // Use stored bound handler reference
            this._boundCommandHandler = (event) => {
                 // console.log("TabRenamer: Rename command triggered."); // Optional debug
                 try {
                     if (typeof TabContextMenu !== 'undefined' && TabContextMenu.contextTab) {
                         this.startRename(TabContextMenu.contextTab);
                     } else {
                         console.warn(`TabRenamer: Rename command triggered, but TabContextMenu.contextTab not found.`);
                     }
                 } catch (e) {
                     console.error("TabRenamer: Error executing rename command handler:", e);
                 }
             };
            command.addEventListener('command', this._boundCommandHandler);

            const mainCommandSet = document.getElementById('mainCommandSet');
            if (!mainCommandSet) {
                console.error("TabRenamer: Required element 'mainCommandSet' not found! Cannot add command.");
                return; // Don't proceed if command can't be added
            }
            mainCommandSet.appendChild(command);

            // 2. Create Menu Item Element
            const menuitem = document.createXULElement('menuitem');
            menuitem.id = 'context_renameTab';
            menuitem.setAttribute('label', renameLabel);
            menuitem.setAttribute('accesskey', accessKey);
            menuitem.setAttribute('command', 'cmd_renameTab');
            menuitem.setAttribute('hidden', 'true'); // Hide by default

            const tabContextMenu = document.getElementById('tabContextMenu');
            if (!tabContextMenu) {
                console.error("TabRenamer: Required element 'tabContextMenu' not found! Cannot add menu item.");
                command.remove(); // Clean up command if menu item can't be added
                if (this._boundCommandHandler) {
                    command.removeEventListener('command', this._boundCommandHandler);
                    this._boundCommandHandler = null;
                }
                return;
            }

            // Insert before the close separator or close item for better placement
            const insertBeforeElement = tabContextMenu.querySelector('#context_closeTabSeparator') || tabContextMenu.querySelector('#context_closeTab');
            if (insertBeforeElement) {
                insertBeforeElement.parentNode.insertBefore(menuitem, insertBeforeElement);
            } else {
                // Fallback: append if specific separators aren't found
                tabContextMenu.appendChild(menuitem);
                console.warn("TabRenamer: Could not find preferred insertion point in tab context menu, appended item instead.");
            }
        },

        // --- Add Context Menu Listener ---
        addContextMenuListener: function () {
             const contextMenu = document.getElementById('tabContextMenu');
             if (contextMenu) {
                 // Ensure only one listener is added
                 if (this._boundOnPopupShowing) {
                     contextMenu.removeEventListener('popupshowing', this._boundOnPopupShowing);
                 }
                 this._boundOnPopupShowing = this.onPopupShowing.bind(this);
                 contextMenu.addEventListener('popupshowing', this._boundOnPopupShowing);
             } else {
                 console.error("TabRenamer: 'tabContextMenu' not found. Cannot add visibility listener.");
             }
        },

        // --- Handle Context Menu Popup ---
        onPopupShowing: function (event) {
             // Only react to the tab context menu itself
             if (event.target.id !== 'tabContextMenu') return;

             const renameItem = document.getElementById('context_renameTab');
             const contextTab = TabContextMenu?.contextTab; // Use optional chaining

             if (!renameItem) {
                 // console.warn("TabRenamer: Rename menu item not found during popupshowing."); // Optional debug
                 return; // Nothing to show/hide
             }
             if (!contextTab) {
                 // console.warn("TabRenamer: Context tab not found during popupshowing."); // Optional debug
                 renameItem.hidden = true; // Hide if no context tab
                 return;
             }

             // Determine if the item should be hidden
             let shouldHide = false;
             if (contextTab.hasAttribute('zen-essential')) { // Check for custom attribute indicating non-renameable
                 shouldHide = true;
             } else if (this._tabEdited && this._tabEdited !== contextTab) { // Hide if another tab is already being edited
                 shouldHide = true;
             } else {
                // Hide for internal pages or blank tabs
                const uriSpec = contextTab.linkedBrowser?.currentURI?.spec;
                if (!uriSpec || uriSpec.startsWith('about:') || uriSpec.startsWith('chrome:')) {
                    shouldHide = true;
                }
             }

             renameItem.hidden = shouldHide;
        },

        // --- Start Renaming Process ---
        startRename: function (tab) {
             if (!tab) {
                 console.warn("TabRenamer: Attempted to rename a null tab.");
                 return;
             }
             if (tab.querySelector('.tab-editor-container')) {
                 // console.warn("TabRenamer: Already renaming this tab."); // Optional debug
                 return; // Already in edit mode for this tab
             }
             if (this._tabEdited && this._tabEdited !== tab) {
                 console.warn(`TabRenamer: Cannot rename tab "${tab.label}". Already editing tab "${this._tabEdited.label}".`);
                 // Optionally: Provide user feedback (e.g., flash the already-editing tab)
                 return; // Another tab is being edited
             }
             // Prevent renaming essential/internal tabs (redundant check, also done in onPopupShowing)
             const uriSpec = tab.linkedBrowser?.currentURI?.spec;
             if (tab.hasAttribute('zen-essential') || !uriSpec || uriSpec.startsWith('about:') || uriSpec.startsWith('chrome:')) {
                 console.warn(`TabRenamer: Rename blocked for protected or internal tab: "${tab.label}".`);
                 return;
             }

             this._tabEdited = tab;
             this._originalLabel = tab.label;
             // console.log(`TabRenamer: Starting rename for tab "${this._originalLabel}"`); // Optional debug

             document.documentElement.setAttribute('zen-renaming-tab', 'true'); // Global state indicator

             const labelContainer = this._tabEdited.querySelector('.tab-label-container');
             if (!labelContainer) {
                 console.error("TabRenamer: Could not find '.tab-label-container' within the target tab. Aborting rename.");
                 this.haltRename(false);
                 return;
             }
             labelContainer.classList.add('tab-label-container-editing'); // Hide original label

             // Create editor elements
             const editorContainer = document.createXULElement('vbox');
             editorContainer.className = 'tab-label-container tab-editor-container'; // Reuse class for styling
             editorContainer.setAttribute('flex', '1');
             editorContainer.setAttribute('align', 'start');
             editorContainer.setAttribute('pack', 'center');

             const input = document.createElement('input'); // Use standard HTML input
             input.id = 'tab-label-input'; // Unique ID within the tab scope is usually fine
             input.setAttribute('type', 'text');
             input.value = this._tabEdited.label; // Pre-fill with current label
             input.style.width = '100%'; // Ensure it fills container

             // Store bound listeners for later removal
             this._boundHandleKeydown = this.handleKeydown.bind(this);
             this._boundHandleBlur = this.handleBlur.bind(this);

             input.addEventListener('keydown', this._boundHandleKeydown);
             input.addEventListener('blur', this._boundHandleBlur);

             editorContainer.appendChild(input);
             labelContainer.after(editorContainer); // Insert editor after the original label container

             input.focus();
             input.select();
             // console.log("TabRenamer: Rename input created and focused."); // Optional debug
        },

        // --- Handle Input Keystrokes ---
        handleKeydown: function (event) {
             // Ensure we are handling the keydown for the currently edited tab's input
             if (!this._tabEdited || event.target.id !== 'tab-label-input' || event.target.closest('.tabbrowser-tab') !== this._tabEdited) {
                 return;
             }

             if (event.key === 'Enter') {
                 event.preventDefault(); // Prevent potential form submission or other default actions
                 this.saveRename();
             } else if (event.key === 'Escape') {
                 event.preventDefault(); // Prevent potential side effects (like closing popups)
                 this.haltRename(false); // Cancel the rename
             }
        },

        // --- Handle Input Blur ---
        handleBlur: function (event) {
            // Use a short timeout to allow focus to shift (e.g., if clicking outside to intentionally blur/save)
            // and check if focus is still within the browser window or moved outside completely.
             setTimeout(() => {
                  // Check if a tab is still being edited *and* if the blurred element belongs to that tab
                  if (this._tabEdited && event.target.closest('.tabbrowser-tab') === this._tabEdited) {
                      // If focus has moved away from the input itself, consider it a save action
                      if (document.activeElement !== event.target) {
                        // console.log("TabRenamer: Input blurred, saving."); // Optional debug
                        this.saveRename();
                      }
                  } else if (!this._tabEdited) {
                      // If blur happens after editing was already halted (e.g., via Escape), do nothing further.
                  } else {
                      // If the blur event somehow occurred for an input on a tab *not* currently marked as edited
                      // (should be rare), halt any potentially inconsistent state.
                      console.warn("TabRenamer: Blur event detected on input, but it doesn't belong to the currently tracked edited tab. Forcing halt.");
                      this.haltRename(false);
                  }
             }, 50); // 50ms delay seems reasonable
        },

        // --- Save the New Name ---
        saveRename: async function () {
            if (!this._tabEdited) {
                // console.warn("TabRenamer Save: No tab is being edited."); // Optional debug
                return;
            }

            const tabToSave = this._tabEdited; // Store reference before halting might clear it
            const input = tabToSave.querySelector('#tab-label-input');

            if (!input) {
                console.error("TabRenamer Save: Input element not found inside the tab being edited. Halting.");
                this.haltRename(false); // Halt without saving
                return;
            }

            const newName = input.value.trim();
            const originalLabel = this._originalLabel;
            const isPinned = tabToSave.pinned;
            const pinId = isPinned ? tabToSave.getAttribute('zen-pin-id') : null; // Assuming this attribute exists for pinned tabs needing persistence
            const hadStaticLabel = tabToSave.hasAttribute('zen-has-static-label'); // Check original state

            // console.log(`TabRenamer Save: Processing name "${newName}" for tab "${originalLabel}". Pinned: ${isPinned}`); // Optional detailed debug

            let titleToPersist = "";
            let setCustomPersistenceFlag = false;
            let visualUpdateError = null;
            let persistenceError = null;

            // 1. Apply Visual Name Change & Determine Persistence State
            try {
                if (newName && newName !== originalLabel) {
                    // If the tab *already* had a custom name, remove the attribute briefly
                    // to ensure Firefox's internal title update mechanism doesn't block the new custom name.
                    if (hadStaticLabel) {
                        tabToSave.removeAttribute('zen-has-static-label');
                        // console.log("TabRenamer Save: Temporarily removed static label attribute for re-rename."); // Optional debug
                    }
                    gBrowser._setTabLabel(tabToSave, newName); // Apply the custom label visually
                    tabToSave.setAttribute('zen-has-static-label', 'true'); // Mark as having a custom name
                    titleToPersist = newName;
                    setCustomPersistenceFlag = true;
                    // console.log(`TabRenamer Save: Applied new custom name: "${newName}"`); // Optional debug

                } else if (!newName) {
                    // Empty name means revert to original title
                    // console.log("TabRenamer Save: New name empty, reverting to original title."); // Optional debug
                    tabToSave.removeAttribute('zen-has-static-label'); // Remove custom flag
                    gBrowser.setTabTitle(tabToSave); // Ask Firefox to reset the title based on content
                    // Wait briefly for the title to potentially update asynchronously
                    await new Promise(resolve => setTimeout(resolve, 50));
                    titleToPersist = tabToSave.label; // Persist the (potentially reverted) title
                    setCustomPersistenceFlag = false;

                } else { // Name is the same as the original label
                    // console.log("TabRenamer Save: Name unchanged."); // Optional debug
                    titleToPersist = tabToSave.label; // Use current label for persistence
                    // Ensure attribute consistency: if it originally had one, it should keep it.
                    if (hadStaticLabel) {
                        if (!tabToSave.hasAttribute('zen-has-static-label')) {
                             tabToSave.setAttribute('zen-has-static-label', 'true'); // Re-apply if somehow lost
                        }
                        // Re-apply visually just in case something interfered
                        gBrowser._setTabLabel(tabToSave, newName);
                        setCustomPersistenceFlag = true;
                    } else {
                        // If it didn't have one originally and name is unchanged, ensure it doesn't get one.
                        tabToSave.removeAttribute('zen-has-static-label');
                        setCustomPersistenceFlag = false;
                    }
                }
            } catch (e) {
                console.error("TabRenamer Save: Error applying visual name change:", e);
                visualUpdateError = e;
                // Don't proceed to persistence if visual update failed
                this.haltRename(false); // Halt UI without saving state
                return;
            }

            // 2. Persist Changes (Only for Pinned Tabs via external manager, non-pinned rely on attribute)
            if (isPinned && pinId && typeof gZenPinnedTabManager !== 'undefined' && gZenPinnedTabManager.updatePinTitle) {
                // console.log("TabRenamer Persist: Updating pinned tab via gZenPinnedTabManager."); // Optional debug
                try {
                    // Await the persistence operation BEFORE halting the UI
                    await gZenPinnedTabManager.updatePinTitle(tabToSave, titleToPersist, setCustomPersistenceFlag);
                    // console.log("TabRenamer Persist: Pinned tab update successful."); // Optional debug
                } catch (e) {
                    console.error("TabRenamer Persist: Error updating pinned tab via Manager:", e);
                    persistenceError = e;
                    // Proceed to halt UI, but log the persistence error
                }
            } else if (isPinned && (!pinId || typeof gZenPinnedTabManager === 'undefined')) {
                 console.warn("TabRenamer Persist: Tab is pinned, but required pinId or gZenPinnedTabManager is missing. Persistence skipped.");
                 persistenceError = new Error("Missing pinId or PinnedTabManager for persistence.");
            }
             // Non-pinned tabs rely solely on the 'zen-has-static-label' attribute for session restore logic (handled elsewhere)

            // 3. Halt the Renaming UI - IMPORTANT: Do this *after* potential async persistence
            this.haltRename(true); // Pass true as save process completed (even if persistence failed)

            // 4. Provide User Feedback (Optional)
             if (newName && newName !== originalLabel && !persistenceError && !visualUpdateError) {
                 // console.log("TabRenamer Feedback: Rename successful."); // Optional debug
                 try {
                     // Example using external UI manager for feedback
                     if (typeof gZenUIManager !== 'undefined') {
                         if (gZenUIManager.showToast) gZenUIManager.showToast('zen-tabs-renamed'); // ID for a localized toast message
                         if (gZenUIManager.motion?.animate) gZenUIManager.motion.animate( tabToSave, { scale: [1, 0.98, 1] }, { duration: 0.25 });
                     }
                 } catch (e) { console.error("TabRenamer Feedback: Error showing confirmation:", e); }
             } else if (persistenceError) {
                  console.error("TabRenamer: Tab renamed visually, but failed to persist changes.", persistenceError);
                  // Optionally show error feedback to the user here
             } else if (visualUpdateError) {
                 // Error already logged, UI halted.
             }
        },

        // --- Halt Editing UI / Cancel ---
        haltRename: function (didSaveSuccessfully) { // Parameter indicates if called after a save attempt
            if (!this._tabEdited) return; // Already halted or never started

             const tabBeingHalted = this._tabEdited;

             // Store listeners before resetting state
             const keydownListener = this._boundHandleKeydown;
             const blurListener = this._boundHandleBlur;

             // Reset internal state FIRST to prevent race conditions or re-triggering
             this._tabEdited = null;
             this._originalLabel = null;
             this._boundHandleKeydown = null;
             this._boundHandleBlur = null;

             // Clean up UI elements and listeners
             try {
                 document.documentElement.removeAttribute('zen-renaming-tab'); // Remove global state indicator

                 const editorContainer = tabBeingHalted.querySelector('.tab-editor-container');
                 const input = editorContainer?.querySelector('#tab-label-input');

                 if (input) {
                     // Remove specific listeners that were added
                     if (keydownListener) input.removeEventListener('keydown', keydownListener);
                     if (blurListener) input.removeEventListener('blur', blurListener);
                 }
                 editorContainer?.remove(); // Remove the input container

                 const labelContainer = tabBeingHalted.querySelector('.tab-label-container');
                 labelContainer?.classList.remove('tab-label-container-editing'); // Show original label container again

             } catch (e) {
                 console.error("TabRenamer Halt: Error cleaning up UI elements:", e);
                 // Continue resetting state even if UI cleanup fails partially
             }

            // console.log(`TabRenamer: Renaming halted for tab. Saved: ${!!didSaveSuccessfully}`); // Optional debug
        },

    }; // End of window.TabRenamer object

    // --- Robust Initialization Logic ---
    function addStartupObserver() {
        // console.log("TabRenamer Init: Using 'delayed-startup-finished' observer."); // Optional debug
        try {
            if (typeof Services === 'undefined' || !Services.obs) {
                console.error("TabRenamer Init Error: Services.obs is not available! Cannot guarantee proper initialization timing.");
                // Fallback: Try initializing after a short delay, might work in some environments
                 setTimeout(safelyCallInit, 1000);
                return;
            }
            let delayedListener = (subject, topic) => {
                if (topic === "delayed-startup-finished" && subject === window) {
                    // console.log("TabRenamer Init: 'delayed-startup-finished' received."); // Optional debug
                    Services.obs.removeObserver(delayedListener, "delayed-startup-finished");
                    safelyCallInit(); // Initialize after startup is complete
                }
            };
            Services.obs.addObserver(delayedListener, "delayed-startup-finished");
        } catch (e) {
            console.error("TabRenamer Init: Error setting up 'delayed-startup-finished' observer:", e);
             // Fallback: Try initializing after a delay
            setTimeout(safelyCallInit, 1000);
        }
    }

    function safelyCallInit() {
         // console.log("TabRenamer Init: Attempting safe initialization call."); // Optional debug
         try {
             if (window.TabRenamer && typeof window.TabRenamer.init === 'function') {
                 window.TabRenamer.init();
             } else {
                 console.error("TabRenamer Init Error: TabRenamer object or init function not found at time of call!");
             }
         } catch (e) {
             console.error("TabRenamer Init: Error *during* execution of TabRenamer.init():", e);
         }
     }

    // Determine the best time to initialize
    try {
        // Prefer SessionStore's promise if available (common in modern Firefox userChromeJS contexts)
        if (typeof SessionStore !== 'undefined' && SessionStore.promiseInitialized?.then) {
             // console.log("TabRenamer Init: Waiting for SessionStore.promiseInitialized..."); // Optional debug
            SessionStore.promiseInitialized.then(() => {
                 // console.log("TabRenamer Init: SessionStore ready. Initializing."); // Optional debug
                 // Use a minimal timeout to ensure the event loop turn completes after promise resolution
                 setTimeout(safelyCallInit, 50);
            }).catch(e => {
                 console.error("TabRenamer Init: Error waiting for SessionStore promise. Falling back to observer.", e);
                 addStartupObserver();
            });
        }
        // Fallback check for older methods or different environments
        else if (typeof gBrowserInit !== 'undefined' && gBrowserInit.delayedStartupFinished) {
             // console.log("TabRenamer Init: Startup finished according to gBrowserInit. Initializing."); // Optional debug
            setTimeout(safelyCallInit, 50); // Short delay might still be prudent
        }
        // If neither indicator is available or ready, use the observer
        else {
            // console.log("TabRenamer Init: Startup indicators not ready/available. Using observer."); // Optional debug
            addStartupObserver();
        }
    } catch (e) {
        console.error("TabRenamer Init: Error during initial startup check. Falling back to observer.", e);
        addStartupObserver(); // Ensure observer is added if checks fail
    }
    // --- End of Robust Initialization Logic ---

})(); // End of the main IIFE