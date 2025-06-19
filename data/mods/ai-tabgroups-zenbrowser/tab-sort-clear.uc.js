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
            'google docs': 'Google Docs', 'docs.google.com': 'Google Docs',
            'google drive': 'Google Drive', 'drive.google.com': 'Google Drive',
            'youtube.com': 'YouTube', 'youtube': 'YouTube',
            'reddit.com': 'Reddit', 'reddit': 'Reddit',
            'chatgpt': 'ChatGPT', 'openai.com': 'OpenAI',
            'gmail': 'Gmail', 'mail.google.com': 'Gmail',
            'aws': 'AWS', 'amazon web services': 'AWS',
            'pinterest.com': 'Pinterest', 'pinterest': 'Pinterest',
            'developer.mozilla.org': 'MDN Web Docs', 'mdn': 'MDN Web Docs', 'mozilla': 'Mozilla'
        };

        if (normalizationMap[originalTextTrimmedLower]) {
            return normalizationMap[originalTextTrimmedLower];
        }

        let processedText = text.replace(/^(Category is|The category is|Topic:)\s*"?/i, '');
        processedText = processedText.replace(/^\s*[\d.\-*]+\s*/, '');
        let words = processedText.trim().split(/\s+/);
        let category = words.slice(0, 2).join(' ');
        category = category.replace(/["'*().:;,]/g, '');

        return toTitleCase(category).substring(0, 40) || "Uncategorized";
    };

    const extractTitleKeywords = (title) => {
        if (!title || typeof title !== 'string') {
            return new Set();
        }
        const cleanedTitle = title.toLowerCase()
            .replace(/[-_]/g, ' ')
            .replace(/[^\w\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        const words = cleanedTitle.split(' ');
        const keywords = new Set();

        for (const word of words) {
            if (word.length >= CONFIG.minKeywordLength && !CONFIG.titleKeywordStopWords.has(word) && !/^\d+$/.test(word)) {
                keywords.add(word);
            }
        }
        return keywords;
    };

    const getNextGroupColorName = () => {
        const colorName = CONFIG.groupColorNames[groupColorIndex % CONFIG.groupColorNames.length];
        groupColorIndex++;
        return colorName;
    };

    const findGroupElement = (topicName, workspaceId) => {
        const sanitizedTopicName = topicName.trim();
        if (!sanitizedTopicName) return null;

        // Escape special characters for CSS selector
        const safeSelectorTopicName = sanitizedTopicName.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

        // Use :has() to find the group by label that CONTAINS a tab with the correct workspace ID
        const selector = `tab-group[label="${safeSelectorTopicName}"]:has(tab[zen-workspace-id="${workspaceId}"])`;

        try {
            // console.log(`findGroupElement: Searching with selector: ${selector}`); // Optional debug log
            return document.querySelector(selector);
        } catch (e) {
            console.error(`Error finding group with selector: ${selector}`, e);
            return null;
        }
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
    // --- End Helper Functions ---


    // --- AI Interaction ---
    const askAIForMultipleTopics = async (tabs, existingCategoryNames = []) => {
        const validTabs = tabs.filter(tab => tab && tab.isConnected);
        if (!validTabs || validTabs.length === 0) {
            return [];
        }

        const { gemini, ollama } = CONFIG.apiConfig;
        let result = [];
        let apiChoice = "None";

        validTabs.forEach(tab => tab.classList.add('tab-is-sorting'));

        try {
            if (gemini.enabled) {
                apiChoice = "Gemini";
                if (!gemini.apiKey) {
                    throw new Error("Gemini API key is missing or not set. Please paste your key in the CONFIG section.");
                }
                console.log(`Batch AI (Gemini): Requesting categories for ${validTabs.length} tabs, considering ${existingCategoryNames.length} existing categories...`);

                const tabDataArray = validTabs.map(getTabData);
                const formattedTabDataList = tabDataArray.map((data, index) =>
                    `${index + 1}.\nTitle: "${data.title}"\nURL: "${data.url}"\nDescription: "${data.description}"`
                ).join('\n\n');
                const formattedExistingCategories = existingCategoryNames.length > 0
                    ? existingCategoryNames.map(name => `- ${name}`).join('\n')
                    : "None";

                const prompt = gemini.promptTemplateBatch
                    .replace("{EXISTING_CATEGORIES_LIST}", formattedExistingCategories)
                    .replace("{TAB_DATA_LIST}", formattedTabDataList);

                const apiUrl = `${gemini.apiBaseUrl}${gemini.model}:generateContent?key=${gemini.apiKey}`;
                const headers = { 'Content-Type': 'application/json' };
                const estimatedOutputTokens = Math.max(256, validTabs.length * 16); // Dynamic estimation

                const requestBody = {
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        ...gemini.generationConfig,
                        maxOutputTokens: estimatedOutputTokens
                    }
                };

                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify(requestBody)
                });

                if (!response.ok) {
                    let errorText = `API Error ${response.status}`;
                    try {
                        const errorData = await response.json();
                        errorText += `: ${errorData?.error?.message || response.statusText}`;
                        console.error("Gemini API Error Response:", errorData);
                    } catch (parseError) {
                        errorText += `: ${response.statusText}`;
                        const rawText = await response.text().catch(() => '');
                        console.error("Gemini API Error Raw Response:", rawText);
                    }
                    if (response.status === 400 && errorText.includes("API key not valid")) {
                         throw new Error(`Gemini API Error: API key is not valid. Please check the key in the script configuration. (${errorText})`);
                    }
                    if (response.status === 403) {
                        throw new Error(`Gemini API Error: Permission denied. Ensure the API key has the 'generativelanguage.models.generateContent' permission enabled. (${errorText})`);
                    }
                    throw new Error(errorText);
                }

                const data = await response.json();
                const aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

                if (!aiText) {
                    console.error("Gemini API: Empty or unexpected response structure.", data);
                    if (data?.promptFeedback?.blockReason) {
                         throw new Error(`Gemini API Error: Request blocked due to ${data.promptFeedback.blockReason}. Check safety ratings: ${JSON.stringify(data.promptFeedback.safetyRatings)}`);
                    }
                    if (data?.candidates?.[0]?.finishReason && data.candidates[0].finishReason !== "STOP") {
                        throw new Error(`Gemini API Error: Generation finished unexpectedly due to ${data.candidates[0].finishReason}.`);
                    }
                    throw new Error("Gemini API response content is missing or empty.");
                }

                console.log("Gemini Raw Response Text:\n---\n", aiText, "\n---");
                const lines = aiText.split('\n').map(line => line.trim()).filter(Boolean);

                if (lines.length !== validTabs.length) {
                    console.warn(`Batch AI (Gemini): Mismatch! Expected ${validTabs.length} topics, received ${lines.length}.`);
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
                    console.log("Batch AI (Gemini): Processed Topics:", processedTopics);
                    result = validTabs.map((tab, index) => ({ tab: tab, topic: processedTopics[index] }));
                }

            } else if (ollama.enabled) {
                // --- OLLAMA LOGIC ---
                apiChoice = "Ollama";
                console.log(`Batch AI (Ollama): Requesting categories for ${validTabs.length} tabs, considering ${existingCategoryNames.length} existing categories...`);
                let apiUrl = ollama.endpoint;
                let headers = { 'Content-Type': 'application/json' };

                const tabDataArray = validTabs.map(getTabData);
                const formattedTabDataList = tabDataArray.map((data, index) =>
                    `${index + 1}.\nTitle: "${data.title}"\nURL: "${data.url}"\nDescription: "${data.description}"`
                ).join('\n\n');
                const formattedExistingCategories = existingCategoryNames.length > 0
                    ? existingCategoryNames.map(name => `- ${name}`).join('\n')
                    : "None";

                const prompt = ollama.promptTemplateBatch
                    .replace("{EXISTING_CATEGORIES_LIST}", formattedExistingCategories)
                    .replace("{TAB_DATA_LIST}", formattedTabDataList);

                const requestBody = {
                    model: ollama.model,
                    prompt: prompt,
                    stream: false,
                    options: { temperature: 0.1, num_predict: validTabs.length * 15 } // Dynamic estimation
                };

                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify(requestBody)
                });

                if (!response.ok) {
                    const errorText = await response.text().catch(() => 'Unknown API error reason');
                    throw new Error(`Ollama API Error ${response.status}: ${errorText}`);
                }

                const data = await response.json();
                let aiText = data.response?.trim();

                if (!aiText) {
                    throw new Error("Ollama: Empty API response");
                }

                const lines = aiText.split('\n').map(line => line.trim()).filter(Boolean);

                if (lines.length !== validTabs.length) {
                    console.warn(`Batch AI (Ollama): Mismatch! Expected ${validTabs.length} topics, received ${lines.length}. AI Response:\n${aiText}`);
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
                    console.log("Batch AI (Ollama): Processed Topics:", processedTopics);
                    result = validTabs.map((tab, index) => ({ tab: tab, topic: processedTopics[index] }));
                }
            } else {
                throw new Error("No AI API is enabled in the configuration (Gemini or Ollama).");
            }
            return result;
        } catch (error) {
            console.error(`Batch AI (${apiChoice}): Error getting topics:`, error);
            // Return "Uncategorized" for all tabs on error
            return validTabs.map(tab => ({ tab, topic: "Uncategorized" }));
        } finally {
            // Remove sorting indicator after a short delay
            setTimeout(() => {
                validTabs.forEach(tab => {
                    if (tab && tab.isConnected) {
                        tab.classList.remove('tab-is-sorting');
                    }
                });
            }, 200);
        }
    };
    // --- End AI Interaction ---

    // --- Main Sorting Function ---
    const sortTabsByTopic = async () => {
        if (isSorting) {
            console.log("Sorting already in progress.");
            return;
        }
        isSorting = true;

        // Check for multiple tab selection
        const selectedTabs = gBrowser.selectedTabs;
        const isSortingSelectedTabs = selectedTabs.length > 1;
        const actionType = isSortingSelectedTabs ? "selected tabs" : "all ungrouped tabs";

        console.log(`Starting tab sort (${actionType} mode) - (v4.10.0 - Flexible Group Selector)...`);

        let separatorsToSort = []; // Keep track of separators to remove class later
        try {
             separatorsToSort = document.querySelectorAll('.vertical-pinned-tabs-container-separator');
             if(separatorsToSort.length > 0) {
                 console.log("Applying sorting indicator to separator(s)...");
                 separatorsToSort.forEach(sep => sep.classList.add('separator-is-sorting'));
             } else {
                  console.warn("Could not find separator element to apply sorting indicator.");
             }

            const currentWorkspaceId = window.gZenWorkspaces?.activeWorkspace;
            if (!currentWorkspaceId) {
                console.error("Cannot get current workspace ID.");
                // No need to set isSorting = false here, finally block handles it
                return; // Exit early
            }

            // --- Step 1: Get ALL Existing Group Names for Context ---
            const allExistingGroupNames = new Set();
            // CORRECTED SELECTOR using :has()
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

            // Determine if we are sorting multiple selected tabs
            let initialTabsToSort = [];
            if (isSortingSelectedTabs) {
                console.log(` -> Sorting ${selectedTabs.length} selected tabs.`);
                initialTabsToSort = selectedTabs.filter(tab => {
                    const isInCorrectWorkspace = tab.getAttribute('zen-workspace-id') === currentWorkspaceId;
                    // For multi-selected tabs, we allow sorting even if they are already in a group.
                    return (
                        isInCorrectWorkspace &&
                        !tab.pinned &&
                        !tab.hasAttribute('zen-empty-tab') &&
                        tab.isConnected
                    );
                });
            } else {
                // Sort all ungrouped tabs - ensure they aren't already in a group matched by the NEW selector
                console.log(" -> Sorting all ungrouped tabs in the current workspace.");
                initialTabsToSort = Array.from(gBrowser.tabs).filter(tab => {
                    const isInCorrectWorkspace = tab.getAttribute('zen-workspace-id') === currentWorkspaceId;
                    const groupParent = tab.closest('tab-group');
                    const isInGroupInCorrectWorkspace = groupParent ? groupParent.matches(groupSelector) : false;
                    return (
                        isInCorrectWorkspace &&  // Must be in the target workspace
                        !tab.pinned && // Not pinned
                        !tab.hasAttribute('zen-empty-tab') && // Not an empty zen tab
                        !isInGroupInCorrectWorkspace && // Not already in a group belonging to this workspace
                        tab.isConnected // Tab is connected
                    );
                });
            }

            if (initialTabsToSort.length === 0) {
                console.log(`No tabs to sort in this workspace (${actionType} mode).`);
                // No need to set isSorting = false here, finally block handles it
                return; // Exit early
            }
            console.log(`Found ${initialTabsToSort.length} tabs to process for sorting.`);

            // --- Pre-Grouping Logic (Keywords & Hostnames) ---
            const preGroups = {};
            const handledTabs = new Set();
            const tabDataCache = new Map();
            const tabKeywordsCache = new Map();

            initialTabsToSort.forEach(tab => {
                const data = getTabData(tab);
                tabDataCache.set(tab, data);
                tabKeywordsCache.set(tab, data.title ? extractTitleKeywords(data.title) : new Set());
            });

            // Keyword pre-grouping
            const keywordToTabsMap = new Map();
            initialTabsToSort.forEach(tab => {
                const keywords = tabKeywordsCache.get(tab);
                if (keywords) {
                    keywords.forEach(keyword => {
                        if (!keywordToTabsMap.has(keyword)) {
                            keywordToTabsMap.set(keyword, new Set());
                        }
                        keywordToTabsMap.get(keyword).add(tab);
                    });
                }
            });

            const potentialKeywordGroups = [];
            keywordToTabsMap.forEach((tabsSet, keyword) => {
                if (tabsSet.size >= CONFIG.preGroupingThreshold) {
                    potentialKeywordGroups.push({ keyword: keyword, tabs: tabsSet, size: tabsSet.size });
                }
            });
            potentialKeywordGroups.sort((a, b) => b.size - a.size); // Process larger groups first

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

            // Hostname pre-grouping (for remaining tabs)
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
                    // Avoid creating a hostname group if a keyword group with the same processed name already exists
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
            // --- End Pre-Grouping Logic ---

            // --- AI Grouping for Remaining Tabs ---
            const tabsForAI = initialTabsToSort.filter(tab => !handledTabs.has(tab) && tab.isConnected);
            let aiTabTopics = [];
            const comprehensiveExistingNames = new Set([...allExistingGroupNames, ...Object.keys(preGroups)]);
            const existingNamesForAIContext = Array.from(comprehensiveExistingNames);

            if (tabsForAI.length > 0) {
                console.log(` -> ${tabsForAI.length} tabs remaining for AI analysis. Providing ${existingNamesForAIContext.length} existing categories as context.`);
                aiTabTopics = await askAIForMultipleTopics(tabsForAI, existingNamesForAIContext); // Pass comprehensive names
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
                    return; // Skip invalid/uncategorized/disconnected
                }
                if (!finalGroups[topic]) {
                    finalGroups[topic] = [];
                }
                // Double-check if tab was somehow handled between AI request and processing
                if (!handledTabs.has(tab)) {
                    finalGroups[topic].push(tab);
                    handledTabs.add(tab); // Mark as handled now
                } else {
                    const originalGroup = Object.keys(preGroups).find(key => preGroups[key].includes(tab));
                    console.warn(` -> AI suggested category "${topic}" for tab "${getTabData(tab).title}", but it was already pre-grouped under "${originalGroup || 'Unknown Pre-Group'}". Keeping pre-grouped assignment.`);
                }
            });
            // --- End Combine Groups ---

            // --- Consolidate Similar Category Names (Levenshtein distance) ---
            console.log(" -> Consolidating potential duplicate categories...");
            const originalKeys = Object.keys(finalGroups);
            const mergedKeys = new Set();
            const consolidationMap = {}; // To track merges: mergedKey -> canonicalKey

            for (let i = 0; i < originalKeys.length; i++) {
                let keyA = originalKeys[i];
                if (mergedKeys.has(keyA)) continue; // Already merged into another key

                // Resolve transitive merges for keyA if it was already targeted
                while (consolidationMap[keyA]) {
                    keyA = consolidationMap[keyA];
                }
                 if (mergedKeys.has(keyA)) continue; // Check again after resolving transitive merges

                for (let j = i + 1; j < originalKeys.length; j++) {
                    let keyB = originalKeys[j];
                    if (mergedKeys.has(keyB)) continue;

                    // Resolve transitive merges for keyB
                    while (consolidationMap[keyB]) {
                        keyB = consolidationMap[keyB];
                    }
                     if (mergedKeys.has(keyB) || keyA === keyB) continue; // Already merged or identical after resolving

                    const distance = levenshteinDistance(keyA, keyB);
                    const threshold = CONFIG.consolidationDistanceThreshold;

                    if (distance <= threshold && distance > 0) { // Only merge if similar but not identical
                        // Determine which key to keep (prioritize existing, then pre-grouped, then shorter)
                        let canonicalKey = keyA;
                        let mergedKey = keyB;

                        const keyAIsActuallyExisting = allExistingGroupNames.has(keyA);
                        const keyBIsActuallyExisting = allExistingGroupNames.has(keyB);
                        const keyAIsPreGroup = keyA in preGroups;
                        const keyBIsPreGroup = keyB in preGroups;

                        // Priority: Existing > Pre-Group > Shorter Length
                        if (keyBIsActuallyExisting && !keyAIsActuallyExisting) {
                            [canonicalKey, mergedKey] = [keyB, keyA]; // B is existing, A is not
                        } else if (keyAIsActuallyExisting && keyBIsActuallyExisting) {
                            // Both exist, prefer pre-group, then shorter
                             if (keyBIsPreGroup && !keyAIsPreGroup) [canonicalKey, mergedKey] = [keyB, keyA];
                             else if (keyA.length > keyB.length) [canonicalKey, mergedKey] = [keyB, keyA];
                        } else if (!keyAIsActuallyExisting && !keyBIsActuallyExisting) {
                             // Neither exist, prefer pre-group, then shorter
                             if (keyBIsPreGroup && !keyAIsPreGroup) [canonicalKey, mergedKey] = [keyB, keyA];
                             else if (keyA.length > keyB.length) [canonicalKey, mergedKey] = [keyB, keyA];
                        }
                         // Handle the case where keyA exists, keyB doesn't (already default)

                        console.log(`    - Consolidating: Merging "${mergedKey}" into "${canonicalKey}" (Distance: ${distance})`);

                        // Merge tabs from mergedKey into canonicalKey
                        if (finalGroups[mergedKey]) {
                            if (!finalGroups[canonicalKey]) finalGroups[canonicalKey] = [];
                            const uniqueTabsToAdd = finalGroups[mergedKey].filter(tab =>
                                tab && tab.isConnected && !finalGroups[canonicalKey].some(existingTab => existingTab === tab)
                            );
                            finalGroups[canonicalKey].push(...uniqueTabsToAdd);
                        }

                        mergedKeys.add(mergedKey); // Mark B as merged
                        consolidationMap[mergedKey] = canonicalKey; // Track the merge target
                        delete finalGroups[mergedKey]; // Remove the merged group

                        // If keyA was the one being merged, update keyA to the canonical key for subsequent checks in the inner loop
                        if (mergedKey === keyA) {
                            keyA = canonicalKey;
                            break; // Break inner loop as keyA has changed, restart comparison from outer loop perspective
                        }
                    }
                }
            }
            console.log(" -> Consolidation complete.");
            // --- End Consolidation ---

            console.log(" -> Final Consolidated groups:", Object.keys(finalGroups).map(k => `${k} (${finalGroups[k]?.length ?? 0})`).join(', '));
            if (Object.keys(finalGroups).length === 0) {
                console.log("No valid groups identified after consolidation. Sorting finished.");
                // No need to set isSorting = false here, finally block handles it
                return; // Exit early
            }

            // --- Step 2: Get existing group ELEMENTS once before the loop ---
            const existingGroupElementsMap = new Map();
            document.querySelectorAll(groupSelector).forEach(groupEl => { // Use the same corrected selector
                const label = groupEl.getAttribute('label');
                if (label) {
                    existingGroupElementsMap.set(label, groupEl);
                }
            });

            // Reset color index AFTER consolidation, before creating new groups
            groupColorIndex = 0;

            // --- Process each final, consolidated group ---
            for (const topic in finalGroups) {
                // Filter AGAIN for valid, connected tabs right before moving/grouping
                const tabsForThisTopic = finalGroups[topic].filter(t => {
                    if (!t || !t.isConnected) return false;
                    // Always allow valid tabs through; group membership will be checked at move time
                    return true;
                 });

                if (tabsForThisTopic.length === 0) {
                    console.log(` -> Skipping group "${topic}" as no valid, unsorted tabs remain in this workspace.`);
                    continue; // Skip empty or already correctly sorted collections
                }

                // --- Step 3: Use the Map for lookup ---
                const existingGroupElement = existingGroupElementsMap.get(topic);

                if (existingGroupElement && existingGroupElement.isConnected) { // Check if the element is still in the DOM
                    // Move tabs to EXISTING group
                    console.log(` -> Moving ${tabsForThisTopic.length} tabs to existing group "${topic}".`);
                    try {
                        // Ensure group is expanded before moving tabs into it
                        if (existingGroupElement.getAttribute("collapsed") === "true") {
                            existingGroupElement.setAttribute("collapsed", "false");
                            const groupLabelElement = existingGroupElement.querySelector('.tab-group-label');
                            if (groupLabelElement) {
                                groupLabelElement.setAttribute('aria-expanded', 'true'); // Ensure visually expanded too
                            }
                        }
                        // Move tabs one by one
                        for (const tab of tabsForThisTopic) {
                            if (!tab || !tab.isConnected) continue;
                            const groupParent = tab.closest('tab-group');
                            // Only skip if already in the *target* group
                            const isAlreadyInTargetGroup = groupParent === existingGroupElement;
                            if (!isAlreadyInTargetGroup) {
                                gBrowser.moveTabToGroup(tab, existingGroupElement);
                            } else {
                                console.log(` -> Tab "${getTabData(tab)?.title || 'Unknown'}" is already in the correct group "${topic}", skipping move.`);
                            }
                        }
                    } catch (e) {
                        console.error(`Error moving tabs to existing group "${topic}":`, e, existingGroupElement);
                    }
                } else {
                    // Create NEW group
                    if (existingGroupElement && !existingGroupElement.isConnected) {
                        console.warn(` -> Existing group element for "${topic}" was found in map but is no longer connected to DOM. Will create a new group.`);
                    }

                    const wasOriginallyPreGroup = topic in preGroups;
                    const wasDirectlyFromAI = aiTabTopics.some(ait => ait.topic === topic && tabsForThisTopic.includes(ait.tab));

                    // Create group if it meets threshold OR came from pre-grouping OR came directly from AI
                    if (tabsForThisTopic.length >= CONFIG.preGroupingThreshold || wasDirectlyFromAI || wasOriginallyPreGroup) {
                        console.log(` -> Creating new group "${topic}" with ${tabsForThisTopic.length} tabs.`);
                        const firstValidTabForGroup = tabsForThisTopic[0]; // Need a reference tab for insertion point
                        const groupOptions = {
                            label: topic,
                            color: getNextGroupColorName(),
                            insertBefore: firstValidTabForGroup // Insert before the first tab being added
                        };
                        try {
                            // Create the group with all tabs at once
                            const newGroup = gBrowser.addTabGroup(tabsForThisTopic, groupOptions);

                            if (newGroup && newGroup.isConnected) { // Check if group was created and is in DOM
                                console.log(` -> Successfully created group element for "${topic}".`);
                                existingGroupElementsMap.set(topic, newGroup); // Add to map for potential later reuse in this run
                            } else {
                                console.warn(` -> addTabGroup didn't return a connected element for "${topic}". Attempting fallback find.`);
                                // Use the CORRECTED findGroupElement helper
                                const newGroupElFallback = findGroupElement(topic, currentWorkspaceId);
                                if (newGroupElFallback && newGroupElFallback.isConnected) {
                                    console.log(` -> Found new group element for "${topic}" via fallback.`);
                                    existingGroupElementsMap.set(topic, newGroupElFallback); // Add to map via fallback
                                } else {
                                    console.error(` -> Failed to find the newly created group element for "${topic}" even with fallback.`);
                                }
                            }
                        } catch (e) {
                            console.error(`Error calling gBrowser.addTabGroup for topic "${topic}":`, e);
                            // Attempt to find the group even after an error, it might have partially succeeded
                            const groupAfterError = findGroupElement(topic, currentWorkspaceId);
                            if (groupAfterError && groupAfterError.isConnected) {
                                console.warn(` -> Group "${topic}" might exist despite error. Found via findGroupElement.`);
                                existingGroupElementsMap.set(topic, groupAfterError); // Update map
                            } else {
                                console.error(` -> Failed to find group "${topic}" after creation error.`);
                            }
                        }
                    } else {
                        console.log(` -> Skipping creation of small group "${topic}" (${tabsForThisTopic.length} tabs) - didn't meet threshold and wasn't a pre-group or directly from AI.`);
                    }
                }
            } // End loop through final groups

            console.log("--- Tab sorting process complete ---");

        } catch (error) {
            console.error("Error during overall sorting process:", error);
        } finally {
            isSorting = false; // Ensure sorting flag is reset

            // Remove loading indicator class
            if (separatorsToSort.length > 0) {
                console.log("Removing sorting indicator from separator(s)...");
                separatorsToSort.forEach(sep => {
                    // Check if element still exists before removing class
                    if (sep && sep.isConnected) {
                         sep.classList.remove('separator-is-sorting');
                    }
                });
            }

            // Remove tab loading indicators after a delay
            setTimeout(() => {
                Array.from(gBrowser.tabs).forEach(tab => {
                    if (tab && tab.isConnected) {
                        tab.classList.remove('tab-is-sorting');
                    }
                });
            }, 500); // Keep existing delay for tabs
        }
    };
    // --- End Sorting Function ---


    // --- Clear Tabs Functionality ---
    const clearTabs = () => {
        console.log("Clearing tabs...");
        let closedCount = 0;
        try {
            const currentWorkspaceId = window.gZenWorkspaces?.activeWorkspace;
            if (!currentWorkspaceId) {
                console.error("CLEAR BTN: Cannot get current workspace ID.");
                return;
            }
            // Define the group selector for the current workspace *once*
            const groupSelector = `tab-group:has(tab[zen-workspace-id="${currentWorkspaceId}"])`;

            const tabsToClose = [];
            for (const tab of gBrowser.tabs) {
                 const isSameWorkSpace = tab.getAttribute('zen-workspace-id') === currentWorkspaceId;
                 const groupParent = tab.closest('tab-group');
                 // Check if the parent group matches the selector for the *current* workspace
                 const isInGroupInCorrectWorkspace = groupParent ? groupParent.matches(groupSelector) : false;
                 const isEmptyZenTab = tab.hasAttribute("zen-empty-tab");

                 if (isSameWorkSpace &&         // In the correct workspace
                    !tab.selected &&            // Not the active tab
                    !tab.pinned &&              // Not pinned
                    !isInGroupInCorrectWorkspace && // Not in a group belonging to this workspace
                    !isEmptyZenTab &&           // Not an empty Zen tab
                    tab.isConnected) {          // Is connected
                    tabsToClose.push(tab);
                 }
            }

            if (tabsToClose.length === 0) {
                console.log("CLEAR BTN: No ungrouped, non-pinned, non-active tabs found to clear in this workspace.");
                return;
            }

            console.log(`CLEAR BTN: Closing ${tabsToClose.length} tabs.`);
            tabsToClose.forEach(tab => {
                tab.classList.add('tab-closing'); // Add animation class
                closedCount++;
                // Delay removal to allow animation to play
                setTimeout(() => {
                    if (tab && tab.isConnected) {
                        try {
                            gBrowser.removeTab(tab, {
                                animate: false, // Animation handled by CSS
                                skipSessionStore: false,
                                closeWindowWithLastTab: false,
                            });
                        } catch (removeError) {
                            console.warn(`CLEAR BTN: Error removing tab: ${removeError}`, tab);
                            // Attempt to remove animation class if removal fails
                            tab.classList.remove('tab-closing');
                        }
                    }
                }, 500); // Match CSS animation duration
            });
        } catch (error) {
            console.error("CLEAR BTN: Error during tab clearing:", error);
        } finally {
            console.log(`CLEAR BTN: Initiated closing for ${closedCount} tabs.`);
        }
    };


    // --- Button Initialization & Workspace Handling ---

    function ensureButtonsExist(container) {
        if (!container) return;

        // Ensure Sort Button
        if (!container.querySelector('#sort-button')) {
            try {
                const buttonFragment = window.MozXULElement.parseXULToFragment(
                    `<toolbarbutton id="sort-button" command="cmd_zenSortTabs" label="⇅ Sort" tooltiptext="Sort Tabs into Groups by Topic (AI)"/>`
                );
                container.appendChild(buttonFragment.firstChild.cloneNode(true));
                console.log("BUTTONS: Sort button added to container:", container.id || container.className);
            } catch (e) {
                console.error("BUTTONS: Error creating/appending sort button:", e);
            }
        }

        // Ensure Clear Button
        if (!container.querySelector('#clear-button')) {
            try {
                const buttonFragment = window.MozXULElement.parseXULToFragment(
                    `<toolbarbutton id="clear-button" command="cmd_zenClearTabs" label="↓ Clear" tooltiptext="Close ungrouped, non-pinned tabs"/>`
                );
                container.appendChild(buttonFragment.firstChild.cloneNode(true));
                console.log("BUTTONS: Clear button added to container:", container.id || container.className);
            } catch (e) {
                console.error("BUTTONS: Error creating/appending clear button:", e);
            }
        }
    }

    function addButtonsToAllSeparators() {
        const separators = document.querySelectorAll(".vertical-pinned-tabs-container-separator");
        if (separators.length > 0) {
            separators.forEach(ensureButtonsExist);
        } else {
            // Fallback if no separators are found (e.g., different Zen Tab config or error)
            const periphery = document.querySelector('#tabbrowser-arrowscrollbox-periphery');
            if (periphery && !periphery.querySelector('#sort-button') && !periphery.querySelector('#clear-button')) {
                console.warn("BUTTONS: No separators found, attempting fallback append to periphery.");
                ensureButtonsExist(periphery);
            } else if (!periphery) {
                console.error("BUTTONS: No separators or fallback periphery container found.");
            }
        }
    }

    function setupCommandsAndListener() {
        const zenCommands = document.querySelector("commandset#zenCommandSet");
        if (!zenCommands) {
            console.error("BUTTONS INIT: Could not find 'commandset#zenCommandSet'. Zen Tab Organizer might not be fully loaded.");
            return;
        }

        // Add Sort Command if missing
        if (!zenCommands.querySelector("#cmd_zenSortTabs")) {
            try {
                const cmd = window.MozXULElement.parseXULToFragment(`<command id="cmd_zenSortTabs"/>`).firstChild;
                zenCommands.appendChild(cmd);
                console.log("BUTTONS INIT: Command 'cmd_zenSortTabs' added.");
            } catch (e) {
                console.error("BUTTONS INIT: Error adding command 'cmd_zenSortTabs':", e);
            }
        }

        // Add Clear Command if missing
        if (!zenCommands.querySelector("#cmd_zenClearTabs")) {
            try {
                const cmd = window.MozXULElement.parseXULToFragment(`<command id="cmd_zenClearTabs"/>`).firstChild;
                zenCommands.appendChild(cmd);
                console.log("BUTTONS INIT: Command 'cmd_zenClearTabs' added.");
            } catch (e) {
                console.error("BUTTONS INIT: Error adding command 'cmd_zenClearTabs':", e);
            }
        }

        // Add listener only once
        if (!commandListenerAdded) {
            try {
                zenCommands.addEventListener('command', (event) => {
                    if (event.target.id === "cmd_zenSortTabs") {
                        sortTabsByTopic();
                    } else if (event.target.id === "cmd_zenClearTabs") {
                        clearTabs();
                    }
                });
                commandListenerAdded = true;
                console.log("BUTTONS INIT: Command listener added for Sort and Clear.");
            } catch (e) {
                console.error("BUTTONS INIT: Error adding command listener:", e);
            }
        }
    }


    // --- gZenWorkspaces Hooks ---

    function setupZenWorkspaceHooks() {
        if (typeof gZenWorkspaces === 'undefined') {
            console.warn("BUTTONS: gZenWorkspaces object not found. Skipping hook setup. Ensure Zen Tab Organizer loads first.");
            return;
        }
        // Avoid applying hooks multiple times
        if (typeof gZenWorkspaces.originalHooks !== 'undefined') {
            console.log("BUTTONS HOOK: Hooks already seem to be applied. Skipping re-application.");
            return;
        }

        console.log("BUTTONS HOOK: Applying gZenWorkspaces hooks...");
        // Store original functions before overwriting
        gZenWorkspaces.originalHooks = {
            onTabBrowserInserted: gZenWorkspaces.onTabBrowserInserted,
            updateTabsContainers: gZenWorkspaces.updateTabsContainers,
        };

        // Hook into onTabBrowserInserted (called when workspace elements are likely created/updated)
        gZenWorkspaces.onTabBrowserInserted = function(event) {
            // Call the original function first
            if (typeof gZenWorkspaces.originalHooks.onTabBrowserInserted === 'function') {
                try {
                    gZenWorkspaces.originalHooks.onTabBrowserInserted.call(gZenWorkspaces, event);
                } catch (e) {
                    console.error("BUTTONS HOOK: Error in original onTabBrowserInserted:", e);
                }
            }
            // Add buttons after a short delay to ensure elements are ready
            setTimeout(addButtonsToAllSeparators, 150); // Slightly increased delay for safety
        };

        // Hook into updateTabsContainers (called on various workspace/tab changes)
        gZenWorkspaces.updateTabsContainers = function(...args) {
             // Call the original function first
            if (typeof gZenWorkspaces.originalHooks.updateTabsContainers === 'function') {
                try {
                    gZenWorkspaces.originalHooks.updateTabsContainers.apply(gZenWorkspaces, args);
                } catch (e) {
                    console.error("BUTTONS HOOK: Error in original updateTabsContainers:", e);
                }
            }
            // Add buttons after a short delay
            setTimeout(addButtonsToAllSeparators, 150); // Slightly increased delay for safety
        };
        console.log("BUTTONS HOOK: gZenWorkspaces hooks applied successfully.");
    }


    // --- Initial Setup Trigger ---

    function initializeScript() {
        console.log("INIT: Sort & Clear Tabs Script (v4.10.0 - Gemini - Structured) loading...");
        let checkCount = 0;
        const maxChecks = 30; // Check for up to ~30 seconds
        const checkInterval = 1000; // Check every second

        const initCheckInterval = setInterval(() => {
            checkCount++;

            // Check for necessary conditions
            const separatorExists = !!document.querySelector(".vertical-pinned-tabs-container-separator");
            const peripheryExists = !!document.querySelector('#tabbrowser-arrowscrollbox-periphery');
            const commandSetExists = !!document.querySelector("commandset#zenCommandSet");
            const gBrowserReady = typeof gBrowser !== 'undefined' && gBrowser.tabContainer;
            const gZenWorkspacesReady = typeof gZenWorkspaces !== 'undefined' && typeof gZenWorkspaces.activeWorkspace !== 'undefined';

            const ready = gBrowserReady && commandSetExists && (separatorExists || peripheryExists) && gZenWorkspacesReady;

            if (ready) {
                console.log(`INIT: Required elements found after ${checkCount} checks. Initializing...`);
                clearInterval(initCheckInterval); // Stop checking

                // Defer final setup slightly to ensure everything is stable
                const finalSetup = () => {
                     try {
                        injectStyles();
                        setupCommandsAndListener();
                        addButtonsToAllSeparators(); // Initial add
                        setupZenWorkspaceHooks(); // Setup hooks for future updates
                        console.log("INIT: Sort & Clear Button setup and hooks complete.");
                    } catch (e) {
                        console.error("INIT: Error during deferred final setup:", e);
                    }
                };

                // Use requestIdleCallback if available for less impact, otherwise fallback to setTimeout
                 if ('requestIdleCallback' in window) {
                     requestIdleCallback(finalSetup, { timeout: 2000 });
                 } else {
                     setTimeout(finalSetup, 500);
                 }

            } else if (checkCount > maxChecks) {
                clearInterval(initCheckInterval); // Stop checking after timeout
                console.error(`INIT: Failed to find required elements after ${maxChecks} checks. Script might not function correctly.`);
                console.error("INIT Status:", {
                    gBrowserReady,
                    commandSetExists,
                    separatorExists,
                    peripheryExists,
                    gZenWorkspacesReady
                });
                // Provide specific feedback
                 if (!gZenWorkspacesReady) console.error(" -> gZenWorkspaces might not be fully initialized yet (activeWorkspace missing?). Ensure Zen Tab Organizer extension is loaded and enabled BEFORE this script runs.");
                 if (!separatorExists && !peripheryExists) console.error(" -> Neither separator element '.vertical-pinned-tabs-container-separator' nor fallback periphery '#tabbrowser-arrowscrollbox-periphery' found in the DOM.");
                 if (!commandSetExists) console.error(" -> Command set '#zenCommandSet' not found. Ensure Zen Tab Organizer extension is loaded and enabled.");
                 if (!gBrowserReady) console.error(" -> Global 'gBrowser' object not ready.");
            }
        }, checkInterval);
    }

    // --- Start Initialization ---
    // Wait for the window to load before trying to access DOM elements
    if (document.readyState === "complete" || document.readyState === "interactive") {
        // If already loaded, initialize directly
        initializeScript();
    } else {
        // Otherwise, wait for the 'load' event
        window.addEventListener("load", initializeScript, { once: true });
    }
  
})(); // End script wrapper
