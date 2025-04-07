document.addEventListener('DOMContentLoaded', () => {
    // DOM元素引用
    const openBtn = document.getElementById('openBtn')
    const saveBtn = document.getElementById('saveBtn')
    const decompileBtn = document.getElementById('decompileBtn')
    const filePathElement = document.getElementById('filePath')
    const originalCodeElement = document.getElementById('originalCode')
    const decompiledCodeElement = document.getElementById('decompiledCode')
    const moduleTreeContainer = document.getElementById('moduleTreeContainer')
    const moduleTree = document.getElementById('moduleTree')
    const statusMessage = document.getElementById('statusMessage')

    // 当前文件状态
    let currentFile = {
        path: null,
        originalContent: null,
        decompiledContent: null,
        modules: null
    }

    // 打开文件
    openBtn.addEventListener('click', async () => {
        updateStatus('Opening file...')

        const result = await window.electronAPI.openFile()
        if (result.canceled) {
            updateStatus('File open canceled')
            return
        }

        if (result.error) {
            showError(result.error)
            return
        }

        // 更新UI状态
        currentFile.path = result.filePath
        currentFile.originalContent = result.content
        currentFile.decompiledContent = null
        currentFile.modules = null

        filePathElement.textContent = result.filePath
        originalCodeElement.value = result.content
        decompiledCodeElement.value = ''
        moduleTreeContainer.style.display = 'none'
        moduleTree.innerHTML = ''

        saveBtn.disabled = true
        decompileBtn.disabled = false

        updateStatus('File loaded successfully')
    })

    // 保存文件
    saveBtn.addEventListener('click', async () => {
        if (!currentFile.decompiledContent) return

        updateStatus('Saving file...')

        const result = await window.electronAPI.saveFile({
            filePath: currentFile.path,
            content: currentFile.decompiledContent
        })

        if (result.canceled) {
            updateStatus('File save canceled')
            return
        }

        if (result.error) {
            showError(result.error)
            return
        }

        currentFile.path = result.filePath
        filePathElement.textContent = result.filePath
        updateStatus('File saved successfully')
    })

    // 反编译
    // 修改 decompileBtn 的点击事件处理
    decompileBtn.addEventListener('click', async () => {
        if (!currentFile.originalContent) return

        updateStatus('Decompiling...')
        decompileBtn.disabled = true
        decompiledCodeElement.value = 'Decompiling... Please wait'

        try {
            const response = await window.electronAPI.decompile({
                content: currentFile.originalContent
            })

            if (!response.success) {
                throw new Error(response.error || 'Decompilation failed')
            }

            // 直接显示反编译结果
            currentFile.decompiledContent = response.result
            decompiledCodeElement.value = response.result
            saveBtn.disabled = false

            // 显示模块树
            if (response.modules?.length > 0) {
                renderModuleTree(response.modules)
                moduleTreeContainer.style.display = 'block'
            }

            updateStatus('Decompilation completed successfully')
        } catch (error) {
            const errorMessage = `Decompilation error: ${error.message}`
            showError(errorMessage)
            decompiledCodeElement.value = errorMessage
            updateStatus('Decompilation failed')
        } finally {
            decompileBtn.disabled = false
        }
    })

    // 渲染模块树
    function renderModuleTree(modules) {
        moduleTree.innerHTML = ''

        modules.forEach(module => {
            const moduleItem = document.createElement('div')
            moduleItem.className = 'module-item'

            const moduleName = document.createElement('div')
            moduleName.className = 'module-name'
            moduleName.textContent = module.id || 'Anonymous Module'

            const moduleDeps = document.createElement('div')
            moduleDeps.className = 'module-deps'
            moduleDeps.textContent = `Dependencies: ${module.dependencies.join(', ') || 'none'}`

            moduleItem.appendChild(moduleName)
            moduleItem.appendChild(moduleDeps)
            moduleTree.appendChild(moduleItem)
        })

        console.log('Received from main:', {
            result: typeof result,
            modules: modules?.length
        });
    }

    // 更新状态消息
    function updateStatus(message) {
        statusMessage.textContent = message
        console.log(message)
    }

    // 显示错误
    function showError(message) {
        statusMessage.textContent = `Error: ${message}`
        console.error(message)

        // 可以在这里添加更显眼的错误显示，比如Toast通知
        alert(`Error: ${message}`)
    }
})