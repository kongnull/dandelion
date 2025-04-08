<template>
    <div class="container">
        <input type="file" multiple @change="handleFileUpload">
        <div class="editor-container">
            <div v-for="(file, index) in files" :key="index" class="file-wrapper">
                <div class="file-panel">
                    <div class="original-code">
                        <div class="header">原始文件：{{ file.name }}</div>
                        <div ref="originalEditor" class="editor"></div>
                    </div>
                    <div class="actions">
                        <button @click="decompileFile(index)">解析</button>
                        <button @click="saveFile(index)">保存</button>
                    </div>
                    <div class="decompiled-code">
                        <div class="header">反编译结果</div>
                        <div ref="resultEditor" class="editor"></div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script>
import * as monaco from 'monaco-editor';

export default {
    data() {
        return {
            files: [], // 新增文件对象数组 { name: string, content: string, decompiled: string }
            editors: {
                original: [],
                result: []
            }
        }
    },
    methods: {
        async handleFileUpload(e) {
            const files = Array.from(e.target.files);
            this.files = await Promise.all(files.map(async f => ({
                name: f.name,
                content: await this.readFile(f),
                decompiled: ''
            })));

            this.$nextTick(() => {
                this.initOriginalEditors();
            });
        },

        async readFile(file) {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.readAsText(file);
            });
        },

        decompileFile(index) {
            const content = this.files[index].content;
            window.electronAPI.send('decompile-js', {
                content,
                index
            });
        },

        saveFile(index) {
            const file = this.files[index];
            window.electronAPI.send('save-file', {
                name: file.name.replace(/(\.js)\d*$/, '_deobfuscated$1'),
                content: file.decompiled
            });
        },

        initOriginalEditors() {
            this.editors.original = this.$refs.originalEditor.map((el, index) =>
                this.createEditor(el, this.files[index].content)
            );
        },

        createEditor(el, initialValue) {
            return monaco.editor.create(el, {
                value: initialValue,
                language: 'javascript',
                theme: 'vs-dark',
                minimap: { enabled: true },
                readOnly: true
            });
        }
    },
    mounted() {
        window.electronAPI.on('decompile-result', ({ index, result }) => {
            this.$set(this.files[index], 'decompiled', result);

            this.$nextTick(() => {
                if (!this.editors.result[index]) {
                    this.editors.result[index] = this.createEditor(
                        this.$refs.resultEditor[index],
                        result
                    );
                } else {
                    this.editors.result[index].setValue(result);
                }
            });
        });

        // 在methods中添加错误处理
        window.electronAPI.on('decompile-error', ({ index, error }) => {
            this.$set(this.files[index], 'decompiled', `// 反编译错误\n${error}`);
        });


    }
}
</script>

<style>
.file-wrapper {
    margin: 20px 0;
    border: 1px solid #444;
    border-radius: 4px;
}

.file-panel {
    display: grid;
    grid-template-columns: 1fr 80px 1fr;
    gap: 20px;
    padding: 10px;
}

.actions {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 20px 0;
}

.actions button {
    padding: 8px 15px;
    background: #42b983;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}

.header {
    padding: 8px;
    background: #333;
    color: white;
}


.editor {
    height: 600px;
    /* 添加固定高度 */
    border: 1px solid #444;
    margin: 10px 0;
}
</style>