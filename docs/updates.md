# The updating workflow

When triggering automated updates in Sine, it's important to ensure that everything is done properly such that the updating process can be performed smoothly.
In the past, we've had many issues regarding this, and we hope that this documentation will help to relieve some of those issues by ensuring a standardized process.

We now have a single release workflow that will perform all other necessary actions properly to prevent human mistakes.

Here are the standardized rules that the `engine.json` file and `release.yml` workflow must both follow:

- Each new version release must include a patch number, even if it is labeled as 0. If this is not the case, the updating workflow will crash.
- Each new version must include a version type,
  0 for a standard zip-compatible update,
  1 for a necessary terminal update (without bootloader requirements),
  and 2 for a necessary terminal update with bootloader updating as well.
- No "v" prefix is used in any of the files or workflows for actions, as such, no workflow inputs should be allowed to use a "v" prefix.
- No version name should ever be reused. If changes within the same version must be made, the patch number (v0.0.0.x) may be used.

The `release.yml` workflow must handle all of these possible human mistakes, and ensure that these never happen in production.
This workflow must allow for the only necessary human interaction to be to start the workflow with the proper options, while everything forwards must always remain automated.
