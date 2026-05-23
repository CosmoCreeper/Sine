# Testing with Browsercfg

[Browsercfg](https://github.com/CosmoCreeper/browsercfg) is a tool intended to help users develop and test their AutoConfig/userChrome.js projects locally. Sine uses this tool as a way to ensure that code works in isolated, unconfigured environments (to prevent features that work on edge cases). By the end of this guide, you will be capable of testing Sine with browsercfg.

The first step is to install browsercfg. You can install it either via Cargo (and the crates.io registry), or via any kind of package manager that supports the npm registry. For Sine, we manage packages via [Bun](https://bun.sh), so this guide will show you how to install browsercfg via that.

<!-- Use ps1 for commands as it tends to have the best syntax highlighting in GitHub markdown -->

First you must install Bun if you haven't already:

```ps1
# on Linux or macOS
curl -fsSL https://bun.sh/install | bash
# or on Windows
powershell -c "irm bun.sh/install.ps1 | iex"
```

Now you can simply install the necessary dependencies for Sine via Bun:

```ps1
bun install
```

Now you have browsercfg. Congrats! You can ensure this is the case with the following command:

```ps1
bun x browsercfg --version
```

The second step is to configure the web browser you want to test on. Browsercfg makes this process simple, although it currently only supports two browsers (Firefox and Zen). You can run the following command to begin an interactive method of picking your desired browser:

```ps1
bun x browsercfg select
```

After you select your browser via that command, ensure you say yes to downloading it.

The third and final step is to import Sine into browsercfg:

```ps1
bun run dev
```

After running this a web browser should open up with Sine installed. Congrats!

Upon changing Sine's source code, you can rerun step three to see it reflected in the isolated browser instance.
