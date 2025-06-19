(function() {
    'use strict';

    // Preferences management system
    class QuickSearchPreferences {
        constructor() {
            this.prefs = Services.prefs;
            this.prefBranch = "extensions.quicksearch.";
            this.initDefaults();
        }

        initDefaults() {
            const defaults = {
                "context_menu.enabled": true,
                "context_menu.engine": "@ddg",
                "context_menu.access_key": "Q",
                "container.width": 550,
                "container.height": 300,
                "container.position": "top-right",
                "container.theme": "dark",
                "behavior.scale_factor": 0.95,
                "behavior.animation_enabled": true,
                "behavior.remember_size": true,
                "behavior.auto_focus": true,
                "shortcuts.toggle_key": "Ctrl+Shift+Q",
                "shortcuts.escape_closes": true
            };

            for (const [key, value] of Object.entries(defaults)) {
                const prefName = this.prefBranch + key;
                if (!this.prefs.prefHasUserValue(prefName)) {
                    if (typeof value === 'boolean') {
                        this.prefs.setBoolPref(prefName, value);
                    } else if (typeof value === 'number') {
                        this.prefs.setIntPref(prefName, value);
                    } else {
                        this.prefs.setStringPref(prefName, value);
                    }
                }
            }
        }

        get(key) {
            const prefName = this.prefBranch + key;
            try {
                const prefType = this.prefs.getPrefType(prefName);
                switch (prefType) {
                    case this.prefs.PREF_BOOL:
                        return this.prefs.getBoolPref(prefName);
                    case this.prefs.PREF_INT:
                        return this.prefs.getIntPref(prefName);
                    case this.prefs.PREF_STRING:
                        return this.prefs.getStringPref(prefName);
                    default:
                        return null;
                }
            } catch (e) {
                return null;
            }
        }

        set(key, value) {
            const prefName = this.prefBranch + key;
            try {
                if (typeof value === 'boolean') {
                    this.prefs.setBoolPref(prefName, value);
                } else if (typeof value === 'number') {
                    this.prefs.setIntPref(prefName, value);
                } else {
                    this.prefs.setStringPref(prefName, value);
                }
            } catch (e) {
                console.error('QuickSearch: Failed to set preference', key, e);
            }
        }
    }

    // Initialize preferences
    let quickSearchPrefs;
    
    // Create and inject CSS for the search container
    const injectCSS = (theme = 'dark', position = 'top-right', animationsEnabled = true) => {
        // Theme configurations
        const themes = {
            dark: {
                containerBg: '#1e1f1f',
                containerBorder: '#404040',
                browserBg: '#2a2a2a',
                closeBtnBg: 'rgba(240, 240, 240, 0.8)',
                closeBtnColor: '#555',
                closeBtnHoverBg: 'rgba(220, 220, 220, 0.9)',
                closeBtnHoverColor: '#000'
            },
            light: {
                containerBg: '#ffffff',
                containerBorder: '#e0e0e0',
                browserBg: '#f9f9f9',
                closeBtnBg: 'rgba(60, 60, 60, 0.8)',
                closeBtnColor: '#fff',
                closeBtnHoverBg: 'rgba(40, 40, 40, 0.9)',
                closeBtnHoverColor: '#fff'
            },
            auto: window.matchMedia('(prefers-color-scheme: dark)').matches ? {
                containerBg: '#1e1f1f',
                containerBorder: '#404040',
                browserBg: '#2a2a2a',
                closeBtnBg: 'rgba(240, 240, 240, 0.8)',
                closeBtnColor: '#555',
                closeBtnHoverBg: 'rgba(220, 220, 220, 0.9)',
                closeBtnHoverColor: '#000'
            } : {
                containerBg: '#ffffff',
                containerBorder: '#e0e0e0',
                browserBg: '#f9f9f9',
                closeBtnBg: 'rgba(60, 60, 60, 0.8)',
                closeBtnColor: '#fff',
                closeBtnHoverBg: 'rgba(40, 40, 40, 0.9)',
                closeBtnHoverColor: '#fff'
            }
        };

        const currentTheme = themes[theme] || themes.dark;

        // Position configurations
        const positions = {
            'top-right': { top: '10px', right: '10px', left: 'auto', bottom: 'auto' },
            'top-left': { top: '10px', left: '10px', right: 'auto', bottom: 'auto' },
            'center': { top: '50%', left: '50%', right: 'auto', bottom: 'auto', transform: 'translate(-50%, -50%)' },
            'bottom-right': { bottom: '10px', right: '10px', top: 'auto', left: 'auto' },
            'bottom-left': { bottom: '10px', left: '10px', top: 'auto', right: 'auto' }
        };

        const currentPosition = positions[position] || positions['top-right'];

        const css = `
            @keyframes quicksearchSlideIn {
                0% {
                    transform: ${position === 'center' ? 'translate(-50%, -50%) scale(0.8)' : 'translateY(-100%)'};
                    opacity: 0;
                }
                60% {
                    transform: ${position === 'center' ? 'translate(-50%, -50%) scale(1.05)' : 'translateY(5%)'};
                    opacity: 1;
                }
                80% {
                    transform: ${position === 'center' ? 'translate(-50%, -50%) scale(0.98)' : 'translateY(-2%)'};
                }
                100% {
                    transform: ${position === 'center' ? 'translate(-50%, -50%) scale(1)' : 'translateY(0)'};
                }
            }
            
            @keyframes quicksearchSlideOut {
                0% {
                    transform: ${position === 'center' ? 'translate(-50%, -50%) scale(1)' : 'translateY(0)'};
                    opacity: 1;
                }
                100% {
                    transform: ${position === 'center' ? 'translate(-50%, -50%) scale(0.8)' : 'translateY(-100%)'};
                    opacity: 0;
                }
            }
            
            #quicksearch-container {
                position: fixed;
                top: ${currentPosition.top};
                right: ${currentPosition.right};
                left: ${currentPosition.left};
                bottom: ${currentPosition.bottom};
                ${currentPosition.transform ? `transform: ${currentPosition.transform};` : ''}
                width: 550px;
                min-width: 200px;
                height: 300px;
                min-height: 150px;
                max-width: 70vw;
                max-height: 70vh;
                background-color: ${currentTheme.containerBg};
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                z-index: 9999;
                display: none;
                flex-direction: column;
                overflow: hidden;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                opacity: 0;
                border: 1px solid ${currentTheme.containerBorder};
            }
            
            #quicksearch-container.visible {
                display: flex;
                opacity: 1;
                ${animationsEnabled ? 'animation: quicksearchSlideIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;' : ''}
            }
            
            #quicksearch-container.closing {
                ${animationsEnabled ? 'animation: quicksearchSlideOut 0.3s ease-in forwards;' : ''}
            }
            
            #quicksearch-browser-container {
                flex: 1;
                width: 100%;
                border: none;
                background-color: ${currentTheme.browserBg};
                position: relative;
                overflow: hidden;
            }
            
            #quicksearch-content-frame {
                width: 100%;
                height: 100%;
                border: none;
                overflow: hidden;
                background-color: white;
                transform-origin: 0 0;
                transform: scale(1);
            }
            
            .quicksearch-close-button {
                position: absolute;
                top: 8px;
                right: 8px;
                width: 24px;
                height: 24px;
                background-color: ${currentTheme.closeBtnBg};
                border: none;
                border-radius: 50%;
                font-size: 14px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: ${currentTheme.closeBtnColor};
                cursor: pointer;
                z-index: 10000;
                box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
                transition: background-color 0.2s, transform 0.2s;
            }
            
            .quicksearch-close-button:hover {
                background-color: ${currentTheme.closeBtnHoverBg};
                transform: scale(1.1);
                color: ${currentTheme.closeBtnHoverColor};
            }
            
            #quicksearch-resizer {
               position: absolute;
               bottom: 0;
               left: 0;
               width: 0;
               height: 0;
               background:transparent;
               border-style: solid;
               border-width: 0 16px 16px 0;
               border-color: transparent #fff transparent transparent;
               cursor: sw-resize;
               z-index: 10001;
               transform: rotate(180deg);
            }
            .z-index: 10000;
        `;
        
        const styleElement = document.createElement('style');
        styleElement.id = 'quicksearch-styles';
        styleElement.textContent = css;
        document.head.appendChild(styleElement);
    };

    // Function to ensure Services are available
    function ensureServicesAvailable() {
        if (typeof Services === 'undefined' && typeof Components !== 'undefined') {
            try {
                Components.utils.import("resource://gre/modules/Services.jsm");
                return true;
            } catch (e) {
                return false;
            }
        }
        return typeof Services !== 'undefined';
    }

    // Function to load content in browser
    function loadContentInBrowser(browser, searchUrl) {
        try {
            try {
                const uri = Services.io.newURI(searchUrl);
                const principal = Services.scriptSecurityManager.getSystemPrincipal();
                browser.loadURI(uri, {triggeringPrincipal: principal});
            } catch (e) {
                browser.loadURI(searchUrl);
            }
            return true;
        } catch (e) {
            try {
                browser.setAttribute("src", searchUrl);
                return true;
            } catch (e) {
                return false;
            }
        }
    }

    // Function to adjust content scaling to fit container
    function adjustContentScaling(element) {
        if (!element) return;
        
        element.addEventListener('load', function() {
            const scaleFactor = quickSearchPrefs ? quickSearchPrefs.get('behavior.scale_factor') : 0.95;
            element.style.transform = `scale(${scaleFactor})`;
            element.style.transformOrigin = '0 0';
            
            if (element.tagName.toLowerCase() === 'iframe') {
                setTimeout(() => {
                    try {
                        if (element.contentDocument) {
                            const style = element.contentDocument.createElement('style');
                            style.textContent = `
                                body, html {
                                    overflow: hidden !important;
                                    height: 100% !important;
                                    width: 100% !important;
                                    margin: 0 !important;
                                    padding: 0 !important;
                                }
                                
                                * {
                                    scrollbar-width: none !important;
                                }
                                *::-webkit-scrollbar {
                                    display: none !important;
                                    width: 0 !important;
                                    height: 0 !important;
                                }
                                
                                body {
                                    visibility: visible !important;
                                    opacity: 1 !important;
                                    background-color: #1e1f1f !important;
                                    display: block !important;
                                }
                                
                                body > * {
                                    z-index: auto !important;
                                    position: relative !important;
                                }
                            `;
                            element.contentDocument.head.appendChild(style);
                            
                            const mainContent = element.contentDocument.body;
                            if (mainContent) {
                                mainContent.style.transformOrigin = '0 0';
                            }
                        }
                    } catch (e) {
                        // Cross-origin restrictions might prevent this
                    }
                }, 500);
            }
        });
    }

    // Wait for browser to be fully initialized
    function init() {
        if (!ensureServicesAvailable()) return;
        
        // Initialize preferences
        quickSearchPrefs = new QuickSearchPreferences();
        
        // Inject CSS with user preferences
        const theme = quickSearchPrefs.get('container.theme');
        const position = quickSearchPrefs.get('container.position');
        const animationsEnabled = quickSearchPrefs.get('behavior.animation_enabled');
        injectCSS(theme, position, animationsEnabled);
        
        let urlbar = null;
        if (gBrowser && gBrowser.urlbar) {
            urlbar = gBrowser.urlbar;
        } else {
            urlbar = document.getElementById("urlbar") || document.querySelector("#urlbar");
        }
        
        if (urlbar) {
            attachEventListeners(urlbar);
        } else {
            setTimeout(init, 1000);
        }
        
        // Add context menu item if enabled
        const contextMenuEnabled = quickSearchPrefs.get('context_menu.enabled');
        if (contextMenuEnabled) {
            addContextMenuItem();
        }

        // Add keyboard shortcut listener
        addKeyboardShortcuts();
    }
    
    // Attach event listeners to the URL bar
    function attachEventListeners(urlbar) {
        let currentQuery = '';
        
        // Input event to track typing
        urlbar.addEventListener("input", function(event) {
            if (event.target && typeof event.target.value === 'string') {
                currentQuery = event.target.value;
            }
        }, true);
        
        // Add keydown event listener for Ctrl+Enter
        urlbar.addEventListener("keydown", function(event) {
            if (event.ctrlKey && event.key === "Enter") {
                // Check if Shift is also pressed for Glance mode
                if (event.shiftKey) {
                    event.preventDefault();
                    event.stopPropagation();
                    
                    let query = '';
                    try {
                        if (typeof currentQuery === 'string' && currentQuery.length > 0) {
                            query = currentQuery.trim();
                        }
                    } catch (error) {
                        return;
                    }
                    
                    if (query) {
                        openInGlanceMode(query);
                    }
                    
                    return false;
                } else {
                    // Original Ctrl+Enter behavior
                    event.preventDefault();
                    event.stopPropagation();
                    
                    let query = '';
                    try {
                        if (typeof currentQuery === 'string' && currentQuery.length > 0) {
                            query = currentQuery.trim();
                        }
                    } catch (error) {
                        return;
                    }
                    
                    if (query) {
                        handleQuickSearch(query, urlbar);
                    }
                    
                    return false;
                }
            }
        }, true);
        
        // Update the tooltip to include Glance mode information
        let urlbarTooltip = "Quick Search Normal: Type a query and press Ctrl+Enter\n" +
                            "Quick Search Glance: Type a query and press Ctrl+Shift+Enter\n" +
                            "Prefixes: ";

        Services.search.getEngines().then(engines => {
            engines.forEach(engine => {
                if (engine._definedAliases && engine._definedAliases.length > 0) {
                    urlbarTooltip += engine._definedAliases[0] + " (" + engine.name + "), ";
                }
            });
            urlbarTooltip = urlbarTooltip.slice(0, -2);
            try {
                urlbar.setAttribute("tooltip", urlbarTooltip);
                urlbar.setAttribute("title", urlbarTooltip);
            } catch (error) {
                // Non-critical if tooltip fails
            }
        });
    }

      async function getSearchURLFromInput(input) {
          let engineName = document.getElementById("urlbar-search-mode-indicator-title").innerText.trim();
          let engines = await Services.search.getEngines();
          let engine = engines.find(e => e.name === engineName);
          if (!engine) engine = await Services.search.getDefault();
          let searchTerm = input.trim();
          let submission = engine.getSubmission(searchTerm);
          return submission.uri.spec;
      }

    // Function to get search URL with a specific engine
    async function getSearchURLWithEngine(query, engineName) {
        let engines = await Services.search.getEngines();
        let engine = engines.find(e => e.name === engineName || (e._definedAliases && e._definedAliases.includes(engineName)));
        console.log(engines);
        if (!engine) engine = await Services.search.getDefault();

        let searchTerm = query.trim();
        let submission = engine.getSubmission(searchTerm);
        return submission.uri.spec;
    }
    

    // Function to open a URL in Zen Browser's Glance mode
    function openInGlanceMode(query) {
        getSearchURLFromInput(query).then(searchUrl => {
            try {
                if (window.gZenGlanceManager) {
                    const browserRect = document.documentElement.getBoundingClientRect();
                    const centerX = browserRect.width / 2;
                    const centerY = browserRect.height / 2;

                    const data = {
                        url: searchUrl,
                        x: centerX,
                        y: centerY,
                        width: 10,
                        height: 10
                    };

                    window.gZenGlanceManager.openGlance(data);
                } else {
                    gBrowser.addTab(searchUrl, {
                        triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal()
                    });
                }
            } catch (error) {
                console.error("Error opening glance mode:", error);
                gBrowser.addTab(searchUrl, {
                    triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal()
                });
            }
        });
    }

    // Process the search query and show in in-browser container
    function handleQuickSearch(query, urlbar, fromContextMenu = false) {
        ensureServicesAvailable();

        const contextMenuEngine = quickSearchPrefs ? quickSearchPrefs.get('context_menu.engine') : '@ddg';
        const searchPromise = fromContextMenu ? 
            getSearchURLWithEngine(query, contextMenuEngine) : 
            getSearchURLFromInput(query);

        searchPromise.then(searchUrl => {
            try {
                // Get or create the container
                const container = createSearchContainer();
                const browserContainer = document.getElementById('quicksearch-browser-container');

                // Clear any previous content
                while (browserContainer.firstChild) {
                    browserContainer.removeChild(browserContainer.firstChild);
                }

                // Make the container visible immediately
                container.classList.add('visible');

                // Close the URL bar using Zen Browser's approach
                closeUrlBar(urlbar);

                // Add ESC key listener for this container
                addEscKeyListener(container);

                // Try browser element first
                const browserElement = createBrowserElement();

                if (browserElement) {
                    browserElement.id = 'quicksearch-content-frame';
                    browserElement.style.width = '100%';
                    browserElement.style.height = '100%';
                    browserElement.style.border = 'none';
                    browserElement.style.background = '#1e1f1f';
                    browserElement.style.overflow = 'hidden';

                    browserContainer.appendChild(browserElement);

                    const success = loadContentInBrowser(browserElement, searchUrl);

                    if (success) {
                        adjustContentScaling(browserElement);
                        return;
                    } else {
                        browserContainer.removeChild(browserElement);
                    }
                }

                // Create an iframe as fallback if browser element failed
                const iframe = document.createElement('iframe');
                iframe.id = 'quicksearch-content-frame';
                iframe.style.width = '100%';
                iframe.style.height = '100%';
                iframe.style.border = 'none';
                iframe.style.background = 'white';
                iframe.style.overflow = 'hidden';

                // Enhanced sandbox permissions for better rendering
                iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-top-navigation');
                iframe.setAttribute('scrolling', 'no');
                iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
                iframe.referrerPolicy = 'origin';

                iframe.addEventListener('load', function() {
                    setTimeout(() => {
                        const containerWidth = browserContainer.clientWidth;
                        const containerHeight = browserContainer.clientHeight;

                        const scaleFactor = quickSearchPrefs ? quickSearchPrefs.get('behavior.scale_factor') : 0.95;
                        iframe.style.width = `${Math.floor(containerWidth / scaleFactor)}px`;
                        iframe.style.height = `${Math.floor(containerHeight / scaleFactor)}px`;
                    }, 500);
                });
                // First append to container, then set source
                browserContainer.appendChild(iframe);

                // Small delay before setting source
                setTimeout(() => {
                    iframe.src = searchUrl;
                }, 100);

                // Apply content scaling
                adjustContentScaling(iframe);

            } catch (error) {
                // Last resort: open in a new tab/window
                try {
                    gBrowser.addTab(searchUrl, {
                        triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal()
                    });
                } catch (e) {
                    window.open(searchUrl, '_blank');
                }
            }
        });
    }

    function closeUrlBar(urlbar) {
        if (!urlbar) return;
        
        try {
            if (window.gZenUIManager && typeof window.gZenUIManager.handleUrlbarClose === 'function') {
                window.gZenUIManager.handleUrlbarClose(false, false);
                return;
            }
            
            // Reset selection
            urlbar.selectionStart = urlbar.selectionEnd = 0;
        } catch (e) {
        }
    }

    function addEscKeyListener(container) {
        if (container._escKeyListener) {
            document.removeEventListener('keydown', container._escKeyListener);
        }
        
        container._escKeyListener = function(event) {
            if (event.key === 'Escape') {
                const escapeCloses = quickSearchPrefs ? quickSearchPrefs.get('shortcuts.escape_closes') : true;
                if (escapeCloses) {
                    event.preventDefault();
                    event.stopPropagation();
                    closeQuickSearch(container);
                    document.removeEventListener('keydown', container._escKeyListener);
                }
            }
        };
        
        document.addEventListener('keydown', container._escKeyListener);
    }

    // Add keyboard shortcuts
    function addKeyboardShortcuts() {
        function handleGlobalShortcuts(event) {
            const toggleKey = quickSearchPrefs ? quickSearchPrefs.get('shortcuts.toggle_key') : 'Ctrl+Shift+Q';
            
            // Parse the toggle key combination
            const keyParts = toggleKey.split('+').map(k => k.trim());
            const hasCtrl = keyParts.includes('Ctrl');
            const hasShift = keyParts.includes('Shift');
            const hasAlt = keyParts.includes('Alt');
            const mainKey = keyParts[keyParts.length - 1];
            
            // Check if the pressed key combination matches the toggle shortcut
            if (event.ctrlKey === hasCtrl && 
                event.shiftKey === hasShift && 
                event.altKey === hasAlt && 
                event.key.toLowerCase() === mainKey.toLowerCase()) {
                
                event.preventDefault();
                event.stopPropagation();
                
                // Toggle Quick Search
                const existingContainer = document.getElementById('quicksearch-container');
                if (existingContainer && existingContainer.classList.contains('visible')) {
                    closeQuickSearch(existingContainer);
                } else {
                    // Create a simple search interface
                    const container = createSearchContainer();
                    container.classList.add('visible');
                    
                    // Create a search input if it doesn't exist
                    let searchInput = document.getElementById('quicksearch-input');
                    if (!searchInput) {
                        searchInput = document.createElement('input');
                        searchInput.id = 'quicksearch-input';
                        searchInput.type = 'text';
                        searchInput.placeholder = 'Enter search query...';
                        searchInput.style.cssText = `
                            width: 100%;
                            padding: 10px;
                            border: none;
                            border-bottom: 1px solid #ccc;
                            outline: none;
                            font-size: 14px;
                            box-sizing: border-box;
                            background: transparent;
                        `;
                        
                        searchInput.addEventListener('keydown', function(e) {
                            if (e.key === 'Enter') {
                                const query = this.value.trim();
                                if (query) {
                                    // Remove the input and search
                                    this.remove();
                                    handleQuickSearch(query, null, false);
                                }
                            }
                        });
                        
                        container.insertBefore(searchInput, container.firstChild);
                    }
                    
                    // Auto-focus if enabled
                    const autoFocus = quickSearchPrefs ? quickSearchPrefs.get('behavior.auto_focus') : true;
                    if (autoFocus) {
                        setTimeout(() => searchInput.focus(), 100);
                    }
                    
                    addEscKeyListener(container);
                }
            }
        }
        
        document.addEventListener('keydown', handleGlobalShortcuts, true);
    }

    // Function to close the quick search container
    function closeQuickSearch(container) {
        if (!container) container = document.getElementById('quicksearch-container');
        if (!container) return;
        
        const animationsEnabled = quickSearchPrefs ? quickSearchPrefs.get('behavior.animation_enabled') : true;
        const animationDuration = animationsEnabled ? 300 : 0;
        
        if (animationsEnabled) {
            container.classList.add('closing');
        }
        
        setTimeout(() => {
            container.classList.remove('visible');
            container.classList.remove('closing');
            
            // Clear iframe source when closing
            const iframe = document.getElementById('quicksearch-content-frame');
            if (iframe) {
                try {
                    iframe.src = 'about:blank';
                } catch (err) {
                }
            }
            
            // Remove search input if exists
            const searchInput = document.getElementById('quicksearch-input');
            if (searchInput) {
                searchInput.remove();
            }
            
            // Remove the ESC key listener
            if (container._escKeyListener) {
                document.removeEventListener('keydown', container._escKeyListener);
                container._escKeyListener = null;
            }
        }, animationDuration);
    }
    
    function saveContainerDimensions(width, height) {
        const rememberSize = quickSearchPrefs ? quickSearchPrefs.get('behavior.remember_size') : true;
        
        if (rememberSize && quickSearchPrefs) {
            quickSearchPrefs.set('container.width', width);
            quickSearchPrefs.set('container.height', height);
        } else if (rememberSize) {
            // Fallback to legacy method
            const prefs = Services.prefs;
            const prefNameWidth = "quicksearch.container.width";
            const prefNameHeight = "quicksearch.container.height";
            try {
                prefs.setIntPref(prefNameWidth, width);
                prefs.setIntPref(prefNameHeight, height);
            } catch (e) {
                console.error('QuickSearch: Failed to save dimensions', e);
            }
        }
    }

    function loadContainerDimensions() {
        let width = quickSearchPrefs ? quickSearchPrefs.get('container.width') : 550;
        let height = quickSearchPrefs ? quickSearchPrefs.get('container.height') : 300;
        
        // Check if we should remember size
        const rememberSize = quickSearchPrefs ? quickSearchPrefs.get('behavior.remember_size') : true;
        
        if (rememberSize) {
            // Load from legacy preferences if quickSearchPrefs not available
            if (!quickSearchPrefs) {
                const prefs = Services.prefs;
                const prefNameWidth = "quicksearch.container.width";
                const prefNameHeight = "quicksearch.container.height";
                
                try {
                    width = prefs.getIntPref(prefNameWidth);
                    height = prefs.getIntPref(prefNameHeight);
                } catch (e) {
                    // Use default values if preferences are not set
                }
            }
        }

        const container = document.getElementById('quicksearch-container');
        if (container) {
            container.style.width = `${width}px`;
            container.style.height = `${height}px`;
        }
    }

    // Create and initialize the search container
    function createSearchContainer() {
        let container = document.getElementById('quicksearch-container');
        if (container) {
            loadContainerDimensions();
            return container;
        }
        
        // Create the container elements
        container = document.createElement('div');
        container.id = 'quicksearch-container';
        
        // Container for the browser element
        const browserContainer = document.createElement('div');
        browserContainer.id = 'quicksearch-browser-container';
        browserContainer.style.flex = '1';
        browserContainer.style.width = '100%';
        browserContainer.style.position = 'relative';
        browserContainer.style.overflow = 'hidden';
        
        // Create floating close button
        const closeButton = document.createElement('button');
        closeButton.className = 'quicksearch-close-button';
        closeButton.innerHTML = '&#10005;'; // X symbol
        closeButton.title = 'Close';
        closeButton.onclick = (e) => {
            e.stopPropagation();
            closeQuickSearch(container);
        };
        
        // Create resizer element
        const resizer = document.createElement('div');
        resizer.id = 'quicksearch-resizer';
        
        let isResizing = false;
        let startX, startY, startWidth, startHeight;
        
        resizer.addEventListener('mousedown', function(e) {
            isResizing = true;
            startX = e.clientX;
            startY = e.clientY;
            startWidth = container.offsetWidth;
            startHeight = container.offsetHeight;
            document.addEventListener('mousemove', doResize);
            document.addEventListener('mouseup', stopResize);
        });
        
        function doResize(e) {
            if (!isResizing) return;
            
            let width = startWidth - (e.clientX - startX);
            let height = startHeight - (startY - e.clientY);
            
            // Enforce minimum dimensions
            width = Math.max(width, 200);
            height = Math.max(height, 150);

            // Enforce maximum dimensions
            width = Math.min(width, window.innerWidth * 0.7);
            height = Math.min(height, window.innerHeight * 0.7);
            
            container.style.width = width + 'px';
            container.style.height = height + 'px';
        }
        
        function stopResize() {
            if (!isResizing) return;
            
            isResizing = false;
            document.removeEventListener('mousemove', doResize);
            document.removeEventListener('mouseup', stopResize);
            
            // Save the new dimensions
            saveContainerDimensions(container.offsetWidth, container.offsetHeight);
        }
        
        // Assemble the elements
        container.appendChild(browserContainer);
        container.appendChild(closeButton);
        container.appendChild(resizer);
        
        document.body.appendChild(container);
        loadContainerDimensions();
        return container;
    }

    function createBrowserElement() {
        try {
            const browser = document.createXULElement("browser");
            
            browser.setAttribute("type", "content");
            browser.setAttribute("remote", "true");
            browser.setAttribute("maychangeremoteness", "true");
            browser.setAttribute("disablehistory", "true");
            browser.setAttribute("flex", "1");
            browser.setAttribute("noautohide", "true");
            
            return browser;
        } catch (e) {
            try {
                const browser = document.createElementNS("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", "browser");
                
                browser.setAttribute("type", "content");
                browser.setAttribute("remote", "true");
                
                return browser;
            } catch (e) {
                return null;
            }
        }
    }

    // Function to add context menu item
    function addContextMenuItem() {
        const contextMenu = document.getElementById("contentAreaContextMenu");
        if (!contextMenu) {
            setTimeout(addContextMenuItem, 500);
            return;
        }

        if (document.getElementById("quicksearch-context-menuitem")) {
            return;
        }

        const accessKey = quickSearchPrefs ? quickSearchPrefs.get('context_menu.access_key') : 'Q';
        const menuItem = document.createXULElement("menuitem");
        menuItem.id = "quicksearch-context-menuitem";
        menuItem.setAttribute("label", "Open in Quick Search");
        menuItem.setAttribute("accesskey", accessKey);
        
        menuItem.addEventListener("command", handleContextMenuClick);
        
        const searchSelectItem = contextMenu.querySelector("#context-searchselect");
        
        if (searchSelectItem) {
            // Insert right after the searchselect item
            if (searchSelectItem.nextSibling) {
                contextMenu.insertBefore(menuItem, searchSelectItem.nextSibling);
            } else {
                contextMenu.appendChild(menuItem);
            }
        } else {
            // Fallback: insert after context-sep-redo separator
            const redoSeparator = contextMenu.querySelector("#context-sep-redo");
            if (redoSeparator) {
                if (redoSeparator.nextSibling) {
                    contextMenu.insertBefore(menuItem, redoSeparator.nextSibling);
                } else {
                    contextMenu.appendChild(menuItem);
                }
            } else {
                // Final fallback: don't add the menu item if neither element is found
                return;
            }
        }

        contextMenu.addEventListener("popupshowing", updateContextMenuVisibility);
    }


    function handleContextMenuClick() {
        let selectedText = "";
        

        if (typeof gContextMenu !== 'undefined' && gContextMenu.selectedText) {
            selectedText = gContextMenu.selectedText.trim();
        } else {
            console.error("Error getting selected text:", e);
        }
        
        if (selectedText && selectedText.trim()) {
            handleQuickSearch(selectedText.trim(), null, true);
        }
    }



    function updateContextMenuVisibility(event) {
        const menuItem = document.getElementById("quicksearch-context-menuitem");
        if (!menuItem) {
            return;
        }
        let hasSelection = false;
        let selectedText = "";

        if (typeof gContextMenu !== 'undefined') {
            hasSelection = gContextMenu.isTextSelected === true;
            if (hasSelection && gContextMenu.selectedText) {
                selectedText = gContextMenu.selectedText.trim();
            }
        }
        
        menuItem.hidden = !hasSelection;
    }

    setTimeout(init, 1000);
})();
