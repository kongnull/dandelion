const { contextBridge, ipcRenderer } = require('electron')

// 暴露安全的API给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
    // 文件操作
    openFile: () => ipcRenderer.invoke('open-file'),
    saveFile: (options) => ipcRenderer.invoke('save-file', options),

    // 反编译功能
    decompile: (content) => ipcRenderer.invoke('decompile', { content }),

    // 监听事件
    on: (channel, callback) => {
        const validChannels = ['file-opened', 'file-saved', 'decompilation-complete']
        if (validChannels.includes(channel)) {
            ipcRenderer.on(channel, (event, ...args) => callback(...args))
        }
    }
})