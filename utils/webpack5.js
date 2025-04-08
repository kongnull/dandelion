const { parse } = require('acorn');
const { walk } = require('acorn-walk');
const MagicString = require('magic-string');

/**
 * 解析Webpack 5打包的代码
 * @param {string} code - 要解析的代码
 * @returns {Array<{id: string, code: string}>} - 解析出的模块列表
 */
function parseWebpack5(code) {
    // ================= 1. 正则表达式定义 =================
    const chunkRegexes = [
        // 主正则：标准格式
        /\(?(?:global|self|window)\s*\[\s*["']webpackChunk\w+["']\s*\]\s*=\s*(?:global|self|window)\s*\[\s*["']webpackChunk\w+["']\s*\]\s*\|\|\s*\[\]\s*\)?\s*\.push\(\s*\[\[(\d+)\],\s*({[\s\S]+?})\]\s*\)/,

        // 备用1：压缩格式
        /\(g\["webpackChunk\w+"\]=[^)]+\)\.push\(\[\[(\d+)\],({[\s\S]+?})\)\]\)/,

        // 备用2：无global声明
        /\(\["webpackChunk\w+"\]=[^)]+\)\.push\(\[\[(\d+)\],({[\s\S]+?})\)\]\)/,

        // 最终备用：宽松模式
        /push\(\[\[(\d+)\],\s*({[^]+\})\)\]\)/
    ];

    // ================= 2. 调试输出 =================
    console.log('==== 调试信息 ====');
    console.log('输入代码片段:', code.slice(0, 200) + '...');

    // ================= 3. 尝试多种正则匹配 =================
    let match = null;
    for (const regex of chunkRegexes) {
        match = regex.exec(code);
        console.log(`正则 ${regex.toString().slice(0, 50)}... 匹配结果:`, match ? '成功' : '失败');
        if (match) break;
    }

    if (!match || !match[2]) {
        console.log('所有正则匹配失败');
        return null;
    }

    // ================= 4. 模块提取 =================
    try {
        const modulesObjStr = match[2];
        const modules = [];
        const moduleRegex = /(\d+):\s*(?:async\s+)?(?:function\s*\(([^)]*)\)|\(([^)]*)\)\s*=>|([a-zA-Z_$][\w$]*)\s*\(([^)]*)\))\s*(?:{|=>\s*)([\s\S]*?)(?=,\s*(?:\d+:|}\s*\)|\s*\]|$))/g;

        console.log('开始提取模块...');
        let moduleMatch;
        while ((moduleMatch = moduleRegex.exec(modulesObjStr)) !== null) {
            if (moduleMatch.length < 7) continue;

            const params = (moduleMatch[2] || moduleMatch[3] || moduleMatch[5] || '').trim();
            let functionBody = (moduleMatch[6] || '').trim()
                .replace(/^[\s{]*/, '')
                .replace(/[\s}]*$/, '')
                .replace(/^\(/, '')
                .replace(/\)$/, '');

            if (functionBody) {
                modules.push({
                    id: moduleMatch[1],
                    code: `(function(${params}) {\n${functionBody}\n})`,
                    params: params.split(',').map(p => p.trim())
                });
                console.log(`找到模块 ${moduleMatch[1]}，参数: ${params}`);
            }
        }

        return modules.length > 0 ? modules : null;
    } catch (error) {
        console.error('模块提取错误:', {
            message: error.message,
            stack: error.stack,
            codeSnippet: code.slice(0, 200) + '...'
        });
        return null;
    }
}

/**
 * 从AST节点提取函数代码
 */
function extractFunctionCode(node, originalCode) {
    const magicString = new MagicString(originalCode);
    try {
        if (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
            return magicString.slice(node.start, node.end).toString();
        }
        return magicString.slice(node.start, node.end).toString() || '';
    } catch (error) {
        console.error('函数提取错误:', error);
        return '';
    }
}

/**
 * 生成合并后的代码
 */
function generateMergedCode(modules) {
    if (!modules || !modules.length) return "// 未找到模块\n";

    return modules.map(m => {
        return `// ===== 模块 ${m.id} =====
// 参数: ${m.params?.join(', ') || '无'}
// 依赖: ${m.dependencies?.join(', ') || '无'}
${m.code || '// 空模块'}
`;
    }).join('\n\n');
}

/**
 * 测试正则表达式
 */
function testRegexes(code) {
    console.log('=== 正则测试 ===');
    const testCases = [
        `(global["webpack"]=[]).push([[1],{1:(e,t)=>{}}])`,
        `(g["webpack"]=[]).push([[1],{1:(e,t)=>{}}])`,
        code.slice(0, 500)
    ];

    testCases.forEach((test, i) => {
        console.log(`\n测试用例 ${i + 1}:`, test.slice(0, 80) + '...');
        const match = parseWebpack5(test);
        console.log('匹配结果:', match ? `找到 ${match.length} 个模块` : '失败');
    });
}

module.exports = {
    parseWebpack5,
    extractFunctionCode,
    generateMergedCode,
    testRegexes
};