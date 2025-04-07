const { parseWebpack5 } = require('./webpack5')
const js_beautify = require('js-beautify').js
const { generate } = require('escodegen')
const { parse } = require('acorn')
const { walk } = require('acorn-walk')
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
    let webpack5Result = await tryParseWebpack5(code);

    // 2. 如果解析失败，回退到美化原始代码
    if (!webpack5Result) {
        console.log('Falling back to basic beautification');
        return {
            code: beautifyJs(code),
            modules: [],
            warnings: ['Webpack 5 parsing failed, using fallback']
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

        // 添加null检查
        if (!modules || !Array.isArray(modules)) {
            console.warn('No valid modules extracted from Webpack 5 code');
            return null;
        }

        // 确保每个模块都有代码
        const validModules = modules.filter(m => m && m.code);
        if (validModules.length === 0) {
            console.warn('All modules were empty');
            return null;
        }

        return {
            code: generateMergedCode(validModules),
            modules: validModules
        };
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
// 修复1：删除底部重复的 tryParseWebpack5 函数定义（约 373-389 行）
// 原函数已在 50-72 行定义
// 修复2：修改 AST 遍历方式（约 128-146 行）
function renameParameters(code) {
    if (typeof code !== 'string') return code;
    
    try {
        const ast = parse(code, {
            ecmaVersion: 'latest',  // 改为字符串类型
            sourceType: 'script',
            allowReturnOutsideFunction: true,
            allowAwaitOutsideFunction: true,
            allowImportExportEverywhere: true,
            allowHashBang: true
        });

        const magicString = new MagicString(code);

        // 使用更安全的遍历方式
        walk.ancestor(ast, {
            Function(node, ancestors) {
                try {
                    if (node.type === 'FunctionDeclaration' || 
                        node.type === 'FunctionExpression' ||
                        node.type === 'ArrowFunctionExpression') 
                    {
                        // 添加参数有效性检查
                        if (node.params && Array.isArray(node.params)) {
                            renameFunctionParams(node, magicString)
                        }
                    }
                } catch (e) {
                    console.warn('Parameter rename error:', e.message);
                }
            }
        });

        // 增强代码规范化（新增Webpack模块包装处理）
        let result = magicString.toString()
            // 处理Webpack模块工厂函数
            .replace(/(\d+):\s*\(([ertan]+),\s*(\w+),\s*\w+\)\s*=>\s*{/g, '/* WEBPACK MODULE $1 */ (function(__webpack_exports__, __webpack_require__) {')
            .replace(/([^;\n])(\n|$)/g, '$1;\n')
            // 修复对象方法转换（处理生成器函数和异步函数）
            .replace(/(\w+)\s*:\s*(async\s+)?function\s*(\*?)\s*([^(]*?)\s*{/g, (match, p1, p2, p3, p4) => {
                // 保留原始缩进和空格
                const asyncKeyword = p2 ? p2.trim() + ' ' : '';
                const generatorStar = p3 ? p3.trim() + ' ' : '';
                return `${asyncKeyword}function ${generatorStar}${p1}${p4} {`;
            })
            // 修复箭头函数格式
            .replace(/=>\s*{/g, ' => {')
            // 添加分号检查
            .replace(/([^\s;}])$/gm, '$1;');

        // 添加临时调试日志
        console.log('[DEBUG] Post-normalization code:', result.slice(0, 500));
        return result;
    } catch (error) {
        console.warn('Deep parsing failed:', error.message);
        return code;
    }
}


/**
 * 重命名函数参数
 * @param {Object} node - AST节点
 * @param {MagicString} magicString - MagicString实例
 */
function renameFunctionParams(node, magicString) {
    // Webpack常用的参数名映射
    const paramMap = {
        'e': 'module',
        't': 'exports',
        'n': 'require',
        'r': 'defineProperty',
        'o': 'object',
        'i': 'id',
        'a': 'array',
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

    node.params.forEach((param, index) => {
        if (param.type === 'Identifier') {
            const newName = paramMap[param.name] || `param${index}`
            if (newName !== param.name) {
                magicString.overwrite(param.start, param.end, newName)
            }
        }
    })
}

/**
 * 提取模块依赖关系
 * @param {string} code - 模块代码
 * @returns {Array<string>} - 依赖列表
 */
function extractDependencies(code) {
    // 确保输入是字符串
    if (typeof code !== 'string') {
        console.warn('extractDependencies received non-string input:', code)
        return []
    }

    const dependencies = new Set()

    try {
        const ast = parse(code, {
            ecmaVersion: 'latest',
            sourceType: 'module',
            allowHashBang: true  // 添加此配置
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