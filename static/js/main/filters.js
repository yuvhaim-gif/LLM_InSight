const DOMAIN_MODEL_MAP = {
    'coding': ['codellama:7b', 'qwen2.5-coder:7b', 'starcoder2:7b', 'deepseek-coder-v2'],
    'creative': ['gemma:7b-instruct-q4_K_M', 'gemma2:9b', 'llama3.1', 'granite4:latest'],
    'science': ['granite3.3', 'phi4:14b', 'olmo2:7b', 'llama2:13b', 'devstral:24b', 'dolphin3:8b', 'falcon3:7b'],
    'experimental': ['solar', 'voxtral-mini-2507', 'mistral-small-2506', 'open-mistral-nemo-2407', 'llama2-uncensored:7b', 'mistral:7b-instruct'],
    'balanced': ['gemma:7b-instruct-q4_K_M','gpt-oss:20b', 'qwen3:14b', 'mistral-small-2506', 'open-mistral-nemo-2407', 'glm-4-9b', 'glm-4-9b-chat']
};

function filterModelsByDomain(domain) {
    const layer1aSelect = document.getElementById('modelSelectA');
    const layer1bSelect = document.getElementById('modelSelectB');
    const advancedLayer1aSelects = document.querySelectorAll('.advanced-model-select[data-layer="a"]');
    const advancedLayer1bSelects = document.querySelectorAll('.advanced-model-select[data-layer="b"]');
    
    const allSelects = [layer1aSelect, layer1bSelect, ...advancedLayer1aSelects, ...advancedLayer1bSelects];
    
    allSelects.forEach(select => {
        if (!select) return;
        const isAdvancedSelect = select.classList.contains('advanced-model-select');
        const options = select.querySelectorAll('option');
        options.forEach(option => {
            const modelName = option.value.replace(/^☁️\s*/, '').trim();
            if (domain === 'all') {
                if (isAdvancedSelect && (option.value === '' || option.value === 'Default')) {
                    option.style.display = 'none';
                } else {
                    option.style.display = '';
                }
            } else if (option.value === '' || option.value === 'Default') {
                option.style.display = 'none';
            } else if (DOMAIN_MODEL_MAP[domain] && DOMAIN_MODEL_MAP[domain].includes(modelName)) {
                option.style.display = '';
            } else {
                option.style.display = 'none';
            }
        });
    });
    
    localStorage.setItem('selectedDomainFilter', domain);
    console.log(`✅ Model domain filter changed to: ${domain}`);
}

function initializeDomainFilter() {
    const savedFilter = localStorage.getItem('selectedDomainFilter') || 'all';
    const selector = document.getElementById('domainFilterSelector');
    if (selector) {
        selector.value = savedFilter;
        filterModelsByDomain(savedFilter);
    }
}

function getModelCategory(modelName) {
    const lightGreenModels = ['gemini-2.5-flash', 'gemini-2.5-pro', 'mistral:7b-instruct', 'codellama:7b', 'gemma:7b-instruct-q4_K_M', 'qwen2.5-coder:7b', 'starcoder2:7b', 'olmo2:7b', 'llama2-uncensored:7b', 'mistral-small-2506', 'magistral-small-2509', 'voxtral-mini-2507', 'open-mistral-nemo-2407'];
    const yellowModels = ['dolphin3:8b', 'falcon3:7b', 'granite3.3', 'solar', 'llama3.1'];
    const orangeModels = ['qwen3:14b', 'deepseek-r1', 'granite4:latest', 'phi4:14b', 'glm-4-9b', 'glm-4-9b-chat', 'deepseek-coder-v2', 'gemma2:9b', 'llama2:13b'];
    const redModels = ['gpt-oss:20b', 'devstral:24b'];
    
    if (lightGreenModels.includes(modelName)) return 'green';
    if (yellowModels.includes(modelName)) return 'yellow';
    if (orangeModels.includes(modelName)) return 'orange';
    if (redModels.includes(modelName)) return 'red';
    return 'unknown';
}

function shouldShowModel(modelName, systemType) {
    const category = getModelCategory(modelName);
    
    if (systemType === 'simple') {
        return category === 'green' || category === 'yellow';
    } else if (systemType === 'medium') {
        return category === 'green' || category === 'yellow' || category === 'orange';
    } else {
        return true;
    }
}

function setSystemType(systemType) {
    localStorage.setItem('systemType', systemType);
    const dropdown = document.getElementById('systemTypeSelect');
    if (dropdown) {
        dropdown.value = systemType;
    }
    updateModelVisibility(systemType);
}

function updateModelVisibility(systemType) {
    const selects = document.querySelectorAll('select.model-select, select.advanced-model-select');
    selects.forEach(select => {
        const options = select.querySelectorAll('option');
        let firstVisibleOption = null;
        
        options.forEach(option => {
            const modelName = option.value.trim();
            if (!modelName) {
                option.style.display = 'block';
                return;
            }
            
            const isVisible = shouldShowModel(modelName, systemType);
            option.style.display = isVisible ? 'block' : 'none';
            
            if (isVisible && !firstVisibleOption) {
                firstVisibleOption = option;
            }
        });
        
        if (select.value && !shouldShowModel(select.value, systemType)) {
            if (firstVisibleOption) {
                select.value = firstVisibleOption.value;
            }
        }
    });
}
