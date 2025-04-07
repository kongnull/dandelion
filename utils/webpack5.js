const { parse } = require('acorn')
const { walk } = require('acorn-walk')
const MagicString = require('magic-string')

/**
 * 解析Webpack 5打包的代码
 * @param {string} code - 要解析的代码
 * @returns {Array<{id: string, code: string}>} - 解析出的模块列表
 */
// 在 webpack5.js 中
function parseWebpack5(code) {
    // 需要确保能正确提取这种格式的模块：
    // {91:(e,t,a)=>{...}, 5171:(e,t,a)=>{...}}
    const moduleRegex = /(\d+):\s*\(([ertan]+),\s*(\w+),\s*\w+\)\s*=>\s*{/g;
    
    try {
        // 改进chunk正则，支持更多括号变体
        const chunkRegex = /(?:global|\(global\))\["webpackChunk\w+"\]\s*=\s*\S+?\s*\.push\(\[\[(\d+)\],\s*({[\s\S]+?})\]\)/;
        const match = chunkRegex.exec(code);
        if (!match) return null;

        const modulesObjStr = match[2];
        // 移动调试日志到变量声明之后
        console.log('Parsing chunk:', code.slice(0, 200) + '...');
        console.log('Module object string:', modulesObjStr?.slice(0, 500) + '...');

        const modules = [];

        // 强化模块正则表达式
        const moduleRegex = /(\d+):\s*(?:function\s*\(([^)]*)\)|\(([^)]*)\)\s*=>)\s*{([\s\S]+?)}(?=,\s*\d+:|}\s*\)|\s*\]|$)/g;

        let moduleMatch;
        while ((moduleMatch = moduleRegex.exec(modulesObjStr)) !== null) {
            const params = (moduleMatch[2] || moduleMatch[3]).trim();
            let functionBody = moduleMatch[4]
                .replace(/^\{/, '')
                .replace(/\}\s*\)?$/, '')
                .trim()
                // 添加代码规范化
                .replace(/([^;])(\n|$)/g, '$1;\n')
                .replace(/(\b\w+\b)\s*:\s*function/g, 'function $1');

            // 修复非法函数名问题
            modules.push({
                id: moduleMatch[1],
                code: `(function(${params}) {\n${functionBody}\n})`, // 使用匿名函数表达式
                params: params.split(',').map(p => p.trim())
            });
        }

        return modules.length > 0 ? modules : null;
    } catch (error) {
        console.error('Webpack 5 parsing error:', error);
        return null;
    }
}

/**
 * 从AST节点提取函数代码
 * @param {Object} node - AST节点
 * @param {string} originalCode - 原始代码
 * @returns {string} - 提取的函数代码
 */
function extractFunctionCode(node, originalCode) {
    const magicString = new MagicString(originalCode)

    try {
        if (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
            return magicString.slice(node.start, node.end).toString()
        } else if (node.type === 'CallExpression') {
            if (node.callee.type === 'FunctionExpression' || node.callee.type === 'ArrowFunctionExpression') {
                return magicString.slice(node.callee.start, node.callee.end).toString()
            }
        }

        // 默认返回节点对应的代码
        const result = magicString.slice(node.start, node.end).toString()
        return result || '' // 确保不返回undefined
    } catch (error) {
        console.error('Error extracting function code:', error)
        return ''
    }
}

function generateMergedCode(modules) {
    if (!modules || !modules.length) return "// No modules found\n"

    return modules.map(m => {
        return `// Module ID: ${m.id || 'anonymous'}
// Dependencies: ${m.dependencies?.join(', ') || 'none'}
${m.code || '// Empty module'}
`
    }).join('\n\n')
}

// 在 webpack5.js 中添加这些测试正则
function testRegexes(code) {
    // 测试整体匹配
    const chunkTest = /\(?global\["webpackChunk(\w+)"\]\s*=\s*global\["webpackChunk\1"\]\s*\|\|\s*\[\]\)?\.push\(\[\[(\d+)\],\s*({[\s\S]+?})\)\]\)/;

    // 测试模块匹配
    const moduleTest = /(\d+):\s*\(?function\s*\(([^)]*)\)\s*=>\s*{([\s\S]+?)(?=,\d+:|}\s*})/;

    console.log('Chunk test:', chunkTest.test(code));
    console.log('Module test:', moduleTest.test(code));
}

module.exports = {
    parseWebpack5
}