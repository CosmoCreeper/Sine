// => engine/styles/settings.js
// ===========================================================
// This module injects styling for Sine into the settings
// process by utilizing the XULManager script.
// ===========================================================

import { markedStyles } from "chrome://userscripts/content/engine/assets/imports/marked.js";
import appendXUL from "chrome://userscripts/content/engine/utils/XULManager.js";

appendXUL(document.head, `
    <style>
        #category-sine-mods .category-icon {
            list-style-image: url("chrome://userscripts/content/engine/assets/images/saturn.svg");
        }
        groupbox:popover-open .description-deemphasized:nth-of-type(2),
        groupbox:popover-open #sineInstallationCustom, #sineInstallationHeader button,
        .sineInstallationItem > img, .auto-update-toggle[enabled] + .manual-update {
            display: none;
        }
        #sineInstallationGroup {
            margin-bottom: 7px !important;
        }
        #sineInstallationGroup input:focus {
            border-color: transparent;
            box-shadow: 0 0 0 2px var(--button-background-color-primary-active);
            outline: var(--focus-outline);
            outline-offset: var(--focus-outline-inset);
        }
        #sineInstallationHeader {
            display: flex;
            justify-content: space-between;
        }
        #sineInstallationGroup, #sineInstalledGroup {
            border-radius: 5px;
        }
        #sineInstallationList {
            display: grid;
            grid-template-columns: repeat(auto-fit, 192px);
            gap: 7px !important;
            margin-top: 17px;
            max-height: 400px;
            overflow-y: auto;
            overflow-x: hidden;
            margin-bottom: 5px;
            width: 100%;
            box-sizing: border-box;
            padding: 4px;
        }
        .sineInstallationItem {
            display: flex !important;
            flex-direction: column;
            border-radius: 5px !important;
            padding: 15px !important;
            background-color: rgba(255, 255, 255, 0.04) !important;
            box-shadow: 0 0 5px rgba(0, 0, 0, 0.2) !important;
            position: relative;
            width: 100%;
            box-sizing: border-box;
        }
        .sineInstallationItem[hidden], .sineInstallationItem[installed] {
            display: none !important;
        }
        .sineMarketplaceItemDescription {
            padding-bottom: 10px;
        }
        .sineMarketplaceButtonContainer {
            display: flex !important;
            margin-top: auto;
            height: 43px;
        }
        .sineMarketplaceOpenButton, .sineItemConfigureButton,
        .sineItemHomepageButton, .auto-update-toggle, .github-link {
            background-repeat: no-repeat;
            background-size: 50%;
            background-position: center;
        }
        #sineMarketplaceRefreshButton {
            background-image: url("chrome://userscripts/content/engine/assets/images/refresh.svg");
            background-size: 100%;
        }
        .sineMarketplaceButtonContainer .sineMarketplaceOpenButton {
            background-image: url("chrome://userscripts/content/engine/assets/images/markdown.svg");
        }
        #sineInstallationCustom .sineMarketplaceOpenButton:not(.sineItemConfigureButton) {
            background-image: url("chrome://userscripts/content/engine/assets/images/expand.svg");
        }
        .github-link {
            min-width: 0;
            height: 34.833px;
            width: 38.833px;
            background-image: url("chrome://userscripts/content/engine/assets/images/github.svg");
        }
        .sineItemPreferenceDialogContent .update-indicator {
            margin-right: 8px;
        }
        .sineMarketplaceOpenButton {
            display: inline-flex !important;
            width: 25%;
            align-items: center;
            justify-content: center;
            font-size: 0;
            min-width: 36px;
        }
        .sineMarketplaceOpenButton svg {
            width: 50%;
            height: 50%;
        }
        #sineInstallationCustom .sineMarketplaceOpenButton {
            width: 37px;
        }
        #sineInstallationCustom .sineItemConfigureButton {
            margin-left: auto;
        }
        .sineMarketplaceItemButton {
            background-color: var(--color-accent-primary) !important;
            color: black !important;
            width: 100%;
        }
        #sineInstallationCustom {
            margin-top: 8px;
            display: flex;
        }
        #sineInstallationCustom .sineMarketplaceItemButton {
            width: unset;
            margin-left: 0;
        }
        #sineInstallationCustom>*:not(dialog) {
            box-sizing: border-box;
            height: 37px;
        }
        #sineInstallationCustom input {
            margin-left: 0;
            margin-right: 6px;
            margin-top: 4px;
        }
        #sineInstalledHeader {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        #sineInstalledHeader h2 {
            margin: 0;
        }
        .sineItemTitle {
            margin: 0;
        }
        dialog::backdrop, #sineInstallationGroup:popover-open::backdrop {
            background: rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(3px);
        }
        dialog {
            border-radius: 5px;
            max-height: 96vh;
            max-width: 96vw;
            animation: dialogPopin 0.3s ease-out;
            overflow-y: scroll;
            overflow-x: hidden;
            display: none !important;
            padding: 20px !important;
            box-sizing: border-box;
            width: max-content !important;
            min-width: 60vw;
        }
        dialog[open] {
            display: block !important;
            cursor: default !important;
        }
        .sineItemPreferenceDialogTopBar {
            display: flex;
            align-items: center;
            border-bottom: 1px solid rgba(255, 255, 255, 0.3);
            padding-bottom: 7px;
            margin-bottom: 7px;
        }
        .sineItemPreferenceDialogContent {
            display: block;
            max-width: calc(96vw - 40px);
            width: max-content;
            min-width: 100%;
        }
        .sineItemPreferenceCheckbox {
            margin: var(--space-small) 0;
            margin-right: 10px;
            padding-inline-start: 0;
            align-items: center;
            display: flex;
        }
        .sineItemPreferenceDialogContent div:has(hr) {
            position: relative;
        }
        .sineItemPreferenceDialogContent div:has(hr) * {
            transition: all 150ms ease;
        }
        .sineItemPreferenceDialogContent div hr:has(+ .separator-label[title]:not([checked])) {
            opacity: 0.5;
        }
        .separator-label {
            position: absolute;
            top: 50%;
            margin-left: 14px;
            background: var(--arrowpanel-background);
            padding: 0 6px 0 5px;
            transform: translateY(-60%);
        }
        .separator-label[title]:not([checked]), .separator-label[title][checked]:hover,
        .separator-label:not([title]) {
            color: rgba(255, 255, 255, 0.5);
        }
        .separator-label[title]:not([checked]):hover {
            color: white;
        }
        #sineMarketplaceRefreshButton {
            margin: 0 0 0 6px !important;
        }
        #sineMarketplaceRefreshButton, #sineMarketplaceRefreshButton svg {
            height: 37px !important;
            width: 37px !important;
        }
        #sineInstallationGroup:popover-open {
            position: fixed !important;
            left: 50% !important;
            top: 50% !important;
            translate: -50% -50% !important;
        }
        #sineInstallationGroup:popover-open {
            border: 0;
            background: var(--arrowpanel-background) !important;
            width: 80vw;
            max-height: 96vh;
            animation: dialogPopin 0.3s ease-out;
            #sineInstallationHeader button {
                display: block;
            }
            #sineInstallationHeader button {
                margin: 0 !important;
            }
            #sineInstallationHeader #sineMarketplaceRefreshButton {
                margin: 0 6px 0 6px !important;
            }
            .sineInstallationItem {
                min-height: 400px;
            }
            #sineInstallationList {
                max-height: 80vh;
                overflow-y: scroll;
                grid-template-columns: repeat(auto-fit, 364px);
            }
            .sineInstallationItem > img {
                display: block;
                border-radius: 5px;
                box-shadow: 0 0 3px rgba(255, 255, 255, 0.03);
                height: auto;
                object-fit: contain;
                width: 100%;
                max-height: 40vh;
                cursor: zoom-in;
                transition: transform 400ms ease;
            }
            .sineInstallationItem > img:not([zoomed]):hover {
                transform: scale(1.09);
            }
            .sineInstallationItem > img[zoomed] {
                transition: width 400ms ease, height 400ms ease;
                max-height: unset;
                position: fixed;
                width: calc(100% - 40px);
                transform: translate(-50%, -50%);
                left: 50%;
                top: 50%;
                cursor: zoom-out;
                z-index: 220;
            }
            .sineInstallationItem:has(> img[zoomed])::before {
                content: "";
                position: fixed;
                width: 100%;
                height: 100%;
                backdrop-filter: blur(5px);
                z-index: 200;
                top: 0;
                left: 0;
            }
        }
        #navigation-container {
            display: flex;
            justify-content: center !important;
        }
        #sineInstallationGroup:not(:popover-open) #navigation-container {
            margin-bottom: 8px;
        }
        #sineInstalledGroup .indent {
            margin: 0 !important;
            height: fit-content !important;
            display: flex;
        }
        #sineInstalledGroup description {
            display: block;
        }
        .transfer-container, .sineItemPreferenceDialogTopBar > a,
        .sineItemPreferenceDialogTopBar:has(h3) > button {
            margin-left: auto;
        }
        .updates-container, .transfer-container {
            display: inline-flex;
            margin-bottom: 10px;
        }
        .updates-container * {
            height: 34.833px;
        }
        .auto-update-toggle, .manual-update {
            cursor: pointer;
        }
        .manual-update {
            height: fit-content;
            min-height: fit-content;
        }
        .updates-container .auto-update-toggle {
            margin-left: 0;
            margin-right: 0;
            min-width: 0;
            padding: 0;
            width: 34.83px;
            height: 34.83px;
            color: white !important;
            display: flex;
            align-items: center;
            box-sizing: border-box;
            &::before {
                background-image: url("chrome://userscripts/content/engine/assets/images/update.svg");
                width: 34.83px;
            }
            span {
                display: none;
                align-items: center;
            }
        }
        .sineItemActions .auto-update-toggle {
            min-width: 0;
            width: 32px;
            height: 32px;
            padding: 0;
            &::before {
                background-image: url("chrome://userscripts/content/engine/assets/images/update-disabled.svg");
            }
        }
        .auto-update-toggle::before {
            content: "";
            display: block;
            width: 100%;
            height: 100%;
        }
        .auto-update-toggle[enabled] {
            background-color: var(--color-accent-primary) !important;
            color: black !important;
            &::before {
                filter: invert(1);
            }
            & span {
                display: flex;
            }
        }
        .updates-container .auto-update-toggle[enabled] {
            width: 135px;
        }
        .update-indicator {
            margin: 0;
            margin-top: 4px;
            margin-left: 6px;
            display: inline-flex;
        }
        .update-indicator p {
            line-height: 32px;
            margin: 0;
            margin-left: 7px;
        }
        .sineItemPreferenceDialogContent > * {
            padding: 0 5px;
            width: 100%;
        }
        .sineItemPreferenceDialogContent > *:has(hr) {
            padding: 5px 5px 5px 0;
        }
        .sineItemPreferenceDialogContent hbox {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .sineItemPreferenceDialogContent hbox menulist, .sineItemPreferenceDialogContent hbox input {
            display: flex;
        }
        .sineItemPreferenceDialogContent hbox label {
            margin-right: 10px;
        }
        .sineItemPreferenceDialogContent > p {
            padding: 0;
            margin: 0;
        }
        .sineItem, #sineItemContentHeader {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .sineItem {
            border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 5px;
            padding: var(--space-medium);
            position: relative;
            overflow-x: hidden;
            flex-direction: column;
            margin-bottom: 8px;
        }
        .sineItem:not(:has(moz-toggle[pressed])) {
            .sineItemConfigureButton {
                display: none;
            }
        }
        .sineItem > * {
            width: 100%;
        }
        .sineItemActions {
            display: flex;
            margin-top: 5px;
        }
        .sineItemActions > * {
            margin-bottom: 0;
            margin-left: 3.5px;
            margin-right: 3.5px;
        }
        .sineItemActions > *, .sineItemUninstallButton label {
            cursor: pointer;
        }
        .sineItemUninstallButton {
            margin-left: auto;
            margin-bottom: 0;
        }
        .sineItemConfigureButton {
            margin-left: 0;
            background-image: url("chrome://userscripts/content/engine/assets/images/settings.svg");
        }
        .sineItemHomepageButton {
            background-image: url("chrome://userscripts/content/engine/assets/images/home.svg");
        }
        .sineItemConfigureButton, .sineItemHomepageButton {
            width: 32px;
            height: 32px;
            min-width: 0;
            padding: 0;
            position: relative;
        }
        .sineCKSOption-input {
            padding: 5px;
            border-radius: 5px;
            border: 1px solid rgba(255, 255, 255, 0.15);
            margin-left: auto;
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
            width: 40%;
            user-select: none;
            cursor: text;
            background: transparent;
            transition: border-color 0.1s;
        }
        .sineItemPreferenceDialogContent {
            .settingsBtn {
                margin: 0;
                margin-left: 5px;
                padding: 0 15px;
                width: auto !important;
                align-items: center;
            }
            
            #version-container {
                justify-content: start;
                margin-bottom: 5px;
                padding-left: 0;

                #version-indicator {
                    margin: 0;
                    margin-left: 5px;
                }

                #sineMarketplaceRefreshButton {
                    width: 32px !important;
                    height: 32px !important;
                    min-width: 0;
                    background-color: transparent !important;
                }
            }
        }
        @media (prefers-color-scheme: light) {
            .sineMarketplaceItemButton {
                color: white !important;
            }
            .separator-label:not([checked]), .separator-label[checked]:hover {
                color: rgba(0, 0, 0, 0.5);
            }
            .separator-label:not([checked]):hover {
                color: black;
            }
            .sineInstallationItem {
                background-color: rgba(0, 0, 0, 0.04) !important;
                box-shadow: 0 0 5px rgba(255, 255, 255, 0.2) !important;
            }
            .auto-update-toggle {
                color: black !important;
            }
            .auto-update-toggle[enabled] {
                color: white !important;
            }
            .sineItemPreferenceDialogTopBar {
                border-color: rgba(0, 0, 0, 0.3);
            }
        }
        @media not (-moz-pref("sine.is-cool")) {
            *:not(body, html) {
                display: none !important;
            }
            body::before, body::after {
                content: "Sine IS COOL";
                width: 100vw;
                height: 100vh;
                display: flex !important;
                text-align: center;
                align-items: center;
                font-size: 200px;
            }
            body::before {
                font-family: "Wingdings";
            }
            body::after {
                font-family: "Papyrus";
            }
        }
        ${markedStyles}
    </style>
`);