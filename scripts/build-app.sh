#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build:web
swift build -c release --scratch-path .build -Xswiftc -warnings-as-errors
APP="$PWD/dist/MacDown GitLab.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp .build/release/MacDownGitLab "$APP/Contents/MacOS/MacDownGitLab"
cp -R .build/release/MacDownGitLab_MacDownGitLab.bundle "$APP/Contents/Resources/"
cp MacDown/Resources/MarkdownDocument.icns "$APP/Contents/Resources/MarkdownDocument.icns"
cp -R LICENSE "$APP/Contents/Resources/Licenses"
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>MacDownGitLab</string>
<key>CFBundleIdentifier</key><string>com.chocholom.MacDownGitLab</string>
<key>CFBundleName</key><string>MacDown GitLab</string>
<key>CFBundleVersion</key><string>1</string>
<key>CFBundleShortVersionString</key><string>1.0.0</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleIconFile</key><string>MarkdownDocument</string>
<key>NSHighResolutionCapable</key><true/>
<key>LSMinimumSystemVersion</key><string>14.0</string>
<key>NSPrincipalClass</key><string>NSApplication</string>
<key>CFBundleDocumentTypes</key><array><dict>
<key>CFBundleTypeName</key><string>Markdown document</string>
<key>CFBundleTypeRole</key><string>Editor</string>
<key>LSItemContentTypes</key><array><string>net.daringfireball.markdown</string><string>public.plain-text</string></array>
<key>NSDocumentClass</key><string>MacDownGitLab.MarkdownDocument</string>
</dict></array>
<key>UTImportedTypeDeclarations</key><array><dict>
<key>UTTypeIdentifier</key><string>net.daringfireball.markdown</string>
<key>UTTypeConformsTo</key><array><string>public.plain-text</string></array>
<key>UTTypeTagSpecification</key><dict><key>public.filename-extension</key><array><string>md</string><string>markdown</string><string>mdown</string></array></dict>
</dict></array>
</dict></plist>
PLIST
codesign --force --deep --sign - "$APP"
printf 'Built %s\n' "$APP"
