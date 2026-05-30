# RPM packages

Sine uses `packaging/nfpm.yaml` to build RPM packages for Fedora, RHEL-compatible distributions, and OpenSUSE.

Local build:

```sh
mkdir -p packaging/root/usr/bin dist/linux
install -m 0755 path/to/sine-linux-x64 packaging/root/usr/bin/sine
SINE_VERSION=2.3.3 NFPM_ARCH=amd64 nfpm pkg --packager rpm --config packaging/nfpm.yaml --target dist/linux/
```

The package installs the same payload as the Debian package and marks the install as package-manager managed for Sine's internal updater.
