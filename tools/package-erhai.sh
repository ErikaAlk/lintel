#!/bin/bash
set -euo pipefail
source=$(cd -- "$(dirname -- "$0")/.." && pwd)
output=${1:?需要绝对输出目录}
[[ "$output" = /* ]]
stage="$output/lintel@topbar"
test ! -e "$stage"
install -d "$stage"
cp "$source/"{extension.js,prefs.js,metadata.json,stylesheet.css,menuSources.js,cascade.js,erhaiIntegration.js,erhaiMenus.js,calendarLayout.js,calendarMenuRedirect.js,LICENSE,LICENSE-menuSources} "$stage/"
cp -r "$source/"{src,schemas,icons} "$stage/"
"${PYTHON:-python}" "$source/tools/build-erhai-icons.py" "$output/apple-assets"
install -d "$stage/icons/apple" "$stage/locale/zh_CN/LC_MESSAGES"
cp "$output/apple-assets/"*-symbolic.svg "$stage/icons/apple/"
glib-compile-schemas --strict "$stage/schemas"
msgfmt --check "$source/zh_CN.po" -o "$stage/locale/zh_CN/LC_MESSAGES/lintel@topbar.mo"
cd "$stage"
zip -qr "$output/lintel-erhai.shell-extension.zip" .
unzip -tq "$output/lintel-erhai.shell-extension.zip"
echo LINTEL_PACKAGE_PASSED
