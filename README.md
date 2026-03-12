<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://github.com/user-attachments/assets/4c7f6e66-4092-41a8-8da0-2b5ab0def3bf">
    <source media="(prefers-color-scheme: light)" srcset="https://github.com/user-attachments/assets/8d88e456-03b1-4f7e-a713-cc802e0c5561">
    <img src="https://github.com/user-attachments/assets/4c7f6e66-4092-41a8-8da0-2b5ab0def3bf" alt="Sine logo" width="240">
  </picture>
</div>

<div align="center">
  <a href="https://github.com/CosmoCreeper/Sine/releases"><img src="https://img.shields.io/badge/version-2.3-69b4f1?labelColor=gray"/></a>
  <a href="https://github.com/CosmoCreeper/Sine/stargazers"><img src="https://img.shields.io/badge/Star%20our%20repository-★-69b4f1?style=flat&logo=github&labelColor=gray"/></a>
  <a href="https://discord.gg/P76BvB2MXS"><img src="https://img.shields.io/badge/chat-discord-69b4f1.svg?style=flat&labelColor=gray"/></a>
</div>

###

<div align="center">
  <picture>
    <img width="800" alt="A picture of Cosine being displayed on a web browser." src="https://github.com/user-attachments/assets/6819cbcb-29dc-47f3-bf2e-b7d59fd349b2" />
  </picture>
</div>

###

<h2>🧭 What is Sine?</h2>
<p>Sine is a community-driven mod/theme manager for all Firefox-based browsers, designed to be a more efficient, powerful, user-friendly, and compatible alternative to manual installation.</p>

<h2>⚙️ How does Sine work?</h2>
Sine is independent of other third-party tools and injects itself into the settings page to
provide a clean, intuitive, and sturdy system that makes getting new mods and themes easy.

<h2>🛠️ Installation</h2>

ℹ️ NOTE: _A manual installation guide is available in [the documentation page for installation](https://github.com/sineorg/docs/tree/main/src/installation.md)._

The automatic installer is the easiest way to set up both Sine and its bootloader with minimal effort. Starting with version 2.0, installers are available for:

- **macOS**
- **Linux**
- **Windows**

_x64 and ARM architecture CPUs are also supported._

### Steps for Automatic Installation

1. **Download the Installer**: Grab the appropriate installer for your operating system from the [Sine release page](https://github.com/CosmoCreeper/Sine/releases/latest).
2. **Run the Installer**: The installation method differs depending on the platform.
    - **Windows and Linux**: Execute the downloaded file.
    - **Mac**: For Mac, you have to unquarantine the file and then execute it. To do so, open the terminal in the location of the installer and then run the following commands (replace sine-osx-arm64 with sine-osx-x64 if you use x64):<br><br>
        ```
        xattr -d com.apple.quarantine ./sine-osx-arm64
        chmod +x ./sine-osx-arm64
        sudo codesign --force --deep --sign - sine-osx-arm64
        ./sine-osx-arm64
        ```
4. **Restart Your Browser**: Close and reopen the browser to complete the setup.

That’s it! Sine should now be installed and ready to use.

## ✨ Features

Sine boasts a powerful suite of easy-to-use tools for everyone, technical, or non-technical. Let's look through some of these features:

<details><summary><h3>🛒 A built-in marketplace.</h3></summary>
  
Sine has a marketplace that is built-in to the settings gui for easy access. This marketplace is where the user adds and views Sine-compatible mods.

**Am I limited to this settings gui?:** Absolutely not. Sine provides support for installing mods from [our website](https://sineorg.github.io/store/) too.

</details>

<details><summary><h3>💻 Easy to publish and update your mods.</h3></summary>
  
Every time a pull request gets published to a repository, it seems like it just adds to the stack of never-ending overflow. Sine makes this process simple. All you have to do is make an issue with a template. Assuming your project is already Sine-compatible, it'll work just fine. Plus, the developers of Sine are active enough to handle your pull requests quickly.

**What about updating?:** Sine does not require update requests and pulls them straight from your repository. This means that you will never have to worry about github issues being outdated or have to tell your user to update to the latest version.

</details>

<details><summary><h3>🚀 Test mods in a snap.</h3></summary>
  
Sine makes the process of adding unpublished mods easy as long as they have a valid mod format. You simply type in the name of the repository (folder if needed) and Sine handles the rest.

</details>

<details><summary><h3>⚙️ Power over your preferences.</h3></summary>

**Built-in settings**: Sine has built-in settings that allow you to control what you like and don't like about it, and if you ever don't feel like you have enough control, you can create an issue or discussion here and we'll handle it right away.

**Mod management**: Sine gives the power to turn on or off updating for certain mods, as well as auto-updating on browser start, giving the control you need.

**Mod preferences**: Along with a powerful suite of tools to customize your browser experience, Sine comes with extra preference features for mods. Fortunately for you, Sine has so many, we have listed them in a wiki [here](https://github.com/CosmoCreeper/Sine/wiki/Preferences).

</details>

<details><summary><h3>✨ A high-level of compatibility and support.</h3></summary>

Sine is designed to be highly compatible and as such, it offers support for userChrome, userContent, the Zen mod format (chrome), and mods missing typically necessary metadata.

</details>

##

### 🔗 Quick Links

- 📱 [Discord](https://discord.gg/P76BvB2MXS)
- 📚 [Documentation](https://github.com/sineorg/docs/)
- 🛒 [Marketplace](https://github.com/sineorg/store/)
- 🚀 [Releases](https://github.com/CosmoCreeper/Sine/releases)
- 🤝 [Discussions](https://github.com/CosmoCreeper/Sine/discussions)

### 🙏 Credits

Built with ❤️ by [CosmoCreeper](https://github.com/CosmoCreeper) and some [amazing supporters](https://github.com/CosmoCreeper/Sine/contributors)!  
Licensed under [GNU General Public License v3.0](https://github.com/CosmoCreeper/Sine/tree/main/LICENSE).

##
