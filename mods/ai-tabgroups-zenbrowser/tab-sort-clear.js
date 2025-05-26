// VERSION 4.10.0 (Added tab multi-selection sort capability)
(() => {
    // --- Configuration ---

    // Preference Key for AI Model Selection
    const AI_MODEL_PREF = "extensions.tabgroups.ai_model"; // '1' for Gemini, '2' for Ollama
    // Preference Keys for AI Config
    const OLLAMA_ENDPOINT_PREF = "extensions.tabgroups.ollama_endpoint";
    const OLLAMA_MODEL_PREF = "extensions.tabgroups.ollama_model";
    const GEMINI_API_KEY_PREF = "extensions.tabgroups.gemini_api_key";
    const GEMINI_MODEL_PREF = "extensions.tabgroups.gemini_model";

    // Helper function to read preferences with fallbacks
    const getPref = (prefName, defaultValue = "") => {
        try {
            const prefService = Services.prefs;
            if (prefService.prefHasUserValue(prefName)) {
                switch (prefService.getPrefType(prefName)) {
                    case prefService.PREF_STRING:
                        return prefService.getStringPref(prefName);
                    case prefService.PREF_INT:
                        return prefService.getIntPref(prefName);
                    case prefService.PREF_BOOL:
                        return prefService.getBoolPref(prefName);
                }
            }
        } catch (e) {
            console.warn(`Failed to read preference ${prefName}:`, e);
        }
        return defaultValue;
    };

    // Read preference values
    const AI_MODEL_VALUE = getPref(AI_MODEL_PREF, "1"); // Default to Gemini
    const OLLAMA_ENDPOINT_VALUE = getPref(OLLAMA_ENDPOINT_PREF, "http://localhost:11434/api/generate");
    const OLLAMA_MODEL_VALUE = getPref(OLLAMA_MODEL_PREF, "llama3.2");
    const GEMINI_API_KEY_VALUE = getPref(GEMINI_API_KEY_PREF, "");
    const GEMINI_MODEL_VALUE = getPref(GEMINI_MODEL_PREF, "gemini-1.5-flash");

    const CONFIG = {
        apiConfig: {
            ollama: {
                endpoint: OLLAMA_ENDPOINT_VALUE,
                enabled: AI_MODEL_VALUE == "2",
                model: OLLAMA_MODEL_VALUE,
                promptTemplateBatch: `Analyze the following numbered list of tab data (Title, URL, Description) and assign a concise category (1-2 words, Title Case) for EACH tab.

                Existing Categories (Use these EXACT names if a tab fits):
                {EXISTING_CATEGORIES_LIST}

                ---
                Instructions for Assignment:
                1.  **Prioritize Existing:** For each tab below, determine if it clearly belongs to one of the 'Existing Categories'. Base this primarily on the URL/Domain, then Title/Description. If it fits, you MUST use the EXACT category name provided in the 'Existing Categories' list. DO NOT create a minor variation (e.g., if 'Project Docs' exists, use that, don't create 'Project Documentation').
                2.  **Assign New Category (If Necessary):** Only if a tab DOES NOT fit an existing category, assign the best NEW concise category (1-2 words, Title Case).
                    *   PRIORITIZE the URL/Domain (e.g., 'GitHub', 'YouTube', 'StackOverflow').
                    *   Use Title/Description for specifics or generic domains.
                3.  **Consistency is CRITICAL:** Use the EXACT SAME category name for all tabs belonging to the same logical group (whether assigned an existing or a new category). If multiple tabs point to 'google.com/search?q=recipes', categorize them consistently (e.g., 'Google Search' or 'Recipes', but use the same one for all).
                4.  **Format:** 1-2 words, Title Case.

                ---
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

                Output:`
            },
            gemini: {
                enabled: AI_MODEL_VALUE == "1",
                apiKey: GEMINI_API_KEY_VALUE,
                model: GEMINI_MODEL_VALUE,
                // Endpoint structure: https://generativelanguage.googleapis.com/v1beta/models/{model}:{method}
                apiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/models/',
                promptTemplateBatch: `Analyze the following numbered list of tab data (Title, URL, Description) and assign a concise category (1-2 words, Title Case) for EACH tab.

                    Existing Categories (Use these EXACT names if a tab fits):
                    {EXISTING_CATEGORIES_LIST}

                    ---
                    Instructions for Assignment:
                    1.  **Prioritize Existing:** For each tab below, determine if it clearly belongs to one of the 'Existing Categories'. Base this primarily on the URL/Domain, then Title/Description. If it fits, you MUST use the EXACT category name provided in the 'Existing Categories' list. DO NOT create a minor variation (e.g., if 'Project Docs' exists, use that, don't create 'Project Documentation').
                    2.  **Assign New Category (If Necessary):** Only if a tab DOES NOT fit an existing category, assign the best NEW concise category (1-2 words, Title Case).
                        *   PRIORITIZE the URL/Domain (e.g., 'GitHub', 'YouTube', 'StackOverflow').
                        *   Use Title/Description for specifics or generic domains.
                    3.  **Consistency is CRITICAL:** Use the EXACT SAME category name for all tabs belonging to the same logical group (whether assigned an existing or a new category). If multiple tabs point to 'google.com/search?q=recipes', categorize them consistently (e.g., 'Google Search' or 'Recipes', but use the same one for all).
                    4.  **Format:** 1-2 words, Title Case.

                    ---
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

                    Output:`,
                generationConfig: {
                    temperature: 0.1, // Low temp for consistency
                    // maxOutputTokens: calculated dynamically based on tab count
                    candidateCount: 1, // Only need one best answer
                    // stopSequences: ["---"] // Optional: define sequences to stop generation
                }
            },
            customApi: {
                enabled: false,
                // ... (custom API config if needed)
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
        titleKeywordStopWords: new Set([
            'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'of',
            'is', 'am', 'are', 'was', 'were', 'be', 'being', 'been', 'has', 'have', 'had', 'do', 'does', 'did',
            'how', 'what', 'when', 'where', 'why', 'which', 'who', 'whom', 'whose',
            'new', 'tab', 'untitled', 'page', 'home', 'com', 'org', 'net', 'io', 'dev', 'app',
            'get', 'set', 'list', 'view', 'edit', 'create', 'update', 'delete',
            'my', 'your', 'his', 'her', 'its', 'our', 'their', 'me', 'you', 'him', 'her', 'it', 'us', 'them',
            'about', 'search', 'results', 'posts', 'index', 'dashboard', 'profile', 'settings',
            'official', 'documentation', 'docs', 'wiki', 'help', 'support', 'faq', 'guide',
            'error', 'login', 'signin', 'sign', 'up', 'out', 'welcome', 'loading', 'vs', 'using', 'code',
            'microsoft', 'google', 'apple', 'amazon', 'facebook', 'twitter'
        ]),
        minKeywordLength: 3,
        consolidationDistanceThreshold: 2, // Max Levenshtein distance to merge similar group names
        styles: `
        #sort-button {
            opacity: 0;
            transition: opacity 0.1s ease-in-out;
            position: absolute;
            right: 55px; /* Positioned to the left of the clear button */
            font-size: 12px;
            width: 60px;
            pointer-events: auto;
            align-self: end;
            appearance: none;
            margin-top: -8px;
            padding: 1px;
            color: gray;
            label { display: block; }
        }
        #sort-button:hover {
            opacity: 1;
            color: white;
            border-radius: 4px;
        }

        #clear-button {
            opacity: 0;
            transition: opacity 0.1s ease-in-out;
            position: absolute;
            right: 0;
            font-size: 12px;
            width: 60px;
            pointer-events: auto;
            align-self: end;
            appearance: none;
            margin-top: -8px;
            padding: 1px;
            color: grey;
            label { display: block; }
        }
        #clear-button:hover {
            opacity: 1;
            color: white;
            border-radius: 4px;
        }
        /* Separator Base Style (Ensures background is animatable) */
        .vertical-pinned-tabs-container-separator {
             display: flex !important;
             flex-direction: column;
             margin-left: 0;
             min-height: 1px;
             background-color: var(--lwt-toolbarbutton-border-color, rgba(200, 200, 200, 0.1)); /* Subtle base color */
             transition: width 0.1s ease-in-out, margin-right 0.1s ease-in-out, background-color 0.3s ease-out; /* Add background transition */
        }
        /* Separator Hover Logic */
        .vertical-pinned-tabs-container-separator:has(#sort-button):has(#clear-button):hover {
            width: calc(100% - 115px); /* 60px (clear) + 55px (sort) */
            margin-right: auto;
            background-color: var(--lwt-toolbarbutton-hover-background, rgba(200, 200, 200, 0.2)); /* Slightly lighter on hover */
        }
         /* Hover when ONLY SORT is present */
        .vertical-pinned-tabs-container-separator:has(#sort-button):not(:has(#clear-button)):hover {
            width: calc(100% - 65px); /* Only space for sort + margin */
            margin-right: auto;
            background-color: var(--lwt-toolbarbutton-hover-background, rgba(200, 200, 200, 0.2));
        }
         /* Hover when ONLY CLEAR is present */
        .vertical-pinned-tabs-container-separator:not(:has(#sort-button)):has(#clear-button):hover {
            width: calc(100% - 60px); /* Only space for clear */
            margin-right: auto;
            background-color: var(--lwt-toolbarbutton-hover-background, rgba(200, 200, 200, 0.2));
        }
        /* Show BOTH buttons on separator hover */
        .vertical-pinned-tabs-container-separator:hover #sort-button,
        .vertical-pinned-tabs-container-separator:hover #clear-button {
            opacity: 1;
        }

        /* When theres no Pinned Tabs */
        .zen-workspace-tabs-section[hide-separator] .vertical-pinned-tabs-container-separator {
            display: flex !important;
            flex-direction: column !important;
            margin-left: 0 !important;
            margin-top: 5px !important;
            margin-bottom: 8px !important;
            min-height: 1px !important;
            background-color: var(--lwt-toolbarbutton-border-color, rgba(200, 200, 200, 0.1)); /* Subtle base color */
            transition: width 0.1s ease-in-out, margin-right 0.1s ease-in-out, background-color 0.3s ease-out; /* Add background transition */
        }
         /* Hover when BOTH buttons are potentially visible (No Pinned) */
        .zen-workspace-tabs-section[hide-separator] .vertical-pinned-tabs-container-separator:has(#sort-button):has(#clear-button):hover {
             width: calc(100% - 115px); /* 60px (clear) + 55px (sort) */
             margin-right: auto;
             background-color: var(--lwt-toolbarbutton-hover-background, rgba(200, 200, 200, 0.2));
        }
         /* Hover when ONLY SORT is present (No Pinned) */
        .zen-workspace-tabs-section[hide-separator] .vertical-pinned-tabs-container-separator:has(#sort-button):not(:has(#clear-button)):hover {
                width: calc(100% - 65px); /* Only space for sort + margin */
                margin-right: auto;
                background-color: var(--lwt-toolbarbutton-hover-background, rgba(200, 200, 200, 0.2));
            }
            /* Hover when ONLY CLEAR is present (No Pinned) */
        .zen-workspace-tabs-section[hide-separator] .vertical-pinned-tabs-container-separator:not(:has(#sort-button)):has(#clear-button):hover {
                width: calc(100% - 60px); /* Only space for clear */
                margin-right: auto;
                background-color: var(--lwt-toolbarbutton-hover-background, rgba(200, 200, 200, 0.2));
            }
        /* Show BOTH buttons on separator hover (No Pinned) */
        .zen-workspace-tabs-section[hide-separator] .vertical-pinned-tabs-container-separator:hover #sort-button,
        .zen-workspace-tabs-section[hide-separator] .vertical-pinned-tabs-container-separator:hover #clear-button {
            opacity: 1;
        }

        /* Separator Pulsing Animation */
        @keyframes pulse-separator-bg {
            0% { background-color: var(--lwt-toolbarbutton-border-color, rgb(255, 141, 141)); }
            50% { background-color: var(--lwt-toolbarbutton-hover-background, rgba(137, 178, 255, 0.91)); } /* Brighter pulse color */
            100% { background-color: var(--lwt-toolbarbutton-border-color, rgb(142, 253, 238)); }
        }

        .separator-is-sorting {
            animation: pulse-separator-bg 1.5s ease-in-out infinite;
            will-change: background-color;
        }

        /* Tab Animations */
        .tab-closing {
            animation: fadeUp 0.5s forwards;
        }
        @keyframes fadeUp {
            0% { opacity: 1; transform: translateY(0); }
            100% { opacity: 0; transform: translateY(-20px); max-height: 0px; padding: 0; margin: 0; border: 0; } /* Add max-height */
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
        .tabbrowser-tab {
            transition: transform 0.3s ease-out, opacity 0.3s ease-out, max-height 0.5s ease-out, margin 0.5s ease-out, padding 0.5s ease-out; /* Add transition for closing */
        }
    `
    };

    // --- Globals & State ---
    let groupColorIndex = 0;
    let isSorting = false;
    let commandListenerAdded = false;

    // --- Helper Functions ---

    const injectStyles = () => {
        let styleElement = document.getElementById('tab-sort-clear-styles');
        if (styleElement) {
            if (styleElement.textContent !== CONFIG.styles) {
                styleElement.textContent = CONFIG.styles;
                console.log("BUTTONS: Styles updated.");
            }
            return;
        }
        styleElement = Object.assign(document.createElement('style'), {
            id: 'tab-sort-clear-styles',
            textContent: CONFIG.styles
        });
        document.head.appendChild(styleElement);
        console.log("BUTTONS: Styles injected.");
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
                        if (pathSegment) {
                            title = pathSegment;
                        }
                    } catch { /* ignore */ }
                }
            } else {
                title = originalTitle.trim();
            }
            title = title || 'Untitled Page';

            try {
                if (browser && browser.contentDocument) {
                    const metaDescElement = browser.contentDocument.querySelector('meta[name="description"]');
                    if (metaDescElement) {
                        description = metaDescElement.getAttribute('content')?.trim() || '';
                        description = description.substring(0, 200);
                    }
                }
            } catch (contentError) {
                /* ignore permission errors */
            }
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

    const processTopic = (text) => {
        if (!text) return "Uncategorized";

        const originalTextTrimmedLower = text.trim().toLowerCase();
        const normalizationMap = {
            'github.com': 'GitHub', 'github': 'GitHub',
            'stackoverflow.com': 'Stack Overflow', 'stack overflow': 'Stack Overflow', 'stackoverflow': 'Stack Overflow',
            'google docs': 'Google Docs', 'd