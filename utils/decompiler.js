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
async function decompileWebpack(code) {
    // 1. 尝试识别Webpack 5格式
    const webpack5Result = await tryParseWebpack5(code)
    if (webpack5Result) {
        return webpack5Result
    }

    // 2. 尝试识别其他Webpack格式或普通JS
    return {
        code: beautifyJs(code),
        modules: []
    }
}

/**
 * 尝试解析Webpack 5格式的代码
 * @param {string} code - 要解析的代码
 * @returns {Promise<{code: string, modules: Array}|null>} - 解析结果或null
 */
async function tryParseWebpack5(code) {
    try {
        // 检查是否是Webpack 5格式
        if (!isWebpack5Format(code)) {
            return null
        }

        // 解析Webpack 5模块
        const modules = parseWebpack5(code)

        // 处理每个模块
        const processedModules = modules.map(module => {
            // 重命名参数
            const renamedCode = renameParameters(module.code)

            // 提取依赖关系
            const dependencies = extractDependencies(renamedCode)

            // 美化代码
            const beautified = beautifyJs(renamedCode)

            return {
                id: module.id,
                code: beautified,
                dependencies,
                originalCode: module.code
            }
        })

        // 生成合并后的代码
        const mergedCode = generateMergedCode(processedModules)

        return {
            code: mergedCode,
            modules: processedModules.map(m => ({
                id: m.id,
                dependencies: m.dependencies
            }))
        }
    } catch (error) {
        console.error('Webpack 5 parsing failed:', error)
        return null
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
    try {
        // 使用acorn解析AST
        const ast = parse(code, {
            ecmaVersion: 'latest',
            sourceType: 'module'
        })

        // 使用MagicString进行源码转换
        const magicString = new MagicString(code)

        // 遍历AST查找函数参数
        walk(ast, {
            FunctionDeclaration(node) {
                renameFunctionParams(node, magicString)
            },
            FunctionExpression(node) {
                renameFunctionParams(node, magicString)
            },
            ArrowFunctionExpression(node) {
                renameFunctionParams(node, magicString)
            }
        })

        return magicString.toString()
    } catch (error) {
        console.error('Parameter renaming failed:', error)
        return code
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
    const dependencies = new Set()

    try {
        const ast = parse(code, {
            ecmaVersion: 'latest',
            sourceType: 'module'
        })

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
}

/**
 * 生成合并后的代码
 * @param {Array<Object>} modules - 模块列表
 * @returns {string} - 合并后的代码
 */
function generateMergedCode(modules) {
    let output = '// Decompiled Webpack modules\n\n'

    // 添加每个模块
    modules.forEach(module => {
        output += `// Module ID: ${module.id}\n`
        output += `// Dependencies: ${module.dependencies.join(', ') || 'none'}\n`
        output += `${module.code}\n\n`
    })

    return output
}

module.exports = {
    decompileWebpack
}