# URL repository support

The Linux release workflow publishes package repository metadata to the `linux-packages` branch. Users can import that branch by URL without Sine publishing to Ubuntu, Fedora, or OpenSUSE-owned repositories.

APT source:

```sh
sudo curl -L https://raw.githubusercontent.com/CosmoCreeper/Sine/linux-packages/apt/sine.sources -o /etc/apt/sources.list.d/sine.sources
sudo apt update
sudo apt install sine
```

DNF source:

```sh
sudo dnf config-manager addrepo --from-repofile=https://raw.githubusercontent.com/CosmoCreeper/Sine/linux-packages/rpm/sine.repo
sudo dnf install sine
```

Zypper source:

```sh
arch="$(uname -m)"
sudo zypper addrepo "https://raw.githubusercontent.com/CosmoCreeper/Sine/linux-packages/rpm/${arch}" sine
sudo zypper --gpg-auto-import-keys refresh sine
sudo zypper install sine
```
