<h1>Contributing to Sine</h1>

If you are interested in contributing to Sine, this guide is for you! We will cover how to set up the tools we have implemented to make contributing easier, we will introduce you to our current file structure, and lastly, we will provide you with our standards for contributions.

<h2>Setting up your local clone.</h2>

Setting up Sine on your local machine is fairly easy, let's start!

<h3>Prerequisites:</h3>
- A cloned repository of Sine on your local machine.
- You are aware of the location of your profile for your browser (if you wish to use the importing automation script).
  - You may go to ```about:support``` and then under Profile Folder, click Open Folder, that is your profile folder.
- Python (optional; for automation scripts).

<h3>Setting it up:</h3>

To begin your contributing journey with Sine, you must first ensure everything is set up. Let's begin with the automation scripts.

**Automation scripts:**

Sine comes with some convenience scripts like an engine packager, which packages the scripts into a zip file which is used for auto-updating and installing Sine; an engine importer, which imports all the scripts into the profile folder you are using to test Sine; and an updating script to update the auto-updating indicators to the latest date. These automation scripts are built with Python, meaning you will need that to run these.

```
py ./scripts/package.py
py ./scripts/import.py
py ./scripts/update.py
```

As for the automation scripts themselves, everything should work properly, except the `import.py` script. For this one, you will need to do two things:

1. Install python-dotenv: `pip install python-dotenv`
2. Set up a `.env` file:
    - You must create a `.env` file in the root of your Sine clone and this data to it:
      `PROFILE_PATH=your_profile_folder`, replacing `your_profile_folder` with the location of your profile folder in your browser.

**Auto-installers:**

> Rewrite pending the new .sh and .ps1 scripts.

The Sine code contains auto-installers that may be built, ran, and edited, however, there are a couple of commands/prerequisites you may want to know about before building them.

First off, you will need the .NET build tool in order to compile these auto-installers. You can find out more about these at https://dotnet.microsoft.com/en-us/.

Second, you will need to run the `compiler.ps1` (or `compiler.sh`, depending on your platform) so you may build for all platforms and the run the auto-installer. Keep in mind that `dotnet run` **will not work, unless you have your terminal in administrator mode,** but you may run the auto-installer from your terminal, which will automatically request these permissions.

**The directory structure:**

As of writing this, the current directory structure is:

```
deployment/
  auto-installers/
    ...auto-installers scripts
  engine.json
  engine.zip
engine/
  ...engine files
scripts/
  ...automation scripts
.gitignore
.prettierignore
.prettierrc
CONTRIBUTING.md
LICENSE
README.md
sine.sys.mjs
```

This directory structure includes a folder for auto-installers and the engine data for auto-updating and installing, an engine folder for sine related scripts, several other project-related files, and the control script, sine.sys.mjs, which is used to import the engine files.

**Standards for contributions:**

We are not very strict about contributors following the 100% best method of implementing stuff, or optimizing everything to the last detail, but we do recommend that you run a formatting check over the files using Prettier first.

**Good luck and happy coding!** ❤️
