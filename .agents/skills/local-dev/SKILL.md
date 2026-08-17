---
name: local-dev
description: 本地一键启动项目服务。当用户要求"启动项目/启动后端/启动前端/启动 H5/启动微信小程序/run dev/local start"时触发。负责在终端中按端口占用检测启动 admin 后端（:3000）与 frontend_uniapp 前端（H5 或微信小程序），已启动则跳过。
allowed-tools:
disable: false
---

# 本地启动项目（local-dev）

本 skill 用于在本地终端中启动本仓库的两个独立子项目，并在启动前检测服务是否已经在运行（避免重复拉起）。

## 项目背景

- `admin/`：Next.js 后端 + 管理后台，开发服务器默认监听 `:3000`。
- `frontend_uniapp/`：uni-app 客户端，支持 H5（`pnpm dev:h5`）与微信小程序（`pnpm dev:mp-weixin`）。

两个子项目互相独立，需分别启动。

## 启动规则

启动服务时必须启动**两个独立的外部终端窗口**（操作系统级独立窗口，而非 IDE 内置终端面板），互不阻塞。每个外部窗口都**保持前台进程、可见、可交互**——不要后台化、不要隐藏、不要用 `nohup`/`Start-Process`/后台 `&`/日志重定向等方式脱离窗口。

> **终端环境（按操作系统区分）**：
> - **Windows** → 使用 **PowerShell** 终端窗口（`pwsh` / `powershell`）。
> - **非 Windows（macOS / Linux）** → 使用 **bash** 终端窗口。
>
> 下方每个步骤都给出两套命令，按当前系统选择对应的一套执行。

> **重要 — 路径约定**：终端窗口启动时的当前目录（cwd）不一定是仓库根目录，因此务必先 `cd` 到仓库根目录的绝对路径（Windows 用 `C:\...`，bash 用 `/c/...` 或对应绝对路径），再进入子目录。

### 1. 启动后端（外部窗口 1）

- 先检测 `3000` 端口是否已被监听（服务已启动）。
- 若已占用：告知用户后端已在运行，不重复执行。
- 若未占用：在**外部窗口 1** 中依次执行：

  **Windows (PowerShell)：**
  ```powershell
  cd C:\Users\shine\projects\frenquency_circle
  cd admin
  pnpm run dev
  ```
  **非 Windows (bash)：**
  ```bash
  cd /c/Users/shine/projects/frenquency_circle   # 或仓库实际绝对路径
  cd ./admin
  pnpm run dev
  ```

- 端口检测命令（有输出即已启动）：
  - Windows (PowerShell)：`Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue`
  - 非 Windows (bash)：`lsof -iTCP:3000 -sTCP:LISTEN` 或 `netstat -ano | grep ':3000 '`

### 2. 启动前端（外部窗口 2）

- 在**外部窗口 2** 中先 `cd` 到仓库根，再 `cd frontend_uniapp`。
- 根据用户意图选择命令：
  - 启动 H5 → `pnpm run dev:h5`
  - 启动微信小程序 → `pnpm run dev:mp-weixin`
- 启动前同样先检测服务是否已启动：
  - H5：检测 H5 端口是否被监听（见下方端口说明），已占用则跳过。
  - 微信小程序：无 HTTP 端口，跳过端口检测直接启动（或检测是否有对应 dev 进程在运行）。

  **Windows (PowerShell)：**
  ```powershell
  cd C:\Users\shine\projects\frenquency_circle
  cd frontend_uniapp
  pnpm run dev:h5        # 或 pnpm run dev:mp-weixin
  ```
  **非 Windows (bash)：**
  ```bash
  cd /c/Users/shine/projects/frenquency_circle   # 或仓库实际绝对路径
  cd ./frontend_uniapp
  pnpm run dev:h5      # 或 pnpm run dev:mp-weixin
  ```

## 端口检测命令

不生成脚本，直接在外部终端窗口中（先 `cd` 到仓库根）用下面的命令检测服务是否已启动：

- **后端 :3000**
  - Windows：`Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue`
  - 非 Windows：`lsof -iTCP:3000 -sTCP:LISTEN` 或 `netstat -ano | grep ':3000 '`
- **前端 H5**（端口取 `frontend_uniapp/env/.env` 的 `VITE_APP_PORT`，未配置时 Vite 默认 5173）
  - Windows：`Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue`
  - 非 Windows：`lsof -iTCP:5173 -sTCP:LISTEN` 或 `netstat -ano | grep ':5173 '`

有返回结果即代表服务已在运行，跳过启动；无返回结果则执行启动命令。

## 交互约定

- 启动时必须启动**两个外部终端窗口**：窗口 1 后端、窗口 2 前端。终端环境按系统区分——**Windows 用 PowerShell，非 Windows 用 bash**；两个命令都直接运行在独立外部窗口中、前台可见可交互，不要后台化或脱离窗口，也不要使用 IDE 内置终端。
- 若用户只说"启动项目"而未说明平台，默认启动**后端 + 前端 H5**（最常用的本地联调组合），即同时打开两个终端分别执行。
- 若用户只要求"启动后端"或"启动前端"，则只需打开对应的那一个终端。
- 若用户明确要求"微信小程序"，则终端 2 用 `dev:mp-weixin`。
- 每次启动前务必先做端口检测，已运行的不要重复拉起，并向用户说明当前状态。
