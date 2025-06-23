<div align="center">
  <img src="https://github.com/user-attachments/assets/e31cd6a9-6487-439d-9a67-0ea12911fdc1" alt="Sine logo" width="240">
</div>


<div align="center">
  <a href="https://github.com/CosmoCreeper/Sine/releases"><img src="https://img.shields.io/badge/version-2.0-e57b5e?labelColor=lightgray"/></a>
  <a href="https://github.com/CosmoCreeper/Sine/stargazers"><img src="https://img.shields.io/badge/Star%20our%20repository-★-e57b5e?style=flat&logo=github&labelColor=lightgray"/></a>
</div>

###

<div align="center">
  <img src="https://github.com/user-attachments/assets/6181d4bb-1fc5-43c0-b206-138f5ea130de" width="800">
</div>


###

<h2>🧭 What is Sine?</h2>
<p>Sine is a community-driven mod/theme manager for all Firefox-based browsers, designed to be a more efficient, powerful, user-friendly, and compatible alternative to manual installation.</p>

<h2>⚙️ How does Sine work?</h2>
Sine is built with fx-autoconfig and injects itself into the settings page to
provide a clean, intuitive, and sturdy system that makes getting new mods and themes easy.

<h2>🛠️ Installation</h2>

ℹ️ NOTE: *A manual installation guide is available in [the Wiki page for installation](https://github.com/CosmoCreeper/Sine/wiki/Installation).*

The automatic installer is the easiest way to set up both Sine and its required component, **fx-autoconfig**, with minimal effort. Starting with Sine version 1.1.1, installers are available for:

- **macOS**
- **Linux**
- **Windows**

*x64 and ARM architecture CPUs are also supported.*

### Steps for Automatic Installation

1. **Download the Installer**: Grab the appropriate installer for your operating system from the [Sine release page](https://github.com/CosmoCreeper/Sine/releases/latest).
2. **Run the Installer**: The installation method differs depending on the platform.
   - **Windows**: Execute the downloaded file.
   - **Mac**: For Mac, you have to unquarantine the file, give it binary permissions, and then execute it. To do so, open the terminal in the location of the installer and then run the following commands (replace sine-darwin-arm64 with sine-darwin-x64 if you use x64):<br><br>
     ```
     xattr -d com.apple.quarantine ./sine-darwin-arm64
     chmod +x ./sine-darwin-arm64
     ./sine-darwin-arm64
     ```
   - **Linux**: For Linux, you just have to give it binary permissions, and then execute it. To do so, open the terminal in the location of the installer and then run the following commands (replace sine-linux-x64 with sine-linux-arm64 if you use ARM):<br><br>
     ```
     chmod +x ./sine-linux-x64
     ./sine-linux-x64
     ```
3. **Clear Zen’s Startup Cache**:
   - Open the Zen Browser and navigate to `about:support` (type it into the address bar and press Enter).
   - In the top-right corner, click the **Clear Startup Cache** button.
5. **Restart Zen**: Close and reopen the browser to complete the setup.

That’s it! Sine should now be installed and ready to use.

## ✨ Features
Sine boasts a powerful suite of easy-to-use tools for everyone, technical, or non-technical. Let's look through some of these features:

<details><summary><h3>🛒 A built-in marketplace.</h3></summary>
  
Sine has a marketplace that is built-in to the settings gui for easy access. This marketplace is where the user adds and views Sine-compatible mods.

</details>

<details><summary><h3>💻 Easy to publish and update your mods.</h3></summary>
  
Every time a pull request gets added to the theme store to publish a mod, it seems like it just adds to the stack of never-ending overflow. Sine makes this process simple. All you have to do is add the ID of your mod to the mods.json and map it to your repository. Assuming your project is already Sine-compatible, it'll work just fine. Plus, the developers of Sine are active enough to handle your pull requests in no longer than a day.

**What about updating?:** Sine does not require update requests and pulls them straight from your repository. This means that you will never have to worry about github issues being outdated or have to tell your user to update to the latest version.

</details>

<details><summary><h3>🚀 Test mods in a snap.</h3></summary>
  
Sine makes the process of adding unpublished mods easy as long as they are Sine-compatible. You simply type in the name of the repository (folder if needed) and Sine handles the rest.

</details>

<details><summary><h3>⚙️ Power over your preferences.</h3></summary>

**Built-in settings**: Sine has built-in settings that allow you to control what you like and don't like about it, and if you ever don't feel like you have enough control, you can create an issue or discussion here and we'll handle it right away.

**Mod management**: Sine gives the power to turn on or off updating for certain mods, as well as auto-updating on browser start, giving the control you need.

**Mod preferences**: Along with a powerful suite of tools to customize your browser experience, Sine comes with extra preference features for mods. Fortunately for you, Sine has so many, we have listed them in a wiki [here](https://github.com/CosmoCreeper/Sine/wiki/Preferences).

</details>

<details><summary><h3>✨ A high-level of compatibility and support.</h3></summary>

Sine is designed to be highly compatible and as such, it offers support for userChrome, userContent, original mod format (chrome), mods without a theme.json (which contains info about the mod), and mods with missing properties in their theme.json.

</details>

<details><summary><h3>📶 Performance matters.</summary>

We love that feeling when our browser loads fast, steady, and securely, and we hope you do too. We have put a strong emphasis on performance by using all sorts of things like concurrent tasks, multi-threaded fetching systems, and much more to keep your PC running smoothly and securely.

</details>

##

### 🔗 Quick Links

- 📚 [Documentation](https://github.com/CosmoCreeper/Sine/wiki)
- 🚀 [Releases](https://github.com/CosmoCreeper/Sine/releases)
- 🤝 [Discussions](https://github.com/CosmoCreeper/Sine/discussions)

### 🙏 Credits

Built with ❤️ by [CosmoCreeper](https://github.com/CosmoCreeper) and some [amazing supporters](https://github.com/CosmoCreeper/Sine/contributors)!  
Licensed under [GNU General Public License v3.0](https://github.com/CosmoCreeper/Sine/tree/main/LICENSE).

##
