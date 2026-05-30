# Flatpak preparation

Flatpak packaging is intentionally not generated yet. The Linux packaging layout keeps reusable desktop metadata in `packaging/linux/` so a future Flatpak manifest can reuse the same application ID, icon, desktop entry, and package-manager updater policy.

When Flatpak support is added, the sandbox should set `SINE_INSTALL_SOURCE=flatpak` or install an equivalent marker so Sine can disable the internal engine updater and direct users to their Flatpak remote.
