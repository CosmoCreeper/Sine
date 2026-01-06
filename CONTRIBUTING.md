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
py scripts/package.py
py scripts/import.py
py scripts/update.py
```

As for the automation scripts themselves, everything should work properly, except the `import.py` script. For this one, you will need to do two things:

1. Install the required pip packages: `pip install -r scripts/requirements.txt`
2. Set up a `.env` file:
    - You must create a `.env` file in the root of your Sine clone and this data to it:
      `PROFILE_PATH=your_profile_folder`, replacing `your_profile_folder` with the location of your profile folder in your browser.


**Setting up fx-autoconfig**

The working of the automation scripts requires that you already have Sine's bootloader installed.
You may do so using the auto-installer, or by cloning and importing Sine's [bootloader repo](https://github.com/sineorg/bootloader).

**The directory structure:**

As of writing this, the current directory structure is:

```
engine/
  ...engine files
locales/
  ...locales
scripts/
  ...automation scripts
.gitignore
.prettierignore
.prettierrc
CONTRIBUTING.md
LICENSE
README.md
engine.json
sine.sys.mjs
```

This directory structure includes an engine folder for Sine-related functionality, a folder for locales, a folder for automation scripts, several other project-related files, and the control script, sine.sys.mjs, which is used to import the engine files.

**Standards for contributions:**

We are not very strict about contributors following the 100% best method of implementing stuff, or optimizing everything to the last detail, but we do recommend that you run a formatting check over the files using Prettier first.

**Good luck and happy coding!** ❤️
