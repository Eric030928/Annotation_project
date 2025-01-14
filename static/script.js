document.addEventListener('DOMContentLoaded', function () {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const fileInfo = document.getElementById('fileInfo');
    const fileName = document.getElementById('fileName');
    const removeFile = document.getElementById('removeFile');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const promptTextarea = document.getElementById('prompt');
    const charCount = document.querySelector('.char-count');
    const appKeyInput = document.getElementById('appKey');
    const columnSelection = document.getElementById('columnSelection');
    const columnCheckboxes = document.getElementById('columnCheckboxes');
    const form = document.querySelector('form');
    const progressContainer = document.getElementById('progressContainer');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const elapsedTime = document.getElementById('elapsedTime');
    const annotatedCount = document.getElementById('annotatedCount');

    let currentFile = null;
    let worker;

    // 初始清理
    clearAllData();

    // Prompt字数统计
    promptTextarea.addEventListener('input', function () {
        const length = this.value.length;
        charCount.textContent = `${length}`;
        checkAnalyzeButtonState();
    });

    // 拖拽上传
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#2980b9';
        dropZone.style.backgroundColor = '#f7f9fc';
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.style.borderColor = '#3498db';
        dropZone.style.backgroundColor = '#fff';
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#3498db';
        dropZone.style.backgroundColor = '#fff';

        const file = e.dataTransfer.files[0];
        handleFile(file);
    });

    // 点击上传
    dropZone.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        handleFile(file);
    });

    // 文件处理
    function handleFile(file) {
        if (!file) return;

        if (file.type !== 'text/csv') {
            alert('请上传CSV格式的文件');
            return;
        }
        currentFile = file;
        fileName.textContent = file.name;
        fileInfo.style.display = 'flex';

        // 读取CSV文件并提取列名
        const reader = new FileReader();
        reader.onload = function (e) {
            const content = e.target.result;
            const lines = content.split('\n');
            if (lines.length > 0) {
                const headers = lines[0].split(',');
                displayColumnSelection(headers);
            }
        };
        reader.readAsText(file);

        checkAnalyzeButtonState();
    }

    // 显示列选择
    function displayColumnSelection(headers) {
        columnCheckboxes.innerHTML = '';
        headers.forEach(header => {
            const label = document.createElement('label');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.name = 'column';
            checkbox.value = header.trim();
            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(header.trim()));
            columnCheckboxes.appendChild(label);
        });
        columnSelection.style.display = 'block';
    }

    // 移除文件
    removeFile.addEventListener('click', () => {
        currentFile = null;
        fileInfo.style.display = 'none';
        fileInput.value = '';
        // 清除列选择
        columnSelection.style.display = 'none';
        columnCheckboxes.innerHTML = '';
        checkAnalyzeButtonState();
    });

    // 检查分析按钮状态
    function checkAnalyzeButtonState() {
        const prompt = promptTextarea.value.trim();
        const appKey = appKeyInput.value.trim();
        const selectedColumns = document.querySelectorAll('input[name="column"]:checked');
        analyzeBtn.disabled = !(currentFile && prompt && appKey && selectedColumns.length > 0);
    }

    // 为列选择添加事件监听
    columnCheckboxes.addEventListener('change', checkAnalyzeButtonState);

    // 监听App Key输入变化
    appKeyInput.addEventListener('input', checkAnalyzeButtonState);

    // 禁用所有输入元素
    function disableAllInputs() {
        const inputs = document.querySelectorAll('input, textarea, button, select');
        inputs.forEach(input => {
            input.disabled = true;
        });
    }

    // 启用所有输入元素
    function enableAllInputs() {
        const inputs = document.querySelectorAll('input, textarea, button, select');
        inputs.forEach(input => {
            if (input !== analyzeBtn) {
                input.disabled = false;
            }
        });
    }

    // 创建Web Worker
    function createWorker() {
        const workerCode = `
            let progress = 0;
            let completed = 0;
            let total = 0;
            let elapsedTime = 0;

            self.onmessage = function(e) {
                if (e.data.type === 'update') {
                    progress = e.data.progress;
                    completed = e.data.completed;
                    total = e.data.total;
                    elapsedTime = e.data.elapsed_time || elapsedTime;
                } else if (e.data.type === 'getStatus') {
                    self.postMessage({progress, completed, total, elapsedTime});
                }
            };

            setInterval(() => {
                elapsedTime++;
                self.postMessage({type: 'tick', progress, completed, total, elapsedTime});
            }, 1000);
        `;

        const blob = new Blob([workerCode], {type: 'application/javascript'});
        return new Worker(URL.createObjectURL(blob));
    }

    // 修改表单提交事件
    form.addEventListener('submit', function(e) {
        e.preventDefault();

        if (!currentFile) return;

        const prompt = promptTextarea.value.trim();
        const appKey = appKeyInput.value.trim();
        const selectedModel = document.querySelector('input[name="model"]:checked').value;
        const selectedColumns = Array.from(document.querySelectorAll('input[name="column"]:checked')).map(cb => cb.value);

        if (!prompt || !appKey || selectedColumns.length === 0) {
            alert('请确保所有必填字段都已填写');
            return;
        }

        // 禁用所有输入元素
        disableAllInputs();

        const formData = new FormData();
        formData.append('file', currentFile);
        formData.append('model_choice', selectedModel === 'claude' ? '1' : '2');
        formData.append('app_key', appKey);
        formData.append('prompt', prompt);
        formData.append('selected_columns', JSON.stringify(selectedColumns));

        // 显示进度条
        progressContainer.style.display = 'block';
        progressBar.style.width = '0%';
        progressText.textContent = '处理中: 0/0';
        elapsedTime.textContent = '已等待时间: 0秒';
        annotatedCount.textContent = '已标注数据: 0/0';

        // 创建并启动Web Worker
        worker = createWorker();
        worker.onmessage = function(e) {
            if (e.data.type === 'tick') {
                updateProgress(e.data.progress, e.data.completed, e.data.total, e.data.elapsedTime);
            }
        };

        fetch('/analyze', {
            method: 'POST',
            body: formData
        })
        .then(response => {
            const reader = response.body.getReader();
            return new ReadableStream({
                start(controller) {
                    return pump();
                    function pump() {
                        return reader.read().then(({ done, value }) => {
                            if (done) {
                                controller.close();
                                return;
                            }
                            controller.enqueue(value);
                            const chunk = new TextDecoder().decode(value);
                            const lines = chunk.split('\n').filter(line => line.trim() !== '');
                            lines.forEach(line => {
                                try {
                                    const data = JSON.parse(line);
                                    worker.postMessage({type: 'update', ...data});
                                    updateProgress(data.progress, data.completed, data.total, data.elapsed_time);
                                    console.log(`Progress: ${data.progress}%, Completed: ${data.completed}, Total: ${data.total}, Finished: ${data.finished}`);  // 添加日志
                                    if (data.finished && data.completed === data.total) {  // 确保所有行都被处理
                                        console.log("Processing completed. Initiating download.");
                                        setTimeout(() => {
                                            alert('分析完成，文件开始下载');
                                            downloadAndCleanup(currentFile.name);
                                        }, 500);
                                    }
                                } catch (e) {
                                    console.error('Error parsing progress update:', e);
                                }
                            });
                            return pump();
                        });
                    }
                }
            });
        })
        // ... 其余代码保持不变
        
        .then(stream => new Response(stream))
        .then(response => response.text())
        .catch(error => {
            console.error('分析出错:', error);
            alert('分析过程中出现错误：' + error.message);
        })
        .finally(() => {
            enableAllInputs();
            if (worker) {
                worker.terminate();
            }
        });
        
    });

    // 更新进度函数
    function updateProgress(progress, completed, total, elapsedSeconds) {
        progressBar.style.width = `${progress}%`;
        progressText.textContent = `处理中: ${completed}/${total}`;
        annotatedCount.textContent = `已标注数据: ${completed}/${total}`;
        
        if (typeof elapsedSeconds === 'number' && !isNaN(elapsedSeconds)) {
            const minutes = Math.floor(elapsedSeconds / 60);
            const seconds = elapsedSeconds % 60;
            elapsedTime.textContent = `已等待时间: ${minutes}分${seconds}秒`;
        } else {
            elapsedTime.textContent = `已等待时间: 计算中...`;
        }
    }

    // 页面可见性变化事件
    document.addEventListener('visibilitychange', function() {
        if (!document.hidden && worker) {
            worker.postMessage({type: 'getStatus'});
        }
    });

    // 下载文件并清理缓存
    function downloadAndCleanup(filename) {
        fetch('/download/' + filename)
        .then(response => response.blob())
        .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = '标注结果_' + filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            // 下载完成后清理缓存
            clearAllData();
        })
        .catch(error => console.error('Download failed:', error));
    }

    // 清除所有数据的函数
    function clearAllData() {
        fetch('/clear_data', { method: 'POST' })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                console.log('所有临时数据已清除');
                // 重置UI状态
                resetUIState();
            } else {
                console.error('清除数据失败:', data.message);
            }
        })
        .catch(error => {
            console.error('清除数据时出错:', error);
        });
    }

    // 重置UI状态
    function resetUIState() {
        currentFile = null;
        fileInfo.style.display = 'none';
        fileInput.value = '';
        columnSelection.style.display = 'none';
        columnCheckboxes.innerHTML = '';
        promptTextarea.value = '';
        appKeyInput.value = '';
        progressContainer.style.display = 'none';
        checkAnalyzeButtonState();
    }

    // 添加页面卸载事件监听器
    window.addEventListener('beforeunload', function (e) {
        // 发送同步请求以清理数据
        clearAllData();
        
        // 取消默认行为，防止显示浏览器默认的确认对话框
        e.preventDefault();
        // Chrome需要设置returnValue
        e.returnValue = '';
    });
});
