<h1>Contributing to Sine</h1>

If you are interested in contributing to Sine, this guide is for you! We will cover how to set up the tools we have implemented to make contributing easier, we will introduce you to our current file structure, and lastly, we will provide you with our standards for contributions.

<h2>Setting up your local clone.</h2>

Setting up Sine on your local machine is fairly easy, let's start!

**<h3>Prerequisites:</h3>**
- A cloned repository of Sine on your local machine.
- You are aware of the location of your profile for your browser (if you wish to use the importing automation script.)
  - You may go to ```about:support``` and then under Profile Folder, click Open Folder, that is your profile folder.
- Python (optional; for automation scripts.)
  - Makefile (optional; to easily run python scripts with short commands.)
- .NET Build Tool (optional; for auto-installers.)

**<h3>Setting it up:</h3>**

To begin your contributing journey with Sine, you must first ensure everything is set up. Let's begin with the automation scripts.

**Automation scripts:**

Sine comes with some convenience scripts like an engine packager, which packages the scripts into a zip file which is used for auto-updating and installing Sine; an engine importer, which imports all the scripts into the profile folder you are using to test Sine; and an updating script to update the auto-updating indicators to the latest date. These automation scripts are built with Python, meaning you will need that to run these.

We also use another tool to easily run these scripts, that being, makefile. Makefile allows us to run commands like ```make run pkg``` and package the engine without running ```python ./scripts/package_engine.py```, which is unnecessary, but helpful for some at least. Below is the guide on how to install this.

Windows (requires chocolatey): ```choco install make```\
Linux: ```sudo apt install make```\
MacOS (requires brew): ```brew install make```

If you decide to use makefile, the commands you may use are these:
```
make run package
make run import
make run update
```

If you do not decide to use makefile, the commands you may use are these:
```
py ./scripts/package_engine.py
py ./scripts/import_engine.py
py ./scripts/update.py
```

As for the automation scripts themselves, everything should work properly, except the ```import_engine.py``` script. For this one, you will  need to do two things.

1. Install python-dotenv: ```pip install python-dotenv```
2. Set up a ```.env``` file:
   - You must create a ```.env``` file in the root of your Sine clone and this data to it:
     ```PROFILE_PATH=your_profile_folder```, replacing ```your_profile_folder``` with the location of your profile folder in your browser.


**Setting up fx-autoconfig**

The working of Sine requires you to have fx-autoconfig installed.You can look for the instructions on how to install fx-autoconfig in the installation section *the manual installation guide is available in [the Wiki page for installation](https://github.com/CosmoCreeper/Sine/wiki/Installation).*

**Auto-installers:**

The Sine code contains auto-installers that may be built, ran, and edited, however, there are a couple of commands/prerequisites you may want to know about before building them.

First off, you will need the .NET build tool in order to compile these auto-installers. You can find out more about these at https://dotnet.microsoft.com/en-us/.

Second, you will need to run the ```compiler.ps1``` (or ```compiler.sh```, depending on your platform) so you may build for all platforms and the run the auto-installer. Keep in mind that ```dotnet run``` **will not work, unless you have your terminal in administrator mode,** but you may run the auto-installer from your terminal, which will automatically request these permissions.

**The directory structure:**

As of writing this, the current directory structure is:

```
data/
  mods/
    ...js mods
  engine.json
  marketplace.json
deployment/
  auto-installers/
    ...auto-installers scripts
  engine.zip
engine/
  ...engine files
scripts/
  ...automation scripts
.gitignore
CONTRIBUTING.md
LICENSE
makefile
README.md
sine.uc.mjs
```

This directory structure includes data for the script, mods, and the marketplace; a folder for auto-installers and the engine zip for auto-updating and installing; an engine folder for sine related scripts; several other project-related files; and the importing script, sine.uc.mjs, which is used to import the engine files.

**Standards for contributions:**

We are not very strict about contributors following style guidelines, the 100% best method of implementing stuff, or optimizing everything  to the last detail, but, we do believe in some order.

Over time, we will develop out a preferred prettier config, but for right now, we just recommend using 4 spaces for formatting your contributions.

**:heart: Good luck and happy coding!**
