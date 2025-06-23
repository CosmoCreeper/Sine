// ==UserScript==
// @ignorecache
// @name          Dynamic URLBar Background Height
// @description   Adjusts the height of #browser::before to match .urlbarView height.
// @include       chrome://browser/content/browser.xhtml
// @run-at        document-idle
// ==/UserScript==
// (Note: The above header is for userscript managers, may not be needed for autoconfig)

(function() {
  // Only run in the main browser window
  if (window.location.href !== 'chrome://browser/content/browser.xhtml') {
      return;
  }

  console.log("DynamicUrlbarHeight script loading...");

  const BROWSER_ELEMENT_ID = 'browser';
  const URLBAR_ELEMENT_ID = 'urlbar';
  const URLBAR_VIEW_SELECTOR = '.urlbarView'; // Selector for the results container
  const HEIGHT_VARIABLE_NAME = '--urlbar-view-dynamic-height';

  let browserElement = document.getElementById(BROWSER_ELEMENT_ID);
  let urlbarElement = document.getElementById(URLBAR_ELEMENT_ID);
  let urlbarViewElement = null; // Will store the results view element when found
  let resizeObserver = null;
  let mutationObserver = null;

  // --- Function to find the Urlbar View ---
  // Needs to be robust as it might not be a direct child
  function findUrlbarViewElement() {
      if (!urlbarElement) return null;
      // First, try direct descendant of urlbar (most common)
      let view = urlbarElement.querySelector(`:scope > ${URLBAR_VIEW_SELECTOR}`);
      if (view) return view;
      // Fallback: search within the broader browser element (less specific)
      if (browserElement) {
          view = browserElement.querySelector(URLBAR_VIEW_SELECTOR);
          if (view) return view;
      }
      // Fallback: Search the whole document (least ideal)
      view = document.querySelector(URLBAR_VIEW_SELECTOR);

      // You might need to inspect the DOM in your specific FF version/theme
      // if .urlbarView isn't the right container. .urlbarView-body-outer or
      // .urlbarView-results might be needed in some cases.
      // console.log("Searching for urlbar view, found:", view);
      return view;
  }


  // --- Function to measure and update the CSS variable ---
  function updateHeightVariable() {
      if (!browserElement) return;

      // Check if urlbar is open and view element exists
      if (urlbarElement && urlbarElement.hasAttribute('open') && urlbarViewElement) {
          try {
              // getBoundingClientRect().height is often more accurate than offsetHeight
              const height = urlbarViewElement.getBoundingClientRect().height;

              if (height > 0) {
                   // console.log(`Updating ${HEIGHT_VARIABLE_NAME} to: ${height}px`);
                  browserElement.style.setProperty(HEIGHT_VARIABLE_NAME, `${height}px`);
              } else {
                  // If height is 0 (maybe transitioning out), remove the variable
                  // console.log("Urlbar view height is 0, removing variable.");
                  browserElement.style.removeProperty(HEIGHT_VARIABLE_NAME);
              }
          } catch (e) {
              console.error("DynamicUrlbarHeight Error measuring/setting height:", e);
              browserElement.style.removeProperty(HEIGHT_VARIABLE_NAME); // Reset on error
          }
      } else {
          // Urlbar is closed or view not found, remove the variable
          // console.log("Urlbar closed or view not found, removing variable.");
          browserElement.style.removeProperty(HEIGHT_VARIABLE_NAME);
      }
  }

  // --- Initialize ResizeObserver ---
  // This watches the results view itself for size changes while it's open
  function setupResizeObserver() {
      if (resizeObserver) return; // Already setup

      resizeObserver = new ResizeObserver(entries => {
          // Only update if the urlbar is still open; debounce might be needed
          // if updates are too frequent, but usually fine.
          if (urlbarElement && urlbarElement.hasAttribute('open')) {
              // console.log("ResizeObserver detected change on .urlbarView");
              window.requestAnimationFrame(updateHeightVariable); // Update smoothly
          } else {
              // Stop observing if urlbar closed unexpectedly between resize and callback
               console.log("ResizeObserver detected change, but urlbar closed. Stopping observation.");
              if (urlbarViewElement) {
                  try { resizeObserver.unobserve(urlbarViewElement); } catch(e){}
              }
          }
      });
       console.log("ResizeObserver initialized.");
  }

  // --- Initialize MutationObserver ---
  // This watches the #urlbar for the 'open' attribute
  function setupMutationObserver() {
      if (!urlbarElement || mutationObserver) return; // Need urlbar, or already setup

      mutationObserver = new MutationObserver(mutations => {
          let urlbarStateChanged = false;
          for (let mutation of mutations) {
              if (mutation.attributeName === 'open') {
                  urlbarStateChanged = true;
                  break;
              }
          }

          if (!urlbarStateChanged) return; // Only care about the 'open' attribute

          if (urlbarElement.hasAttribute('open')) {
              // --- URL Bar Opened ---
               console.log("MutationObserver: URL Bar Opened");
              // Try to find the view element *now*
              urlbarViewElement = findUrlbarViewElement();

              if (urlbarViewElement) {
                  // Update height immediately
                  updateHeightVariable();
                  // Start observing the view for resize changes
                  if (resizeObserver) {
                       try {
                          resizeObserver.observe(urlbarViewElement);
                           console.log("ResizeObserver started observing .urlbarView");
                       } catch (e) {
                           console.error("Error starting ResizeObserver:", e);
                       }
                  }
              } else {
                  console.warn("URL Bar opened, but '.urlbarView' element not found immediately.");
                  // Optionally, try again after a tiny delay
                  setTimeout(() => {
                       urlbarViewElement = findUrlbarViewElement();
                       if (urlbarViewElement && urlbarElement.hasAttribute('open')) {
                           console.log("Found .urlbarView on second attempt.");
                           updateHeightVariable();
                           if (resizeObserver) try { resizeObserver.observe(urlbarViewElement); } catch(e){}
                       } else if (urlbarElement.hasAttribute('open')) {
                            console.error("Still couldn't find .urlbarView after delay.");
                       }
                  }, 100); // 100ms delay
              }

          } else {
              // --- URL Bar Closed ---
              console.log("MutationObserver: URL Bar Closed");
              // Stop observing the (now potentially hidden) view element
              if (resizeObserver && urlbarViewElement) {
                  try {
                      resizeObserver.unobserve(urlbarViewElement);
                       console.log("ResizeObserver stopped observing .urlbarView");
                  } catch (e) {
                       // Ignore errors if element is already gone
                  }
              }
              urlbarViewElement = null; // Clear reference
              // Ensure the variable is removed
              updateHeightVariable();
          }
      });

      mutationObserver.observe(urlbarElement, { attributes: true });
      console.log("MutationObserver started observing #urlbar for 'open' attribute.");
  }


  // --- Initialization Logic ---
  function initialize() {
      browserElement = document.getElementById(BROWSER_ELEMENT_ID);
      urlbarElement = document.getElementById(URLBAR_ELEMENT_ID);

      if (!browserElement || !urlbarElement) {
          console.error("DynamicUrlbarHeight Error: #browser or #urlbar element not found. Retrying...");
          // Retry initialization after a short delay in case elements aren't ready yet
          setTimeout(initialize, 1000);
          return;
      }

      console.log("DynamicUrlbarHeight: Found #browser and #urlbar elements.");

      setupResizeObserver();
      setupMutationObserver();

      // Initial check in case the URL bar is already open when the script loads
      // (less common, but good practice)
      if (urlbarElement.hasAttribute('open')) {
           console.log("URL bar already open on script load. Performing initial check.");
          urlbarViewElement = findUrlbarViewElement();
          if (urlbarViewElement) {
              updateHeightVariable();
              if (resizeObserver) try { resizeObserver.observe(urlbarViewElement); } catch(e){}
          }
      }
  }

  // Start initialization logic
  // Use requestIdleCallback or setTimeout to ensure the DOM is more likely ready
  if (document.readyState === 'complete') {
      initialize();
  } else {
      window.addEventListener('load', initialize, { once: true });
  }

})();





// FINAL VERSION 4.7.2 (API Key from Prefs + Title>Host + No Clear Button Space)
(() => {
    // --- Configuration ---
    // --- IMPORTANT SETUP ---
    // You MUST set your Mistral API key in about:config for this script to work.
    // 1. Go to about:config in Firefox.
    // 2. Search for extensions.tab_sort.mistral_api_key
    // 3. If it doesn't exist, select 'String' and click the '+' button.
    // 4. Paste your Mistral API Key into the value field and save.
    // --- END SETUP ---
    const CONFIG = {
        apiConfig: {
            customApi: {
                enabled: true, // Enabled Custom API (Mistral)
                endpoint: 'https://api.mistral.ai/v1/chat/completions', // Mistral API endpoint
                // apiKey: 'YOUR_MISTRAL_API_KEY_HERE', // <<<--- REMOVED: Set in about:config (extensions.tab_sort.mistral_api_key)
                model: 'mistral-small-latest', // Example Mistral model, change if needed
                promptTemplateBatch: `Analyze the following numbered list of tab data (Title, URL, Description) and assign a concise category (1-2 words, Title Case) for EACH tab.
                    Some tabs might logically belong to groups already present based on common domains or topics identified by keywords.
                    
                    Tab Categorization Strategy:
                    1. For well-known platforms (GitHub, YouTube, Reddit, etc.), use the platform name as the category.
                    2. For content sites, news sites, or blogs, PRIORITIZE THE SEMANTIC MEANING OF THE TITLE over the domain.
                    3. Look for meaningful patterns and topics across titles to create logical content groups.
                    4. Use the domain name only when it's more relevant than the title content or when the title is generic.
                    
                    BE CONSISTENT: Use the EXACT SAME category name for tabs belonging to the same logical group.

                    Input Tab Data:
                    {TAB_DATA_LIST}

                    ---
                    Instructions for Output:
                    1. Output ONLY the category names.
                    2. Provide EXACTLY ONE category name per line.
                    3. The number of lines in your output MUST EXACTLY MATCH the number of tabs in the Input Tab Data list above.
                    4. DO NOT include numbering, explanations, apologies, markdown formatting, or any surrounding text like "Output:" or backticks.
                    5. Just the list of categories, separated by newlines.
                    ---

                    Output:` // Updated prompt with title-focused hybrid approach
            }
        },
        groupColors: [
            "var(--tab-group-color-blue)", "var(--tab-group-color-red)", "var(--tab-group-color-yellow)",
            "var(--tab-group-color-green)", "var(--tab-group-color-pink)", "var(--tab-group-color-purple)",
            "var(--tab-group-color-orange)", "var(--tab-group-color-cyan)", "var(--tab-group-color-gray)"
        ],
        groupColorNames: [
            "blue", "red", "yellow", "green", "pink", "purple", "orange", "cyan", "gray"
        ],
        preGroupingThreshold: 2, // Min tabs for keyword/hostname pre-grouping
        consolidationDistanceThreshold: 2, // ADDED: Max Levenshtein distance to merge similar group names
        normalizationMap: {
            'github.com': 'GitHub', 'github': 'GitHub', 'stackoverflow.com': 'Stack Overflow',
            'stack overflow': 'Stack Overflow', 'stackoverflow': 'Stack Overflow',
            'google docs': 'Google Docs', 'docs.google.com': 'Google Docs',
            'google drive': 'Google Drive', 'drive.google.com': 'Google Drive',
            'youtube.com': 'YouTube', 'youtube': 'YouTube', 'reddit.com': 'Reddit', 'reddit': 'Reddit',
            'chatgpt': 'ChatGPT', 'openai.com': 'OpenAI', 'gmail': 'Gmail', 'mail.google.com': 'Gmail',
            'aws': 'AWS', 'amazon web services': 'AWS', 'pinterest.com': 'Pinterest', 'pinterest': 'Pinterest',
            'lesnumeriques.com': 'Les Numeriques', 'actuia.com': 'Actu AI', 'twitch.tv': 'Twitch', 'twitch': 'Twitch',
            'tiktok.com': 'TikTok', 'tiktok': 'TikTok', 'instagram.com': 'Instagram', 'instagram': 'Instagram',
            'facebook.com': 'Facebook', 'facebook': 'Facebook', 'twitter.com': 'Twitter', 'twitter': 'Twitter',
            'linkedin.com': 'LinkedIn', 'linkedin': 'LinkedIn', 'x.com': 'X', 'x': 'X',
            'discord.com': 'Discord', 'discord': 'Discord', 'steamcommunity.com': 'Steam', 'steam': 'Steam',
            'epicgames.com': 'Epic Games', 'epicgames': 'Epic Games', 'twitch.tv': 'Twitch', 'twitch': 'Twitch',
            'theverge.com': 'The Verge', 'the verge': 'The Verge', 'theguardian.com': 'The Guardian', 'the guardian': 'The Guardian',
            'google.com': 'Google', 'google': 'Google', 'reddit.com': 'Reddit', 'old.reddit.com': 'Reddit', 'presse-citron.net': 'Presse Citron',
            'mistral.ai': 'Mistral', 'mistral': 'Mistral', 'openai.com': 'OpenAI', 'openai': 'OpenAI',
            
            // Add more hostnames and common phrases you want normalized
        },
        titleKeywordStopWords: new Set([
            'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'of',
            'is', 'am', 'are', 'was', 'were', 'be', 'being', 'been', 'has', 'have', 'had', 'do', 'does', 'did',
            'how', 'what', 'when', 'where', 'why', 'which', 'who', 'whom', 'whose',
            'new', 'tab', 'untitled', 'page', 'home', 'com', 'org', 'net', 'io', 'dev', 'app',
            'get', 'set', 'list', 'view', 'edit', 'create', 'update', 'delete',
            'my', 'your', 'his', 'her', 'its', 'our', 'their', 'me', 'you', 'him', 'her', 'it', 'us', 'them',
            'about', 'search', 'results', 'posts', 'index', 'dashboard', 'profile', 'settings',
            'official', 'documentation', 'docs', 'wiki', 'help', 'support', 'faq', 'guide',
            'error', 'login', 'signin', 'sign', 'up', 'out', 'welcome', 'loading', 
            // French stop words
            'que', 'le', 'la', 'un', 'une', 'des', 'du', 'de', 'les', 'l\'', 'pour', 'qui', 'ce', 'cette', 'ces', 
            'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'son', 'sa', 'ses', 'notre', 'nos', 'votre', 'vos', 'leur', 'leurs', 
            'et', 'ou', 'mais', 'donc', 'car', 'ni', 'dans', 'sur', 'sous', 'avec', 'sans', 'chez', 'par', 'vers', 'depuis',
            'pendant', 'avant', 'après', 'devant', 'derrière', 'entre', 'parmi', 'selon', 'je', 'tu', 'il', 'elle',
            'nous', 'vous', 'ils', 'elles', 'moi', 'toi', 'lui', 'eux', 'celui', 'celle', 'ceux', 'celles', 'dont',
            'où', 'quand', 'comment', 'pourquoi', 'quel', 'quelle', 'quels', 'quelles', 'lequel', 'laquelle', 'lesquels',
            'lesquelles', 'auquel', 'auxquels', 'auxquelles', 'duquel', 'desquels', 'desquelles',
            // Additional French stop words
            'peut', 'peuvent', 'pourrait', 'pourraient', 'doit', 'doivent', 'devrait', 'devraient',
            'est', 'sont', 'sera', 'seront', 'être', 'était', 'étaient', 'été',
            'fait', 'font', 'fera', 'feront', 'faire', 'faisait', 'faisaient', 'fait',
            'comme', 'ainsi', 'alors', 'aussi', 'autre', 'autres', 'aux', 'avoir',
            'bon', 'bien', 'beaucoup', 'cela', 'ces', 'chaque', 'deux', 'dire',
            'encore', 'enfin', 'fois', 'grand', 'ici', 'juste', 'même', 'moins',
            'nouveau', 'nouvelle', 'maintenant', 'peu', 'plus', 'presque', 'quelque', 'quelques',
            'sans', 'seulement', 'si', 'soit', 'toujours', 'tous', 'tout', 'toute', 'toutes', 'très',
            'trop', 'tellement', 'voici', 'voilà', 'voir', 'veut', 'vouloir', 'voulait', 'vont',
            // Add more common/noisy words specific to your browsing habits if needed
        ]),
        minKeywordLength: 3, // Minimum length for a word to be considered a keyword
        // --- Styles (v4.7.1 - Removed space for clear button) ---
        styles: `
            #sort-button, #clear-button {
                font-size: 11px;
                width: 45px;
                appearance: none;
                padding: 1px;
                color: rgba(255, 255, 255, 0.6); /* Slightly more visible default */
                flex-shrink: 0;
                margin-left: 2px;
            }
            #sort-button.hidden-button, #clear-button.hidden-button {
                display: none !important;
                pointer-events: none !important;
            }
            #sort-button label, #clear-button label {
                display: block;
                font-weight: 600;
            }
            #sort-button:hover, #clear-button:hover {
                color: white;
                border-radius: 4px;
            }
            .vertical-pinned-tabs-container-separator {
                 display: flex;
                 flex-direction: row;
                 margin-left: 0;
                 justify-content: flex-end;
                 align-items: center;
            }
            .vertical-pinned-tabs-container-separator.has-no-sortable-tabs #sort-button,
            .vertical-pinned-tabs-container-separator.has-no-sortable-tabs #clear-button {
                 display: none !important;
                 pointer-events: none;
            }
            .vertical-pinned-tabs-container-separator svg.separator-line-svg {
                flex-grow: 1;
            }
            @keyframes loading-pulse-tab {
                0%, 100% { opacity: 0.6; }
                50% { opacity: 1; }
            }
            .tab-is-sorting .tab-icon-image,
            .tab-is-sorting .tab-label {
                animation: loading-pulse-tab 1.5s ease-in-out infinite;
                will-change: opacity;
            }
            
            tab-group {
                transition: background-color 0.3s ease;
            }
            /* Broom brushing animation */
            @keyframes brush-sweep {
              0% { transform: rotate(0deg); }
              20% { transform: rotate(-15deg); }
              40% { transform: rotate(15deg); }
              60% { transform: rotate(-15deg); }
              80% { transform: rotate(15deg); }  
              100% { transform: rotate(0deg); }
            }
            
            #sort-button.brushing .broom-icon {
              animation: brush-sweep 0.8s ease-in-out;
              transform-origin: 50% 50%; /* Center of broom */
            }
            
            /* Arrow animation for clear button */
            @keyframes arrow-pulse {
              0% { transform: scale(1); }
              50% { transform: scale(1.2); }
              100% { transform: scale(1); }
            }
            
            #clear-button.clearing .arrow-icon {
              animation: arrow-pulse 0.6s ease-in-out;
            }

            /* Default styles (Dark theme assumed) */
            #sort-button, #clear-button {
                color: rgba(255, 255, 255, 0.6); /* Slightly more visible default */
            }
            #sort-button:hover, #clear-button:hover {
                color: white;
            }
            .separator-path-segment {
                stroke: rgba(255, 255, 255, 0.3); /* Default stroke for dark theme */
            }

            /* Light Theme Overrides */
            [lwt-toolbar="light"] #sort-button,
            [lwt-toolbar="light"] #clear-button {
                color: rgba(0, 0, 0, 0.6);
            }
            [lwt-toolbar="light"] #sort-button:hover,
            [lwt-toolbar="light"] #clear-button:hover {
                color: black;
            }
            [lwt-toolbar="light"] .separator-path-segment {
                 stroke: rgba(0, 0, 0, 0.2); /* Stroke for light theme */
            }
        `
    };

    // --- Globals & State ---
    let groupColorIndex = 0;
    let isSorting = false;
    let isClearing = false;
    let sortButtonListenerAdded = false;
    let clearButtonListenerAdded = false;
    let sortAnimationId = null; // Added for animation control

    // --- Helper Functions ---

    const injectStyles = () => {
        if (document.getElementById('tab-sort-styles')) {
            // If styles exist, update them in case the config changed
            const styleElement = document.getElementById('tab-sort-styles');
            if (styleElement.textContent !== CONFIG.styles) {
                 styleElement.textContent = CONFIG.styles;
                 console.log("SORT BTN: Styles updated.");
            }
            return;
        }
        // If styles don't exist, create and append
        const style = Object.assign(document.createElement('style'), {
            id: 'tab-sort-styles',
            textContent: CONFIG.styles
        });
        document.head.appendChild(style);
        console.log("SORT BTN: Styles injected.");
    };

    const getTabData = (tab) => {
        if (!tab || !tab.isConnected) {
            return { title: 'Invalid Tab', url: '', hostname: '', description: '' };
        }
        let title = 'Untitled Page';
        let fullUrl = '';
        let hostname = '';
        let description = '';
        try {
            const originalTitle = tab.getAttribute('label') || tab.querySelector('.tab-label, .tab-text')?.textContent || '';
            const browser = tab.linkedBrowser || tab._linkedBrowser || gBrowser?.getBrowserForTab?.(tab);
            if (browser?.currentURI?.spec && !browser.currentURI.spec.startsWith('about:')) {
                try {
                    const currentURL = new URL(browser.currentURI.spec);
                    fullUrl = currentURL.href;
                    hostname = currentURL.hostname.replace(/^www\./, '');
                } catch (e) {
                    hostname = 'Invalid URL';
                    fullUrl = browser?.currentURI?.spec || 'Invalid URL';
                }
            } else if (browser?.currentURI?.spec) {
                fullUrl = browser.currentURI.spec;
                hostname = 'Internal Page';
            }
            if (!originalTitle || originalTitle === 'New Tab' || originalTitle === 'about:blank' || originalTitle === 'Loading...' || originalTitle.startsWith('http:') || originalTitle.startsWith('https:')) {
                if (hostname && hostname !== 'Invalid URL' && hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== 'Internal Page') {
                    title = hostname;
                } else {
                    try {
                        const pathSegment = new URL(fullUrl).pathname.split('/')[1];
                        if (pathSegment) title = pathSegment;
                    } catch { /* ignore */ }
                }
            } else { title = originalTitle.trim(); }
            title = title || 'Untitled Page';
            try {
                if (browser && browser.contentDocument) {
                    const metaDescElement = browser.contentDocument.querySelector('meta[name="description"]');
                    if (metaDescElement) {
                        description = metaDescElement.getAttribute('content')?.trim() || '';
                        description = description.substring(0, 200);
                    }
                }
            } catch (contentError) { /* ignore permission errors */ }
        } catch (e) {
            console.error('Error getting tab data for tab:', tab, e);
            title = 'Error Processing Tab';
        }
        return { title: title, url: fullUrl, hostname: hostname || 'N/A', description: description || 'N/A' };
    };

    const toTitleCase = (str) => {
        if (!str) return ""; // Added guard for null/undefined input
        return str.toLowerCase()
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    };

    // Regex for common TLDs (Top-Level Domains)
    const tldRegex = /\.(com|org|net|gouv|fr|io|dev|ai|tv|app|uk|de|jp|info|biz|me|eu|net|org|io|ai|co|tech|site|online|space|store|blog|news|agency|zone|xyz|pdf|html|php|aspx|jsp|xml|json|css|js|ca|au|in|cn|ru|br|it|es|nl|se|no|fi|dk|pl|ch|at|be|pt|gr|cz|hu|ro|sk|si|lt|lv|ee|ua|tr|il|za|mx|ar|cl|co|pe|ve|kr|my|sg|th|vn|id|ph|hk|tw|sa|ae|eg|ng|jp|pdf|to)$/i;

    const processTopic = (text) => {
        if (!text) return "Uncategorized";

        const originalTextTrimmedLower = text.trim().toLowerCase();
        // Use the map defined in CONFIG
        const normalizationMap = CONFIG.normalizationMap || {};

        if (normalizationMap[originalTextTrimmedLower]) {
            return normalizationMap[originalTextTrimmedLower];
        }

        let processedText = text.replace(/^(Category is|The category is|Topic:)\\s*"?/i, '');
        processedText = processedText.replace(/^\\s*[\\d.*-]+\\s*/, '');
        // Keep TLD removal logic from original tab_sort.uc.js
        processedText = processedText.trim().replace(tldRegex, '');
        let words = processedText.trim().split(/\\s+/);
        let category = words.slice(0, 2).join(' ');
        category = category.replace(/["'*().:;,]/g, '');

        return toTitleCase(category).substring(0, 40) || "Uncategorized";
    };

    const extractTitleKeywords = (title) => {
        if (!title || typeof title !== 'string') {
            return new Set();
        }
        
        // Improved title keyword extraction:
        // 1. Clean the title more thoroughly
        // 2. Handle common title patterns (questions, lists)
        // 3. Preserve multi-word concepts when possible
        
        const cleanedTitle = title.toLowerCase()
            .replace(/[-_]/g, ' ') // Treat dash/underscore as space
            .replace(/[^\w\s']/g, '') // Remove punctuation EXCEPT apostrophes
            .replace(/\s+/g, ' ').trim(); // Normalize spaces
            
        // Detect if title is a question - these are often important
        const isQuestion = /^(how|what|why|when|where|who|which|is|are|can|could|should|will|would|did|do)\b/i.test(title);
        
        // Split into words, but keep track of bigrams (2-word phrases) that might be meaningful
        const words = cleanedTitle.split(' ');
        const keywords = new Set();
        const bigrams = [];
        
        // First collect possible bigrams (2-word phrases)
        for (let i = 0; i < words.length - 1; i++) {
            if (words[i].length >= CONFIG.minKeywordLength && 
                words[i+1].length >= CONFIG.minKeywordLength && 
                !CONFIG.titleKeywordStopWords.has(words[i]) && 
                !CONFIG.titleKeywordStopWords.has(words[i+1])) {
                bigrams.push(`${words[i]} ${words[i+1]}`);
            }
        }
        
        // Add individual words as keywords
        for (const word of words) {
            // Give questions higher priority by adding question words if it's a question
            if (isQuestion && /^(how|what|why|when|where|who|which)\b/i.test(word)) {
                keywords.add(word); // Always include question words for questions
            }
            
            if (word.length >= CONFIG.minKeywordLength && 
                !CONFIG.titleKeywordStopWords.has(word) && 
                !/^\d+$/.test(word)) {
                keywords.add(word);
            }
        }
        
        // Add relevant bigrams
        for (const bigram of bigrams) {
            keywords.add(bigram);
        }
        
        return keywords;
    };

    const levenshteinDistance = (a, b) => {
        if (!a || !b) return Math.max(a?.length ?? 0, b?.length ?? 0);
        a = a.toLowerCase();
        b = b.toLowerCase();
        if (a.length === 0) return b.length;
        if (b.length === 0) return a.length;

        const matrix = [];
        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,     // Deletion
                    matrix[i][j - 1] + 1,     // Insertion
                    matrix[i - 1][j - 1] + cost // Substitution
                );
            }
        }
        return matrix[b.length][a.length];
    };

    const getNextGroupColorName = () => {
        const colorName = CONFIG.groupColorNames[groupColorIndex % CONFIG.groupColorNames.length];
        groupColorIndex++;
        return colorName;
    };

    const findGroupElement = (topicName, workspaceId) => {
        const sanitizedTopicName = topicName.trim();
        if (!sanitizedTopicName) return null;
        const safeSelectorTopicName = sanitizedTopicName.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        try {
            return document.querySelector(`tab-group[label="${safeSelectorTopicName}"][zen-workspace-id="${workspaceId}"]`);
        } catch (e) {
            console.error(`Error finding group selector: tab-group[label="${safeSelectorTopicName}"]...`, e);
            return null;
        }
    };

    // --- AI Interaction ---
    const askAIForMultipleTopics = async (tabs, existingCategoryNames = []) => {
        const validTabs = tabs.filter(tab => tab && tab.isConnected);
        if (!validTabs || validTabs.length === 0) {
            return [];
        }

        console.log(`Batch AI (Mistral): Requesting categories for ${validTabs.length} tabs, considering ${existingCategoryNames.length} existing categories...`);
        validTabs.forEach(tab => tab.classList.add('tab-is-sorting'));

        const { customApi } = CONFIG.apiConfig;
        let result = [];
        let apiKey = null; // Variable to hold the API key

        try {
            if (!customApi.enabled) {
                console.warn("Mistral API is disabled in config. Skipping AI categorization.");
                return validTabs.map(tab => ({ tab, topic: "Uncategorized" }));
            }

            // --- Get API Key from Firefox Preferences --- 
            try {
                const prefService = Components.classes["@mozilla.org/preferences-service;1"]
                                         .getService(Components.interfaces.nsIPrefService)
                                         .getBranch("extensions.tab_sort."); 
                apiKey = prefService.getStringPref("mistral_api_key", ""); 

                if (!apiKey) {
                     console.warn("API key preference 'extensions.tab_sort.mistral_api_key' is empty or not found.");
                }
            } catch (prefError) {
                console.error("Failed to read API key preference 'extensions.tab_sort.mistral_api_key' using Cc/Ci. Ensure Components object is available.", prefError);
                apiKey = ""; 
            }

            if (!apiKey) {
                 throw new Error("Mistral API Key is not configured in about:config (extensions.tab_sort.mistral_api_key). Please set it.");
            }
            // --- End API Key Retrieval --- 

            const tabDataArray = validTabs.map(getTabData);
            
            // Enhanced tab data formatting that emphasizes titles and extracts key concepts
            const formattedTabDataList = tabDataArray.map((data, index) => {
                // Extract keywords from title for additional context
                const titleKeywords = data.title ? Array.from(extractTitleKeywords(data.title)) : [];
                const keywordPhrase = titleKeywords.length > 0 ? 
                    `\nKey Concepts: ${titleKeywords.join(', ')}` : '';
                
                // Format the tab data with title prominently displayed
                return `${index + 1}.\n📝 TITLE: "${data.title}"${keywordPhrase}\n🔗 URL: "${data.url}"\n🌐 Domain: "${data.hostname}"\n📄 Description: "${data.description}"`;
            }).join('\n\n');

            // --- Format existing categories for the prompt --- 
            const formattedExistingCategories = existingCategoryNames.length > 0
                ? `\nExisting Categories:\n${existingCategoryNames.map(name => `- ${name}`).join('\n')}`
                : "\nNo existing categories.";
            // --- End Format --- 

            let apiUrl, headers, requestBody, prompt;

            console.log(`Using Mistral API: ${customApi.endpoint}`);
            apiUrl = customApi.endpoint;
            headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}` 
            };
            
            // --- Inject existing categories into the prompt --- 
            prompt = customApi.promptTemplateBatch
                .replace("{EXISTING_CATEGORIES_LIST}", formattedExistingCategories)
                .replace("{TAB_DATA_LIST}", formattedTabDataList);
            // --- End Injection --- 
            
            requestBody = {
                model: customApi.model,
                messages: [
                    { role: "user", content: prompt }
                ],
                temperature: 0.2,
                max_tokens: validTabs.length * 15, 
                stream: false
            };

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text().catch(() => 'Unknown API error reason');
                throw new Error(`Mistral API Error ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            const aiText = data.choices?.[0]?.message?.content?.trim();

            if (!aiText) {
                throw new Error("Empty API response from Mistral");
            }
            console.log("Mistral Raw Response Text:\n---\n", aiText, "\n---"); // Log raw response

            const lines = aiText.split('\n').map(line => line.trim()).filter(Boolean);

            if (lines.length !== validTabs.length) {
                console.warn(`Batch AI (Mistral): Mismatch! Expected ${validTabs.length} topics, received ${lines.length}.`);
                 if (validTabs.length === 1 && lines.length > 0) {
                    const firstLineTopic = processTopic(lines[0]);
                    console.warn(` -> Mismatch Correction (Single Tab): Using first line "${lines[0]}" -> Topic: "${firstLineTopic}"`);
                    result = [{ tab: validTabs[0], topic: firstLineTopic }];
                 } else if (lines.length > validTabs.length) {
                     console.warn(` -> Mismatch Correction (Too Many Lines): Truncating response to ${validTabs.length} lines.`);
                     const processedTopics = lines.slice(0, validTabs.length).map(processTopic);
                     result = validTabs.map((tab, index) => ({ tab: tab, topic: processedTopics[index] }));
                 } else {
                     console.warn(` -> Fallback (Too Few Lines): Assigning remaining tabs "Uncategorized".`);
                     const processedTopics = lines.map(processTopic);
                     result = validTabs.map((tab, index) => ({
                         tab: tab,
                         topic: index < processedTopics.length ? processedTopics[index] : "Uncategorized"
                     }));
                 }
            } else {
                const processedTopics = lines.map(processTopic);
                console.log("Batch AI (Mistral): Processed Topics:", processedTopics);
                result = validTabs.map((tab, index) => ({
                    tab: tab,
                    topic: processedTopics[index]
                }));
            }

            return result;

        } catch (error) {
            console.error("Batch AI (Mistral): Error getting topics:", error);
             if (error.message.includes("Mistral API Key is not configured")) {
                alert("Mistral API Key is missing or incorrect. Please configure it in about:config (key: extensions.tab_sort.mistral_api_key). Tab sorting via AI is disabled.");
             } 
            return validTabs.map(tab => ({ tab, topic: "Uncategorized" }));
        } finally {
            setTimeout(() => {
                 validTabs.forEach(tab => {
                     if (tab && tab.isConnected) {
                         tab.classList.remove('tab-is-sorting');
                     }
                 });
             }, 200);
        }
    };

    // --- Main Sorting Function ---
    const sortTabsByTopic = async () => {
        if (isSorting) {
            console.log("Sorting already in progress.");
            return;
        }
        isSorting = true;
        console.log("Starting tab sort (v4.9.2 logic + Animation)..."); // Indicate logic source

        let separatorsToSort = []; // Keep track of separators to remove class later
        try {
             separatorsToSort = document.querySelectorAll('.vertical-pinned-tabs-container-separator');
             // Apply visual indicator - Pulsing BG from tab_sort_clear.uc.js styles
             if(separatorsToSort.length > 0) {
                 console.log("Applying sorting indicator (pulse) to separator(s)...");
                 separatorsToSort.forEach(sep => sep.classList.add('separator-is-sorting')); // Use the pulse class
             } else {
                  console.warn("Could not find separator element to apply sorting indicator.");
             }

            const currentWorkspaceId = window.gZenWorkspaces?.activeWorkspace;
            if (!currentWorkspaceId) {
                console.error("Cannot get current workspace ID.");
                return; // Exit early
            }

            // --- Step 1: Get ALL Existing Group Names for Context ---
            const allExistingGroupNames = new Set();
            const groupSelector = `tab-group:has(tab[zen-workspace-id="${currentWorkspaceId}"])`;
            console.log("Querying for groups using selector:", groupSelector);

            document.querySelectorAll(groupSelector).forEach(groupEl => {
                const label = groupEl.getAttribute('label');
                if (label) {
                    allExistingGroupNames.add(label);
                } else {
                    console.log("Group element found, but missing label attribute:", groupEl);
                }
            });
            console.log(`Found ${allExistingGroupNames.size} existing group names for context:`, Array.from(allExistingGroupNames));

            // --- Filter initial tabs --- 
            const initialTabsToSort = Array.from(gBrowser.tabs).filter(tab => {
                const isInCorrectWorkspace = tab.getAttribute('zen-workspace-id') === currentWorkspaceId;
                const groupParent = tab.closest('tab-group');
                const isInGroupInCorrectWorkspace = groupParent ? groupParent.matches(groupSelector) : false;

                return isInCorrectWorkspace &&
                       !tab.pinned &&
                       !tab.hasAttribute('zen-empty-tab') &&
                       !tab.hasAttribute('zen-glance-tab') && // ADDED: Exclude glance tabs
                       !isInGroupInCorrectWorkspace &&
                       tab.isConnected;
            });

            if (initialTabsToSort.length === 0) {
                console.log("No ungrouped, connected tabs to sort in this workspace.");
                return; // Exit early
            }
            console.log(`Found ${initialTabsToSort.length} potentially sortable tabs.`);

            // --- Pre-Grouping Logic --- 
            const preGroups = {};
            const handledTabs = new Set();
            const tabDataCache = new Map();
            const tabKeywordsCache = new Map();

            initialTabsToSort.forEach(tab => {
                const data = getTabData(tab);
                tabDataCache.set(tab, data);
                tabKeywordsCache.set(tab, data.title ? extractTitleKeywords(data.title) : new Set());
            });

            // First identify well-known domains that should always be grouped together
            const wellKnownDomains = new Set(
                Object.keys(CONFIG.normalizationMap)
                .filter(key => key.includes('.com') || key.includes('.org') || key.includes('.net'))
            );
            
            // Domain pre-grouping for well-known domains - always prioritize these
            const domainsToProcess = new Set();
            initialTabsToSort.forEach(tab => {
                if (!handledTabs.has(tab)) {
                    const data = tabDataCache.get(tab);
                    const hostname = data?.hostname || '';
                    if (hostname && hostname !== 'N/A' && hostname !== 'Invalid URL' && hostname !== 'Internal Page') {
                        if (wellKnownDomains.has(hostname)) {
                            domainsToProcess.add(hostname);
                        }
                    }
                }
            });
            
            // Process well-known domains first
            domainsToProcess.forEach(hostname => {
                const categoryName = processTopic(hostname);
                const matchingTabs = [];
                
                initialTabsToSort.forEach(tab => {
                    if (!handledTabs.has(tab)) {
                        const data = tabDataCache.get(tab);
                        if (data?.hostname === hostname) {
                            matchingTabs.push(tab);
                        }
                    }
                });
                
                if (matchingTabs.length > 0) {
                    console.log(`   - Pre-Grouping by Well-Known Domain: "${hostname}" (Count: ${matchingTabs.length}) -> Category: "${categoryName}"`);
                    preGroups[categoryName] = matchingTabs;
                    matchingTabs.forEach(tab => handledTabs.add(tab));
                }
            });

            // Keyword pre-grouping for content tabs
            const keywordToTabsMap = new Map();
            initialTabsToSort.forEach(tab => {
                if (!handledTabs.has(tab)) {
                    const keywords = tabKeywordsCache.get(tab);
                    if (keywords) {
                        keywords.forEach(keyword => {
                            // Prioritize longer keywords and phrases (likely more meaningful)
                            if (keyword.includes(' ') || keyword.length > 5) {
                                if (!keywordToTabsMap.has(keyword)) {
                                    keywordToTabsMap.set(keyword, new Set());
                                }
                                keywordToTabsMap.get(keyword).add(tab);
                            }
                        });
                    }
                }
            });

            const potentialKeywordGroups = [];
            keywordToTabsMap.forEach((tabsSet, keyword) => {
                if (tabsSet.size >= CONFIG.preGroupingThreshold) {
                    potentialKeywordGroups.push({ keyword, tabs: tabsSet, size: tabsSet.size });
                }
            });
            
            // Sort by most meaningful keywords first (longer or multi-word)
            potentialKeywordGroups.sort((a, b) => {
                // First prioritize by number of tabs
                if (b.size !== a.size) return b.size - a.size;
                
                // Then by whether it's a multi-word phrase
                const aIsPhrase = a.keyword.includes(' ');
                const bIsPhrase = b.keyword.includes(' ');
                if (aIsPhrase !== bIsPhrase) return aIsPhrase ? -1 : 1;
                
                // Then by length of keyword
                return b.keyword.length - a.keyword.length;
            });

            potentialKeywordGroups.forEach(({ keyword, tabs }) => {
                const finalTabsForGroup = new Set();
                tabs.forEach(tab => {
                    if (!handledTabs.has(tab)) {
                        finalTabsForGroup.add(tab);
                    }
                });
                if (finalTabsForGroup.size >= CONFIG.preGroupingThreshold) {
                    const categoryName = processTopic(keyword);
                    console.log(`   - Pre-Grouping by Title Keyword: "${keyword}" (Count: ${finalTabsForGroup.size}) -> Category: "${categoryName}"`);
                    preGroups[categoryName] = Array.from(finalTabsForGroup);
                    finalTabsForGroup.forEach(tab => handledTabs.add(tab));
                }
            });

            // Regular hostname pre-grouping for remaining tabs
            const hostnameCounts = {};
            initialTabsToSort.forEach(tab => {
                if (!handledTabs.has(tab)) {
                    const data = tabDataCache.get(tab);
                    if (data?.hostname && data.hostname !== 'N/A' && data.hostname !== 'Invalid URL' && data.hostname !== 'Internal Page') {
                        hostnameCounts[data.hostname] = (hostnameCounts[data.hostname] || 0) + 1;
                    }
                }
            });

            const sortedHostnames = Object.keys(hostnameCounts).sort((a, b) => hostnameCounts[b] - hostnameCounts[a]);

            for (const hostname of sortedHostnames) {
                if (hostnameCounts[hostname] >= CONFIG.preGroupingThreshold) {
                    const categoryName = processTopic(hostname);
                    if (preGroups[categoryName]) {
                        console.log(`   - Skipping Hostname Group for "${hostname}" -> Category "${categoryName}" (already exists from keywords).`);
                        continue;
                    }
                    const tabsForHostnameGroup = [];
                    initialTabsToSort.forEach(tab => {
                        if (!handledTabs.has(tab)) {
                            const data = tabDataCache.get(tab);
                            if (data?.hostname === hostname) {
                                tabsForHostnameGroup.push(tab);
                            }
                        }
                    });
                    if (tabsForHostnameGroup.length >= CONFIG.preGroupingThreshold) {
                        console.log(`   - Pre-Grouping by Hostname: "${hostname}" (Count: ${tabsForHostnameGroup.length}) -> Category: "${categoryName}"`);
                        preGroups[categoryName] = tabsForHostnameGroup;
                        tabsForHostnameGroup.forEach(tab => handledTabs.add(tab));
                    }
                }
            }
            // --- End Pre-Grouping --- 

            // --- AI Grouping --- 
            const tabsForAI = initialTabsToSort.filter(tab => !handledTabs.has(tab) && tab.isConnected);
            let aiTabTopics = [];
            const comprehensiveExistingNames = new Set([...allExistingGroupNames, ...Object.keys(preGroups)]);
            const existingNamesForAIContext = Array.from(comprehensiveExistingNames);

            if (tabsForAI.length > 0) {
                console.log(` -> ${tabsForAI.length} tabs remaining for AI analysis. Providing ${existingNamesForAIContext.length} existing categories as context.`);
                // Call our existing askAIForMultipleTopics, passing context
                aiTabTopics = await askAIForMultipleTopics(tabsForAI, existingNamesForAIContext); 
            } else {
                console.log(" -> No tabs remaining for AI analysis.");
            }
            // --- End AI Grouping --- 

            // --- Combine Groups --- 
            const finalGroups = { ...preGroups };
            aiTabTopics.forEach(({ tab, topic }) => {
                if (!topic || topic === "Uncategorized" || !tab || !tab.isConnected) {
                    if (topic && topic !== "Uncategorized") {
                         console.warn(` -> AI suggested category "${topic}" but associated tab is invalid/disconnected.`);
                    }
                    return; 
                }
                if (!finalGroups[topic]) {
                    finalGroups[topic] = [];
                }
                if (!handledTabs.has(tab)) {
                    finalGroups[topic].push(tab);
                    handledTabs.add(tab); 
                } else {
                    const originalGroup = Object.keys(preGroups).find(key => preGroups[key].includes(tab));
                    console.warn(` -> AI suggested category "${topic}" for tab "${getTabData(tab).title}", but it was already pre-grouped under "${originalGroup || 'Unknown Pre-Group'}". Keeping pre-grouped assignment.`);
                }
            });
            // --- End Combine Groups --- 

            // --- Consolidate Similar Category Names --- 
            console.log(" -> Consolidating potential duplicate categories...");
            const originalKeys = Object.keys(finalGroups);
            const mergedKeys = new Set();
            const consolidationMap = {}; 

            for (let i = 0; i < originalKeys.length; i++) {
                let keyA = originalKeys[i];
                if (mergedKeys.has(keyA)) continue; 
                while (consolidationMap[keyA]) {
                    keyA = consolidationMap[keyA];
                }
                 if (mergedKeys.has(keyA)) continue; 

                for (let j = i + 1; j < originalKeys.length; j++) {
                    let keyB = originalKeys[j];
                    if (mergedKeys.has(keyB)) continue;
                    while (consolidationMap[keyB]) {
                        keyB = consolidationMap[keyB];
                    }
                     if (mergedKeys.has(keyB) || keyA === keyB) continue; 

                    const distance = levenshteinDistance(keyA, keyB);
                    const threshold = CONFIG.consolidationDistanceThreshold;

                    if (distance <= threshold && distance > 0) {
                        let canonicalKey = keyA;
                        let mergedKey = keyB;
                        const keyAIsActuallyExisting = allExistingGroupNames.has(keyA);
                        const keyBIsActuallyExisting = allExistingGroupNames.has(keyB);
                        const keyAIsPreGroup = keyA in preGroups;
                        const keyBIsPreGroup = keyB in preGroups;

                        if (keyBIsActuallyExisting && !keyAIsActuallyExisting) {
                            [canonicalKey, mergedKey] = [keyB, keyA];
                        } else if (keyAIsActuallyExisting && keyBIsActuallyExisting) {
                             if (keyBIsPreGroup && !keyAIsPreGroup) [canonicalKey, mergedKey] = [keyB, keyA];
                             else if (keyA.length > keyB.length) [canonicalKey, mergedKey] = [keyB, keyA];
                        } else if (!keyAIsActuallyExisting && !keyBIsActuallyExisting) {
                             if (keyBIsPreGroup && !keyAIsPreGroup) [canonicalKey, mergedKey] = [keyB, keyA];
                             else if (keyA.length > keyB.length) [canonicalKey, mergedKey] = [keyB, keyA];
                        }

                        console.log(`    - Consolidating: Merging "${mergedKey}" into "${canonicalKey}" (Distance: ${distance})`);
                        if (finalGroups[mergedKey]) {
                            if (!finalGroups[canonicalKey]) finalGroups[canonicalKey] = [];
                            const uniqueTabsToAdd = finalGroups[mergedKey].filter(tab =>
                                tab && tab.isConnected && !finalGroups[canonicalKey].some(existingTab => existingTab === tab)
                            );
                            finalGroups[canonicalKey].push(...uniqueTabsToAdd);
                        }
                        mergedKeys.add(mergedKey); 
                        consolidationMap[mergedKey] = canonicalKey; 
                        delete finalGroups[mergedKey]; 
                        if (mergedKey === keyA) {
                            keyA = canonicalKey;
                            break; 
                        }
                    }
                }
            }
            console.log(" -> Consolidation complete.");
            // --- End Consolidation --- 

            console.log(" -> Final Consolidated groups:", Object.keys(finalGroups).map(k => `${k} (${finalGroups[k]?.length ?? 0})`).join(', '));
            if (Object.keys(finalGroups).length === 0) {
                console.log("No valid groups identified after consolidation. Sorting finished.");
                return; 
            }

            // --- Get existing group ELEMENTS --- 
            const existingGroupElementsMap = new Map();
            document.querySelectorAll(groupSelector).forEach(groupEl => { 
                const label = groupEl.getAttribute('label');
                if (label) {
                    existingGroupElementsMap.set(label, groupEl);
                }
            });

            groupColorIndex = 0;

            // --- Process each final, consolidated group --- 
            for (const topic in finalGroups) {
                const tabsForThisTopic = finalGroups[topic].filter(t => {
                    const groupParent = t.closest('tab-group');
                    const isInGroupInCorrectWorkspace = groupParent ? groupParent.matches(groupSelector) : false;
                    return t && t.isConnected && !isInGroupInCorrectWorkspace;
                 });

                if (tabsForThisTopic.length === 0) {
                    console.log(` -> Skipping group "${topic}" as no valid, *ungrouped* tabs remain in this workspace.`);
                    continue; 
                }

                const existingGroupElement = existingGroupElementsMap.get(topic);

                if (existingGroupElement && existingGroupElement.isConnected) { 
                    console.log(` -> Moving ${tabsForThisTopic.length} tabs to existing group "${topic}".`);
                    try {
                        if (existingGroupElement.getAttribute("collapsed") === "true") {
                            existingGroupElement.setAttribute("collapsed", "false");
                            const groupLabelElement = existingGroupElement.querySelector('.tab-group-label');
                            if (groupLabelElement) {
                                groupLabelElement.setAttribute('aria-expanded', 'true'); 
                            }
                        }
                        for (const tab of tabsForThisTopic) {
                            const groupParent = tab.closest('tab-group');
                            const isInGroupInCorrectWorkspace = groupParent ? groupParent.matches(groupSelector) : false;
                            if (tab && tab.isConnected && !isInGroupInCorrectWorkspace) {
                                gBrowser.moveTabToGroup(tab, existingGroupElement);
                            } else {
                                console.warn(` -> Tab "${getTabData(tab)?.title || 'Unknown'}" skipped moving to "${topic}" (already grouped or invalid).`);
                            }
                        }
                    } catch (e) {
                        console.error(`Error moving tabs to existing group "${topic}":`, e, existingGroupElement);
                    }
                } else {
                    if (existingGroupElement && !existingGroupElement.isConnected) {
                        console.warn(` -> Existing group element for "${topic}" was found in map but is no longer connected to DOM. Will create a new group.`);
                    }

                    const wasOriginallyPreGroup = topic in preGroups;
                    const wasDirectlyFromAI = aiTabTopics.some(ait => ait.topic === topic && tabsForThisTopic.includes(ait.tab));

                    if (tabsForThisTopic.length >= CONFIG.preGroupingThreshold || wasDirectlyFromAI || wasOriginallyPreGroup) {
                        console.log(` -> Creating new group "${topic}" with ${tabsForThisTopic.length} tabs.`);
                        const firstValidTabForGroup = tabsForThisTopic[0]; 
                        const groupOptions = {
                            label: topic,
                            color: getNextGroupColorName(),
                            insertBefore: firstValidTabForGroup 
                        };
                        try {
                            const newGroup = gBrowser.addTabGroup(tabsForThisTopic, groupOptions);
                            if (newGroup && newGroup.isConnected) { 
                                console.log(` -> Successfully created group element for "${topic}".`);
                                existingGroupElementsMap.set(topic, newGroup); 
                            } else {
                                console.warn(` -> addTabGroup didn't return a connected element for "${topic}". Attempting fallback find.`);
                                // Use the CORRECT findGroupElement helper from clear script (needs to be added/updated)
                                const newGroupElFallback = findGroupElement(topic, currentWorkspaceId);
                                if (newGroupElFallback && newGroupElFallback.isConnected) {
                                    console.log(` -> Found new group element for "${topic}" via fallback.`);
                                    existingGroupElementsMap.set(topic, newGroupElFallback);
                                } else {
                                    console.error(` -> Failed to find the newly created group element for "${topic}" even with fallback.`);
                                }
                            }
                        } catch (e) {
                            console.error(`Error calling gBrowser.addTabGroup for topic "${topic}":`, e);
                            const groupAfterError = findGroupElement(topic, currentWorkspaceId);
                            if (groupAfterError && groupAfterError.isConnected) {
                                console.warn(` -> Group "${topic}" might exist despite error. Found via findGroupElement.`);
                                existingGroupElementsMap.set(topic, groupAfterError); 
                            } else {
                                console.error(` -> Failed to find group "${topic}" after creation error.`);
                            }
                        }
                    } else {
                        console.log(` -> Skipping creation of small group "${topic}" (${tabsForThisTopic.length} tabs) - didn't meet threshold and wasn't a pre-group or directly from AI.`);
                    }
                }
            } // End loop through final groups

            console.log("--- Tab sorting process complete (New Logic) ---");

        } catch (error) {
            console.error("Error during overall sorting process:", error);
        } finally {
            isSorting = false; 
            
            // --- INTEGRATED Animation Stop Logic ---
            if (sortAnimationId !== null) {
                console.log("SORT BTN ANIM: Stopping animation.");
                cancelAnimationFrame(sortAnimationId);
                sortAnimationId = null;
                try {
                    const activeSeparator = document.querySelector('.vertical-pinned-tabs-container-separator:not(.has-no-sortable-tabs)');
                    const pathElement = activeSeparator?.querySelector('#separator-path');
                    if (pathElement) {
                        pathElement.setAttribute('d', 'M 0 1 L 100 1');
                        console.log("SORT BTN ANIM: Path reset to straight line.");
                    } else {
                         console.warn("SORT BTN ANIM: Could not find path element to reset in finally block.");
                    }
                } catch (resetError) {
                    console.error("SORT BTN ANIM: Error resetting path in finally block:", resetError);
                }
            }
            // --- End INTEGRATED Animation Stop Logic ---
            
            // Remove separator pulse indicator
            if (separatorsToSort.length > 0) {
                console.log("Removing sorting indicator (pulse) from separator(s)...");
                separatorsToSort.forEach(sep => {
                    if (sep && sep.isConnected) {
                         sep.classList.remove('separator-is-sorting'); // Use pulse class
                    }
                });
            }

            // Remove tab loading indicators 
            setTimeout(() => {
                Array.from(gBrowser.tabs).forEach(tab => {
                    if (tab && tab.isConnected) {
                        tab.classList.remove('tab-is-sorting');
                    }
                });
                
                // Update button visibility immediately after sorting is complete
                updateButtonsVisibilityState();
            }, 500); 
        }
    };

    // --- New function to clear ungrouped tabs ---
    const clearUngroupedTabs = () => {
        if (isClearing) {
            console.log("Clearing already in progress.");
            return;
        }
        isClearing = true;
        console.log("Starting tab clear process...");

        try {
            const currentWorkspaceId = window.gZenWorkspaces?.activeWorkspace;
            if (!currentWorkspaceId) {
                console.error("Cannot get current workspace ID.");
                return; // Exit early
            }

            // Get tabs that are ungrouped and not selected
            const tabsToClose = Array.from(gBrowser.tabs).filter(tab => {
                const isInCorrectWorkspace = tab.getAttribute('zen-workspace-id') === currentWorkspaceId;
                const groupParent = tab.closest('tab-group');
                const isInGroup = !!groupParent;
                const isSelected = tab.selected;
                const isPinned = tab.pinned;
                const isEmpty = tab.hasAttribute('zen-empty-tab');
                const isGlance = tab.hasAttribute('zen-glance-tab'); // ADDED: Check for glance tabs
                const isConnected = tab.isConnected;

                return isInCorrectWorkspace && !isInGroup && !isSelected && !isPinned && !isEmpty && !isGlance && isConnected; // MODIFIED: Added !isGlance
            });

            if (tabsToClose.length === 0) {
                console.log("No ungrouped, non-selected tabs to close.");
                return; // Exit early
            }
            console.log(`Found ${tabsToClose.length} tabs to close.`);

            // Close the tabs in reverse order to avoid index shifting issues
            tabsToClose.reverse().forEach(tab => {
                try {
                    gBrowser.removeTab(tab);
                } catch (e) {
                    console.error("Error closing tab:", e);
                }
            });

            console.log(`Successfully closed ${tabsToClose.length} ungrouped tabs.`);
        } catch (error) {
            console.error("Error during tab clearing process:", error);
        } finally {
            isClearing = false;
            
            // Update button visibility immediately after clearing is complete
            setTimeout(() => {
                updateButtonsVisibilityState();
            }, 50);
        }
    };

    // --- Button Initialization & Workspace Handling ---
    function ensureSortButtonExists(separator) {
        console.log("SORT BTN DBG: ensureSortButtonExists called for separator:", separator);
        if (!separator) {
            console.log("SORT BTN DBG: Separator invalid, returning.");
            return;
        }
        try {
            console.log("SORT BTN DBG: Attempting to add SVG/Buttons...");
            // --- Create and Insert SVG with SINGLE Path --- 
            if (!separator.querySelector('svg.separator-line-svg')) { 
                 console.log("SORT BTN DBG: SVG does not exist, creating...");
                const svgNS = "http://www.w3.org/2000/svg";
                const svg = document.createElementNS(svgNS, "svg");
                svg.setAttribute("class", "separator-line-svg"); 
                svg.setAttribute("viewBox", "0 0 100 2"); 
                svg.setAttribute("preserveAspectRatio", "none"); 
                console.log("SORT BTN DBG: SVG element created:", svg);

                // Create ONE path
                const path = document.createElementNS(svgNS, "path");
                path.setAttribute("id", `separator-path`); // Single ID
                path.setAttribute("class", "separator-path-segment"); // Keep common class
                path.setAttribute("d", 'M 0 1 L 100 1'); // Initial straight line
                path.style.fill = "none";
                path.style.opacity = '1'; // Ensure it's visible
                path.setAttribute("stroke-width", "1"); // Added: Set initial stroke width
                path.setAttribute("stroke-linecap", "round"); // Added: Make path ends round
                svg.appendChild(path);
                console.log(`SORT BTN DBG: Single path element created and appended: #separator-path`);
                
                separator.insertBefore(svg, separator.firstChild); 
                console.log("SORT BTN DBG: SVG with single path inserted into separator.");
            } else {
                 console.log("SORT BTN DBG: SVG already exists.");
            }
            // --- End SVG --- 

            // --- Create and Append Sort Button ---
            if (!separator.querySelector('#sort-button')) {
                 console.log("SORT BTN DBG: Tidy button does not exist, creating...");
                const buttonFragment = window.MozXULElement.parseXULToFragment(`
                    <toolbarbutton
                        id="sort-button"
                        class="sort-button-with-icon"
                        command="cmd_zenSortTabs"
                        tooltiptext="Sort Tabs into Groups by Topic (AI)">
                        <hbox class="toolbarbutton-box" align="center">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 28 28" class="broom-icon">
                                <g>
                                    <path d="M19.9132 21.3765C19.8875 21.0162 19.6455 20.7069 19.3007 20.5993L7.21755 16.8291C6.87269 16.7215 6.49768 16.8384 6.27165 17.1202C5.73893 17.7845 4.72031 19.025 3.78544 19.9965C2.4425 21.392 3.01177 22.4772 4.66526 22.9931C4.82548 23.0431 5.78822 21.7398 6.20045 21.7398C6.51906 21.8392 6.8758 23.6828 7.26122 23.8031C7.87402 23.9943 8.55929 24.2081 9.27891 24.4326C9.59033 24.5298 10.2101 23.0557 10.5313 23.1559C10.7774 23.2327 10.7236 24.8834 10.9723 24.961C11.8322 25.2293 12.699 25.4997 13.5152 25.7544C13.868 25.8645 14.8344 24.3299 15.1637 24.4326C15.496 24.5363 15.191 26.2773 15.4898 26.3705C16.7587 26.7664 17.6824 27.0546 17.895 27.1209C19.5487 27.6369 20.6333 27.068 20.3226 25.1563C20.1063 23.8255 19.9737 22.2258 19.9132 21.3765Z" fill="currentColor" stroke="none"/>
                                    <path d="M16.719 1.7134C17.4929-0.767192 20.7999 0.264626 20.026 2.74523C19.2521 5.22583 18.1514 8.75696 17.9629 9.36C17.7045 10.1867 16.1569 15.1482 15.899 15.9749L19.2063 17.0068C20.8597 17.5227 20.205 19.974 18.4514 19.4268L8.52918 16.331C6.87208 15.8139 7.62682 13.3938 9.28426 13.911L12.5916 14.9429C12.8495 14.1163 14.3976 9.15491 14.6555 8.32807C14.9135 7.50122 15.9451 4.19399 16.719 1.7134Z" fill="currentColor" stroke="none"/>
                                </g>
                            </svg>
                            <label class="toolbarbutton-text" value="Tidy" crop="right"/>
                        </hbox>
                    </toolbarbutton>
                `);
                const buttonNode = buttonFragment.firstChild.cloneNode(true);
                console.log("SORT BTN DBG: Tidy button node created:", buttonNode);
                separator.appendChild(buttonNode);
                console.log("SORT BTN DBG: Tidy button appended to separator.");
            } else {
                console.log("SORT BTN DBG: Tidy button already exists.");
            }
            // --- End Sort Button ---

            // --- Create and Append Clear Button ---
            if (!separator.querySelector('#clear-button')) {
                console.log("SORT BTN DBG: Clear button does not exist, creating...");
                const clearButtonFragment = window.MozXULElement.parseXULToFragment(`
                    <toolbarbutton
                        id="clear-button"
                        class="clear-button-with-icon"
                        command="cmd_zenClearTabs"
                        tooltiptext="Close All Ungrouped Tabs (Except Selected)">
                        <hbox class="toolbarbutton-box" align="center">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" class="arrow-icon">
                                <path d="M12 2v18m-7-6l7 8 7-8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                            <label class="toolbarbutton-text" value="Clear" crop="right"/>
                        </hbox>
                    </toolbarbutton>
                `);
                const clearButtonNode = clearButtonFragment.firstChild.cloneNode(true);
                console.log("SORT BTN DBG: Clear button node created:", clearButtonNode);
                separator.appendChild(clearButtonNode);
                console.log("SORT BTN DBG: Clear button appended to separator.");
            } else {
                console.log("SORT BTN DBG: Clear button already exists.");
            }
            // --- End Clear Button ---
            
            console.log("SORT BTN DBG: Finished adding SVG/Buttons successfully.");

        } catch (e) {
            console.error("SORT BTN DBG: Error inside ensureSortButtonExists:", e);
        }
    }

    function addSortButtonToAllSeparators() {
        const separators = document.querySelectorAll(".vertical-pinned-tabs-container-separator");
        if (separators.length > 0) {
            separators.forEach(ensureSortButtonExists);
            updateButtonsVisibilityState();
        } else {
            const periphery = document.querySelector('#tabbrowser-arrowscrollbox-periphery');
            if (periphery && !periphery.querySelector('#sort-button')) {
                console.warn("SORT BTN: No separators found, attempting fallback append to periphery.");
                ensureSortButtonExists(periphery);
            } else if (!periphery) {
                console.error("SORT BTN: No separators or fallback periphery container found.");
            }
        }
        updateButtonsVisibilityState();
    }

    function setupSortCommandAndListener() {
        const zenCommands = document.querySelector("commandset#zenCommandSet");
        if (!zenCommands) {
            console.error("SORT BTN INIT: Could not find 'commandset#zenCommandSet'.");
            return;
        }

        // Add Sort command
        if (!zenCommands.querySelector("#cmd_zenSortTabs")) {
            try {
                const command = window.MozXULElement.parseXULToFragment(`<command id="cmd_zenSortTabs"/>`).firstChild;
                zenCommands.appendChild(command);
                console.log("SORT BTN INIT: Command 'cmd_zenSortTabs' added.");
            } catch (e) {
                console.error("SORT BTN INIT: Error adding command 'cmd_zenSortTabs':", e);
            }
        }

        // Add Clear command
        if (!zenCommands.querySelector("#cmd_zenClearTabs")) {
            try {
                const clearCommand = window.MozXULElement.parseXULToFragment(`<command id="cmd_zenClearTabs"/>`).firstChild;
                zenCommands.appendChild(clearCommand);
                console.log("SORT BTN INIT: Command 'cmd_zenClearTabs' added.");
            } catch (e) {
                console.error("SORT BTN INIT: Error adding command 'cmd_zenClearTabs':", e);
            }
        }

        // Add Sort button listener
        if (!sortButtonListenerAdded) {
            try {
                zenCommands.addEventListener('command', (event) => {
                    if (event.target.id === "cmd_zenSortTabs") {
                        console.log("SORT BTN ANIM: cmd_zenSortTabs command received.");
                        
                        // Add brushing animation class
                        const sortButton = document.querySelector('#sort-button');
                        if (sortButton) {
                            sortButton.classList.add('brushing');
                            // Remove class after animation completes
                            setTimeout(() => {
                                sortButton.classList.remove('brushing');
                            }, 800); // Match animation duration
                        }

                        // Prevent starting animation if already running
                        if (sortAnimationId !== null) {
                            console.log("SORT BTN ANIM: Animation already running, ignoring request.");
                            return; 
                        }

                        // Try finding the active separator directly
                        let separator = document.querySelector('.vertical-pinned-tabs-container-separator:not(.has-no-sortable-tabs)');
                        if (!separator) {
                            console.error("SORT BTN ANIM: Failed to find the target separator for animation start.");
                            sortTabsByTopic(); // Still run sort even if animation fails
                            return;
                        }
                        console.log("SORT BTN ANIM: Found separator directly:", separator);

                        // --- Start Animation logic --- 
                        const pathElement = separator.querySelector('#separator-path');
                        if (pathElement) {
                            console.log("SORT BTN ANIM: Found path element, starting continuous rAF animation with growth.");
                            
                            const maxAmplitude = 3; // Max wave height
                            const frequency = 8;   
                            const segments = 50;  
                            const growthDuration = 500; // Time (ms) for amplitude to reach max
                            let t = 0; // Phase variable
                            let startTime = performance.now(); 

                            function animateWaveLoop(timestamp) {
                                const elapsedTime = timestamp - startTime;
                                
                                // Calculate amplitude growth progress (0 to 1 over growthDuration)
                                const growthProgress = Math.min(elapsedTime / growthDuration, 1);
                                const currentAmplitude = maxAmplitude * growthProgress;

                                t += 0.5; // Simple increment for phase shift

                                let points = [];
                                for (let i = 0; i <= segments; i++) {
                                    const x = (i / segments) * 100; 
                                    // Use currentAmplitude which grows initially then stays maxed
                                    const y = 1 + currentAmplitude * Math.sin((x / (100 / frequency) * 2 * Math.PI) + (t * 0.1)); 
                                    points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
                                }
                                const pathData = "M" + points.join(" L");
                                pathElement.setAttribute('d', pathData);

                                // Continue the loop indefinitely until cancelled
                                sortAnimationId = requestAnimationFrame(animateWaveLoop);
                            }

                            // Start the loop
                            animateWaveLoop(startTime); // Pass initial timestamp
                            console.log("SORT BTN ANIM: Continuous animation loop started.");

                        } else {
                            console.warn("SORT BTN ANIM: Could not find #separator-path in the separator to start animation.");
                        }
                        // --- End Animation Logic ---
                        
                        // Call the actual sorting logic AFTER starting animation
                        sortTabsByTopic();
                    }
                });
                sortButtonListenerAdded = true;
                console.log("SORT BTN INIT: Sort command listener added.");
            } catch (e) {
                console.error("SORT BTN INIT: Error adding sort command listener:", e);
            }
        }

        // Add Clear button listener
        if (!clearButtonListenerAdded) {
            try {
                zenCommands.addEventListener('command', (event) => {
                    if (event.target.id === "cmd_zenClearTabs") {
                        console.log("CLEAR BTN: cmd_zenClearTabs command received.");
                        
                        // Add animation class to clear button
                        const clearButton = document.querySelector('#clear-button');
                        if (clearButton) {
                            clearButton.classList.add('clearing');
                            // Remove class after animation completes
                            setTimeout(() => {
                                clearButton.classList.remove('clearing');
                            }, 600); // Match animation duration
                        }
                        
                        // Call the actual clearing function
                        clearUngroupedTabs();
                    }
                });
                clearButtonListenerAdded = true;
                console.log("SORT BTN INIT: Clear command listener added.");
            } catch (e) {
                console.error("SORT BTN INIT: Error adding clear command listener:", e);
            }
        }
    }

    // --- gZenWorkspaces Hooks ---
    function setupgZenWorkspacesHooks() {
        if (typeof window.gZenWorkspaces === 'undefined') {
             console.warn("SORT BTN: gZenWorkspaces object not found. Hooks not applied.");
             return;
        }

        const originalOnTabBrowserInserted = window.gZenWorkspaces.onTabBrowserInserted;
        const originalUpdateTabsContainers = window.gZenWorkspaces.updateTabsContainers;

        window.gZenWorkspaces.onTabBrowserInserted = function(event) {
            if (typeof originalOnTabBrowserInserted === 'function') {
                try {
                    originalOnTabBrowserInserted.call(window.gZenWorkspaces, event);
                } catch (e) {
                     console.error("SORT BTN HOOK: Error in original onTabBrowserInserted:", e);
                }
            }
            addSortButtonToAllSeparators();
            updateButtonsVisibilityState();
        };

        window.gZenWorkspaces.updateTabsContainers = function(...args) {
            if (typeof originalUpdateTabsContainers === 'function') {
                 try {
                    originalUpdateTabsContainers.apply(window.gZenWorkspaces, args);
                 } catch (e) {
                      console.error("SORT BTN HOOK: Error in original updateTabsContainers:", e);
                 }
            }
            addSortButtonToAllSeparators();
            updateButtonsVisibilityState();
        };
        console.log("SORT BTN: gZenWorkspaces hooks applied.");
    }

    // --- New Helper: Count Tabs for Button Visibility ---
    const countTabsForButtonVisibility = () => {
        const currentWorkspaceId = window.gZenWorkspaces?.activeWorkspace;
        console.log(`BTN VIS: Current Workspace ID: ${currentWorkspaceId}`);
        if (!currentWorkspaceId || typeof gBrowser === 'undefined' || !gBrowser.tabs) {
            console.log(`BTN VIS: Cannot determine or no tabs available. Returning zeros.`);
            return { 
                ungroupedTotal: 0,
                ungroupedNonSelected: 0,
                hasGroupedTabs: false
            };
        }
        
        let ungroupedTotal = 0;
        let ungroupedNonSelected = 0;
        let hasGroupedTabs = false;
        
        for (const tab of gBrowser.tabs) {
            const workspaceId = tab.getAttribute('zen-workspace-id');
            const isPinned = tab.pinned;
            const isEmpty = tab.hasAttribute('zen-empty-tab');
            const isConnected = tab.isConnected;
            const groupParent = tab.closest('tab-group');
            const isInGroup = !!groupParent;
            const isSelected = tab.selected;
            const isGlance = tab.hasAttribute('zen-glance-tab'); // ADDED: Check for glance tabs
            
            // Only count tabs in current workspace
            if (workspaceId === currentWorkspaceId && !isPinned && !isEmpty && !isGlance && isConnected) { // MODIFIED: Added !isGlance
                if (isInGroup) {
                    // This is a grouped tab
                    hasGroupedTabs = true;
                } else {
                    // If not in a group, increment total ungrouped count
                    ungroupedTotal++;
                    
                    // If also not selected, increment that count too
                    if (!isSelected) {
                        ungroupedNonSelected++;
                    }
                }
            }
        }
        
        console.log(`BTN VIS: Found ${ungroupedTotal} ungrouped tabs (${ungroupedNonSelected} non-selected), hasGroupedTabs: ${hasGroupedTabs}`);
        return {
            ungroupedTotal,
            ungroupedNonSelected,
            hasGroupedTabs
        };
    };

    // --- Updated Helper: Update Button Visibility State ---
    const updateButtonsVisibilityState = () => {
        console.log("BTN VIS: updateButtonsVisibilityState called.");
        const { ungroupedTotal, ungroupedNonSelected, hasGroupedTabs } = countTabsForButtonVisibility();
        const separators = document.querySelectorAll(".vertical-pinned-tabs-container-separator");
        
        console.log(`BTN VIS: Updating visibility - ${separators.length} separators, ${ungroupedTotal} ungrouped tabs, ${ungroupedNonSelected} non-selected, hasGroupedTabs: ${hasGroupedTabs}`);
        
        separators.forEach((separator) => {
            // Handle Tidy button visibility with new condition:
            // - If there are grouped tabs already, show when any ungrouped tabs exist
            // - If no grouped tabs yet, only show when 6+ ungrouped tabs
            const tidyButton = separator.querySelector('#sort-button');
            if (tidyButton) {
                const shouldShowTidyButton = hasGroupedTabs ? ungroupedTotal > 0 : ungroupedTotal >= 6;
                if (shouldShowTidyButton) {
                    tidyButton.classList.remove('hidden-button');
                } else {
                    tidyButton.classList.add('hidden-button');
                }
            }
            
            // Handle Clear button visibility (needs any ungrouped non-selected tabs)
            const clearButton = separator.querySelector('#clear-button');
            if (clearButton) {
                if (ungroupedNonSelected > 0) {
                    clearButton.classList.remove('hidden-button');
                } else {
                    clearButton.classList.add('hidden-button');
                }
            }
            
            // Always keep the separator visible - remove this class
            separator.classList.remove('has-no-sortable-tabs');
        });
    };

    // --- Add Tab Event Listeners for Visibility Updates ---
    function addTabEventListeners() {
        if (typeof gBrowser !== 'undefined' && gBrowser.tabContainer) {
            const updateVisibilityDebounced = debounce(updateButtonsVisibilityState, 250); // Debounce slightly

            gBrowser.tabContainer.addEventListener('TabOpen', updateVisibilityDebounced);
            gBrowser.tabContainer.addEventListener('TabClose', updateVisibilityDebounced);
            gBrowser.tabContainer.addEventListener('TabSelect', updateVisibilityDebounced); // Added to handle selection changes
            // Also consider listening to pin/unpin events if pinned tabs affect visibility logic significantly
            gBrowser.tabContainer.addEventListener('TabPinned', updateVisibilityDebounced);
            gBrowser.tabContainer.addEventListener('TabUnpinned', updateVisibilityDebounced);
            // Listen to grouping-related events as well
            gBrowser.tabContainer.addEventListener('TabGroupAdd', updateVisibilityDebounced);
            gBrowser.tabContainer.addEventListener('TabGroupRemove', updateVisibilityDebounced);
            gBrowser.tabContainer.addEventListener('TabGrouped', updateVisibilityDebounced); // ADDED: Listen for tabs added to a group
            gBrowser.tabContainer.addEventListener('TabUngrouped', updateVisibilityDebounced); // ADDED: Listen for tabs removed from a group
            gBrowser.tabContainer.addEventListener('TabAttrModified', updateVisibilityDebounced);
            
            // Potentially listen to workspace changes if that affects visibility criteria
            if (typeof window.gZenWorkspaces !== 'undefined') {
                window.addEventListener('zen-workspace-switched', updateVisibilityDebounced);
            }

            console.log("BTN VIS: Added all tab event listeners for visibility updates.");
        } else {
            console.error("BTN VIS: Could not add tab event listeners - gBrowser.tabContainer not found.");
        }
    }

    // --- Debounce Utility (to prevent rapid firing) ---
    function debounce(func, wait) {
      let timeout;
      return function executedFunction(...args) {
        const later = () => {
          clearTimeout(timeout);
          func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
      };
    }

    // --- Initial Setup Trigger ---
    function initializeScript() {
        console.log("INIT: Sort Tabs Script (v4.7.2) loading..."); // Updated version
        let checkCount = 0;
        const maxChecks = 30;
        const checkInterval = 1000;

        const initCheckInterval = setInterval(() => {
            checkCount++;

            const separatorExists = !!document.querySelector(".vertical-pinned-tabs-container-separator");
            const commandSetExists = !!document.querySelector("commandset#zenCommandSet");
            const gBrowserReady = typeof gBrowser !== 'undefined' && gBrowser.tabContainer;
            const gZenWorkspacesReady = typeof window.gZenWorkspaces !== 'undefined';

            const ready = gBrowserReady && commandSetExists && separatorExists && gZenWorkspacesReady;

            if (ready) {
                console.log(`INIT: Required elements found after ${checkCount} checks. Initializing...`);
                clearInterval(initCheckInterval);

                setTimeout(() => {
                    try {
                        injectStyles(); // Make sure styles are injected/updated
                        setupSortCommandAndListener();
                        addSortButtonToAllSeparators();
                        setupgZenWorkspacesHooks();
                        updateButtonsVisibilityState(); // Initial visibility check (updated function name)
                        addTabEventListeners(); // <-- Add this call
                        console.log("INIT: Sort Button setup and hooks complete.");
                    } catch (e) {
                        console.error("INIT: Error during deferred initial setup:", e);
                    }
                }, 500);

            } else if (checkCount > maxChecks) {
                clearInterval(initCheckInterval);
                console.error(`INIT: Failed to find required elements after ${maxChecks} checks. Status:`, {
                    gBrowserReady, commandSetExists, separatorExists, gZenWorkspacesReady
                });
            }
        }, checkInterval);
    }

    // --- Start Initialization ---
    if (document.readyState === "complete") {
        initializeScript();
    } else {
        window.addEventListener("load", initializeScript, { once: true });
    }

})(); // End script

// ========================================================================================================================================================================

// ==UserScript==
// @ignorecache
// @name           Tab Explode Animation
// @version        1.0
// @author         Your Name
// @description    Adds a bubble explosion animation when a tab or tab group is closed.
// @compatibility  Firefox 100+
// ==/UserScript==

(() => {
    console.log("Tab Explode Animation: Script execution started.");

    const TAB_EXPLODE_ANIMATION_ID = 'tab-explode-animation-styles';
    const BUBBLE_COUNT = 25; // Number of bubbles
    const ANIMATION_DURATION = 600; // Milliseconds

    function injectStyles() {
        if (document.getElementById(TAB_EXPLODE_ANIMATION_ID)) {
            return;
        }

        const css = `
            .tab-explosion-container {
                position: absolute;
                top: 0; /* Will be set by JS */
                left: 0; /* Will be set by JS */
                width: 0; /* Will be set by JS */
                height: 0; /* Will be set by JS */
                pointer-events: none; /* Don't interfere with mouse events */
                z-index: 99999; /* Above other tab elements */
            }

            .bubble-particle {
                position: absolute;
                /* background-color: var(--toolbarbutton-icon-fill-attention, dodgerblue); */ /* Use a theme-aware color or a fixed one */
                background-color: light-dark( #cac2b6, #808080) !important;
                border-radius: 50%;
                opacity: 0.8;
                animation-name: bubbleExplode;
                animation-duration: ${ANIMATION_DURATION}ms;
                animation-timing-function: ease-out;
                animation-fill-mode: forwards; /* Stay at the end state (invisible) */
                will-change: transform, opacity; /* Hint for browser optimization */
            }

            @keyframes bubbleExplode {
                0% {
                    transform: scale(0.2);
                    opacity: 0.8;
                }
                100% {
                    transform: translate(var(--tx, 0px), var(--ty, 0px)) scale(var(--s, 1));
                    opacity: 0;
                }
            }
        `;

        const styleElement = document.createElement('style');
        styleElement.id = TAB_EXPLODE_ANIMATION_ID;
        styleElement.textContent = css;
        document.head.appendChild(styleElement);
        console.log("Tab Explode Animation: Styles injected.");
    }

    function animateElementClose(element) {
        if (!element || !element.isConnected) return;

        const elementRect = element.getBoundingClientRect(); // Viewport-relative
        const explosionContainer = document.createElement('div');
        explosionContainer.className = 'tab-explosion-container'; // Has position: absolute

        // Determine the parent for the animation.
        // #browser is a high-level container for the browser content area.
        let parentForAnimation = document.getElementById('browser');
        if (!parentForAnimation || !parentForAnimation.isConnected) {
            // Fallback to main-window or even documentElement if #browser is not suitable
            parentForAnimation = document.getElementById('main-window') || document.documentElement;
        }
        
        const parentRect = parentForAnimation.getBoundingClientRect();

        // Calculate position of explosionContainer relative to parentForAnimation,
        // such that it aligns with the element's viewport position.
        explosionContainer.style.left = `${elementRect.left - parentRect.left}px`;
        explosionContainer.style.top = `${elementRect.top - parentRect.top}px`;
        explosionContainer.style.width = `${elementRect.width}px`;
        explosionContainer.style.height = `${elementRect.height}px`;
        
        parentForAnimation.appendChild(explosionContainer);

        for (let i = 0; i < BUBBLE_COUNT; i++) {
            const bubble = document.createElement('div');
            bubble.className = 'bubble-particle';

            let initialX, initialY;
            let edge;
            if (i < 4) { // Assign the first four bubbles to distinct edges (0, 1, 2, 3)
                edge = i;
            } else {     // For subsequent bubbles, assign to a random edge
                edge = Math.floor(Math.random() * 4);
            }

            const bubbleSizeOffset = 5; // Half of average bubble size, to keep them visually on edge

            switch (edge) {
                case 0: // Top edge
                    initialX = Math.random() * elementRect.width;
                    initialY = -bubbleSizeOffset;
                    break;
                case 1: // Right edge
                    initialX = elementRect.width + bubbleSizeOffset;
                    initialY = Math.random() * elementRect.height;
                    break;
                case 2: // Bottom edge
                    initialX = Math.random() * elementRect.width;
                    initialY = elementRect.height + bubbleSizeOffset;
                    break;
                case 3: // Left edge
                    initialX = -bubbleSizeOffset;
                    initialY = Math.random() * elementRect.height;
                    break;
            }
            
            bubble.style.left = `${initialX}px`; 
            bubble.style.top = `${initialY}px`;
            bubble.style.width = `${Math.random() * 4 + 4}px`; // Random size (4px to 8px)
            bubble.style.height = bubble.style.width;

            // Random final translation and scale for each bubble
            const angle = Math.random() * Math.PI * 2;
            let distance = Math.random() * 1 + 1; // Explosion radius, even further reduced spread
            let finalTranslateX = Math.cos(angle) * distance;
            let finalTranslateY = Math.sin(angle) * distance;
            
            // Bias explosion outwards from the edge
            const outwardBias = 10; // Reduced outward bias
            if (edge === 0) finalTranslateY -= outwardBias; // Upwards from top
            if (edge === 1) finalTranslateX += outwardBias; // Rightwards from right
            if (edge === 2) finalTranslateY += outwardBias; // Downwards from bottom
            if (edge === 3) finalTranslateX -= outwardBias; // Leftwards from left

            const finalScale = Math.random() * 0.4 + 0.7; // Scale up a bit

            bubble.style.setProperty('--tx', `${finalTranslateX}px`);
            bubble.style.setProperty('--ty', `${finalTranslateY}px`);
            bubble.style.setProperty('--s', finalScale);
            
            // Stagger animation start slightly
            bubble.style.animationDelay = `${Math.random() * 120}ms`;

            explosionContainer.appendChild(bubble);
        }

        // Make the original element content invisible immediately
        element.style.opacity = '0';
        element.style.transition = 'opacity 0.1s linear';

        // Remove the explosion container after the animation
        setTimeout(() => {
            if (explosionContainer.parentNode) {
                explosionContainer.parentNode.removeChild(explosionContainer);
            }
        }, ANIMATION_DURATION + 100); // Add slight buffer for animation delay
    }

    function onTabClose(event) {
        const tab = event.target;
        // Ensure it's a normal tab and not something else
        if (tab.localName === 'tab' && !tab.pinned && tab.isConnected) {
            // Check if the tab is part of a group
            const groupParent = tab.closest('tab-group');
            if (!groupParent) {
            console.log("Tab Explode Animation: TabClose event triggered for tab:", tab);
                animateElementClose(tab);
            }
        }
    }

    function onTabGroupRemove(event) {
        console.log("Tab Explode Animation: TabGroupRemove event received:", event);
        const group = event.target;
        if (group && group.localName === 'tab-group' && group.isConnected) {
            console.log("Tab Explode Animation: TabGroupRemove event triggered for group:", group);
            animateElementClose(group);
        }
    }

    function init() {
        console.log("Tab Explode Animation: init() function called.");
        injectStyles();
        if (typeof gBrowser !== 'undefined' && gBrowser.tabContainer) {
            console.log("Tab Explode Animation: gBrowser and gBrowser.tabContainer are available.");
            gBrowser.tabContainer.addEventListener('TabClose', onTabClose, false);
            
            // Add multiple event listeners to catch tab group removal
            gBrowser.tabContainer.addEventListener('TabGroupRemove', onTabGroupRemove, false);
            gBrowser.tabContainer.addEventListener('TabGroupClosed', onTabGroupRemove, false);
            gBrowser.tabContainer.addEventListener('TabGroupRemoved', onTabGroupRemove, false);
            
            // Also listen for the custom event that might be used
            document.addEventListener('TabGroupRemoved', onTabGroupRemove, false);
            
            console.log("Tab Explode Animation: Listeners attached to TabClose and TabGroup events.");
        } else {
            // Retry if gBrowser is not ready
            console.log("Tab Explode Animation: gBrowser not ready, scheduling retry.");
            setTimeout(init, 1000);
        }
    }

    // Wait for the browser to be fully loaded
    console.log("Tab Explode Animation: Setting up load event listener or calling init directly.");
    if (document.readyState === "complete") {
        console.log("Tab Explode Animation: Document already complete, calling init().");
        init();
    } else {
        console.log("Tab Explode Animation: Document not complete, adding load event listener for init().");
        window.addEventListener("load", init, { once: true });
    }

})(); 




// ========================================================================================================================================================================

// ========================================================================================================================================================================
// ==UserScript==
// @ignorecache
// @name           permission-box-possition-fix
// @namespace      zenPermissionBoxGranterPostionFix
// @description    helps in switching copy url bar extension and permission box position
// @version        1.7b
// ==/UserScript==

(function() {
  if (window.location.href !== 'chrome://browser/content/browser.xhtml' && window.location.href !== 'chrome://browser/content/browser.xul') {
    return;
  }

  const IDENTITY_PERMISSION_BOX_ID = 'identity-permission-box';
  const MAIN_WINDOW_ID = 'main-window'; // Or document.documentElement
  const ACTIVE_STATE_ATTRIBUTE = 'data-identity-permission-active';

  const checkAndUpdateState = () => {
    const mainWindow = document.getElementById(MAIN_WINDOW_ID);
    const permBox = document.getElementById(IDENTITY_PERMISSION_BOX_ID);

    if (!mainWindow || !permBox) {
      // If elements aren't found yet, ensure state is off
      if (mainWindow && mainWindow.hasAttribute(ACTIVE_STATE_ATTRIBUTE)) {
        mainWindow.removeAttribute(ACTIVE_STATE_ATTRIBUTE);
      }
      return;
    }

    const isActive = permBox.hasAttribute('open') ||
                     permBox.hasAttribute('hasPermissions') ||
                     permBox.hasAttribute('hasSharingIcon');

    if (isActive) {
      if (!mainWindow.hasAttribute(ACTIVE_STATE_ATTRIBUTE)) {
        mainWindow.setAttribute(ACTIVE_STATE_ATTRIBUTE, 'true');
        // console.log('Identity permission box active, attribute set.');
      }
    } else {
      if (mainWindow.hasAttribute(ACTIVE_STATE_ATTRIBUTE)) {
        mainWindow.removeAttribute(ACTIVE_STATE_ATTRIBUTE);
        // console.log('Identity permission box inactive, attribute removed.');
      }
    }
  };

  // Observer for attribute changes on #identity-permission-box
  const permBoxObserver = new MutationObserver((mutationsList) => {
    for (const mutation of mutationsList) {
      if (mutation.type === 'attributes' &&
          (mutation.attributeName === 'open' ||
           mutation.attributeName === 'hasPermissions' ||
           mutation.attributeName === 'hasSharingIcon')) {
        checkAndUpdateState();
        break; // No need to check other mutations if relevant one found
      }
    }
  });

  // We also need to observe if #identity-permission-box itself is added/removed
  // or if its parent structure changes, so observe a higher stable parent.
  // #navigator-toolbox is a good candidate as it contains the urlbar.
  const parentObserver = new MutationObserver(() => {
    const permBox = document.getElementById(IDENTITY_PERMISSION_BOX_ID);
    if (permBox) {
      // If the box exists, ensure our attribute observer is connected to it
      // and do an initial check.
      permBoxObserver.observe(permBox, { attributes: true });
      checkAndUpdateState();
    } else {
        // If the box is removed, ensure state is off
        const mainWindow = document.getElementById(MAIN_WINDOW_ID);
        if (mainWindow && mainWindow.hasAttribute(ACTIVE_STATE_ATTRIBUTE)) {
            mainWindow.removeAttribute(ACTIVE_STATE_ATTRIBUTE);
        }
    }
  });


  // Function to start observation once the UI is ready
  const observeWhenReady = () => {
    const navigatorToolbox = document.getElementById('navigator-toolbox');
    const permBox = document.getElementById(IDENTITY_PERMISSION_BOX_ID);

    if (navigatorToolbox) {
      parentObserver.observe(navigatorToolbox, { childList: true, subtree: true });
      // console.log('Observing navigator-toolbox for identity-permission-box changes.');

      // Initial check and setup observer for permBox if it already exists
      if (permBox) {
        permBoxObserver.observe(permBox, { attributes: true });
        // console.log('Observing existing identity-permission-box for attribute changes.');
      }
      checkAndUpdateState(); // Perform an initial check
    } else {
      // Retry if navigator-toolbox is not found yet
      console.warn('userChrome.js: navigator-toolbox not found, retrying...');
      setTimeout(observeWhenReady, 500);
    }
  };

  // Start after a brief delay for UI elements to be more likely available
  if (document.readyState === 'complete') {
    observeWhenReady();
  } else {
    window.addEventListener('load', observeWhenReady, { once: true });
  }

})();


// ========================================================================================================================================================================
// ==UserScript==
// @ignorecache
// @name           zen-media-coverart-enhanced-bg-wrapper-hoverfix
// @namespace      zenMediaCoverArtEnhancedBgWrapperHoverFix
// @description    Set Zen media coverart via wrapper (v1.7b - Adjusts opacity on hover for consistent brightness). Affects background ONLY.
// @version        1.7b
// ==/UserScript==

(function waitForZenMediaController() {
  // --- Configuration ---
  const BACKGROUND_BLUR = '55px';       // Base blur
  const BACKGROUND_CONTRAST = '95%';    // Base contrast
  const BACKGROUND_SATURATION = '90%';  // Base saturation
  const BACKGROUND_BRIGHTNESS = '75%';   // Base brightness
  const BACKGROUND_BLEND_MODE = 'darken';// Base blend mode
  const BACKGROUND_OPACITY = '0.8';     // Base opacity (Adjust for base visibility through default backdrop)

  // --- Hover Adjustment ---
  // Slightly adjust opacity/brightness when player is expanded (hovered)
  // to match the perceived brightness of the collapsed state.
  // If collapsed looks too dark, INCREASE hover opacity/brightness slightly.
  // If expanded looks too dark, DECREASE hover opacity/brightness slightly.
  // Set to the same as BACKGROUND_OPACITY to disable adjustment.
  const HOVER_BACKGROUND_OPACITY = '0.9'; // Opacity when toolbaritem is hovered

  // --- Constants ---
  const STYLE_ELEMENT_ID = 'zen-coverart-dynamic-style-v4-wrapper-hoverfix'; // Unique ID
  const TOOLBAR_ITEM_SELECTOR = '#zen-media-controls-toolbar > toolbaritem';
  const WRAPPER_ELEMENT_ID = 'zen-coverart-background-wrapper'; // ID for our injected div
  // --- End Configuration ---


  if (typeof window.gZenMediaController?.setupMediaController !== 'function') {
    setTimeout(waitForZenMediaController, 300);
    return;
  }

  let lastArtworkUrl = null;
  let styleEl = null; // Keep reference to the style element

  // Combine filter strings (using BASE values)
  const filterValue = [
      BACKGROUND_BLUR && BACKGROUND_BLUR !== '0px' ? `blur(${BACKGROUND_BLUR})` : '',
      BACKGROUND_CONTRAST && BACKGROUND_CONTRAST !== '100%' && BACKGROUND_CONTRAST !== '1' ? `contrast(${BACKGROUND_CONTRAST})` : '',
      BACKGROUND_SATURATION && BACKGROUND_SATURATION !== '100%' && BACKGROUND_SATURATION !== '1' ? `saturate(${BACKGROUND_SATURATION})` : '',
      BACKGROUND_BRIGHTNESS && BACKGROUND_BRIGHTNESS !== '100%' && BACKGROUND_BRIGHTNESS !== '1' ? `brightness(${BACKGROUND_BRIGHTNESS})` : '',
  ].filter(Boolean).join(' ') || 'none';

  // Function to setup/update the injected CSS style tag
  function updateCoverArtStyle(coverUrl) {
    if (!styleEl) {
      styleEl = document.getElementById(STYLE_ELEMENT_ID);
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = STYLE_ELEMENT_ID;
        document.head.appendChild(styleEl);
      }
    }

    // Determine base opacity
    const baseTargetOpacity = coverUrl ? BACKGROUND_OPACITY : '0';
    // Determine hover opacity (use base if hover value is same or invalid)
    const hoverTargetOpacity = coverUrl
        ? (HOVER_BACKGROUND_OPACITY && HOVER_BACKGROUND_OPACITY !== BACKGROUND_OPACITY ? HOVER_BACKGROUND_OPACITY : baseTargetOpacity)
        : '0';


    // CSS for the WRAPPER element. Includes a rule for the hover state of the PARENT.
    let cssText = `
      /* Default state for the wrapper */
      #${WRAPPER_ELEMENT_ID} {
        content: "" !important;
        position: absolute !important;
        inset: 0 !important;
        z-index: -1 !important;
        overflow: hidden !important;
        border-radius: inherit !important;

        background-image: ${coverUrl ? `url("${coverUrl}")` : 'none'} !important;
        background-size: cover !important;
        background-position: center !important;
        background-repeat: no-repeat !important;
        background-blend-mode: ${BACKGROUND_BLEND_MODE} !important;
        filter: ${coverUrl ? filterValue : 'none'} !important;
        opacity: ${baseTargetOpacity} !important; /* Use base opacity */

        /* Transition applies to both states */
        transition: background-image 0.4s ease-in-out, filter 0.4s ease-in-out, opacity 0.4s ease-in-out !important;
        pointer-events: none !important;
      }

      /* Rule for the wrapper WHEN THE PARENT toolbaritem is hovered */
      ${TOOLBAR_ITEM_SELECTOR}:hover #${WRAPPER_ELEMENT_ID} {
        opacity: ${hoverTargetOpacity} !important; /* Use hover opacity */
        /* You could also add a brightness adjustment here if needed: */
        /* filter: ${coverUrl ? filterValue.replace(/brightness\([^)]+\)/, '').trim() + ' brightness(HOVER_BRIGHTNESS_VALUE)' : 'none'} !important; */
      }
    `;

    // Only update if the CSS text has actually changed
    if (styleEl.textContent !== cssText) {
      styleEl.textContent = cssText;
      // console.log("[ZenCoverArt] Updated dynamic style element (v1.7b - hover fix).");
    }
  }

  // --- manageWrapperElement, setBackgroundFromMetadata, Patching, Initialization ---
  // --- These remain IDENTICAL to the original v1.7 script you provided ---

    // Function to ensure the wrapper div exists or is removed
    function manageWrapperElement(toolbarItem, shouldExist) {
      if (!toolbarItem) return;
      let wrapper = toolbarItem.querySelector(`#${WRAPPER_ELEMENT_ID}`);
      if (shouldExist && !wrapper) {
          wrapper = document.createElement('div');
          wrapper.id = WRAPPER_ELEMENT_ID;
          toolbarItem.prepend(wrapper);
           console.log("[ZenCoverArt] Injected background wrapper.");
      } else if (!shouldExist && wrapper) {
          wrapper.remove();
           console.log("[ZenCoverArt] Removed background wrapper.");
      }
      return !!toolbarItem.querySelector(`#${WRAPPER_ELEMENT_ID}`);
  }


  function setBackgroundFromMetadata(controller) {
    const metadata = controller?.getMetadata?.();
    const artwork = metadata?.artwork;
    let coverUrl = null;

    const toolbarItem = document.querySelector(TOOLBAR_ITEM_SELECTOR);
    if (!toolbarItem) {
        return;
    }

    if (Array.isArray(artwork) && artwork.length > 0) {
      const sorted = [...artwork].sort((a, b) => {
        const [aw, ah] = a.sizes?.split("x").map(Number) || [0, 0];
        const [bw, bh] = b.sizes?.split("x").map(Number) || [0, 0];
        return (bw * bh) - (aw * ah);
      });
      const bestArtwork = sorted[0];
      if (bestArtwork?.src) {
          coverUrl = bestArtwork.src;
      }
    }

    const wrapperExists = manageWrapperElement(toolbarItem, !!coverUrl);

    if (wrapperExists || lastArtworkUrl) {
         updateCoverArtStyle(coverUrl);
    }

    if(coverUrl !== lastArtworkUrl){
        // console.log("[ZenCoverArt]", coverUrl ? `Setting new background URL: ${coverUrl}` : "Clearing background URL.");
    }
    lastArtworkUrl = coverUrl;
  }

  const originalSetupMediaController = gZenMediaController.setupMediaController.bind(gZenMediaController);
  gZenMediaController.setupMediaController = function (controller, browser) {
    // console.log("[ZenCoverArt] setupMediaController fired for:", controller.id);
    setBackgroundFromMetadata(controller);

    controller.removeEventListener("metadatachange", setBackgroundFromMetadataWrapper);
    controller.addEventListener("metadatachange", setBackgroundFromMetadataWrapper);

    return originalSetupMediaController(controller, browser);
  };

  function setBackgroundFromMetadataWrapper() {
    if (this && typeof this.getMetadata === 'function') {
      setBackgroundFromMetadata(this);
    } else {
      const currentController = gZenMediaController?._currentMediaController;
      if (currentController) {
        setBackgroundFromMetadata(currentController);
      } else {
        console.warn("[ZenCoverArt] Controller lost. Attempting cleanup.");
        const toolbarItem = document.querySelector(TOOLBAR_ITEM_SELECTOR);
        if(toolbarItem) manageWrapperElement(toolbarItem, false);
        updateCoverArtStyle(null);
        lastArtworkUrl = null;
      }
    }
  }

  const initialController = gZenMediaController._currentMediaController;
  const toolbarItem = document.querySelector(TOOLBAR_ITEM_SELECTOR);
  if (initialController) {
    // console.log("[ZenCoverArt] Initial controller found");
    setBackgroundFromMetadata(initialController);

    initialController.removeEventListener("metadatachange", setBackgroundFromMetadataWrapper);
    initialController.addEventListener("metadatachange", setBackgroundFromMetadataWrapper);
  } else {
     if(toolbarItem) manageWrapperElement(toolbarItem, false);
     updateCoverArtStyle(null);
  }

  console.log("[ZenCoverArt] Hooked setupMediaController successfully (Enhanced Version 1.7b - Hover Fix)");

})();


// ========================================================================================================================================================================


// ========================================================================================================================================================================
// ==UserScript==
// @ignorecache
// @name          zen-workspace-button-wave-animation
// @namespace      zenWorkspaceButtonAnimation
// @description    helps in adding mac os dock like aniamtion to zen worspace buttons
// @version        1.7b
// ==/UserScript==


(function() {
  if (window.ZenBrowserCustomizableDockEffect) {
    return;
  }
  window.ZenBrowserCustomizableDockEffect = true;
  let isEffectInitialized = false;

  // --- Configuration (These are your main tuning knobs!) ---
  // ========================================================

  // --- DOM Selectors ---
  const DOCK_CONTAINER_ID = 'zen-workspaces-button';
  const BUTTON_SELECTOR = '.subviewbutton';

  // --- Inactive Icon Display Mode --- NEW ---
  // 'dot': Inactive icons are heavily dimmed/grayscaled (like dots).
  // 'visible': Inactive icons are more visible, just less prominent.
  // This can be overridden by a browser preference/setting if implemented.
  const INACTIVE_ICON_MODE_DEFAULT = 'dot'; // or 'visible'

  // --- Base Appearance (Initial state derived from CSS, with JS fallbacks) ---
  const BASE_SCALE = 1;

  // -- For 'dot' mode (current behavior) --
  const JS_FALLBACK_INITIAL_OPACITY_DOT_MODE = 0.75; // Or lower for more "dot-like"
  const JS_FALLBACK_INITIAL_GRAYSCALE_DOT_MODE = 100; // In %

  // -- For 'visible' mode (new behavior) --
  const JS_FALLBACK_INITIAL_OPACITY_VISIBLE_MODE = 0.85; // More visible
  const JS_FALLBACK_INITIAL_GRAYSCALE_VISIBLE_MODE = 50; // Less grayscale, more color

  // --- Magnification & Wave Effect ---
  const MAX_MAGNIFICATION_SCALE = 1.3;
  const NEIGHBOR_INFLUENCE_WIDTH_FACTOR = 3;
  const SCALE_FALLOFF_POWER = 5.7;

  // --- Opacity Transition ---
  const MAX_OPACITY = 1.0;
  const OPACITY_FALLOFF_POWER = 1.5;

  // --- Grayscale Transition ---
  const MAX_GRAYSCALE = 0; // Grayscale (%) for icon closest to mouse (0 = full color)
  const GRAYSCALE_FALLOFF_POWER = 1.5;

  // --- Stacking Order ---
  const BASE_Z_INDEX = 1;
  const Z_INDEX_BOOST = 10;

  // --- Performance Tuning ---
  const MOUSE_MOVE_THROTTLE_MS = 10;
  const RESIZE_DEBOUNCE_MS = 150;

  // --- Dynamic Gapping ---
  const DYNAMIC_GAP_CSS_VARIABLE = '--zen-dock-dynamic-gap';
  const JS_FALLBACK_DEFAULT_GAP = '0.1em';
  // ========================================================
  // --- End Configuration ---

  let dockContainerElement = null;
  let currentButtons = [];
  let buttonCachedProperties = [];
  let lastMouseMoveTime = 0;
  let resizeDebounceTimeout;
  let isMouseOverDock = false;
  let lastMouseXInDock = 0;

  // --- NEW: Function to get the current inactive icon mode ---
  // This is where you'd integrate reading from `about:config` or similar browser settings
  function getCurrentInactiveIconMode() {
      // Example: Placeholder for reading a browser preference
      // if (typeof browser !== 'undefined' && browser.prefs && browser.prefs.get) {
      // try {
      //   const prefValue = await browser.prefs.get('extensions.zenBrowser.dock.inactiveIconMode');
      //   if (prefValue === 'visible' || prefValue === 'dot') {
      //     return prefValue;
      //   }
      // } catch (e) { console.warn("Zen Dock: Could not read preference", e); }
      // }
      // For now, we'll use a CSS custom property or the JS default
      const modeFromCSS = getCssVariableOrDefault('--zen-dock-inactive-icon-mode', INACTIVE_ICON_MODE_DEFAULT, false);
      if (modeFromCSS === 'visible' || modeFromCSS === 'dot') {
          return modeFromCSS;
      }
      return INACTIVE_ICON_MODE_DEFAULT;
  }


  function getCssVariableOrDefault(varName, fallbackValue, isInteger = false, treatAsString = false) {
      try {
          const rootStyle = getComputedStyle(document.documentElement);
          let value = rootStyle.getPropertyValue(varName).trim();
          if (value) {
              if (treatAsString) return value; // Return as string if requested
              return isInteger ? parseInt(value, 10) : parseFloat(value);
          }
      } catch (e) { /* CSS variable might not be defined yet or invalid */ }
      return fallbackValue;
  }

  // --- MODIFIED: Function to get initial properties based on mode ---
  function getInitialButtonProperties() {
    const mode = getCurrentInactiveIconMode();
    let initialOpacity, initialGrayscale;

    if (mode === 'visible') {
        initialOpacity = getCssVariableOrDefault('--zen-dock-icon-initial-opacity-visible', JS_FALLBACK_INITIAL_OPACITY_VISIBLE_MODE);
        initialGrayscale = getCssVariableOrDefault('--zen-dock-icon-initial-grayscale-visible', JS_FALLBACK_INITIAL_GRAYSCALE_VISIBLE_MODE, true);
    } else { // Default to 'dot' mode
        initialOpacity = getCssVariableOrDefault('--zen-dock-icon-initial-opacity-dot', JS_FALLBACK_INITIAL_OPACITY_DOT_MODE);
        initialGrayscale = getCssVariableOrDefault('--zen-dock-icon-initial-grayscale-dot', JS_FALLBACK_INITIAL_GRAYSCALE_DOT_MODE, true);
    }
    return { initialOpacity, initialGrayscale };
  }


  function getDynamicGapValue(buttonCount) {
    // ... (same as before)
    let gapValue = JS_FALLBACK_DEFAULT_GAP;
    if (buttonCount <= 1) gapValue = '0em';
    else if (buttonCount === 2) gapValue = '1em';
    else if (buttonCount === 3) gapValue = '0em';
    else if (buttonCount <= 5) gapValue = '0.5em';
    else if (buttonCount <= 7) gapValue = '0.3em';
    else if (buttonCount === 8) gapValue = '0.2em';
    else if (buttonCount >= 9) gapValue = '0.1em';
    return gapValue;
  }

  function updateDockGapping() {
    // ... (same as before)
    if (!dockContainerElement) return;
    const buttonCount = currentButtons.length;
    const gapValue = getDynamicGapValue(buttonCount);
    dockContainerElement.style.setProperty(DYNAMIC_GAP_CSS_VARIABLE, gapValue);
  }

  function cacheButtonProperties() {
    // ... (same as before)
    if (!dockContainerElement) return [];
    const newButtons = Array.from(dockContainerElement.querySelectorAll(BUTTON_SELECTOR));
    const newButtonProperties = newButtons.map(btn => {
      const rect = btn.getBoundingClientRect();
      return {
        element: btn,
        center: rect.left + rect.width / 2,
        width: rect.width,
      };
    });
    let buttonsChangedStructurally = newButtons.length !== currentButtons.length;
    if (!buttonsChangedStructurally) {
        for (let i = 0; i < newButtons.length; i++) {
            if (newButtons[i] !== currentButtons[i]) {
                buttonsChangedStructurally = true;
                break;
            }
        }
    }
    currentButtons = newButtons;
    buttonCachedProperties = newButtonProperties;
    updateDockGapping();
    return buttonsChangedStructurally;
  }

  function resetAllButtonsToDefault() {
    // --- MODIFIED to use getInitialButtonProperties ---
    const { initialOpacity, initialGrayscale } = getInitialButtonProperties();
    const isActiveButton = (btn) => btn.matches('[active="true"]');

    currentButtons.forEach(btn => {
      let targetOpacity = initialOpacity;
      let targetGrayscale = initialGrayscale;

      if (isActiveButton(btn)) {
        // Active buttons should always be quite visible, regardless of inactive mode
        targetOpacity = getCssVariableOrDefault('--zen-dock-icon-active-opacity', MAX_OPACITY);
        // Potentially make active grayscale slightly less than full color if preferred
        targetGrayscale = getCssVariableOrDefault('--zen-dock-icon-active-grayscale', MAX_GRAYSCALE + 10); // e.g., 10% grayscale for active
      }
      
      btn.style.transform = `scale(${BASE_SCALE})`;
      btn.style.opacity = targetOpacity;
      btn.style.filter = `grayscale(${targetGrayscale}%)`;
      btn.style.zIndex = BASE_Z_INDEX;
    });
  }

  function updateDockEffectStyles(mouseX) {
    const now = performance.now();
    if (MOUSE_MOVE_THROTTLE_MS > 0 && (now - lastMouseMoveTime < MOUSE_MOVE_THROTTLE_MS)) {
      return;
    }
    lastMouseMoveTime = now;

    if (buttonCachedProperties.length === 0 && currentButtons.length > 0) {
      cacheButtonProperties(); 
      if (buttonCachedProperties.length === 0) return;
    } else if (currentButtons.length === 0) {
        return;
    }

    // --- MODIFIED to use getInitialButtonProperties ---
    const { initialOpacity: currentInitialOpacity, initialGrayscale: currentInitialGrayscale } = getInitialButtonProperties();
    
    // Active button properties remain separate
    const currentActiveOpacity = getCssVariableOrDefault('--zen-dock-icon-active-opacity', MAX_OPACITY);
    const currentActiveGrayscale = getCssVariableOrDefault('--zen-dock-icon-active-grayscale', MAX_GRAYSCALE + 10);

    const isActiveButton = (btn) => btn.matches('[active="true"]');

    buttonCachedProperties.forEach(props => {
      const iconElement = props.element;
      const iconCenter = props.center;
      const iconWidth = props.width;

      if (!iconElement || iconWidth === 0) return;

      const distanceToMouse = Math.abs(mouseX - iconCenter);
      const maxEffectDistance = iconWidth * NEIGHBOR_INFLUENCE_WIDTH_FACTOR;
      let effectStrength = 0;

      if (distanceToMouse < maxEffectDistance) {
        effectStrength = Math.cos((distanceToMouse / maxEffectDistance) * (Math.PI / 2));
        effectStrength = Math.pow(effectStrength, SCALE_FALLOFF_POWER);
      }

      const scale = BASE_SCALE + (MAX_MAGNIFICATION_SCALE - BASE_SCALE) * effectStrength;

      let baseOpacityForCalc = currentInitialOpacity;
      let baseGrayscaleForCalc = currentInitialGrayscale;

      // If active and mouse is far, use active base properties
      if (isActiveButton(iconElement) && effectStrength < 0.1) {
        baseOpacityForCalc = currentActiveOpacity;
        baseGrayscaleForCalc = currentActiveGrayscale;
      }

      let opacityEffectStrengthMod = effectStrength;
      if (OPACITY_FALLOFF_POWER !== SCALE_FALLOFF_POWER && distanceToMouse < maxEffectDistance) {
         let tempStrength = Math.cos((distanceToMouse / maxEffectDistance) * (Math.PI / 2));
         opacityEffectStrengthMod = Math.pow(tempStrength, OPACITY_FALLOFF_POWER);
      }
      // If icon is active, it should not become less opaque than its active base when mouse is far
      // And it should not become less opaque than initial general opacity when mouse is near
      let targetOpacity;
      if(isActiveButton(iconElement)) {
        // Active buttons transition from their `currentActiveOpacity` towards `MAX_OPACITY`
        targetOpacity = currentActiveOpacity + (MAX_OPACITY - currentActiveOpacity) * opacityEffectStrengthMod;
      } else {
        // Inactive buttons transition from `currentInitialOpacity` towards `MAX_OPACITY`
        targetOpacity = currentInitialOpacity + (MAX_OPACITY - currentInitialOpacity) * opacityEffectStrengthMod;
      }
      

      let grayscaleEffectStrengthMod = effectStrength;
      if (GRAYSCALE_FALLOFF_POWER !== SCALE_FALLOFF_POWER && distanceToMouse < maxEffectDistance) {
         let tempStrength = Math.cos((distanceToMouse / maxEffectDistance) * (Math.PI / 2));
         grayscaleEffectStrengthMod = Math.pow(tempStrength, GRAYSCALE_FALLOFF_POWER);
      }
      // Similar logic for grayscale
      let targetGrayscale;
      if(isActiveButton(iconElement)) {
        // Active buttons transition from their `currentActiveGrayscale` towards `MAX_GRAYSCALE`
        targetGrayscale = currentActiveGrayscale - (currentActiveGrayscale - MAX_GRAYSCALE) * grayscaleEffectStrengthMod;
      } else {
        // Inactive buttons transition from `currentInitialGrayscale` towards `MAX_GRAYSCALE`
        targetGrayscale = currentInitialGrayscale - (currentInitialGrayscale - MAX_GRAYSCALE) * grayscaleEffectStrengthMod;
      }
            
      const zIndex = BASE_Z_INDEX + Math.ceil(Z_INDEX_BOOST * effectStrength);

      iconElement.style.transform = `scale(${scale})`;
      
      // Determine the absolute minimum opacity (should not go below its non-hovered state)
      let minOpacityForElement = isActiveButton(iconElement) ? currentActiveOpacity : currentInitialOpacity;
      // If under mouse influence, it could even go down to the general initial opacity if that's lower than active
      if (isActiveButton(iconElement) && effectStrength > 0.1 && currentInitialOpacity < currentActiveOpacity) {
          minOpacityForElement = currentInitialOpacity;
      }

      iconElement.style.opacity = Math.min(MAX_OPACITY, Math.max(minOpacityForElement, targetOpacity));
      iconElement.style.filter = `grayscale(${Math.max(0, Math.min(100, Math.round(targetGrayscale)))}%)`;
      iconElement.style.zIndex = zIndex;
    });
  }

  function initializeDockEffect() {
    // ... (same as before)
    dockContainerElement = document.getElementById(DOCK_CONTAINER_ID);
    if (!dockContainerElement) return;

    cacheButtonProperties();
    if (currentButtons.length === 0) {
        // Observer will handle when buttons appear
    } else {
        resetAllButtonsToDefault(); // This will now use the configured mode
    }

    dockContainerElement.addEventListener('mousemove', (event) => {
      const dockRect = dockContainerElement.getBoundingClientRect();
      if (event.clientX >= dockRect.left && event.clientX <= dockRect.right &&
          event.clientY >= dockRect.top && event.clientY <= dockRect.bottom) {
        isMouseOverDock = true;
        lastMouseXInDock = event.clientX;
        updateDockEffectStyles(event.clientX);
      } else {
        if (isMouseOverDock) {
            isMouseOverDock = false;
            resetAllButtonsToDefault();
        }
      }
    });

    dockContainerElement.addEventListener('mouseleave', () => {
      isMouseOverDock = false;
      resetAllButtonsToDefault();
    });

    window.addEventListener('resize', () => {
      clearTimeout(resizeDebounceTimeout);
      resizeDebounceTimeout = setTimeout(() => {
        cacheButtonProperties();
        if (isMouseOverDock && lastMouseXInDock !== 0 && currentButtons.length > 0) {
            updateDockEffectStyles(lastMouseXInDock);
        } else {
            resetAllButtonsToDefault();
        }
      }, RESIZE_DEBOUNCE_MS);
    });
  }

  const observer = new MutationObserver((mutationsList, obs) => {
    // ... (logic largely the same, but resetAllButtonsToDefault and updateDockEffectStyles now use mode)
    const dockNowExists = document.getElementById(DOCK_CONTAINER_ID);
    
    if (!dockNowExists) {
      if (isEffectInitialized) {
        isEffectInitialized = false;
        isMouseOverDock = false;
        currentButtons = [];
        buttonCachedProperties = [];
      }
      return;
    }
    if (dockContainerElement !== dockNowExists) dockContainerElement = dockNowExists;

    const buttonsArePresent = dockNowExists.querySelector(BUTTON_SELECTOR);

    if (buttonsArePresent) {
      if (!isEffectInitialized) {
        initializeDockEffect();
        isEffectInitialized = true;
      } else {
        const structuralChange = cacheButtonProperties();
        if (isMouseOverDock && !structuralChange && currentButtons.length > 0) {
          updateDockEffectStyles(lastMouseXInDock);
        } else {
          resetAllButtonsToDefault();
          if (isMouseOverDock && currentButtons.length > 0) {
            updateDockEffectStyles(lastMouseXInDock);
          }
        }
      }
    } else if (isEffectInitialized && currentButtons.length > 0) {
        currentButtons = [];
        buttonCachedProperties = [];
        updateDockGapping();
    }
  });
  
  function attemptInitialization() {
    // ... (same as before)
    const dock = document.getElementById(DOCK_CONTAINER_ID);
    if (dock) {
        dockContainerElement = dock;
        if (dock.querySelector(BUTTON_SELECTOR)) {
            if (!isEffectInitialized) {
                initializeDockEffect();
                isEffectInitialized = true;
            }
        } else {
            if (!isEffectInitialized) {
                updateDockGapping();
                observer.observe(document.documentElement, { childList: true, subtree: true });
            }
        }
    } else {
        observer.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  // --- NEW: Listen for preference changes (if applicable) ---
  // This is a conceptual example. Actual implementation depends on your browser environment.
  // For a typical WebExtension:
  // if (typeof browser !== 'undefined' && browser.storage && browser.storage.onChanged) {
  //   browser.storage.onChanged.addListener((changes, areaName) => {
  //     if (areaName === 'local' || areaName === 'sync') { // Or wherever your preference is stored
  //       if (changes['extensions.zenBrowser.dock.inactiveIconMode']) { // Or your actual preference key
  //         console.log("Zen Dock: Inactive icon mode preference changed. Re-applying styles.");
  //         // Re-apply styles based on the new preference
  //         if (isMouseOverDock && lastMouseXInDock !== 0 && currentButtons.length > 0) {
  //           updateDockEffectStyles(lastMouseXInDock);
  //         } else {
  //           resetAllButtonsToDefault();
  //         }
  //       }
  //     }
  //   });
  // } else if (/* You have another way to detect preference changes, e.g., custom events */) {
  //   // document.addEventListener('myCustomPreferenceChangeEvent', () => { ... });
  // }


  if (document.readyState === "complete" || document.readyState === "interactive") {
    attemptInitialization();
  } else {
    document.addEventListener("DOMContentLoaded", attemptInitialization, { once: true });
  }
})();

// ========================================================================================================================================================================
// ==UserScript==
// @ignorecache
// @name           CompactmodeSidebarWidthFix
// @namespace      psuedobgwidthfix
// @description    it help in adjust dynamic width of psuedo background
// @version        1.7b
// ==/UserScript==



(function () {
  const mainWindow = document.getElementById('main-window');
  const toolbox = document.getElementById('navigator-toolbox');

  function updateSidebarWidthIfCompact() {
    const isCompact = mainWindow.getAttribute('zen-compact-mode') === 'true';
    if (!isCompact) return;

    const value = getComputedStyle(toolbox).getPropertyValue('--zen-sidebar-width');
    if (value) {
      mainWindow.style.setProperty('--zen-sidebar-width', value.trim());
      console.log('[userChrome] Synced --zen-sidebar-width to #main-window:', value.trim());
    }
  }

  // Set up a MutationObserver to watch attribute changes on #main-window
  const observer = new MutationObserver((mutationsList) => {
    for (const mutation of mutationsList) {
      if (
        mutation.type === 'attributes' &&
        mutation.attributeName === 'zen-compact-mode'
      ) {
        updateSidebarWidthIfCompact();
      }
    }
  });

  // Observe attribute changes
  observer.observe(mainWindow, {
    attributes: true,
    attributeFilter: ['zen-compact-mode']
  });

  // Optional: run it once in case the attribute is already set at load
  updateSidebarWidthIfCompact();
})();



// ========================================================================================================================================================================
// ==UserScript==
// @ignorecache
// @name           GradientOpacitydjuster
// @namespace      variableopacity
// @description    it help in adjust dynamically opacity and contrast of icons and other elements
// @version        1.7b
// ==/UserScript==




(function () {
  console.log('[UserChromeScript] custom-input-to-dual-css-vars-persistent.uc.js starting...');

  // --- Configuration ---
  const INPUT_ELEMENT_ID = 'PanelUI-zen-gradient-generator-opacity';
  const CSS_VARIABLE_DIRECT_NAME = '--zen-gradient-opacity';
  const CSS_VARIABLE_INVERTED_NAME = '--zen-gradient-opacity-inverted';
  const TARGET_ELEMENT_FOR_CSS_VAR = document.documentElement; // Apply globally to <html>
  const PREF_NAME = `userchrome.custom.${INPUT_ELEMENT_ID}.value`;

  // IMPORTANT: Define how to interpret the input's value for inversion
  // If input.value is naturally 0-1 (e.g. for opacity):
  const INPUT_VALUE_MIN = 0;
  const INPUT_VALUE_MAX = 1;
  // If input.value is 0-100 (e.g. a percentage slider):
  // const INPUT_VALUE_MIN = 0;
  // const INPUT_VALUE_MAX = 100;
  // --- End Configuration ---

  let inputElement = null;
  let Services;

  try {
    Services = globalThis.Services || ChromeUtils.import("resource://gre/modules/Services.jsm").Services;
    console.log('[UserChromeScript] Services module loaded.');
  } catch (e) {
    console.error('[UserChromeScript] CRITICAL: Failed to load Services module:', e);
    Services = null; // Ensure it's null if loading failed
  }

  function saveValueToPrefs(value) {
    if (!Services || !Services.prefs) {
      console.warn('[UserChromeScript] Services.prefs not available. Cannot save preference.');
      return;
    }
    try {
      Services.prefs.setStringPref(PREF_NAME, String(value)); // Save as string
      // console.log(`[UserChromeScript] Saved to prefs (${PREF_NAME}):`, value);
    } catch (e) {
      console.error(`[UserChromeScript] Error saving preference ${PREF_NAME}:`, e);
    }
  }

  function loadValueFromPrefs() {
    if (!Services || !Services.prefs) {
      console.warn('[UserChromeScript] Services.prefs not available. Cannot load preference.');
      return null;
    }
    if (Services.prefs.prefHasUserValue(PREF_NAME)) {
      try {
        const value = Services.prefs.getStringPref(PREF_NAME);
        // console.log(`[UserChromeScript] Loaded from prefs (${PREF_NAME}):`, value);
        return value; // Return as string, will be parsed later
      } catch (e) {
        console.error(`[UserChromeScript] Error loading preference ${PREF_NAME}:`, e);
        return null;
      }
    }
    // console.log(`[UserChromeScript] No user value found for preference ${PREF_NAME}.`);
    return null;
  }

  function applyCssVariables(directValueStr) {
    if (!TARGET_ELEMENT_FOR_CSS_VAR) {
      console.warn(`[UserChromeScript] Target element for CSS variables not found.`);
      return;
    }

    let directValueNum = parseFloat(directValueStr);

    // Validate and clamp the directValueNum based on defined min/max
    if (isNaN(directValueNum)) {
        console.warn(`[UserChromeScript] Invalid number parsed from input: '${directValueStr}'. Using default of ${INPUT_VALUE_MIN}.`);
        directValueNum = INPUT_VALUE_MIN;
    }
    directValueNum = Math.max(INPUT_VALUE_MIN, Math.min(INPUT_VALUE_MAX, directValueNum));

    // Calculate inverted value
    // Formula for inversion: inverted = MAX - (value - MIN)
    // Or simpler if MIN is 0: inverted = MAX - value
    const invertedValueNum = (INPUT_VALUE_MAX + INPUT_VALUE_MIN) - directValueNum;


    TARGET_ELEMENT_FOR_CSS_VAR.style.setProperty(CSS_VARIABLE_DIRECT_NAME, directValueNum);
    TARGET_ELEMENT_FOR_CSS_VAR.style.setProperty(CSS_VARIABLE_INVERTED_NAME, invertedValueNum);

    console.log(`[UserChromeScript] Synced CSS Vars: ${CSS_VARIABLE_DIRECT_NAME}=${directValueNum}, ${CSS_VARIABLE_INVERTED_NAME}=${invertedValueNum}`);
  }


  function handleInputChange() {
    if (!inputElement) {
      console.warn('[UserChromeScript] handleInputChange called but inputElement is null.');
      return;
    }
    const valueStr = inputElement.value; // Value from input is a string
    console.log(`[UserChromeScript] Input changed. New string value: '${valueStr}'`);
    applyCssVariables(valueStr);
    saveValueToPrefs(valueStr); // Save the original string value
  }

  function setupInputListener() {
    inputElement = document.getElementById(INPUT_ELEMENT_ID);

    if (inputElement) {
      console.log(`[UserChromeScript] Found input element #${INPUT_ELEMENT_ID}.`);

      const savedValueStr = loadValueFromPrefs();
      let initialValueStr;

      if (savedValueStr !== null) {
        inputElement.value = savedValueStr;
        initialValueStr = savedValueStr;
        console.log(`[UserChromeScript] Applied saved value '${savedValueStr}' to #${INPUT_ELEMENT_ID}.`);
      } else {
        initialValueStr = inputElement.value; // Use current value of input if no pref
        console.log(`[UserChromeScript] No saved value. Using current input value: '${initialValueStr}'.`);
      }

      applyCssVariables(initialValueStr); // Apply CSS vars based on initial/loaded value

      inputElement.removeEventListener('input', handleInputChange);
      inputElement.addEventListener('input', handleInputChange);
      console.log(`[UserChromeScript] Attached 'input' event listener to #${INPUT_ELEMENT_ID}.`);

    } else {
      console.warn(`[UserChromeScript] Element #${INPUT_ELEMENT_ID} not found during setup. Will retry if element appears.`);
      // If element not found, try to apply from prefs if available
      const savedValueStr = loadValueFromPrefs();
      if (savedValueStr !== null) {
          console.log(`[UserChromeScript] Element not found, but applying saved pref value '${savedValueStr}' to CSS vars.`);
          applyCssVariables(savedValueStr);
      }
    }
  }

  function initializeScript() {
    console.log("[UserChromeScript] initializeScript called.");
    setupInputListener();
  }

  let observer;
  function observeForElement() {
    const targetNode = document.body || document.documentElement;
    if (!targetNode) {
        console.warn("[UserChromeScript] Cannot find document.body or document.documentElement to observe.");
        setTimeout(observeForElement, 1000);
        return;
    }

    initializeScript(); // Try to init immediately

    if (!inputElement) {
        console.log(`[UserChromeScript] Input element #${INPUT_ELEMENT_ID} not found yet. Setting up MutationObserver.`);
        if (observer) observer.disconnect();

        observer = new MutationObserver((mutationsList, obs) => {
            if (document.getElementById(INPUT_ELEMENT_ID)) {
                console.log(`[UserChromeScript] Element #${INPUT_ELEMENT_ID} detected by MutationObserver.`);
                initializeScript();
                obs.disconnect();
                observer = null;
            }
        });
        observer.observe(targetNode, { childList: true, subtree: true });
        console.log(`[UserChromeScript] MutationObserver started on ${targetNode.nodeName}.`);
    }
  }

  if (document.readyState === 'loading') {
    console.log('[UserChromeScript] DOM is loading, waiting for DOMContentLoaded.');
    document.addEventListener('DOMContentLoaded', observeForElement, { once: true });
  } else {
    console.log('[UserChromeScript] DOM already loaded, running observeForElement immediately.');
    observeForElement();
  }
  console.log('[UserChromeScript] custom-input-to-dual-css-vars-persistent.uc.js finished initial execution.');
})();
