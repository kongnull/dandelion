const { parse } = require('acorn')
const { walk } = require('acorn-walk')
const MagicString = require('magic-string')

/**
 * 解析Webpack 5打包的代码
 * @param {string} code - 要解析的代码
 * @returns {Array<{id: string, code: string}>} - 解析出的模块列表
 */
function parseWebpack5(code) {
    // 1. 提取Webpack chunk数组
    const chunkRegex = /\(global\["webpackChunk\w*"\]\s*=\s*global\["webpackChunk\w*"\]\s*\|\|\s*\[\]\)\.push\(\[\[(\d+)\],\s*({[^}]+})\)/g
    const chunks = []
    let match

    while ((match = chunkRegex.exec(code)) !== null) {
        const chunkId = match[1]
        const modulesObjStr = match[2]
        chunks.push({ chunkId, modulesObjStr })
    }

    if (chunks.length === 0) {
        throw new Error('No Webpack 5 chunks found')
    }

    // 2. 解析模块对象
    const modules = []
    chunks.forEach(chunk => {
        // 将模块对象字符串转换为可解析的代码
        const objCode = `let modules = ${chunk.modulesObjStr}`

        try {
            // 使用acorn解析对象
            const ast = parse(objCode, {
                ecmaVersion: 'latest',
                sourceType: 'script'
            })

            // 查找对象表达式
            let modulesObj = null
            walk.simple(ast, {
                VariableDeclarator(node) {
                    if (node.id.name === 'modules' && node.init.type === 'ObjectExpression') {
                        modulesObj = node.init
                    }
                }
            })

            if (!modulesObj) {
                throw new Error('Failed to find modules object')
            }

            // 提取每个模块
            modulesObj.properties.forEach(prop => {
                if (prop.key.type === 'Literal') {
                    modules.push({
                        id: prop.key.value,
                        code: extractFunctionCode(prop.value, code)
                    })
                } else if (prop.key.type === 'Identifier' || prop.key.type === 'NumericLiteral') {
                    modules.push({
                        id: prop.key.name || prop.key.value,
                        code: extractFunctionCode(prop.value, code)
                    })
                }
            })
        } catch (error) {
            console.error(`Error parsing chunk ${chunk.chunkId}:`, error)
            throw new Error(`Failed to parse Webpack 5 modules: ${error.message}`)
        }
    })

    return modules
}

/**
 * 从AST节点提取函数代码
 * @param {Object} node - AST节点
 * @param {string} originalCode - 原始代码
 * @returns {string} - 提取的函数代码
 */
function extractFunctionCode(node, originalCode) {
    const magicString = new MagicString(originalCode)

    if (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
        // 提取整个函数
        return magicString.slice(node.start, node.end)
    } else if (node.type === 'CallExpression') {
        // 可能是立即调用的函数表达式 (IIFE)
        if (node.callee.type === 'FunctionExpression' || node.callee.type === 'ArrowFunctionExpression') {
            return magicString.slice(node.callee.start, node.callee.end)
        }
    }

    // 默认返回节点对应的代码
    return magicString.slice(node.start, node.end)
}

module.exports = {
    parseWebpack5
}