# Mod update and reload regression checks

These checks cover the mod manager, not the Sine engine installer. Run them only
in a disposable browser profile. They write fixture mod files and replace the
test profile's registry temporarily; never point the runner at a normal profile.

## Automated native suite

Use the Browsercfg workflow described in `CONTRIBUTING.md` and run `bun run test`.
The suite requires `browsercfg.test.active` and restores its registry, temporary
mod files, preferences and network doubles after each fixture. It contains 47
checks, including the existing path check.

- Store updates use immutable commit identity, even without `updatedAt` or a
  display homepage. Missing sources and malformed identities are failures, not
  a successful “up-to-date” check.
- A failed check does not cancel another mod's successful update. Overlapping
  manual checks share one operation. Concurrent commits read the latest registry
  and preserve toggles made during download.
- Download, missing-subfolder, empty-payload, missing-script/manifest and real
  read-only-registry failures preserve the previous installation. Uninstall has
  the same registry-write rollback protection.
- Reserved registry/internal IDs are rejected. Extracted mod files use a short,
  fixed internal payload directory independent of the mod ID, avoiding collisions
  with download, selection or rollback filenames and unnecessary Windows path length.
- Imports reinstall canonical source metadata and restore only the user's
  explicit enable/update choices. Exported stale script paths and versions do
  not overwrite the newly installed metadata.
- Native classic, window-module and background-module load failures reach the
  result. All window-module imports settle before another rebuild can begin.
  Successful cleanup permits reinitialization; failed cleanup blocks it.
- Non-unloadable code is not executed again on rebuild or disable/re-enable.
  Failed partial initialization without cleanup remains an explicit failure
  requiring a restart, rather than being retried blindly or reported loaded.
  It can still be disabled without blocking independent reloads.
- Recovery fixtures construct interrupted swaps before and after the registry
  commit and an interrupted uninstall. Startup reconciliation restores the old
  payload or retains the committed replacement accordingly.

The updater tests replace metadata/archive **transport**, but use actual Gecko
filesystem and registry operations. The loader tests execute real `.uc.js`,
`.uc.mjs` and `.sys.mjs` through Sine. They use small counters and promise gates,
not resource-exhaustion workloads.

## Recorded integration results

Verified on Windows with Zen **1.23.3b / Gecko 158.0**, starting from upstream
`fb0bd4ca6af888f10648e126947f7d1f82228433`:

| Boundary                          | Exercise and observed result                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native network and ZIP extraction | A loopback HTTP server served ZIPs containing a root mod and a nested mod. Both installed. An archive with no entrypoint, a missing URL, and non-ZIP bytes all failed without replacing the old CSS or version.                                                                                                                                                                                                                                                      |
| Settings feedback                 | Actual clicks on the disposable `about:preferences#sineMods` page produced localized current, updated, partial-failure, total-failure, activation-failure and thrown-exception messages. The button re-enabled in all six cases; none remained at `...`. Manager outcomes were controlled for these UI checks.                                                                                                                                                       |
| Public Sine/GitHub path           | Installed `customize-collapsed-sidebar` from the actual Sine catalog and immutable GitHub archive `ca6f8d39f594edd9cd5cb7eebab421e52da1b877`. `Customize%20Collapsed%20Sidebar` resolved to `userChrome.css` and `preferences.json`, version `1.1.1`. Replacing only the disposable installed commit with a stale identity and removing its date caused the real manual update to refresh it successfully, with no failed results. The public store was not changed. |
| Broken-mod startup                | With a deliberately throwing window module, instrumented disposable copies confirmed that startup still called the automatic update path and imported the marketplace API module. This proves continuation, not that an automatic network update was needed.                                                                                                                                                                                                         |
| Baseline discrimination           | The original updater suite failed 13 of 14 checks on untouched upstream; added lifecycle/source-format cases also failed before their repairs. A revised registry-failure test using actual OS read-only permissions independently failed upstream and passed the candidate.                                                                                                                                                                                         |

Both the standalone native runner and the Browsercfg suite passed. **Tooling
qualification:** Browsercfg 0.1.8's generated bootstrap attempted to load tests
using `file:` URLs, rejected by this Gecko build. For the Browsercfg run only,
its generated bootstrap's `Services.io.newFileURI(file).spec` was replaced with
`` `chrome://userchrome/content/tests/${encodeURIComponent(file.leafName)}` ``
and the imported suite was run with `bun run test -- --no-import`. This uses the
same test files through the bootloader's registered chrome root; no browser
security preference was disabled. An unmodified Browsercfg 0.1.8 run is **not**
claimed to pass on this browser.

## Recovery and compatibility limits

Staged updates are validated before touching live files. Each directory swap
records `transaction.json` in its unique `.sine-update-*` or `.sine-remove-*`
directory. `mods.json` persistence is the commit point. Startup reconciles these
records before registering loaders. A conflict or missing recovery payload is
reported and retained for inspection rather than guessed away.

The recovery tests construct the on-disk interrupted states; they do not certify
power-loss durability or cover every filesystem/storage fault. Pre-journal
interrupted downloads have not touched installed files and are not treated as
committed transactions. Do not delete a retained transaction containing the only
previous payload while investigating an unresolved recovery error.

Only English strings were added; translations need the usual localization
workflow. Other browsers/operating systems still need native qualification. The
patch does not infer missing legacy origin data, close all of #454/#429, change
installer behavior, or claim to diagnose/fix any particular high-memory hang.
The subfolder test and public reproduction address #730's installer-path defect.
Loader ownership/serialization overlaps the concerns in open PR #734, but does
not implement its targeted-reload redesign.
