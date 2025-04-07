
# 项目结构

# 使用 Electron 构建 JS 反编译工具

下面是一个基于 Electron 的反编译工具实现方案，可以用于分析被打包过的 JavaScript 代码。

## 功能概述

1. 加载打包后的 JS 文件
2. 使用 Babel 和 AST 分析工具进行反编译
3. 提供可视化界面展示反编译结果
4. 支持代码美化、变量重命名等功能

## 项目结构

```
js-decompiler/
├── main.js          // Electron 主进程
├── preload.js       // 预加载脚本
├── renderer/        // 渲染进程
│   ├── index.html   // 主界面
│   ├── main.js      // 渲染进程脚本
│   └── styles.css   // 样式文件
├── package.json
└── utils/          // 工具函数
    └── decompiler.js // 反编译核心逻辑
```

## 核心代码实现

### 1. package.json

```json
{
  "name": "js-decompiler",
  "version": "1.0.0",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "build": "electron-builder"
  },
  "dependencies": {
    "electron": "^latest",
    "@babel/core": "^7.0.0",
    "@babel/parser": "^7.0.0",
    "@babel/generator": "^7.0.0",
    "@babel/traverse": "^7.0.0",
    "prettier": "^2.0.0",
    "escodegen": "^2.0.0",
    "esprima": "^4.0.0",
    "estraverse": "^5.0.0"
  },
  "devDependencies": {
    "electron-builder": "^latest"
  }
}
```

### 2. main.js (主进程)

```javascript
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// 处理文件打开请求
ipcMain.handle('open-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'JavaScript Files', extensions: ['js'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    const content = fs.readFileSync(filePath, 'utf-8');
    return { filePath, content };
  }
  return null;
});

// 处理文件保存请求
ipcMain.handle('save-file', async (event, { filePath, content }) => {
  try {
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
```

### 3. preload.js

```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('open-file'),
  saveFile: (data) => ipcRenderer.invoke('save-file', data)
});
```

### 4. renderer/index.html

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>JS Decompiler</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="container">
    <div class="toolbar">
      <button id="openBtn">Open JS File</button>
      <button id="saveBtn" disabled>Save</button>
      <button id="decompileBtn" disabled>Decompile</button>
      <button id="beautifyBtn" disabled>Beautify</button>
    </div>
    <div class="editor-container">
      <div class="editor">
        <h3>Original Code</h3>
        <textarea id="originalCode" spellcheck="false"></textarea>
      </div>
      <div class="editor">
        <h3>Decompiled Code</h3>
        <textarea id="decompiledCode" spellcheck="false"></textarea>
      </div>
    </div>
    <div class="status-bar" id="statusBar"></div>
  </div>
  <script src="main.js"></script>
</body>
</html>
```

### 5. renderer/main.js

```javascript
document.addEventListener('DOMContentLoaded', () => {
  const openBtn = document.getElementById('openBtn');
  const saveBtn = document.getElementById('saveBtn');
  const decompileBtn = document.getElementById('decompileBtn');
  const beautifyBtn = document.getElementById('beautifyBtn');
  const originalCode = document.getElementById('originalCode');
  const decompiledCode = document.getElementById('decompiledCode');
  const statusBar = document.getElementById('statusBar');

  let currentFile = null;

  // 打开文件
  openBtn.addEventListener('click', async () => {
    const result = await window.electronAPI.openFile();
    if (result) {
      currentFile = result.filePath;
      originalCode.value = result.content;
      decompiledCode.value = '';
      saveBtn.disabled = true;
      decompileBtn.disabled = false;
      beautifyBtn.disabled = false;
      updateStatus(`Loaded: ${currentFile}`);
    }
  });

  // 保存文件
  saveBtn.addEventListener('click', async () => {
    const content = decompiledCode.value;
    if (content && currentFile) {
      const result = await window.electronAPI.saveFile({
        filePath: currentFile.replace('.js', '.decompiled.js'),
        content
      });
      if (result.success) {
        updateStatus(`File saved successfully`);
      } else {
        updateStatus(`Error: ${result.error}`, 'error');
      }
    }
  });

  // 反编译
  decompileBtn.addEventListener('click', () => {
    try {
      const code = originalCode.value;
      const decompiled = decompileCode(code);
      decompiledCode.value = decompiled;
      saveBtn.disabled = false;
      updateStatus('Decompilation completed');
    } catch (error) {
      updateStatus(`Decompilation error: ${error.message}`, 'error');
    }
  });

  // 美化代码
  beautifyBtn.addEventListener('click', () => {
    try {
      const code = originalCode.value;
      const beautified = beautifyCode(code);
      originalCode.value = beautified;
      updateStatus('Code beautified');
    } catch (error) {
      updateStatus(`Beautification error: ${error.message}`, 'error');
    }
  });

  // 更新状态栏
  function updateStatus(message, type = 'info') {
    statusBar.textContent = message;
    statusBar.className = `status-bar ${type}`;
  }

  // 反编译核心函数
  function decompileCode(code) {
    // 这里调用实际的解包逻辑
    // 可以使用 Babel AST 或其他工具分析代码
    // 这是一个简化示例
    return tryDeobfuscate(code);
  }

  // 美化代码
  function beautifyCode(code) {
    // 使用 Prettier 或其他美化工具
    try {
      return prettier.format(code, {
        parser: 'babel',
        semi: true,
        singleQuote: true
      });
    } catch {
      // 如果美化失败，返回原始代码
      return code;
    }
  }
});

// 简单的反混淆尝试
function tryDeobfuscate(code) {
  // 这里可以添加更复杂的解包逻辑
  // 例如: 解析 AST, 重命名变量, 还原控制流等
  
  // 1. 尝试美化代码
  let result = code;
  try {
    result = prettier.format(code, {
      parser: 'babel',
      semi: true,
      singleQuote: true
    });
  } catch (e) {
    console.warn('Prettier failed, using original code');
  }
  
  // 2. 尝试简单的字符串替换
  // 这里可以添加针对特定打包工具的规则
  result = result.replace(/\\x([0-9A-Fa-f]{2})/g, (match, p1) => {
    return String.fromCharCode(parseInt(p1, 16));
  });
  
  return result;
}
```

### 6. utils/decompiler.js (核心反编译逻辑)

```javascript
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generator = require('@babel/generator').default;
const t = require('@babel/types');

/**
 * 高级反编译函数
 * @param {string} code - 要反编译的代码
 * @returns {string} 反编译后的代码
 */
function advancedDecompile(code) {
  try {
    // 1. 解析为 AST
    const ast = parser.parse(code, {
      sourceType: 'unambiguous',
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
      allowSuperOutsideMethod: true,
      plugins: [
        'jsx',
        'typescript',
        'asyncGenerators',
        'classProperties',
        'dynamicImport',
        'objectRestSpread',
        'decorators-legacy'
      ]
    });

    // 2. 遍历 AST 进行转换
    traverse(ast, {
      // 解包常见的 webpack 包装
      CallExpression(path) {
        // 处理 webpack 的模块加载器
        if (t.isFunctionExpression(path.node.callee) {
          const args = path.node.arguments;
          if (args.length === 1 && t.isArrayExpression(args[0])) {
            // 可能是 webpack 的模块数组
            const modules = args[0].elements;
            // 提取模块代码...
          }
        }
      },
      
      // 解包 IIFE (立即执行函数)
      ExpressionStatement(path) {
        if (t.isCallExpression(path.node.expression)) {
          const callee = path.node.expression.callee;
          if (t.isFunctionExpression(callee) || t.isArrowFunctionExpression(callee)) {
            // 提取 IIFE 内容...
          }
        }
      },
      
      // 重命名混淆的变量
      Identifier(path) {
        if (path.node.name.match(/^[a-z]$/) || path.node.name.match(/^_[a-z0-9]+$/)) {
          // 根据上下文推测更有意义的名称
          // 这是一个简化示例，实际实现会更复杂
          const binding = path.scope.getBinding(path.node.name);
          if (binding) {
            // 根据使用方式重命名
            if (isFunctionUsedAs(binding.path, 'logger')) {
              path.node.name = 'logger';
            }
            // 添加更多启发式规则...
          }
        }
      }
    });

    // 3. 生成代码
    const output = generator(ast, {
      retainLines: false,
      compact: false,
      concise: false,
      quotes: 'single',
      jsescOption: { minimal: true }
    });

    return output.code;
  } catch (error) {
    console.error('Advanced decompilation failed:', error);
    return code; // 返回原始代码作为后备
  }
}

function isFunctionUsedAs(path, role) {
  // 实现根据使用方式判断函数角色的逻辑
  // 这是一个简化示例
  return false;
}

module.exports = {
  advancedDecompile
};
```

## 功能扩展建议

1. **特定打包工具支持**：添加对 Webpack、Rollup、Parcel 等打包工具的专门解包逻辑
2. **控制流平坦化**：解包经过控制流平坦化混淆的代码
3. **字符串解密**：自动识别并解密经过加密的字符串
4. **AST 可视化**：添加 AST 可视化工具帮助分析代码结构
5. **性能优化**：对大文件进行分块处理，避免界面卡顿

## 构建与运行

1. 安装依赖：
```bash
npm install
```

2. 运行开发版本：
```bash
npm start
```

3. 构建可执行文件：
```bash
npm run build
```

## 注意事项

1. 反编译工具仅供学习、调试和代码恢复使用，请遵守相关软件许可协议
2. 某些打包工具可能有复杂的混淆技术，可能需要针对性地编写解包逻辑
3. 对于大型文件，可能需要优化 AST 处理性能

这个实现提供了基础框架，你可以根据需要进一步扩展反编译功能，添加更多高级分析功能。


> 如果加上专门针对 webpack 打包的解析呢

# 增强 Webpack 打包文件的解析功能

下面我将为 Electron 反编译工具添加专门针对 Webpack 打包文件的解析功能。Webpack 打包的文件有特定的结构特征，我们可以利用这些特征来更好地还原源代码。

## Webpack 打包文件特征

1. 通常以 IIFE (立即执行函数) 形式包裹
2. 包含一个模块数组或模块对象
3. 有特定的模块加载器函数
4. 使用 `__webpack_require__` 或类似的模块系统

## 代码增强实现

### 1. 首先更新 `utils/decompiler.js`

```javascript
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generator = require('@babel/generator').default;
const t = require('@babel/types');
const escodegen = require('escodegen');

/**
 * 主反编译函数
 * @param {string} code - 要反编译的代码
 * @returns {string} 反编译后的代码
 */
function decompileCode(code) {
  // 先尝试识别是否为 Webpack 打包文件
  if (isWebpackBundle(code)) {
    try {
      return decompileWebpackBundle(code);
    } catch (e) {
      console.error('Webpack decompilation failed, falling back to general decompilation:', e);
      return generalDecompile(code);
    }
  }
  return generalDecompile(code);
}

/**
 * 判断是否是 Webpack 打包文件
 */
function isWebpackBundle(code) {
  // 检查常见的 Webpack 特征
  return code.includes('__webpack_require__') ||
    /\(function\(modules\)\s*\{/.test(code) ||
    /\/\*\*\*\*\*\//.test(code); // Webpack 的模块分隔符
}

/**
 * 专门解包 Webpack 打包文件
 */
function decompileWebpackBundle(code) {
  const ast = parser.parse(code, {
    sourceType: 'unambiguous',
    allowReturnOutsideFunction: true
  });

  const webpackData = {
    modules: {},
    runtime: '',
    isIdentified: false
  };

  // 1. 识别 Webpack 结构并提取模块
  traverse(ast, {
    CallExpression(path) {
      // 识别 Webpack 的启动函数 (function(modules) { ... })([...])
      if (t.isFunctionExpression(path.node.callee) && 
          path.node.arguments.length === 1 && 
          t.isArrayExpression(path.node.arguments[0])) {
        webpackData.isIdentified = true;
        
        // 提取模块数组
        const modulesArray = path.node.arguments[0].elements;
        modulesArray.forEach((element, index) => {
          if (t.isFunctionExpression(element)) {
            webpackData.modules[index] = extractWebpackModule(element);
          }
        });
        
        // 提取运行时
        if (t.isBlockStatement(path.node.callee.body)) {
          webpackData.runtime = generator(path.node.callee.body).code;
        }
        
        path.stop(); // 找到后停止遍历
      }
    }
  });

  // 如果没有识别到标准结构，尝试其他 Webpack 变体
  if (!webpackData.isIdentified) {
    return fallbackWebpackDecompile(code);
  }

  // 2. 重建模块代码
  let output = `// Decompiled Webpack Bundle\n`;
  output += `// Extracted ${Object.keys(webpackData.modules).length} modules\n\n`;
  
  // 添加运行时（如果有）
  if (webpackData.runtime) {
    output += `// Webpack Runtime\n${webpackData.runtime}\n\n`;
  }
  
  // 添加各模块代码
  Object.entries(webpackData.modules).forEach(([id, module]) => {
    output += `// Module ${id}\n`;
    if (module.deps.length > 0) {
      output += `// Dependencies: ${module.deps.join(', ')}\n`;
    }
    output += `${module.code}\n\n`;
  });
  
  return output;
}

/**
 * 提取单个 Webpack 模块
 */
function extractWebpackModule(moduleFunc) {
  const module = {
    deps: [],
    code: ''
  };
  
  // 提取模块参数 (通常为 module, exports, __webpack_require__)
  const params = moduleFunc.params.map(p => p.name);
  
  // 提取依赖项 (通常在函数体内有 require 调用)
  traverse(moduleFunc, {
    CallExpression(path) {
      if (t.isIdentifier(path.node.callee, { name: params[2] || '__webpack_require__' }) &&
          path.node.arguments.length === 1 &&
          t.isNumericLiteral(path.node.arguments[0])) {
        const depId = path.node.arguments[0].value;
        if (!module.deps.includes(depId)) {
          module.deps.push(depId);
        }
      }
    }
  });
  
  // 提取模块代码
  if (t.isBlockStatement(moduleFunc.body)) {
    // 简化代码生成
    module.code = generator(moduleFunc.body, {
      concise: false,
      quotes: 'single'
    }).code;
    
    // 移除最外层的大括号
    module.code = module.code.replace(/^\s*\{|\}\s*$/g, '');
  }
  
  return module;
}

/**
 * 后备 Webpack 解包方案
 */
function fallbackWebpackDecompile(code) {
  const ast = parser.parse(code, {
    sourceType: 'unambiguous',
    allowReturnOutsideFunction: true
  });

  // 尝试提取所有可能的模块
  const modules = [];
  
  traverse(ast, {
    CallExpression(path) {
      // 查找类似 __webpack_require__.d 的定义
      if (t.isMemberExpression(path.node.callee) &&
          t.isIdentifier(path.node.callee.object, { name: '__webpack_require__' }) &&
          t.isIdentifier(path.node.callee.property, { name: 'd' }) &&
          path.node.arguments.length === 2) {
        const exportsDef = path.node.arguments[1];
        if (t.isObjectExpression(exportsDef)) {
          const moduleId = path.node.arguments[0].value;
          modules.push({
            id: moduleId,
            exports: exportsDef.properties.map(p => p.key.name)
          });
        }
      }
      
      // 查找模块执行代码
      if (t.isIdentifier(path.node.callee, { name: '__webpack_require__' }) &&
          path.node.arguments.length === 1) {
        const moduleId = path.node.arguments[0].value;
        // 可以在这里关联模块定义和执行
      }
    }
  });
  
  // 简化处理 - 返回带注释的原始代码
  let output = `// Webpack Bundle (fallback decompilation)\n`;
  output += `// Identified ${modules.length} module(s)\n\n`;
  output += code;
  
  return output;
}

/**
 * 通用反编译
 */
function generalDecompile(code) {
  // ...之前的通用反编译实现...
}

module.exports = {
  decompileCode,
  isWebpackBundle,
  decompileWebpackBundle
};
```

### 2. 更新渲染进程代码 (renderer/main.js)

```javascript
// 在文件顶部添加
const { decompileCode, isWebpackBundle } = require('../utils/decompiler');

// 修改 decompileCode 函数
async function decompileCode(code) {
  updateStatus('Decompiling...', 'info');
  
  try {
    let result;
    
    // 检查是否是 Webpack 打包文件
    if (isWebpackBundle(code)) {
      updateStatus('Detected Webpack bundle, applying specialized decompilation...');
      result = await window.electronAPI.decompileWebpack(code);
    } else {
      updateStatus('Applying general decompilation...');
      result = await window.electronAPI.decompileGeneral(code);
    }
    
    return result;
  } catch (error) {
    console.error('Decompilation error:', error);
    updateStatus(`Error: ${error.message}`, 'error');
    return `// Decompilation failed\n// ${error.message}\n\n${code}`;
  }
}

// 在 electronAPI 暴露中添加新方法
contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('open-file'),
  saveFile: (data) => ipcRenderer.invoke('save-file', data),
  decompileWebpack: (code) => ipcRenderer.invoke('decompile-webpack', code),
  decompileGeneral: (code) => ipcRenderer.invoke('decompile-general', code)
});
```

### 3. 更新主进程代码 (main.js)

```javascript
// 添加新的 IPC 处理器
const { decompileCode, decompileWebpackBundle } = require('./utils/decompiler');

ipcMain.handle('decompile-webpack', async (event, code) => {
  try {
    return decompileWebpackBundle(code);
  } catch (error) {
    console.error('Webpack decompilation failed:', error);
    return `// Webpack decompilation failed\n// ${error.message}\n\n${code}`;
  }
});

ipcMain.handle('decompile-general', async (event, code) => {
  try {
    return decompileCode(code);
  } catch (error) {
    console.error('General decompilation failed:', error);
    return `// Decompilation failed\n// ${error.message}\n\n${code}`;
  }
});
```

## Webpack 特定功能实现

### 1. 模块依赖图重建

```javascript
function buildWebpackDependencyGraph(modules) {
  const graph = {};
  
  Object.entries(modules).forEach(([id, module]) => {
    graph[id] = {
      deps: module.deps,
      code: module.code,
      resolved: false
    };
  });
  
  return graph;
}

function resolveWebpackModules(graph) {
  const resolved = {};
  let hasUnresolved = true;
  let iterations = 0;
  const maxIterations = 100; // 防止无限循环
  
  while (hasUnresolved && iterations < maxIterations) {
    hasUnresolved = false;
    iterations++;
    
    Object.entries(graph).forEach(([id, module]) => {
      if (!module.resolved) {
        const allDepsResolved = module.deps.every(depId => 
          !graph[depId] || graph[depId].resolved
        );
        
        if (allDepsResolved) {
          // 替换依赖引用
          let code = module.code;
          module.deps.forEach(depId => {
            if (graph[depId]) {
              code = code.replace(
                new RegExp(`__webpack_require__\\(${depId}\\)`, 'g'),
                `/* resolved dep ${depId} */ (${graph[depId].code})`
              );
            }
          });
          
          resolved[id] = code;
          module.resolved = true;
        } else {
          hasUnresolved = true;
        }
      }
    });
  }
  
  return resolved;
}
```

### 2. Webpack 模块模板识别

```javascript
function detectWebpackTemplates(code) {
  const TEMPLATES = {
    WEBPACK_BOOTSTRAP: /function\s*\(modules\)\s*\{[\s\S]*?\}\([^)]+\)/,
    AMD_DEFINE: /define\(([^)]+)\)/,
    COMMONJS: /module\.exports\s*=/,
    ES_MODULE: /export\s+(default\s+|{[^}]+}\s+from\s+)/,
    LAZY_LOAD: /__webpack_require__\.e\([^)]+\)/
  };
  
  const detected = {};
  
  Object.entries(TEMPLATES).forEach(([name, regex]) => {
    if (regex.test(code)) {
      detected[name] = true;
    }
  });
  
  return detected;
}
```

## 使用示例

当工具检测到 Webpack 打包文件时，会：

1. 自动识别模块结构
2. 提取各个模块代码
3. 分析模块间依赖关系
4. 尝试重建原始源代码结构
5. 生成带有注释的解包代码，包括：
   - 模块ID和依赖关系
   - 原始导出内容
   - Webpack运行时代码

## 如何测试

1. 准备一个 Webpack 打包的 JS 文件
2. 在工具中打开该文件
3. 工具会自动检测为 Webpack 打包文件并应用专门的反编译逻辑
4. 查看反编译结果，应该能看到分离的模块和依赖关系注释

## 注意事项

1. Webpack 有多个版本，不同版本的打包结构可能不同
2. 生产模式下的代码可能经过混淆和优化，增加反编译难度
3. 某些动态加载的模块可能需要特殊处理
4. 对于特别复杂的打包结果，可能需要手动干预分析

这个增强版本专门针对 Webpack 打包文件提供了更准确的反编译结果，能够更好地还原原始代码结构。你可以根据需要进一步扩展对特定 Webpack 版本和配置的支持。

> 可以根据编译过后的代码痕迹看出打包方式吗：

```js
 (global["webpackChunkpb_sign"]=global["webpackChunkpb_sign"]||[]).push([[504],{95371:(e,t)=>{"use strict";Object.defineProperty(t,"__esModule",{value:!0}),t.getElectronBinding=void 0;const n=e=>process._linkedBinding?process._linkedBinding("electron_common_"+e):process.electronBinding?process.electronBinding(e):null;t.getElectronBinding=n},58759:(e,t,n)=>{"use strict";var
```
 
 从这段代码可以明显看出这是 Webpack 打包后的代码，具体分析如下：

## Webpack 打包特征识别

1. **明显的 Webpack 分块加载语法**：
   ```javascript
   (global["webpackChunkpb_sign"] = global["webpackChunkpb_sign"] || []).push([[504], {...}])
   ```
   这是 Webpack 5 的分块(chunk)加载方式，`webpackChunk` 是 Webpack 的全局变量命名约定。

2. **模块定义结构**：
   ```javascript
   {
     95371: (e, t) => { ... },
     58759: (e, t, n) => { ... }
   }
   ```
   这是 Webpack 的标准模块封装格式，数字键是模块ID，函数参数是：
   - `e`: module 对象
   - `t`: exports 对象
   - `n`: require 函数

3. **模块内容特征**：
   - 使用 `Object.defineProperty(t, "__esModule", {value: !0})` 标记 ES 模块
   - 包含 `"use strict"` 指令

## 打包方式判断

1. **Webpack 5+ 版本**：
   - 使用 `webpackChunk` 全局变量
   - 模块函数使用箭头函数而非传统函数表达式
   - 这是较新的 Webpack 版本的特征

2. **分块加载(Chunk Loading)**：
   - 通过 `push` 方法动态加载代码块
   - 表明使用了代码分割功能

3. **ES 模块转换**：
   - 有 `__esModule` 标记
   - 表明原始代码可能是 ES Module 格式

## 专门的反编译建议

针对这种 Webpack 5+ 打包的代码，可以增强反编译工具：

### 1. 更新 Webpack 检测逻辑

```javascript
function isWebpack5Bundle(code) {
  return /global\["webpackChunk/.test(code) || 
         /\(global\.webpackChunk/.test(code);
}
```

### 2. 专门处理 Webpack 5 分块格式

```javascript
function decompileWebpack5Chunk(code) {
  const chunkRegex = /\(global\["webpackChunk\w+"\]\s*=\s*global\["webpackChunk\w+"\]\s*\|\|\s*\[\]\)\.push\((\[[^\]]+\]\s*,\s*\{[^}]+\})\)/;
  const match = code.match(chunkRegex);
  
  if (!match) return null;
  
  try {
    const chunkData = new Function(`return ${match[1]}`)();
    const [chunkId, modules] = chunkData;
    
    return {
      chunkId,
      modules: Object.entries(modules).map(([id, mod]) => ({
        id,
        code: extractWebpack5Module(mod)
      }))
    };
  } catch (e) {
    console.error('Failed to parse webpack chunk:', e);
    return null;
  }
}

function extractWebpack5Module(moduleFunc) {
  // Webpack 5 使用箭头函数，参数通常为 (e, t, n)
  const params = ['module', 'exports', '__webpack_require__'];
  const ast = parser.parse(moduleFunc.toString(), {
    sourceType: 'unambiguous'
  });
  
  // 重命名参数以增加可读性
  traverse(ast, {
    Identifier(path) {
      if (path.node.name === 'e') path.node.name = params[0];
      if (path.node.name === 't') path.node.name = params[1];
      if (path.node.name === 'n') path.node.name = params[2];
    }
  });
  
  return generator(ast).code;
}
```

### 3. 生成更友好的输出格式

```javascript
function formatWebpack5Output(decompiled) {
  let output = `// Webpack 5 Chunk ID: ${decompiled.chunkId}\n`;
  output += `// Contains ${decompiled.modules.length} modules\n\n`;
  
  decompiled.modules.forEach(module => {
    output += `/*** MODULE ${module.id} ***/\n`;
    output += `${module.code}\n\n`;
  });
  
  return output;
}
```

### 4. 在反编译流程中集成

```javascript
function decompileCode(code) {
  if (isWebpack5Bundle(code)) {
    const chunk = decompileWebpack5Chunk(code);
    if (chunk) return formatWebpack5Output(chunk);
    // 如果专门解包失败，回退到通用 Webpack 解包
    return decompileWebpackBundle(code); 
  }
  // ...其他检测
}
```

## 针对示例代码的具体处理

对于你提供的代码示例：

```javascript
(global["webpackChunkpb_sign"]=global["webpackChunkpb_sign"]||[]).push([[504],{
  95371:(e,t)=>{"use strict";...},
  58759:(e,t,n)=>{"use strict";...}
}])
```

反编译工具可以：

1. 识别出这是 Webpack 5 的分块加载
2. 提取 chunk ID (504)
3. 分离出两个模块 (95371 和 58759)
4. 对每个模块：
   - 重命名参数 (e → module, t → exports, n → __webpack_require__)
   - 解析模块内容
   - 美化输出代码
5. 生成带有清晰注释的反编译结果

## 完整反编译示例输出

对于模块 95371，反编译后可能显示为：

```javascript
/*** MODULE 95371 ***/
(module, exports) => {
  "use strict";
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.getElectronBinding = void 0;
  
  const getElectronBinding = (e) => 
    process._linkedBinding 
      ? process._linkedBinding("electron_common_" + e)
      : process.electronBinding
        ? process.electronBinding(e)
        : null;
        
  exports.getElectronBinding = getElectronBinding;
}
```

这样处理后，代码的可读性和可维护性会大大提高，更容易理解原始代码的意图和结构。

# 如何在 mac 上使用双 git 库，比如同时使用 github，又使用码云

以下是在 `macOS` 上同时使用 `GitHub` 和码云（`Gitee`）双 `Git` 库的配置步骤：

一、生成独立 `SSH` 密钥对

为 `GitHub` 生成密钥‌

```sh
Copy Code
ssh-keygen -t rsa -C "github邮箱" -f ~/.ssh/github_id_rsa
```


按提示回车（无需设置密码）‌。

为码云生成密钥‌

```sh
Copy Code
ssh-keygen -t rsa -C "码云邮箱" -f ~/.ssh/gitee_id_rsa
```


生成后会在 `~/.ssh` 目录下得到 `github_id_rsa`、`github_id_rsa.pub`、`gitee_id_rsa`、`gitee_id_rsa.pub` 文件‌。

二、配置 `SSH` 身份识别
创建 `~/.ssh/config` 文件‌
添加以下内容（若无此文件需新建）：

```sh
# GitHub
Host github.com
  HostName github.com
  PreferredAuthentications publickey
  IdentityFile ~/.ssh/github_id_rsa

# 码云
Host gitee.com
  HostName gitee.com
  PreferredAuthentications publickey
  IdentityFile ~/.ssh/gitee_id_rsa
```

此配置使系统根据域名自动选择对应密钥‌。
三、添加公钥到平台

`GitHub‌`
复制 `github_id_rsa.pub` 内容：


```sh
Copy Code
cat ~/.ssh/github_id_rsa.pub
```


粘贴到 `GitHub` 的 `‌Settings → SSH and GPG keys`‌ 页面‌。

码云‌
复制 `gitee_id_rsa.pub` 内容：


```sh
Copy Code
cat ~/.ssh/gitee_id_rsa.pub
```


粘贴到码云的 ‌个人设置 → `SSH` 公钥‌ 页面‌。

四、验证连接

测试 `GitHub` 连接‌


```sh
Copy Code
ssh -T git@github.com
```

成功会显示 `You've successfully authenticated‌。`

测试码云连接‌


```sh
Copy Code
ssh -T git@gitee.com
```


成功会显示 `Welcome to Gitee‌`。

五、配置本地仓库

取消全局用户配置（若已设置）‌


```sh
git config --global --unset user.name
git config --global --unset user.email
```

按仓库设置用户信息‌
进入项目目录后执行：


```sh
# 针对 GitHub 仓库
git config --local user.name "GitHub用户名"
git config --local user.email "GitHub邮箱"

# 针对码云仓库
git config --local user.name "码云用户名"
git config --local user.email "码云邮箱"
```


此操作确保提交记录与对应平台账号关联‌。

六、关联远程仓库

添加多个远程仓库地址‌


```sh
git remote add github git@github.com:用户名/仓库名.git
git remote add gitee git@gitee.com:用户名/仓库名.git
```


推送代码‌


```sh
git push github main   # 推送到 GitHub
git push gitee main    # 推送到码云
```

注意事项
密钥权限问题‌：确保 `~/.ssh` 目录权限为 `700`，私钥文件权限为 `600`‌。
调试工具‌：若连接失败，可通过 `ssh -vT git@github.com` 查看详细日志‌。



# 本地一套代码可以同时推两个库吗

本地一套代码可以同时推送到两个远程仓库（如`GitHub`和码云），实现方法如下：

一、核心配置原理

通过为不同远程仓库设置独立别名，并绑定对应的SSH密钥，实现‌单本地仓库同时关联多个远程仓库‌。推送时需分别指定别名，或通过修改配置文件实现一键双推‌。

二、具体操作步骤

关联多个远程仓库‌

方法一：命令行添加别名‌


```sh
# 添加 GitHub 仓库
git remote add github git@github.com:用户名/仓库名.git
# 添加码云仓库
git remote add gitee git@gitee.com:用户名/仓库名.git
```


通过 `git remote -v `可验证配置‌。

方法二：修改 `.git/config` 文件‌
在项目根目录的 `.git/config` 文件中添加：


```sh
[remote "github"]
  url = git@github.com:用户名/仓库名.git
  fetch = +refs/heads/*:refs/remotes/github/*
[remote "gitee"]
  url = git@gitee.com:用户名/仓库名.git
  fetch = +refs/heads/*:refs/remotes/gitee/*
```


此方法支持直接编辑配置文件‌。

推送代码到双仓库‌

分别推送‌


```sh
git push github main  # 推送到 GitHub
git push gitee main   # 推送到码云
```


需手动执行两次推送命令‌。

一键双推（需配置多 `URL`）‌
在 `.git/config` 的 `[remote "origin"]` 下添加多个 `URL`：


```sh
[remote "origin"]
  url = git@github.com:用户名/仓库名.git
  url = git@gitee.com:用户名/仓库名.git
```

执行 `git push origin main` 可同时推送至两个仓库‌。

三、验证配置

检查远程仓库关联状态‌


```sh
git remote -v
```

输出应显示 `github` 和 `gitee`（或 `origin` 含双地址）‌。

测试推送结果‌

分别访问 `GitHub` 和码云仓库页面，确认代码已同步‌。

四、注意事项

`SSH` 密钥区分‌：需为 `GitHub` 和码云生成独立的 `SSH` 密钥对，并在 `~/.ssh/config` 中配置域名与密钥的映射关系‌。
分支一致性‌：确保本地分支与远程分支名称一致（如 `main`），避免推送失败‌。
冲突处理‌：若两仓库内容不同步，建议先执行 `git pull` 合并变更后再推送‌。

通过上述配置，单套本地代码即可实现双仓库同步推送，适用于需要多平台备份或加速访问的场景‌。


