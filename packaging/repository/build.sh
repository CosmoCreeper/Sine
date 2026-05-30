#!/usr/bin/env bash
set -euo pipefail

package_dir="${PACKAGE_DIR:-dist/linux}"
repo_dir="${REPO_DIR:-dist/repository}"
version="${SINE_VERSION:?SINE_VERSION is required}"
repository="${REPOSITORY_FULL_NAME:-CosmoCreeper/Sine}"

rm -rf "$repo_dir"
mkdir -p \
  "$repo_dir/apt/pool/main/s/sine" \
  "$repo_dir/apt/dists/stable/main/binary-amd64" \
  "$repo_dir/apt/dists/stable/main/binary-arm64" \
  "$repo_dir/rpm/x86_64" \
  "$repo_dir/rpm/aarch64"

find "$package_dir" -maxdepth 1 -name "*.deb" -exec cp {} "$repo_dir/apt/pool/main/s/sine/" \;
find "$package_dir" -maxdepth 1 -name "*.rpm" -exec sh -c '
  for package do
    case "$package" in
      *aarch64.rpm) cp "$package" "$0/rpm/aarch64/" ;;
      *x86_64.rpm) cp "$package" "$0/rpm/x86_64/" ;;
    esac
  done
' "$repo_dir" {} +

(
  cd "$repo_dir/apt"
  dpkg-scanpackages --arch amd64 pool > dists/stable/main/binary-amd64/Packages
  dpkg-scanpackages --arch arm64 pool > dists/stable/main/binary-arm64/Packages
)
gzip -kf "$repo_dir/apt/dists/stable/main/binary-amd64/Packages"
gzip -kf "$repo_dir/apt/dists/stable/main/binary-arm64/Packages"

apt-ftparchive \
  -o APT::FTPArchive::Release::Origin=Sine \
  -o APT::FTPArchive::Release::Label=Sine \
  -o APT::FTPArchive::Release::Suite=stable \
  -o APT::FTPArchive::Release::Codename=stable \
  -o APT::FTPArchive::Release::Architectures="amd64 arm64" \
  -o APT::FTPArchive::Release::Components=main \
  release "$repo_dir/apt/dists/stable" > "$repo_dir/apt/dists/stable/Release"

createrepo_c "$repo_dir/rpm/x86_64"
createrepo_c "$repo_dir/rpm/aarch64"

cat > "$repo_dir/apt/sine.sources" <<SOURCES
Types: deb
URIs: https://raw.githubusercontent.com/${repository}/linux-packages/apt
Suites: stable
Components: main
Architectures: amd64 arm64
Trusted: yes
SOURCES

cat > "$repo_dir/rpm/sine.repo" <<REPO
[sine]
name=Sine
baseurl=https://raw.githubusercontent.com/${repository}/linux-packages/rpm/\$basearch
enabled=1
gpgcheck=0
metadata_expire=1h
REPO

cat > "$repo_dir/VERSION" <<VERSION
$version
VERSION
