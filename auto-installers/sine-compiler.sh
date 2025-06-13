#!/bin/bash

bun build --compile --target=bun-windows-x64 ./sine-installer.js --minify --outfile sine-win-x64
bun build --compile --target=bun-linux-x64 ./sine-installer.js --minify --outfile sine-linux-x64
bun build --compile --target=bun-linux-musl-x64 ./sine-installer.js --minify --outfile sine-linux-musl-x64
bun build --compile --target=bun-linux-arm64 ./sine-installer.js --minify --outfile sine-linux-arm64
bun build --compile --target=bun-darwin-x64 ./sine-installer.js --minify --outfile sine-darwin-x64
bun build --compile --target=bun-darwin-arm64 ./sine-installer.js --minify --outfile sine-darwin-arm64
