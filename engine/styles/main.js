// => engine/styles/main.js
// ===========================================================
// This module injects styling for Sine into the main process
// by utilizing the XULManager script.
// ===========================================================

import appendXUL from "chrome://userscripts/content/engine/utils/XULManager.js";

appendXUL(document.head, `
    <style>
        notification-message {
            border-radius: 8px !important;
            box-shadow: 2px 2px 2px rgba(0, 0, 0, 0.2) !important;
            margin-bottom: 5px !important;
            margin-right: 5px !important;
        }
        .sineCommandPalette {
            position: fixed;
            height: fit-content;
            width: 50vw;
            max-width: 800px;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            backdrop-filter: blur(10px) brightness(0.6) saturate(3.4);
            border: 2px solid rgba(255, 255, 255, 0.3);
            z-index: 2000;
            box-shadow: 0 0 4px 4px rgba(0, 0, 0, 0.5);
            border-radius: 8px;
            transition: visibility 0.35s ease, opacity 0.35s ease;
            box-sizing: border-box;

            &[hidden] {
                display: block;
                opacity: 0;
                visibility: hidden;
                backdrop-filter: 0px;
            }
        }
        .sineCommandInput, .sineCommandSearch {
            width: 100%;
            height: 100%;
            box-sizing: border-box;
            position: relative;

            & > input, & > div {
                padding: 15px;
                box-sizing: border-box;
                font-size: 15px;
                width: 100%;
            }
            & > input {
                background: transparent;
                border: none;
                padding-bottom: 0;
            }
            & > hr {
                border-top: 1px solid rgba(255, 255, 255, 0.3);
                margin: 10px;
            }
            & > div {
                padding-top: 0;

                & > button {
                    width: 100%;
                    padding: 5px;
                    background: transparent;
                    border: 1px solid rgba(255, 255, 255, 0.3);
                    box-sizing: border-box;
                    margin-top: 3px;
                    margin-bottom: 3px;

                    &[selected], &:hover {
                        background: rgba(255, 255, 255, 0.3);
                    }
                }
            }
        }
        .sineToastManager {
            position: fixed;
            bottom: 10px;
            right: 10px;
            z-index: 2000;
            display: flex;
            flex-direction: column;
            gap: 8px;

            .sineToast {
                width: auto;
                min-width: 100px;
                height: 30px;
                color: black;
                border-radius: 8px;
                padding: 10px;
                display: flex;
                align-items: center;
                background: var(--zen-primary-color, rgb(190, 211, 255));

                span:not(.description) {
                    font-weight: 600;
                    font-size: 14px;
                }

                .description {
                    font-size: smaller;
                    display: block;
                }

                button {
                    border: 1px solid rgba(0, 0, 0, 0.3);
                    background: transparent;
                    margin-left: 10px;
                    color: black;
                    padding: 5px 10px;
                    border-radius: 4px;
                    cursor: pointer;

                    &:hover {
                        background: rgba(0, 0, 0, 0.1);
                        border-color: rgba(0, 0, 0, 0.5);
                    }
                }
            }
        }

        @media (max-width: 768px) {
            .sineToastManager {
                right: 5px;
                bottom: 5px;
            }

            .sineToast {
                min-width: 80px;
                font-size: 13px;
            }
        }
    </style>
`);