const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')

// 主窗口引用
let mainWindow = null

/**
 * 创建主窗口
 */
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    })

    // 加载渲染进程
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'))

    // 开发模式下打开开发者工具
    if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools()
    }

    mainWindow.on('closed', () => {
        mainWindow = null
    })
}

// 应用准备就绪后创建窗口
app.whenReady().then(() => {
    createWindow()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
        }
    })
})

// 所有窗口关闭时退出应用
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

/**
 * 处理打开文件请求
 */
ipcMain.handle('open-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
            { name: 'JavaScript Files', extensions: ['js'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    })

    if (result.canceled) {
        return { canceled: true }
    }

    const filePath = result.filePaths[0]
    try {
        const content = fs.readFileSync(filePath, 'utf-8')
        return { canceled: false, filePath, content }
    } catch (error) {
        console.error('Error reading file:', error)
        return { canceled: false, error: error.message }
    }
})

/**
 * 处理保存文件请求
 */
ipcMain.handle('save-file', async (event, { filePath, content }) => {
    try {
        // 如果没有文件路径，显示保存对话框
        if (!filePath) {
            const result = await dialog.showSaveDialog(mainWindow, {
                filters: [
                    { name: 'JavaScript Files', extensions: ['js'] },
                    { name: 'All Files', extensions: ['*'] }
                ]
            })

            if (result.canceled) {
                return { canceled: true }
            }
            filePath = result.filePath
        }

        fs.writeFileSync(filePath, content, 'utf-8')
        return { canceled: false, filePath }
    } catch (error) {
        console.error('Error saving file:', error)
        return { canceled: false, error: error.message }
    }
})

/**
 * 处理反编译请求
 */
ipcMain.handle('decompile', async (event, { content }) => {
    try {
        const { decompileWebpack } = require('./utils/decompiler')
        const result = await decompileWebpack(content)
        return { success: true, result }
    } catch (error) {
        console.error('Decompilation error:', error)
        return { success: false, error: error.message }
    }
})