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
    </style>
`);