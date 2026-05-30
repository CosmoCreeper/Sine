# Debian and Ubuntu packages

Sine uses `packaging/nfpm.yaml` to build Debian packages from the staged Linux installer binary.

Local build:

```sh
mkdir -p packaging/root/usr/bin dist/linux
install -m 0755 path/to/sine-linux-x64 packaging/root/usr/bin/sine
SINE_VERSION=2.3.3 NFPM_ARCH=amd64 nfpm pkg --packager deb --config packaging/nfpm.yaml --target dist/linux/
```

The package installs:

- `/usr/bin/sine`
- `/usr/share/applications/sine.desktop`
- `/usr/share/icons/hicolor/scalable/apps/sine.svg`
- `/usr/share/sine/install-source`
