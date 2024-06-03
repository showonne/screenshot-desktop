import { app, BrowserWindow, shell, ipcMain, globalShortcut, desktopCapturer, ipcRenderer } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import { update } from './update'
import { screen } from 'electron';

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬ dist-electron
// │ ├─┬ main
// │ │ └── index.js    > Electron-Main
// │ └─┬ preload
// │   └── index.mjs   > Preload-Scripts
// ├─┬ dist
// │ └── index.html    > Electron-Renderer
//
process.env.APP_ROOT = path.join(__dirname, '../..')

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

// Disable GPU Acceleration for Windows 7
if (os.release().startsWith('6.1')) app.disableHardwareAcceleration()

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let win: BrowserWindow | null = null
const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')

async function startCapture() {
  // use contextBridge.exposeInMainWorld send message to render process
  // Test actively push message to the Electron-Renderer
  // win?.webContents.on('did-finish-load', async () => {
  //   win?.webContents.send('capture', screen.getAllDisplays(), screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id)

  //   win?.show()
  //   win?.setSimpleFullScreen(true)
  //   win?.setAlwaysOnTop(true, 'screen-saver')
  // })

  // 先 send event 再 show window, 防止 window 出现夺取焦点，导致截屏的菜单栏信息不对
  win?.webContents.send('capture', screen.getAllDisplays(), screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id)

  setTimeout(() => {
    // 直接展示
    win?.show()
    win?.setSimpleFullScreen(true)
    win?.setAlwaysOnTop(true, 'screen-saver')
  }, 100)

  // Make all links open with the browser, not with the application
  win?.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })

  // Auto update
  // update(win)
}

app.whenReady().then(() => {
  // createWindow()

  // 预先创建一个 browserWindow
  win = new BrowserWindow({
    title: 'Main Window',
    icon: path.join(process.env.VITE_PUBLIC, 'favicon.ico'),
    width: screen.getPrimaryDisplay().workAreaSize.width, // 设置窗口宽度为当前屏幕宽度
    height: screen.getPrimaryDisplay().workAreaSize.height, // 设置窗口高度为当前屏幕高度
    frame: false, // 移除窗口边框以实现状态栏透明效果（如果适用）
    transparent: true, // 设置窗口背景透明
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    show: false,
    // simpleFullscreen: true,
    // alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload,
      // 考虑安全性和最佳实践，这里建议保持默认设置或使用 contextBridge.exposeInMainWorld
      // ...
    },
    // kiosk: true
  });
  
  if (VITE_DEV_SERVER_URL) { // #298
    win?.loadURL(VITE_DEV_SERVER_URL)
    // Open devTool if the app is not packaged
    win?.webContents.openDevTools()
  } else {
    win?.loadFile(indexHtml)
  }

  globalShortcut.register('Command+1', () => {
    startCapture()
  })

  globalShortcut.register('CommandOrControl+3', () => {
    if (win) {
      win.hide()
      // win.close();
      // win = null
    }
  });
})

app.on('window-all-closed', () => {
  win = null
  if (process.platform !== 'darwin') app.quit()
})

app.on('second-instance', () => {
  if (win) {
    // Focus on the main window if the user tried to open another
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    allWindows[0].focus()
  } else {
    // createWindow()
  }
})

// New window example arg: new windows url
ipcMain.handle('open-win', (_, arg) => {
  const childWindow = new BrowserWindow({
    webPreferences: {
      preload,
      nodeIntegration: true,
      contextIsolation: false,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    childWindow.loadURL(`${VITE_DEV_SERVER_URL}#${arg}`)
  } else {
    childWindow.loadFile(indexHtml, { hash: arg })
  }
})

ipcMain.on('SCREENSHOTS:CANCEL', () => {
  win?.hide()
})