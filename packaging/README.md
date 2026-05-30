# Linux packaging

Sine builds Linux packages from the same native installer executable produced by the existing CMake installer build. The release workflow stages that executable at `packaging/root/usr/bin/sine`, then nFPM creates `.deb` and `.rpm` packages from `packaging/nfpm.yaml`.

## Outputs

- `sine-linux-x64` and `sine-linux-arm64` standalone binaries
- Debian packages for APT-based distributions
- RPM packages for DNF, RPM, and Zypper-based distributions
- APT and RPM repository metadata for URL imports

## Package layout

- `/usr/bin/sine`
- `/usr/share/applications/sine.desktop`
- `/usr/share/icons/hicolor/scalable/apps/sine.svg`
- `/usr/share/sine/install-source`

The marker file tells Sine that updates should be handled by the system package manager. Standalone installer builds keep using the internal updater.

## Repository publishing

Release tags publish repository trees to the `linux-packages` branch. The branch is intentionally separate from Fedora, Ubuntu, or OpenSUSE infrastructure: users import Sine's URL and then use their normal package manager.

## Local package builds

```sh
mkdir -p packaging/root/usr/bin dist/linux
install -m 0755 path/to/sine-linux-x64 packaging/root/usr/bin/sine
SINE_VERSION=2.3.3 NFPM_ARCH=amd64 nfpm pkg --packager deb --config packaging/nfpm.yaml --target dist/linux/
SINE_VERSION=2.3.3 NFPM_ARCH=amd64 nfpm pkg --packager rpm --config packaging/nfpm.yaml --target dist/linux/
SINE_VERSION=2.3.3 PACKAGE_DIR=dist/linux REPO_DIR=dist/repository packaging/repository/build.sh
```

For ARM64, use `NFPM_ARCH=arm64`.
