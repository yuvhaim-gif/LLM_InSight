if (window.Chart && window.ChartDataLabels && !window.ChartDataLabelsRegistered) {
    Chart.register(ChartDataLabels);
    window.ChartDataLabelsRegistered = true;
}

function getModelColor(modelName) {
    const lightGreenModels = ['gemini-2.5-flash', 'gemini-2.5-pro', 'mistral:7b-instruct', 'codellama:7b', 'gemma:7b-instruct-q4_K_M', 'qwen2.5-coder:7b', 'starcoder2:7b', 'olmo2:7b', 'llama2-uncensored:7b', 'mistral-small-2506', 'magistral-small-2509', 'voxtral-mini-2507', 'open-mistral-nemo-2407'];
    const yellowModels = ['dolphin3:8b', 'falcon3:7b', 'granite3.3', 'solar', 'llama3.1'];
    const orangeModels = ['qwen3:14b', 'deepseek-r1', 'granite4:latest', 'phi4:14b', 'glm-4-9b', 'glm-4-9b-chat', 'deepseek-coder-v2', 'gemma2:9b', 'llama2:13b'];
    const redModels = ['gpt-oss:20b', 'devstral:24b'];
    
    if (lightGreenModels.includes(modelName)) return '#22AA22';
    if (yellowModels.includes(modelName)) return '#FFB800';
    if (orangeModels.includes(modelName)) return '#FF8800';
    if (redModels.includes(modelName)) return '#FF5555';
    return 'black';
}

function colorizeModelOptions() {
    const selects = document.querySelectorAll('select.model-select, select.advanced-model-select');
    selects.forEach(select => {
        const options = select.querySelectorAll('option');
        options.forEach(option => {
            const modelName = option.value.trim();
            if (modelName) {
                option.style.color = getModelColor(modelName);
            }
        });
    });
}
