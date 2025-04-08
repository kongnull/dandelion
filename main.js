// 在文件最顶部添加electron模块导入
const { app, BrowserWindow, ipcMain, dialog } = require('electron')

const fs = require('fs')
const path = require('path')
const esprima = require('esprima');
const escodegen = require('escodegen');

// 新增AST处理工具
const estraverse = require('estraverse');

// 更新后的BrowserWindow配置
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: true, // 启用上下文隔离
      preload: path.join(__dirname, 'preload.js'), // 添加预加载脚本
      webgl: false // 禁用WebGL
    }
  });
  
  // 加载Vue开发服务器或打包后的文件
  // 修正加载路径逻辑
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173/index.html') // 明确指定入口文件
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist/index.html'))
  }
}

// 文件处理IPC监听
// 在文件处理IPC监听处添加进度报告
ipcMain.on('decompile-js', (event, filePaths) => {
  try {
    const results = filePaths.map((file, index) => {
      const content = fs.readFileSync(file, 'utf8');
      // 报告处理进度
      event.sender.send('processing-progress', index + 1);
      return {
        filename: path.basename(file),
        code: deobfuscate(content)
      };
    });
    event.sender.send('decompile-result', results);
  } catch (error) {
    event.sender.send('decompile-error', error.message);
  }
});

// 添加保存文件处理
ipcMain.on('save-file', (event, { filename, content }) => {
  const savePath = dialog.showSaveDialogSync({
    defaultPath: filename,
    filters: [{ name: 'JavaScript Files', extensions: ['js'] }]
  });
  
  if (savePath) {
    fs.writeFileSync(savePath, content);
    event.sender.send('save-success', path.basename(savePath));
  }
});

// 改进后的反混淆核心逻辑
function deobfuscate(code) {
  try {
    // 新增异常字符过滤
    const sanitizedCode = code
      .replace(/[\x00-\x1F\x7F-\x9F]/g, '') // 过滤控制字符
      .replace(/(?<!\\)\\(?!["\\/bfnrtu])/g, ''); // 移除无效转义

    // 更新AST解析方式
    const ast = esprima.parseScript(sanitizedCode, {
      tolerant: true,
      range: true,
      loc: true // 启用位置信息
    });

    // 增强AST遍历逻辑
    // 修改AST遍历逻辑（修复node未定义问题）
    estraverse.traverse(ast, {
      enter: function(node, parent) {
        // 确保node存在
        if (!node) return;
    
        // 简化计算表达式（添加安全判断）
        if (node.type === 'BinaryExpression' && node.left && node.right) {
          try {
            const result = eval(escodegen.generate(node));
            this.replace({ type: 'Literal', value: result });
          } catch {}
        }
        
        // 处理空数组声明（添加存在性检查）
        if (node.type === 'ArrayExpression' && (!node.elements || node.elements.length === 0)) {
          this.replace({ type: 'ArrayExpression', elements: [] });
        }
      }
    });
  } catch (e) {
    console.error(`反编译失败: ${e.stack}`); // 输出完整堆栈
    return `/* 反编译失败！错误原因：${e.message} */\n${code}`;
  }
}

// 在文件顶部添加环境变量设置
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

// 确保app ready后创建窗口
app.whenReady().then(() => {
  // 在app ready事件前添加
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('disable-software-rasterizer');
  app.commandLine.appendSwitch('disable-features', 'Vulkan,UseSkiaRenderer');
  createWindow()
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// 添加应用生命周期管理
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// 更新IPC监听逻辑
ipcMain.on('decompile-js', (event, { content, index }) => {
  try {
    const result = deobfuscate(content);
    event.sender.send('decompile-result', { 
      index,
      result 
    });
  } catch (error) {
    event.sender.send('decompile-error', { 
      index,
      error: error.message 
    });
  }
});