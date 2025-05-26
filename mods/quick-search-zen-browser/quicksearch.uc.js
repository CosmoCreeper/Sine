(function() {
    'use strict';
    
    // Create and inject CSS for the search container
    const injectCSS = () => {
        const css = `
            @keyframes quicksearchSlideIn {
                0% {
                    transform: translateY(-100%);
                    opacity: 0;
                }
                60% {
                    transform: translateY(5%);
                    opacity: 1;
                }
                80% {
                    transform: translateY(-2%);
                }
                100% {
                    transform: translateY(0);
                }
            }
            
            @keyframes quicksearchSlideOut {
                0% {
                    transform: translateY(0);
                    opacity: 1;
                }
                100% {
                    transform: translateY(-100%);
                    opacity: 0;
                }
            }
            
            #quicksearch-container {
                position: fixed;
                top: 10px;
                right: 10px;
                width: 550px;
                height: 300px;
                background-color: #1e1f1f;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                z-index: 9999;
                display: none;
                flex-direction: column;
                overflow: hidden;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                opacity: 0;
                border: 1px solid #e0e0e0;
            }
            
            #quicksearch-container.visible {
                display: flex;
                opacity: 1;
                animation: quicksearchSlideIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
            }
            
            #quicksearch-container.closing {
                animation: quicksearchSlideOut 0.3s ease-in forwards;
            }
            
            #quicksearch-browser-container {
                flex: 1;
                width: 100%;
                border: none;
                background-color: #f9f9f9;
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
                background-color: rgba(240, 240, 240, 0.8);
                border: none;
                border-radius: 50%;
                font-size: 14px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #555;
                cursor: pointer;
                z-index: 10000;
                box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
                transition: background-color 0.2s, transform 0.2s;
            }
            
            .quicksearch-close-button:hover {
                background-color: rgba(220, 220, 220, 0.9);
                transform: scale(1.1);
                color: #000;
            }
        `;
        
        const styleElement = document.createElement('style');
        styleElement.id = 'quicksearch-styles';
        styleElement.textContent = css;
        document.head.appendChild(styleElement);
    };

    // Configuration
    const config = {
        searchEngines: {
            google: {
                prefix: 'g:',
                url: 'https://www.google.com/search?q='
            },
            bing: {
                prefix: 'b:',
                url: 'https://www.bing.com/search?q='
            },
            duckduckgo: {
                prefix: 'd:',
                url: 'https://duckduckgo.com/?q='
            },
            ecosia: {
                prefix: 'e:',
                url: 'https://www.ecosia.org/search?q='
            },
            stackoverflow: {
                prefix: 'so:',
                url: 'https://stackoverflow.com/search?q='
            },
            github: {
                prefix: 'gh:',
                url: 'https://github.com/search?q='
            },
            wikipedia: {
                prefix: 'wiki:',
                url: 'https://en.wikipedia.org/wiki/Special:Search?search='
            }
        },
        defaultEngine: 'google'
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
            const scaleFactor = 0.95;
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
        injectCSS();
        
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
        const urlbarTooltip = "Quick Search Normal: Type a query and press Ctrl+Enter\n" +
                            "Quick Search Glance: Type a query and press Ctrl+Shift+Enter\n" +
                            "Prefixes: g: (Google), b: (Bing), d: (DuckDuckGo), e: (Ecosia), " + 
                            "so: (Stack Overflow), gh: (GitHub), wiki: (Wikipedia)";
        try {
            urlbar.setAttribute("tooltip", urlbarTooltip);
            urlbar.setAttribute("title", urlbarTooltip);
        } catch (error) {
            // Non-critical if tooltip fails
        }
    }

    // Function to open a URL in Zen Browser's Glance mode
    function openInGlanceMode(query) {
        let searchEngine = config.defaultEngine;
        let searchQuery = query;
        
        for (const [engine, engineData] of Object.entries(config.searchEngines)) {
            if (query.startsWith(engineData.prefix)) {
                searchEngine = engine;
                searchQuery = query.substring(engineData.prefix.length).trim();
                break;
            }
        }
        
        const baseUrl = config.searchEngines[searchEngine].url;
        let searchUrl;
        
        if (searchEngine === 'google') {
            searchUrl = baseUrl + encodeURIComponent(searchQuery);
        } else if (searchEngine === 'stackoverflow') {
            searchUrl = baseUrl + encodeURIComponent(searchQuery) + '&s=relevance';
        } else if (searchEngine === 'github') {
            searchUrl = baseUrl + encodeURIComponent(searchQuery) + '&type=repositories';
        } else {
            searchUrl = baseUrl + encodeURIComponent(searchQuery);
        }
        
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
    }

    // Process the search query and show in in-browser container
    function handleQuickSearch(query, urlbar) {
        let searchEngine = config.defaultEngine;
        let searchQuery = query;
        
        // Check if query starts with a search engine prefix
        for (const [engine, engineData] of Object.entries(config.searchEngines)) {
            if (query.startsWith(engineData.prefix)) {
                searchEngine = engine;
                searchQuery = query.substring(engineData.prefix.length).trim();
                break;
            }
        }
        
        ensureServicesAvailable();
        
        // Build the search URL - handle special cases for better compatibility
        let searchUrl;
        const baseUrl = config.searchEngines[searchEngine].url;
        
        // Some engines work better with different parameter styles
        if (searchEngine === 'google') {
            searchUrl = baseUrl + encodeURIComponent(searchQuery);
        } else if (searchEngine === 'stackoverflow') {
            searchUrl = baseUrl + encodeURIComponent(searchQuery) + '&s=relevance';
        } else if (searchEngine === 'github') {
            searchUrl = baseUrl + encodeURIComponent(searchQuery) + '&type=repositories';
        } else {
            searchUrl = baseUrl + encodeURIComponent(searchQuery);
        }
        
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
                    
                    const scaleFactor = 0.95;
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
                event.preventDefault();
                event.stopPropagation();
                closeQuickSearch(container);
                document.removeEventListener('keydown', container._escKeyListener);
            }
        };
        
        document.addEventListener('keydown', container._escKeyListener);
    }

    // Function to close the quick search container
    function closeQuickSearch(container) {
        if (!container) container = document.getElementById('quicksearch-container');
        if (!container) return;
        
        container.classList.add('closing');
        
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
            
            // Remove the ESC key listener
            if (container._escKeyListener) {
                document.removeEventListener('keydown', container._escKeyListener);
                container._escKeyListener = null;
            }
        }, 300);
    }

    // Create and initialize the search container
    function createSearchContainer() {
        if (document.getElementById('quicksearch-container')) {
            return document.getElementById('quicksearch-container');
        }
        
        // Create the container elements
        const container = document.createElement('div');
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
        
        // Assemble the elements
        container.appendChild(browserContainer);
        container.appendChild(closeButton);
        
        document.body.appendChild(container);
        
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

    // Initialize after a small delay
    setTimeout(init, 1000);
})();
