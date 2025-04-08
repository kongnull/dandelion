const { parseWebpack5 } = require('./webpack5')
const js_beautify = require('js-beautify').js
const { generate } = require('escodegen')
const { parse } = require('acorn')
const { walk } = require('acorn-walk')
// 添加 ancestor 的显式导入
const { ancestor } = require('acorn-walk')
const MagicString = require('magic-string')
const estraverse = require('estraverse')


/**
 * 主反编译函数
 * @param {string} code - 要反编译的代码
 * @returns {Promise<{code: string, modules: Array}>} - 反编译后的代码和模块信息
 */
async function decompileWebpack(input) {
    let code = typeof input === 'string' ? input :
        (input && typeof input.content === 'string' ? input.content : String(input));

    // 1. 尝试Webpack5解析
    let webpack5Result = null;
    try {
        webpack5Result = await tryParseWebpack5(code);
    } catch (e) {
        console.error('Webpack 5 parsing failed:', e);
    }

    // 2. 如果解析失败，回退到美化原始代码
    if (!webpack5Result) {
        console.log('Falling back to basic beautification with enhanced processing');

        // 增强的回退处理
        const enhancedCode = code
            // 替换Webpack特定语法
            .replace(/a\.r\(t\)/g, '/* WEBPACK EXPORT */')
            .replace(/a\.d\(t,\s*{([^}]+)}/g, '/* WEBPACK DEFINE $1 */')
            // 美化代码
            .replace(/([;,{])(\w)/g, '$1 $2');

        return {
            code: beautifyJs(enhancedCode),
            modules: [],
            warnings: ['Webpack 5 parsing failed, using enhanced fallback']
        };
    }


    // 3. 处理模块（将处理逻辑移到函数内部）
    const processedModules = webpack5Result.modules.map(mod => ({
        id: mod.id || 'anonymous',
        code: beautifyJs(renameParameters(mod.code)), // 确保先重命名再美化
        dependencies: extractDependencies(mod.code) || [],
        originalCode: mod.code
    }));

    return {
        code: generateMergedCode(processedModules),
        modules: processedModules
    };
}
/**
 * 尝试解析Webpack 5格式的代码
 * @param {string} code - 要解析的代码
 * @returns {Promise<{code: string, modules: Array}|null>} - 解析结果或null
 */
async function tryParseWebpack5(code) {
    try {
        if (!isWebpack5Format(code)) {
            return null;
        }

        const modules = parseWebpack5(code);

        if (!modules || !Array.isArray(modules)) {
            console.warn('No valid modules extracted from Webpack 5 code');
            return null;
        }

        // 处理每个模块
        const processedModules = [];
        for (const mod of modules) {
            if (!mod || !mod.code) continue;

            try {
                processedModules.push({
                    ...mod,
                    code: beautifyJs(renameParameters(mod.code)),
                    dependencies: extractDependencies(mod.code) || []
                });
            } catch (e) {
                console.warn('Module processing failed:', e);
                processedModules.push({
                    ...mod,
                    code: beautifyJs(mod.code),
                    dependencies: []
                });
            }
        }

        return processedModules.length > 0 ? {
            code: generateMergedCode(processedModules),
            modules: processedModules
        } : null;
    } catch (error) {
        console.error('Webpack 5 parsing failed:', error);
        return null;
    }
}
/**
 * 检查是否是Webpack 5格式
 * @param {string} code - 要检查的代码
 * @returns {boolean} - 是否是Webpack 5格式
 */
function isWebpack5Format(code) {
    return /webpackChunk\w*\s*=\s*webpackChunk\w*\s*\|\|/.test(code) ||
        /\(global\["webpackChunk/.test(code)
}

/**
 * 重命名模块参数
 * @param {string} code - 模块代码
 * @returns {string} - 重命名后的代码
 */
function renameParameters(code) {
    if (typeof code !== 'string') return code;

    try {
        const ast = parse(code, {
            ecmaVersion: 'latest',
            sourceType: 'script',
            allowReturnOutsideFunction: true,
            allowAwaitOutsideFunction: true,
            allowImportExportEverywhere: true,
            allowHashBang: true
        });

        const magicString = new MagicString(code);

        ancestor(ast, {
            Function(node, ancestors) {
                try {
                    if (node.params && Array.isArray(node.params)) {
                        renameFunctionParams(node, magicString);
                    }
                } catch (e) {
                    console.warn('参数重命名错误:', e.message);
                }
            },
            Property(node, ancestors) {
                if (node.method && node.value.type === 'FunctionExpression') {
                    renameFunctionParams(node.value, magicString);
                }
            }
        });

        let result = magicString.toString()
            // 模块包装替换
            .replace(/(\d+):\s*\(([^)]+)\)\s*=>\s*{/g, '/* WEBPACK MODULE $1 */\n(function(module, exports, __webpack_require__) {')
            // CommonJS导出替换
            .replace(/(\w+)\.r\(\w+\)[^;]*?\.d\(\w+,\s*{\s*default:\s*\(\)\s*=>\s*(\w+)\s*}\s*\);/g, (_, p1, p2) => `\nmodule.exports = ${p2};`)
            // 箭头函数转换
            .replace(/(\bparam\d+)\s*=>/g, (_, p1) => `function(${p1})`)
            // 方法调用替换
            .replace(/\((\d+),\s*(\w+)\.(\w+)\)/g, '$2.$3')
            // 事件处理参数
            .replace(/on:\s*{\s*click:\s*function\(\w+\)/g, 'on: { click: function(event)')
            // Vue回调参数
            .replace(/callback:\s*function\(\w+\)/g, 'callback: function(value)');

        console.log('[DEBUG] Final transformed code:', result.slice(0, 1000));
        return result;
    } catch (error) {
        console.warn('AST解析失败:', error.message);
        return code;
    }
}

/**
 * 重命名函数参数
 * @param {Object} node - AST节点
 * @param {MagicString} magicString - MagicString实例
 */
function renameFunctionParams(node, magicString) {
    const paramMap = {
        // 新增回调函数专用映射
        Callback: {
            't': 'value',
            'a': 'newValue'
        },
        EventHandler: { // 事件处理上下文
            't': 'event',
            'e': 'event'
        },
        Common: { // 通用上下文
            'e': 'module',
            't': 'exports',
            'a': 'args',
            'n': 'name',
            'r': 'defineProperty',
            'o': 'object',
            'i': 'id',
            's': 'string',
            'l': 'load',
            'd': 'define',
            'c': 'cache',
            'u': 'url',
            'f': 'function',
            'p': 'path',
            'v': 'value',
            'm': 'moduleId',
            'h': 'hash',
            'g': 'global'
        }
    };

    // 安全访问父节点属性
    const isEventHandler = node.parent?.key?.name === 'click' || 
                         node.parent?.key?.name === 'submit';

    // 新增回调函数上下文检测
    const isCallback = node.parent?.key?.name === 'callback';
    const contextMap = isCallback ? paramMap.Callback : 
                     isEventHandler ? paramMap.EventHandler : 
                     paramMap.Common;

    node.params.forEach((param) => {
        if (param.type === 'Identifier') {
            const contextMap = isEventHandler ? paramMap.EventHandler : paramMap.Common;
            const newName = contextMap[param.name] || param.name;
            
            if (newName !== param.name) {
                magicString.overwrite(param.start, param.end, newName);
            }
        }
    });
}

/**
 * 提取模块依赖关系
 * @param {string} code - 模块代码
 * @returns {Array<string>} - 依赖列表
 */
function extractDependencies(code) {
    if (typeof code !== 'string') {
        console.warn('extractDependencies received non-string input:', code)
        return []
    }

    const dependencies = new Set()

    try {
        const ast = parse(code, {
            ecmaVersion: 2022,  // 使用数字而不是字符串
            sourceType: 'script',  // 改为script而不是module
            allowHashBang: true,
            allowReturnOutsideFunction: true,
            allowAwaitOutsideFunction: true,
            allowImportExportEverywhere: true
        });

        // 遍历AST查找require调用
        estraverse.traverse(ast, {
            enter: function (node) {
                if (node.type === 'CallExpression' &&
                    node.callee.type === 'Identifier' &&
                    node.callee.name === 'require' &&
                    node.arguments.length > 0 &&
                    node.arguments[0].type === 'Literal') {
                    dependencies.add(node.arguments[0].value)
                }

                // 在estraverse.traverse中添加
                if (node.type === 'ImportExpression') {
                    if (node.source && node.source.value) {
                        dependencies.add(node.source.value);
                    }
                }
            }
        })
    } catch (error) {
        console.error('Dependency extraction failed:', error)
    }

    return Array.from(dependencies)
}

/**
 * 美化JavaScript代码
 * @param {string} code - 要美化的代码
 * @returns {string} - 美化后的代码
 */
function beautifyJs(code) {
    // 确保输入是字符串
    if (typeof code !== 'string') {
        console.warn('beautifyJs received non-string input:', code)
        code = String(code)
    }

    try {
        return js_beautify(code, {
            indent_size: 2,
            space_in_empty_paren: true,
            preserve_newlines: true,
            max_preserve_newlines: 2,
            keep_array_indentation: false,
            break_chained_methods: false,
            indent_scripts: 'normal',
            brace_style: 'collapse,preserve-inline',
            space_before_conditional: true,
            unescape_strings: false,
            jslint_happy: false,
            end_with_newline: false,
            wrap_line_length: 0,
            indent_empty_lines: false,
            comma_first: false,
            e4x: false,
            indent_with_tabs: false
        })
    } catch (error) {
        console.error('Code beautification failed:', error)
        return code // 返回原始代码作为回退
    }
}

/**
 * 生成合并后的代码
 * @param {Array<Object>} modules - 模块列表
 * @returns {string} - 合并后的代码
 */
function generateMergedCode(modules) {
    if (!modules || modules.length === 0) {
        return "// No modules found\n";
    }

    return modules.map(module => {
        // 添加空值检查和默认值
        const params = (module.params || []).join(', ');
        const deps = (module.dependencies || []).join(', ') || 'none';

        const moduleHeader = `// ======== Module ${module.id || 'anonymous'} ========\n` +
            `// Parameters: ${params}\n` +  // 修复这里的问题
            `// Dependencies: ${deps}\n`;

        return moduleHeader + (module.code || '// Empty module\n');
    }).join('\n\n');
}

// 修复3：确保模块导出正确（文件底部）
module.exports = {
    decompileWebpack,
    beautifyJs,
    extractDependencies
};