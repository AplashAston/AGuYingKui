# 📈 A股盈亏复盘 (A-Share Trading Review Tool)

**A股盈亏复盘** 是一款基于 **React** (前端) 和 **Python** (后端 pywebview) 开发的轻量级桌面应用程序。它专为 A 股投资者设计，用于记录交易、分析持仓成本、计算“做T”收益以及实时推演浮动盈亏。

## ✨ 主要功能

  * **📊 资产全景总览**
      * 自动计算累计总盈亏（包含已实现和浮动）。
      * 展示持仓资金占比与总成本。
      * 基于最新现价的潜在浮动盈亏估算。
  * **📝 交易记录与复盘**
      * 支持买入、卖出操作记录，自动计算佣金、印花税和过户费。
      * **做T分析**：自动识别日内/波段交易，独立统计“做T”收益与胜率。
      * **成本计算**：实时更新持仓均价、保本价格。
  * **🧮 现价推演**
      * 在详情页输入当前股价，实时联动计算浮动盈亏。
      * 数据自动持久化，下次打开无需重新输入。
  * **💾 数据安全与管理**
      * **本地存储**：数据安全地保存在用户文档目录 (`~/Documents/A股盈亏复盘/data.json`)，不上传云端。
      * **智能保存**：支持 `Ctrl+S` / `Cmd+S` 快捷键保存；关闭程序前自动检测未保存更改并提示。
      * **备份恢复**：支持一键导出/导入 JSON 备份文件。
  * **⚙️ 个性化设置**
      * 自定义交易费率（佣金、印花税、过户费）。
      * 支持设置最低佣金（如 5 元起）。

## 🛠 技术栈

  * **前端**：React 19, TypeScript, Tailwind CSS, Vite, Lucide React (图标)
  * **后端**：Python 3, `pywebview` (GUI 框架)
  * **打包工具**：PyInstaller

## 🚀 开发环境搭建

### 1\. 前置要求

  * **Node.js** (推荐 v16+)
  * **Python** (推荐 3.8+)

### 2\. 初始化项目

```bash
# 1. 安装前端依赖
npm install

# 2. 创建并激活 Python 虚拟环境 (推荐)
# macOS/Linux:
python3 -m venv .venv
source .venv/bin/activate

# Windows:
python -m venv venv
.\venv\Scripts\activate

# 3. 安装 Python 依赖
# Windows (无需安装 pyobjc 等 Mac 专用库):
pip install pywebview pyinstaller

# macOS:
pip install pywebview pyinstaller pyobjc
```

### 3\. 运行开发版

```bash
# 1. 构建前端资源 (生成 dist 文件夹)
npm run build

# 2. 运行 Python 主程序
python main.py
```

## 📦 打包发布

### ⚠️ 打包前准备

  * **图标文件**：
      * macOS 需要 `app.icns` 放在根目录。
      * Windows 需要 `app.ico` 放在根目录。
      * 前端 `public/` 目录下需要有 `icon.png` 用于界面显示。
  * **清理旧文件**：每次打包前建议执行 `rm -rf dist build` (Mac) 或删除对应文件夹 (Windows)。

### 🍎 macOS 打包

在 macOS 终端中执行：

```bash
# 1. 清理并构建前端
rm -rf dist build
npm run build

# 2. 使用 PyInstaller 打包
pyinstaller --noconfirm --windowed --clean \
 --name "A股盈亏复盘" \
 --add-data "dist:dist" \
 --hidden-import "stock_types" \
 --hidden-import "stock_utils" \
 --icon "app.icns" \
 main.py

# 3. 修复权限 (防止“已损坏”提示)
xattr -cr "dist/A股盈亏复盘.app"
```

*产物位于 `dist/A股盈亏复盘.app`*

### 🪟 Windows 打包

在 Windows PowerShell 或 CMD 中执行：

```powershell
# 1. 清理旧文件 (手动删除 dist 和 build 文件夹)

# 2. 构建前端
npm run build

# 3. 使用 PyInstaller 打包 (注意分隔符为分号 ;)
pyinstaller --noconfirm --windowed --clean ^
 --name "A股盈亏复盘" ^
 --add-data "dist;dist" ^
 --hidden-import "stock_types" ^
 --hidden-import "stock_utils" ^
 --icon "app.ico" ^
 main.py
```

*产物位于 `dist/A股盈亏复盘/A股盈亏复盘.exe`*

## 📂 数据存储路径

程序产生的数据文件 `data.json` 默认存储在用户的文档目录下，方便用户进行备份或迁移。

  * **macOS**: `/Users/您的用户名/Documents/A股盈亏复盘/data.json`
  * **Windows**: `C:\Users\您的用户名\Documents\A股盈亏复盘\data.json`

## ⌨️ 快捷键

| 功能 | macOS | Windows |
| :--- | :--- | :--- |
| **保存数据** | `Cmd + S` | `Ctrl + S` |
| **关闭窗口** | `Cmd + W` | `Ctrl + W` |

-----

**注意**：本项目仅用于个人交易复盘辅助，不构成任何投资建议。股市有风险，入市需谨慎。