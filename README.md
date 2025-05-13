> [!NOTE]
> Sine Alpha has finally released!\
> [v1.0.1](https://github.com/CosmoCreeper/Sine/milestone/1) is releasing soon with script auto-updating and proper marketplace styling!
# Sine
![version](https://img.shields.io/badge/version-1.0.0-blue)
[![Star our repository](https://img.shields.io/badge/Star%20our%20repository-★-blue?style=flat&logo=github)](https://github.com/CosmoCreeper/Sine/stargazers)
\
Sine is the replacement that the Zen community has been waiting for. Through this unofficial plugin to Zen Mods, I hope to show the Zen creators that this is what we need.

### INSTALL
**Requirements:**
- Install fx-autoconfig from https://github.com/MrOtherGuy/fx-autoconfig.
- Prep your mind for features you've never seen before.

**Actual install!**\
Once you've set up fx-autoconfig, you can begin the super easy installation.\
Go ahead, grab the file named "sine.uc.mjs" and open up about:support on your Zen installation. From there, you can go to the section named "Profile Folder" and click "Open Folder". This will open up your current profile's location in your system's file explorer. From this directory, you can navigate to the "chrome" folder, "JS" folder, and paste your "sine.uc.mjs" file here.

## Overview
Sine is built with fx-autoconfig and manipulates the inner workings of Zen Mods to
provide a clean, intuitive, and sturdy system that makes getting the "github version" easy.

## Features
Sine boasts a powerful suite of easy-to-use tools for everyone, technical, or non-technical. Let's look through some of these features:

### A built-in marketplace.
Sine has a marketplace that is built-in to the settings gui for easy access. This marketplace is where the user adds and views Sine-compatible mods.

### Dev nightmares become dreams.
Every dev has that panic when they have to publish their mod to the theme store or have to update it. Sine makes this process simple. All you have to do is add the ID of your mod to the mods.json and map it to your repository. Assuming your project is already Sine-compatible, it'll work just fine. Plus, the developers of Sine are active enough to handle your pull requests in no longer than a day.

Now what about that updating?: The Zen theme store requires a pull request for not just creating a mod, but updating too. This, combined with painfully long response times makes dev updates a nightmare. Well fear no more, because Sine does not require update requests and pulls them straight from your repository. This means that you will never have to worry about github issues being outdated or have to tell your user to update to the "github version".

### Add unpublished mods easy.
Sine makes the process of adding unpublished mods easy as long as they are Sine-compatible. You simply type in the name of the repository (folder if needed) and Sine handles the rest.

### Update management made smart.
In Sine, updates are never what you think they are. Although Sine updates mods on browser restart, you have the power to turn off updating for certain mods or just altogether. This means that you won't have to worry about your mod getting updated to that new version you don't like.

The other powerful safeguard regarding updating is that Sine won't update your mod to the latest every time, only when the updatedAt property is modified. This means that when you are working on your mod locally and testing changes, your work won't be undone. (but if you're worried an update will happen while you are working on it locally, you can turn off updating for that mod.)

### Powerful new preference features.
Sine comes with a whole new suite of tools regarding preference management. Let's check them out now!:

- **Formatting (all types):** One of the best, new features is text formatting. This means you can now have bold, italic, and underlined letters in your label property. ~ for underline, * for italic, and ** for bold. (You may also use two backslashes to just type a * or ~ sign.)
```json
[
  {
    "type": "checkbox",
    "label": "~My~ *cool* ***checkbox*** ~***with***~ **formatting**! \\*\\*Excluded from formatting\\*\\*"
  }
]
```
- **Size (all types):** You can now use a size property to edit the font size of all sorts of stuff! (Works the same as a font size property)
```json
[
  {
    "type": "text",
    "label": "My text",
    "size": "20px"
  }
]
```
- **Text:** Sine has a standalone text type for additional context and by using the combination of bold formatting and increased font sizes, you can create a header.
```json
[
  {
    "type": "text",
    "label": "**My Header**",
    "size": "20px"
  }
]
```
- **Separators:** And if you thought that headers weren't enough to keep your users on track, we have real separators to help too! These are also compatible with the label property to have text in your separator too.
```json
[
  {
    "type": "separator",
    "label": "Workspace Indicator", <-- Displayed inside of the separator.
    "property": "uc.show-workspace-indicator" <-- Yes, you can use the separator as a type of checkbox.
  }
]
```
- **The border property (string only):** If a user is inputting a color into a string input, usually they have to type it in and then check it out by seeing the usage of it in their browser. Using the border property, the user can type in their color and see it applied on the border around the string input live. Set the border property to value for it to have this behavior, you can also set it to a color to just have a static color.
```json
[
  {
    "type": "string",
    "label": "A string that bases its *border* around your input!",
    "border": "value" <-- Replaceable with #fff, rgb(25, 25, 25), etc.
  }
]
```
- **The margin property (all types):** In order to have advanced formatting and neatness, we have added the margin property. You can set this to 20px, 1rem, 20px 4px 8px 6px, etc. It works just like a normal margin CSS property.
```json
[
  {
    "type": "text",
    "label": "more text for testing!",
    "margin": "0 20px 3px 1px"
  }
]
```
- **The conditions and operator properties (all types):** Isn't it annoying that a setting has to display all the time? What if you could hide it when another setting is not equal to something or is equal to something? Well now you can using the conditions and operator properties! (operator defaults to OR and conditions can be nested):
```json
[
  {
    "type": "string",
    "label": "A hidden setting unless the **uc.essentials.position** setting is set to ~bottom~ and superpins border is set to both or pins",
    "conditions": [
      {"if": {"property":"uc.essentials.position","value":"bottom"}},
      {"not": {"property":"uc.essentials.position","value":"left"}},
      {
        "conditions": [
          {"if": {"property":"uc.superpins.border","value":"both"}},
          {"if": {"property":"uc.superpins.border","value":"pins"}}
        ],
        "operator": "OR"
      }
    ]
    "operator": "AND"
  }
]
```
As you might have guessed, the operator property is the AND or OR condition, so whether or not the conditions should this and that or this or that. (&& or || in JS)\
As for the conditions property, it is an array that contains objects which contain if or not properties so if this or if not that. The conditions property is also nestable so it can have an object which contains more conditions and operator properties. (This is an advanced logical operators system so don't worry if you don't understand it right away.)

README IS NOT COMPLETE.
