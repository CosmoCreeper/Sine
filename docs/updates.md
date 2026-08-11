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

## Triggering a new release

Due to our collaboration with SignPath, we now sign all of our stable releases. This results in our stable release workflow being different than our beta release workflow.

### Beta (Cosine)

- Initialize a new release with the tag of the new version you want to deploy, with a 'c' suffix. (meaning Cosine, e.g. v2.3.4.0c)
- Fill in details regarding the main goal of this release and the changelog.
- Save the release as a draft, **do not publish, releases are immutable once published**.
- Trigger the "Deploy latest assets" workflow (our main deploy workflow) on the Cosine branch with the release version (excluding 'v' prefix and 'c' suffix) and the version type (0, 1, 2).
- Once the asset deployment workflow is complete, you may publish the draft release (assuming all data appears as intended).

### Stable

- Initialize a new release with the tag of the new version you want to deploy. (e.g. v2.3.4.0)
- Fill in details regarding the main goal of this release and the changelog.
- Save the release as a draft, **do not publish, releases are immutable once published**.
- Trigger the "Build cross-platform installers" workflow on the main branch with release version, excluding 'v' prefix. (e.g. 2.3.4.0), as well as the version of the Sine bootloader that should be bundled with the release, excluding 'v' prefix (e.g. 0.1.4).
- The installer-building workflow should then submit the assets to SignPath for reviewal and signing.
- When SignPath approves and signs the assets (1-3 business days), the "Deploy latest assets" workflow will then be ready to be triggered.
  Trigger it with the release version (excluding 'v' prefix), the version type (0, 1, 2), and the run_id for the build workflow specified earlier.
- Once the asset deployment workflow is complete, you may publish the draft release (assuming all data appears as intended), but it is recommended to first verify that the Windows installer does not have a SmartScreen prompt when downloaded and executed from the draft release.
  If the SmartScreen prompt does appear, it means the installer was not properly signed, and a reviewal of our submission process must be performed, as well as a checkup with SignPath.
