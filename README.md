# Sine
Sine is the replacement that the Zen community has been waiting for. Through this unofficial plugin to Zen Mods, I hope to show the Zen creators that this is what we need.

## Overview
Sine is built with fx-autoconfig and manipulates the inner workings of Zen Mods to
provide a clean, intuitive, and sturdy system that makes getting the "github version" easy.

## Features
Sine boasts a powerful suite of easy-to-use tools for everyone, technical, or non-technical. Let's look through some of these features:

### A built-in marketplace.
Sine has a marketplace that is built-in to the settings gui for easy access. This marketplace is where the user adds and views Sine-compatible mods.

### Dev nightmares become dreams.
Every dev has that panic when they have to publish their mod to the theme store or have to update it. Sine makes this process simple. All you have to do is add the ID of your mod to the mods.json and map it to your repository. Assuming your project is already Sine-compatible, it'll work just fine. Plus, the developers of Sine are active enough to handle your pull requests in no longer than a day.

Now what about that updating?: The Zen theme store requires a pull request for not just creating a mod, but updating too. This, combined with painfully long response times makes dev updates a nightmare. Well fear no more, because Sine does not require update requests and pulls them straight from your repository. This means that you will never have to worry about githuv issues being outdated or have to tell your user to update to the "github version".

### Add unpublished mods easy.
Sine makes the process of adding unpublished mods easy as long as they are Sine-compatible. You simply type in the name of the repository (folder if needed) and Sine handles the rest.

### Update management made smart.
In Sine, updates are never what you think they are. Although Sine updates mods on browser restart, you have the power to turn off updating for certain mods or just altogether. This means that you won't have to worry about your mod getting updated to that new version you don't like.

The other powerful safeguard regarding updating is that Sine won't update your mod to the latest every time, only when the updatedAt property is modified. This means that when you are working on your mod locally and testing changes, your work won't be undone. (but if you're worried an update will happen while you are working on it locally, you can turn off updating for that mod.)

### Powerful new preference features.
Sine comes with a whole new suite of tools regarding preference management. Let's check then out now!:

- Formatting: One of the best, new features is text formatting. This means you can now have bold, italic, and underlined letters in your label property.
- Headers: Sine has headers to separate sections of your preferences with ease. No more confused users.
- Separators: And if you thought that headers weren't enough to keep your users on track, we have real separators to help too! These are also compatible with the label property to have text in your separator too.

README IS NOT COMPLETE.