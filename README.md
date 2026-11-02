# Lintel 洱海改版

面向一加平板 2 Pro、Arch Linux ARM 与 GNOME Shell 51 的菜单栏改版，基于 [eliotBenitez/lintel](https://github.com/eliotBenitez/lintel) `ca84855fb8a096fe442f3367eb71ab4d1940747e`（0.17.2）。

## 功能

- 系统菜单、当前应用实际导出的菜单与侧面子菜单。
- 触控控制中心、媒体播放、声音输出设备、日历与原生通知。
- 横向电池图标、实时输入功率与充电动画；充电数据读取本机 qcom-battmgr 接口。
- GNOME 51 亮度接口、中文界面与输入法指示，保留系统隐私指示器。

应用菜单取决于应用实际导出的 GMenuModel、D-Bus menu 或 GAction。充电显示面向本项目硬件，其他设备未验证。

## 加载玻璃外观

本改版与 [Glasslight 洱海改版](https://github.com/ErikaAlk/glasslight)、Blur my Shell 77 和 `erhai-motion@erhai.local` 共同使用。完整安装、启用与停用命令见 [Arch 可选外观](https://github.com/ErikaAlk/onepluspad-2pro-Arch/blob/main/docs/APPEARANCE.zh-CN.md)。

玻璃参数保存在 Arch 仓库的 `arch/appearance/`：原始桌面配置、连续圆角、GLSL 着色器、材质样式和加载顺序一起固定。已调参数包括饱和度 `1.05`、折射模糊半径 `14`、色散 `0.03`、高光强度 `0.10`、噪点 `0.025`、圆角平滑度 `0.6`。菜单、通知、控制中心和启动台共用这套材质。

安装顺序为 Blur my Shell → Lintel → erhai-motion → Glasslight。更新 JavaScript 后需要退出 GNOME 并重新登录。

## 单独打包

需要 Bash、Python、gettext、glib2、zip、unzip、Potrace，以及 `tools/erhai-requirements.txt` 中固定版本的 Pillow 与 svgpathtools。在 Linux 中执行：

```sh
python -m venv .build/python
.build/python/bin/pip install -r tools/erhai-requirements.txt
. .build/python/bin/activate
bash tools/package-erhai.sh "$PWD/.build/package"
```

输出 `lintel-erhai.shell-extension.zip`。打包时从 Apple 官方资源地址下载图标参考，逐项检查 SHA256，再使用与本机相同的透明轮廓和 Potrace 参数生成 SVG；这些第三方资源没有放进本仓库。OPPO Sans 字体由使用者从官方渠道获取并遵守其许可。

## 验证与许可证

改版曾在本机 GNOME 51.1 上完成菜单、真实媒体操作、亮度与音量、日历、触控切换和启停验证；其他机器与桌面版本未验证。公开打包验证与机器上的历史运行验证分别记录在配套 Arch 仓库。

上游 Lintel 使用 GPL-2.0-or-later，见 [LICENSE](LICENSE)。`menuSources.js` 与 `cascade.js` 的来源为 [TPCT Mac](https://github.com/TPCT/tpct-mac-theme) `4407330a30f9dcb6e5538553e57bdf48518e6892`，保留 [LICENSE-menuSources](LICENSE-menuSources)；本项目入口、菜单与集成文件按各文件 GPL-3.0-or-later 声明分发。
