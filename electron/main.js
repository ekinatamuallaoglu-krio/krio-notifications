const { app, BrowserWindow, ipcMain } = require('electron')
const { spawn } = require('node:child_process')
const path = require('node:path')

const port = process.env.PORT || '18080'
let backend
let quitting = false

function startBackend() {
  if (process.env.APP_URL) return process.env.APP_URL
  const executable = process.platform === 'win32' ? 'krio-chat.exe' : 'krio-chat'
  const binary = app.isPackaged
    ? path.join(process.resourcesPath, 'bin', executable)
    : path.join(__dirname, '..', 'dist', executable)
  backend = spawn(binary, [], {
    env: { ...process.env, PORT: port },
    cwd: path.join(__dirname, '..'),
    stdio: 'ignore',
  })
  backend.on('error', (error) => console.error('Backend başlatılamadı:', error))
  backend.on('exit', (code) => {
    backend = null
    if (!quitting && code !== 0) app.quit()
  })
  return `http://127.0.0.1:${port}`
}

function createWindow(url) {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 760,
    minHeight: 560,
    backgroundColor: '#f7f7f3',
    title: 'Krio Connect',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: path.join(__dirname, 'preload.js') },
  })
  const load = () => window.loadURL(url).catch(() => setTimeout(load, 250))
  load()
}

app.whenReady().then(() => {
  const url = startBackend()
  if (!process.argv.includes('--background')) createWindow(url)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(url)
  })
})

ipcMain.handle('set-auto-start', (_, enabled) => {
  app.setLoginItemSettings({ openAtLogin: Boolean(enabled), args: ['--background'] })
  return app.getLoginItemSettings().openAtLogin
})

ipcMain.handle('get-auto-start', () => app.getLoginItemSettings().openAtLogin)

app.on('before-quit', () => {
  quitting = true
  backend?.kill()
})
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
