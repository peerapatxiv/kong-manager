#!/bin/bash
# Builds "Kong Manager.app" in ~/Applications. Opening it runs the app locally with the
# Kong proxy and opens it in the browser. Run again after moving the project folder.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
APP="$HOME/Applications/Kong Manager.app"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

sed "s|__REPO__|$REPO|" "$HERE/launcher.sh" >"$APP/Contents/MacOS/kong-manager"
chmod +x "$APP/Contents/MacOS/kong-manager"

cat >"$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Kong Manager</string>
  <key>CFBundleDisplayName</key><string>Kong Manager</string>
  <key>CFBundleIdentifier</key><string>io.github.peerapatxiv.kong-manager</string>
  <key>CFBundleExecutable</key><string>kong-manager</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>LSUIElement</key><true/>
</dict>
</plist>
PLIST

# Icon: render the SVG (Swift keeps the corners transparent; Quick Look is the fallback),
# then build the .icns from the standard sizes.
swift "$HERE/render-icon.swift" "$HERE/icon.svg" "$WORK/icon.svg.png" 1024 2>/dev/null \
  || qlmanage -t -s 1024 -o "$WORK" "$HERE/icon.svg" >/dev/null 2>&1
ICONSET="$WORK/AppIcon.iconset"
mkdir -p "$ICONSET"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$WORK/icon.svg.png" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
  double=$((size * 2))
  sips -z "$double" "$double" "$WORK/icon.svg.png" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"

codesign --force --sign - "$APP" >/dev/null 2>&1 || true
# Make Finder and Launchpad pick up the new icon.
touch "$APP"
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$APP" >/dev/null 2>&1 || true

echo "Installed: $APP"
echo "Open it from Launchpad or Spotlight, or drag it to the Dock."
