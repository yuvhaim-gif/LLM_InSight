window.addEventListener('error', function(e) {
    console.error('Global JS Error:', e.error);
    if (document.getElementById('processingOverlay') && document.getElementById('processingOverlay').style.display === 'flex') {
        console.error('Processing is still running, keeping overlay visible');
        return false;
    }
});

window.addEventListener('unhandledrejection', function(e) {
    console.error('Unhandled Promise Rejection:', e.reason);
    if (document.getElementById('processingOverlay') && document.getElementById('processingOverlay').style.display === 'flex') {
        console.error('Processing is still running, keeping overlay visible');
        e.preventDefault();
    }
});

if (window.Chart && window.ChartDataLabels && !window.ChartDataLabelsRegistered) {
    Chart.register(ChartDataLabels);
    window.ChartDataLabelsRegistered = true;
}

let DEEPER_ANALYSIS_GRADE_KEYS = (typeof initialGraderWeights !== 'undefined' && initialGraderWeights && Object.keys(initialGraderWeights).length > 0) ? Object.keys(initialGraderWeights) : ["accuracy", "clarity", "conciseness", "creativity", "structure"];
let DEEPER_ANALYSIS_DEFAULT_WEIGHTS = (typeof initialGraderWeights !== 'undefined' && initialGraderWeights && Object.keys(initialGraderWeights).length > 0) ? Object.assign({}, initialGraderWeights) : { accuracy: 0.25, clarity: 0.25, conciseness: 0.15, creativity: 0.25, structure: 0.10 };
let deeperAnalysisAvgChart = null;
let deeperAnalysisRadarChart = null;
let deeperAnalysisOriginalWeights = null;

function getDeeperAnalysisInitialWeights() {
    const weights = {};
    const weightInputs = document.querySelectorAll('.weight-input');

    weightInputs.forEach(input => {
        const key = input.dataset && input.dataset.category;
        const value = parseFloat(input.value) / 100;
        if (key && !isNaN(value)) {
            weights[key] = value;
        }
    });

    if (Object.keys(weights).length === 0) {
        return { ...DEEPER_ANALYSIS_DEFAULT_WEIGHTS };
    }

    return normalizeDeeperAnalysisWeights(weights);
}

function renderDeeperAnalysisWeightControls(weights) {
    var wkeys = Object.keys(weights);
    if (wkeys.length === 0) wkeys = DEEPER_ANALYSIS_GRADE_KEYS;
    const entries = wkeys.map(key => {
        const value = weights[key] || 0;
        return `<div style="display: flex; align-items: center; gap: 6px; background: rgba(255,255,255,0.95); border: 1px solid rgba(102, 126, 234, 0.2); border-radius: 8px; padding: 6px 8px;"><span style="font-size: 0.78rem; font-weight: 600; color: #2d3436; text-transform: capitalize;">${key}</span><input type="number" data-deeper-weight-input="${key}" value="${value.toFixed(2)}" min="0" max="1" step="0.01" style="width: 66px; padding: 3px 6px; border: 1px solid #d0d7de; border-radius: 6px; font-size: 0.78rem;"><span data-deeper-weight-percent="${key}" style="font-size: 0.75rem; color: #636e72;">${(value * 100).toFixed(0)}%</span></div>`;
    }).join('');

    const total = wkeys.reduce((sum, key) => sum + (weights[key] || 0), 0);
    return `<div id="deeperAnalysisWeightControls" style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 0 0 14px 0;"><span style="font-size: 0.85rem; font-weight: 700; color: #2d3436; margin-right: 6px;">⚖️ Avg Graph Weights</span><span id="deeperAnalysisWeightTotalIndicator" style="font-size: 0.78rem; font-weight: 700; padding: 3px 8px; border-radius: 999px; background: #e9ecef; color: #495057;">Total: ${(total * 100).toFixed(0)}%</span><button type="button" id="deeperAnalysisWeightResetBtn" onclick="resetDeeperAnalysisWeightsToOriginal()" style="border: none; border-radius: 8px; padding: 4px 10px; font-size: 0.75rem; font-weight: 700; cursor: pointer; background: #e2e3e5; color: #6c757d;">Reset</button>${entries}</div>`;
}

function areDeeperAnalysisWeightsAtOriginal(currentWeights) {
    if (!deeperAnalysisOriginalWeights) {
        return true;
    }

    var keys = Object.keys(currentWeights);
    if (keys.length === 0) keys = DEEPER_ANALYSIS_GRADE_KEYS;
    return keys.every(key => Math.abs((currentWeights[key] || 0) - (deeperAnalysisOriginalWeights[key] || 0)) < 0.001);
}

function resetDeeperAnalysisWeightsToOriginal() {
    if (!deeperAnalysisOriginalWeights) {
        return;
    }

    const inputs = document.querySelectorAll('[data-deeper-weight-input]');
    if (!inputs.length) {
        return;
    }

    inputs.forEach(input => {
        const key = input.getAttribute('data-deeper-weight-input');
        if (key in deeperAnalysisOriginalWeights) {
            input.value = deeperAnalysisOriginalWeights[key].toFixed(2);
        }
    });

    updateDeeperAnalysisWeightIndicator();
    inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
}

function updateDeeperAnalysisWeightIndicator() {
    const inputs = document.querySelectorAll('[data-deeper-weight-input]');
    const indicator = document.getElementById('deeperAnalysisWeightTotalIndicator');
    const resetBtn = document.getElementById('deeperAnalysisWeightResetBtn');

    if (!inputs.length || !indicator) {
        return;
    }

    let total = 0;
    const currentWeights = {};
    inputs.forEach(input => {
        const key = input.getAttribute('data-deeper-weight-input');
        const value = parseFloat(input.value);
        const safeValue = !isNaN(value) && value >= 0 ? value : 0;
        total += safeValue;
        if (key) {
            currentWeights[key] = safeValue;
        }

        const percentLabel = document.querySelector(`[data-deeper-weight-percent="${key}"]`);
        if (percentLabel) {
            percentLabel.textContent = (safeValue * 100).toFixed(0) + '%';
        }
    });

    const totalPercent = total * 100;
    indicator.textContent = `Total: ${totalPercent.toFixed(0)}%`;

    if (Math.abs(total - 1) < 0.001) {
        indicator.style.background = '#d1f7e5';
        indicator.style.color = '#0f8f56';
    } else if (total < 1) {
        indicator.style.background = '#fff3cd';
        indicator.style.color = '#b26a00';
    } else {
        indicator.style.background = '#fde2e2';
        indicator.style.color = '#c0392b';
    }

    if (resetBtn) {
        if (areDeeperAnalysisWeightsAtOriginal(currentWeights)) {
            resetBtn.style.background = '#e2e3e5';
            resetBtn.style.color = '#6c757d';
        } else {
            resetBtn.style.background = '#f8d7da';
            resetBtn.style.color = '#842029';
        }
    }
}

function getDeeperAnalysisModalWeights() {
    const weights = { ...DEEPER_ANALYSIS_DEFAULT_WEIGHTS };
    const inputs = document.querySelectorAll('[data-deeper-weight-input]');

    inputs.forEach(input => {
        const key = input.getAttribute('data-deeper-weight-input');
        const value = parseFloat(input.value);
        if (key && !isNaN(value)) {
            weights[key] = value;
        }
    });

    return normalizeDeeperAnalysisWeights(weights);
}

function normalizeDeeperAnalysisWeights(weights) {
    const normalized = {};
    let total = 0;
    var keys = Object.keys(weights);
    if (keys.length === 0) keys = DEEPER_ANALYSIS_GRADE_KEYS;

    keys.forEach(key => {
        const value = parseFloat(weights[key]);
        const safeValue = !isNaN(value) && value >= 0 ? value : 0;
        normalized[key] = safeValue;
        total += safeValue;
    });

    if (total <= 0) {
        return { ...DEEPER_ANALYSIS_DEFAULT_WEIGHTS };
    }

    keys.forEach(key => {
        normalized[key] = normalized[key] / total;
    });

    return normalized;
}

function calculateDeeperAnalysisWeightedScore(grades, weights) {
    let total = 0;
    var keys = Object.keys(weights);
    if (keys.length === 0) keys = DEEPER_ANALYSIS_GRADE_KEYS;

    keys.forEach(key => {
        const gradeValue = grades && grades[key] !== undefined ? parseFloat(grades[key]) : 0;
        const safeGrade = !isNaN(gradeValue) ? gradeValue : 0;
        total += safeGrade * (weights[key] || 0);
    });

    return total;
}

function showDownloadOptions() {
    const consoleDiv = document.querySelector('.console-output');
    if (!consoleDiv) {
        alert('No console output to download');
        return;
    }
    
    const consoleText = consoleDiv.innerText;
    if (!consoleText.trim()) {
        alert('Console output is empty');
        return;
    }
    
    document.getElementById('downloadModal').style.display = 'flex';
}

function closeDownloadModal() {
    document.getElementById('downloadModal').style.display = 'none';
}

function saveSelectionsAndNavigate(url) {
    fetch('/save_current_selection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            window.location.href = url;
        } else {
            console.warn('Failed to save selections, navigating anyway');
            window.location.href = url;
        }
    })
    .catch(error => {
        console.warn('Error saving selections:', error);
        window.location.href = url;
    });
}

function downloadAsText() {
    const consoleDiv = document.querySelector('.console-output');
    const consoleText = consoleDiv.innerText;
    
    const blob = new Blob([consoleText], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', 'console_output_' + new Date().toISOString().replace(/[:.]/g, '-') + '.txt');
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
    closeDownloadModal();
}

function downloadAsJson() {
    const consoleDiv = document.querySelector('.console-output');
    const consoleText = consoleDiv.innerText;
    
    fetch('/get_backup_data')
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                const backupData = result.backup_data;
                
                const jsonData = {
                    console_output: consoleText,
                    prompt_history: backupData.prompt_history || [],
                    all_prompt_results: backupData.all_prompt_results || [],
                    iteration_history: backupData.iteration_history || {},
                    best_best_cache: backupData.best_best_cache || {},
                    ledger_entries: backupData.ledger_entries || [],
                    session_data: {
                        current_weights: backupData.session_data.current_weights || {},
                        layer1a_model: backupData.session_data.layer1a_model || '',
                        layer1b_model: backupData.session_data.layer1b_model || '',
                        layer0_model: backupData.session_data.layer0_model || '',
                        layer2_model: backupData.session_data.layer2_model || '',
                        layer3_graders: backupData.session_data.layer3_graders || {},
                        advanced_layer1a_models: backupData.session_data.advanced_layer1a_models || {},
                        advanced_layer1b_models: backupData.session_data.advanced_layer1b_models || {},
                        advanced_layer2_models: backupData.session_data.advanced_layer2_models || {},
                        degradation_break_enabled: backupData.session_data.degradation_break_enabled !== false,
                        change_prompt_between_layers1: backupData.session_data.change_prompt_between_layers1 !== false,
                        give_ideas_enabled: backupData.session_data.give_ideas_enabled !== false,
                        layer1_last_best_context_enabled: backupData.session_data.layer1_last_best_context_enabled !== false,
                        grade_vs_prompt_mode: backupData.session_data.grade_vs_prompt_mode === 'first' ? 'first' : 'current',
                        grader_setting_name: backupData.session_data.grader_setting_name || 'default',
                        min_grade: backupData.session_data.min_grade || 100,
                        max_iterations: backupData.session_data.max_iterations || 5
                    },
                    timestamp: new Date().toISOString(),
                    version: "2.0"
                };
                
                const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json;charset=utf-8' });
                const link = document.createElement('a');
                const url = URL.createObjectURL(blob);
                
                link.setAttribute('href', url);
                link.setAttribute('download', 'chat_backup_complete_' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
                link.style.visibility = 'hidden';
                
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                URL.revokeObjectURL(url);
                closeDownloadModal();
                
                console.log('✅ Complete chat backup downloaded with all continuity data');
            } else {
                alert('Failed to gather backup data: ' + result.error);
            }
        })
        .catch(error => {
            console.error('Error getting backup data:', error);
            alert('Error preparing backup: ' + error.message);
        });
}

function setDegradationBreak(enabled) {
    const yesBtn = document.getElementById('degBreakYes');
    const noBtn = document.getElementById('degBreakNo');
    
    fetch('/set_degradation_break', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enabled: enabled })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            if (enabled) {
                yesBtn.classList.add('active');
                noBtn.classList.remove('active');
            } else {
                yesBtn.classList.remove('active');
                noBtn.classList.add('active');
            }
        }
    })
    .catch(error => {
        console.error('Error setting degradation break:', error);
    });
}

function setChangePromptBetweenLayers1(enabled) {
    const yesBtn = document.getElementById('changePromptYes');
    const noBtn = document.getElementById('changePromptNo');
    
    fetch('/set_change_prompt_between_layers1', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enabled: enabled })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            if (enabled) {
                yesBtn.classList.add('active');
                noBtn.classList.remove('active');
            } else {
                yesBtn.classList.remove('active');
                noBtn.classList.add('active');
            }
        }
    })
    .catch(error => {
        console.error('Error setting change prompt between layers1:', error);
    });
}

function setGiveIdeas(enabled) {
    const yesBtn = document.getElementById('giveIdeasYes');
    const noBtn = document.getElementById('giveIdeasNo');
    
    fetch('/set_give_ideas', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enabled: enabled })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            if (enabled) {
                yesBtn.classList.add('active');
                noBtn.classList.remove('active');
            } else {
                yesBtn.classList.remove('active');
                noBtn.classList.add('active');
            }
        }
    })
    .catch(error => {
        console.error('Error setting give ideas:', error);
    });
}

function setLayer1LastBestContext(enabled) {
    const yesBtn = document.getElementById('layer1LastBestContextYes');
    const noBtn = document.getElementById('layer1LastBestContextNo');

    fetch('/set_layer1_last_best_context', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enabled: enabled })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            if (enabled) {
                yesBtn.classList.add('active');
                noBtn.classList.remove('active');
            } else {
                yesBtn.classList.remove('active');
                noBtn.classList.add('active');
            }
        }
    })
    .catch(error => {
        console.error('Error setting Layer1 last best context:', error);
    });
}

function setGradeVsPromptMode(mode) {
    const firstBtn = document.getElementById('gradePromptFirst');
    const currentBtn = document.getElementById('gradePromptCurrent');

    fetch('/set_grade_vs_prompt_mode', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mode: mode })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            const isFirst = data.mode === 'first';
            if (firstBtn) {
                firstBtn.classList.toggle('active', isFirst);
            }
            if (currentBtn) {
                currentBtn.classList.toggle('active', !isFirst);
            }
        }
    })
    .catch(error => {
        console.error('Error setting grade-vs prompt mode:', error);
    });
}

const GRADE_WEIGHTS = {
    balanced: { accuracy: 0.25, clarity: 0.25, conciseness: 0.15, creativity: 0.25, structure: 0.10 },
    accuracy: { accuracy: 0.40, clarity: 0.25, conciseness: 0.15, creativity: 0.10, structure: 0.10 },
    creativity: { accuracy: 0.15, clarity: 0.20, conciseness: 0.15, creativity: 0.40, structure: 0.10 },
    conciseness: { accuracy: 0.20, clarity: 0.20, conciseness: 0.30, creativity: 0.20, structure: 0.10 }
};

let currentGradeWeightsProfile = 'balanced';
let currentGraderConfigWeights = (typeof initialGraderSettingName !== 'undefined' && initialGraderSettingName !== 'default' && typeof initialGraderWeights !== 'undefined') ? Object.assign({}, initialGraderWeights) : null;

function setGradeWeights(profile) {
    const manualIndicator = document.getElementById('manualIndicator');
    const manualIndicatorTop = document.getElementById('manualIndicatorTop');
    
    if (!(profile in GRADE_WEIGHTS)) {
        return;
    }
    
    const weights = GRADE_WEIGHTS[profile];
    updateSidebarWeights(weights);
    updateWeightStatus(profile);
    if (manualIndicator) manualIndicator.style.display = 'none';
    if (manualIndicatorTop) manualIndicatorTop.style.display = 'none';
    currentGradeWeightsProfile = profile;
    localStorage.setItem('selectedGradeWeights', profile);
    applyWeights();
    
    console.log(`✅ Domain selector changed to: ${profile} - prompt history preserved on frontend`);
}

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

function updateSidebarWeights(weights) {
    const weightInputs = document.querySelectorAll('[data-weight-input]');
    weightInputs.forEach(input => {
        const key = input.getAttribute('data-weight-input');
        if (key in weights) {
            input.value = Math.round(weights[key] * 100);
        }
    });
    updateWeightSumIndicator();
}

function updateWeightStatus(profile) {
    const profileNames = {
        'balanced': 'Balanced',
        'accuracy': 'Accuracy-heavy',
        'creativity': 'Creativity-heavy',
        'conciseness': 'Conciseness-heavy'
    };
    const statusDiv = document.getElementById('weightStatus');
    if (statusDiv) {
        statusDiv.textContent = profileNames[profile] || profile;
    }
}

function checkManualWeightChanges() {
    const manualIndicator = document.getElementById('manualIndicator');
    const manualIndicatorTop = document.getElementById('manualIndicatorTop');
    const weightInputs = document.querySelectorAll('[data-weight-input]');
    
    let isManual = false;
    weightInputs.forEach(input => {
        const key = input.getAttribute('data-weight-input');
        if (GRADE_WEIGHTS[currentGradeWeightsProfile] && key in GRADE_WEIGHTS[currentGradeWeightsProfile]) {
            const expectedValue = GRADE_WEIGHTS[currentGradeWeightsProfile][key];
            const currentValue = parseFloat(input.value) / 100;
            if (Math.abs(currentValue - expectedValue) > 0.001) {
                isManual = true;
            }
        }
    });
    
    if (isManual) {
        if (manualIndicator) manualIndicator.style.display = 'inline';
        if (manualIndicatorTop) manualIndicatorTop.style.display = 'inline';
    } else {
        if (manualIndicator) manualIndicator.style.display = 'none';
        if (manualIndicatorTop) manualIndicatorTop.style.display = 'none';
    }
}

function getCurrentSidebarWeights() {
    const weights = {};
    const weightInputs = document.querySelectorAll('[data-weight-input]');

    weightInputs.forEach(input => {
        const key = input.getAttribute('data-weight-input');
        const value = parseFloat(input.value) / 100;
        if (key && !isNaN(value)) {
            weights[key] = value;
        }
    });

    return weights;
}

function detectGradeWeightsProfile(weights, tolerance = 0.011) {
    const profileKeys = Object.keys(GRADE_WEIGHTS);

    for (const profile of profileKeys) {
        const profileWeights = GRADE_WEIGHTS[profile];
        const allMatch = Object.keys(profileWeights).every(key => {
            const currentValue = parseFloat(weights[key]);
            if (isNaN(currentValue)) {
                return false;
            }
            return Math.abs(currentValue - profileWeights[key]) <= tolerance;
        });

        if (allMatch) {
            return profile;
        }
    }

    return null;
}

function initializeGradeWeights() {
    const savedProfile = localStorage.getItem('selectedGradeWeights') || 'balanced';
    const selector = document.getElementById('gradeWeightsSelector');
    const manualIndicator = document.getElementById('manualIndicator');
    const manualIndicatorTop = document.getElementById('manualIndicatorTop');

    if (!selector) {
        return;
    }

    const currentWeights = getCurrentSidebarWeights();
    const detectedProfile = detectGradeWeightsProfile(currentWeights);
    const profileToUse = detectedProfile || (savedProfile in GRADE_WEIGHTS ? savedProfile : 'balanced');

    selector.value = profileToUse;
    currentGradeWeightsProfile = profileToUse;
    updateWeightStatus(profileToUse);
    localStorage.setItem('selectedGradeWeights', profileToUse);

    if (detectedProfile) {
        if (manualIndicator) manualIndicator.style.display = 'none';
        if (manualIndicatorTop) manualIndicatorTop.style.display = 'none';
    } else {
        if (manualIndicator) manualIndicator.style.display = 'inline';
        if (manualIndicatorTop) manualIndicatorTop.style.display = 'inline';
    }

    updateWeightPercentages();
    checkManualWeightChanges();
}

window.addEventListener('load', function() {
    initializeGradeWeights();
    initializeDomainFilter();
    var consoleElement = document.querySelector('.console-output');
    if(consoleElement) {
        consoleElement.scrollTop = consoleElement.scrollHeight;
    }
});

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

window.addEventListener('DOMContentLoaded', function() {
    let savedSystemType = localStorage.getItem('systemType');
    if (!savedSystemType) {
        savedSystemType = 'powerful';
        localStorage.setItem('systemType', 'powerful');
    }
    const dropdown = document.getElementById('systemTypeSelect');
    if (dropdown) {
        dropdown.value = savedSystemType;
    }
    updateModelVisibility(savedSystemType);
});

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

// Auto-resize textarea
document.addEventListener('DOMContentLoaded', function() {
    const textarea = document.getElementById('prompt');
    if (textarea) {
        // Restore last prompt from localStorage if it exists (after processing completes)
        const lastPrompt = localStorage.getItem('lastPrompt');
        if (lastPrompt) {
            textarea.value = lastPrompt;
            localStorage.removeItem('lastPrompt');
        }
        
        // Restore loaded prompt from sessionStorage (from Review Chats load)
        const loadedPrompt = sessionStorage.getItem('loaded_last_prompt');
        if (loadedPrompt) {
            textarea.value = loadedPrompt;
            sessionStorage.removeItem('loaded_last_prompt');
        }
        
        textarea.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.max(200, this.scrollHeight) + 'px';
        });
    }
    
    // Restore model selections from sessionStorage (from Review Chats load)
    const loadedModels = {
        'loaded_layer1a_model': 'modelSelectA',
        'loaded_layer1b_model': 'modelSelectB',
        'loaded_layer0_model': 'modelSelectLayer0',
        'loaded_layer2_model': 'modelSelectLayer2'
    };
    
    for (const [storageKey, elementId] of Object.entries(loadedModels)) {
        const modelValue = sessionStorage.getItem(storageKey);
        if (modelValue) {
            const selectElement = document.getElementById(elementId);
            if (selectElement) {
                selectElement.value = modelValue;
            }
            sessionStorage.removeItem(storageKey);
        }
    }

    const loadedLayer1LastBestContext = sessionStorage.getItem('loaded_layer1_last_best_context_enabled');
    if (loadedLayer1LastBestContext !== null) {
        setLayer1LastBestContext(loadedLayer1LastBestContext === 'true');
        sessionStorage.removeItem('loaded_layer1_last_best_context_enabled');
    }

    const loadedGradeVsPromptMode = sessionStorage.getItem('loaded_grade_vs_prompt_mode');
    if (loadedGradeVsPromptMode !== null) {
        setGradeVsPromptMode(loadedGradeVsPromptMode === 'first' ? 'first' : 'current');
        sessionStorage.removeItem('loaded_grade_vs_prompt_mode');
    }

    var loadedGraderSetting = sessionStorage.getItem('loaded_grader_setting_name');
    if (loadedGraderSetting !== null) {
        var graderSelect = document.getElementById('graderSettingSelect');
        if (graderSelect) {
            graderSelect.value = loadedGraderSetting;
            applyGraderSetting(loadedGraderSetting);
        }
        sessionStorage.removeItem('loaded_grader_setting_name');
    }
    
    // Color model options
    colorizeModelOptions();
    
    // Apply system type filtering
    const savedSystemType = localStorage.getItem('systemType') || 'powerful';
    updateModelVisibility(savedSystemType);
    
    // Update weight percentages on input
    const weightInputs = document.querySelectorAll('.weight-input');
    weightInputs.forEach(input => {
        input.addEventListener('input', updateWeightPercentages);
    });
    
    // Update advanced sidebar iterations when max_iterations changes
    const maxIterationsInput = document.querySelector('input[name="max_iterations"]');
    if (maxIterationsInput) {
        maxIterationsInput.addEventListener('change', function() {
            updateAdvancedSidebarIterations();
            colorizeModelOptions();
            const savedSystemType = localStorage.getItem('systemType') || 'powerful';
            updateModelVisibility(savedSystemType);
        });
    }
    
    // Close download modal on background click
    const downloadModal = document.getElementById('downloadModal');
    if (downloadModal) {
        downloadModal.addEventListener('click', function(e) {
            if (e.target === this) {
                closeDownloadModal();
            }
        });
    }
});

// Processing screen functionality - submit async and show processing page
document.getElementById('analysisForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const prompt = document.getElementById('prompt').value.trim();
    
    if (!prompt) {
        alert('Please enter a prompt before running analysis.');
        return;
    }
    
    // Store the current prompt in localStorage for restoration after processing
    localStorage.setItem('lastPrompt', prompt);
    
    // Submit form via AJAX (non-blocking)
    const formData = new FormData(document.getElementById('analysisForm'));
    fetch('/', {method: 'POST', body: formData}).catch(() => {});
    
    // Show processing screen immediately (not overlay)
    showProcessingScreen();
});

function showProcessingScreen() {
    const main = document.querySelector('.main-layout');

    window.lastDisplayedIteration = 1;
    window.lastDisplayedModelsExecuted = 0;
    
    let promptNum = 1;
    
    fetch('/get_backup_data')
        .then(response => response.json())
        .then(data => {
            if (data.success && data.backup_data) {
                const historyCount = data.backup_data.prompt_history ? data.backup_data.prompt_history.length : 0;
                const iterHistoryCount = data.backup_data.iteration_history && data.backup_data.iteration_history.prompts 
                    ? Object.keys(data.backup_data.iteration_history.prompts).length 
                    : 0;
                promptNum = Math.max(historyCount, iterHistoryCount) + 1;
            }
            displayProcessingScreen(promptNum);
        })
        .catch(() => {
            if (iterationHistory && iterationHistory.prompts) {
                const promptKeys = Object.keys(iterationHistory.prompts);
                if (promptKeys.length > 0) {
                    const lastPromptNum = Math.max(...promptKeys.map(key => {
                        const data = iterationHistory.prompts[key];
                        return data.prompt_number || parseInt(key.replace('prompt_', '')) || 0;
                    }));
                    promptNum = lastPromptNum + 1;
                }
            }
            displayProcessingScreen(promptNum);
        });
}

function displayProcessingScreen(promptNum) {
    const main = document.querySelector('.main-layout');
    
    main.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; width: 100%; height: 100vh; background: linear-gradient(135deg, #050209 0%, #0f0620 25%, #1a0f2e 50%, #0d0620 75%, #050209 100%) fixed; position: fixed; top: 0; left: 0; z-index: 10000;">
            <style>
                @keyframes pulse { 0%, 100% { box-shadow: 0 15px 35px rgba(102, 126, 234, 0.3); } 50% { box-shadow: 0 15px 50px rgba(102, 126, 234, 0.6); } }
            </style>
            <div style="width: 720px; height: 720px; border-radius: 50%; background-image: url('/static/login-background.gif'); background-size: cover; background-position: center; background-repeat: no-repeat; display: flex; align-items: center; justify-content: center; padding: 12px; box-sizing: border-box;">
                <div style="width: 450px; height: 450px; border-radius: 50%; background: rgba(255, 255, 255, 0.15); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); padding: 40px; box-shadow: 0 25px 50px rgba(0, 0, 0, 0.15); display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden;">
                    <div style="width: 140px; height: 140px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; box-shadow: 0 15px 35px rgba(102, 126, 234, 0.3); border: 3px solid rgba(255, 255, 255, 0.2); animation: pulse 3s ease-in-out infinite;">
                        <div style="font-family: 'Dancing Script', cursive; color: #ffffff; font-size: 1.8rem; font-weight: 700; text-shadow: 0 4px 20px rgba(0,0,0,0.2); text-align: center; letter-spacing: -0.5px;">LLM🔍InSights</div>
                    </div>
                <h2 style="color: white; margin: 8px 0; font-size: 18px;">🔄 Processing Analysis</h2>
                <p style="color: white; font-size: 12px; margin: 3px 0;">Prompt: ${promptNum}</p>
                <p style="color: white; font-size: 12px; margin: 3px 0;">Iteration: <span id="currentIteration">1</span></p>
                <p style="color: white; font-size: 12px; margin: 3px 0;">Model Runs completed: <span id="modelsExecuted">0</span></p>
                <p style="color: white; font-size: 12px; margin: 3px 0;">Elapsed time: <span id="elapsedSeconds">0</span>s</p>
                </div>
            </div>
        </div>
    `;
    
    if (!window.processingStartTime) {
        window.processingStartTime = Date.now();
    }
    
    window.processingTimerId = setInterval(() => {
        const elapsedMs = Date.now() - window.processingStartTime;
        const seconds = Math.floor(elapsedMs / 1000);
        const elem = document.getElementById('elapsedSeconds');
        if (elem) elem.textContent = seconds;
    }, 1000);
    
    pollProcessing();
}

function pollProcessing() {
    const checkInterval = setInterval(() => {
        fetch('/is-processing').then(r => r.json()).then(processingData => {
            fetch('/iteration').then(r => r.json()).then(iterationData => {
                const reportedIteration = Number(iterationData.iteration);
                const normalizedIteration = Number.isFinite(reportedIteration)
                    ? Math.max(0, Math.floor(reportedIteration))
                    : 0;
                const visibleIteration = processingData.processing
                    ? Math.max(1, normalizedIteration)
                    : normalizedIteration;
                window.lastDisplayedIteration = Math.max(Number(window.lastDisplayedIteration) || 1, visibleIteration);

                const reportedModelsExecuted = Number(processingData.models_executed);
                const normalizedModelsExecuted = Number.isFinite(reportedModelsExecuted)
                    ? Math.max(0, Math.floor(reportedModelsExecuted))
                    : 0;
                window.lastDisplayedModelsExecuted = Math.max(Number(window.lastDisplayedModelsExecuted) || 0, normalizedModelsExecuted);

                const iterElem = document.getElementById('currentIteration');
                if (iterElem) {
                    iterElem.textContent = window.lastDisplayedIteration;
                }
                const modelsElem = document.getElementById('modelsExecuted');
                if (modelsElem) {
                    modelsElem.textContent = window.lastDisplayedModelsExecuted;
                }
                if (!processingData.processing) {
                    clearInterval(checkInterval);
                    if (window.processingTimerId) clearInterval(window.processingTimerId);
                    delete window.processingStartTime;
                    fetch('/iteration').then(r => r.json()).then(finalData => {
                        const finalIterElem = document.getElementById('currentIteration');
                        if (finalIterElem) {
                            const finalReportedIteration = Number(finalData.iteration);
                            const finalIteration = Number.isFinite(finalReportedIteration)
                                ? Math.max(0, Math.floor(finalReportedIteration))
                                : 0;
                            finalIterElem.textContent = Math.max(finalIteration, Number(window.lastDisplayedIteration) || 0);
                        }
                        setTimeout(() => window.location.reload(), 500);
                    }).catch(() => {
                        setTimeout(() => window.location.reload(), 500);
                    });
                }
            });
        }).catch(() => {});
    }, 2000);
}

// Reset button state on page load
window.addEventListener('load', function() {
    const analyzeBtn = document.getElementById('analyzeBtn');
    if (analyzeBtn) {
        analyzeBtn.disabled = false;
        analyzeBtn.textContent = '🎯 START ANALYSIS 🎯';
    }
    
    updateUploadButtonState();
});

function showDownloadOptions() {
    const consoleDiv = document.querySelector('.console-output');
    if (!consoleDiv) {
        alert('No console output to download');
        return;
    }
    
    const consoleText = consoleDiv.innerText;
    if (!consoleText.trim()) {
        alert('Console output is empty');
        return;
    }
    
    document.getElementById('downloadModal').style.display = 'flex';
}

function closeDownloadModal() {
    document.getElementById('downloadModal').style.display = 'none';
}

function saveSelectionsAndNavigate(url) {
    fetch('/save_current_selection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            window.location.href = url;
        } else {
            console.warn('Failed to save selections, navigating anyway');
            window.location.href = url;
        }
    })
    .catch(error => {
        console.warn('Error saving selections:', error);
        window.location.href = url;
    });
}

function downloadAsText() {
    const consoleDiv = document.querySelector('.console-output');
    const consoleText = consoleDiv.innerText;
    
    const blob = new Blob([consoleText], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', 'console_output_' + new Date().toISOString().replace(/[:.]/g, '-') + '.txt');
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
    closeDownloadModal();
}

function downloadAsJson() {
    const consoleDiv = document.querySelector('.console-output');
    const consoleText = consoleDiv.innerText;
    
    fetch('/get_backup_data')
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                const backupData = result.backup_data;
                
                const jsonData = {
                    console_output: consoleText,
                    prompt_history: backupData.prompt_history || [],
                    all_prompt_results: backupData.all_prompt_results || [],
                    iteration_history: backupData.iteration_history || {},
                    best_best_cache: backupData.best_best_cache || {},
                    ledger_entries: backupData.ledger_entries || [],
                    session_data: {
                        current_weights: backupData.session_data.current_weights || {},
                        layer1a_model: backupData.session_data.layer1a_model || '',
                        layer1b_model: backupData.session_data.layer1b_model || '',
                        layer0_model: backupData.session_data.layer0_model || '',
                        layer2_model: backupData.session_data.layer2_model || '',
                        layer3_graders: backupData.session_data.layer3_graders || {},
                        advanced_layer1a_models: backupData.session_data.advanced_layer1a_models || {},
                        advanced_layer1b_models: backupData.session_data.advanced_layer1b_models || {},
                        advanced_layer2_models: backupData.session_data.advanced_layer2_models || {},
                        degradation_break_enabled: backupData.session_data.degradation_break_enabled !== false,
                        change_prompt_between_layers1: backupData.session_data.change_prompt_between_layers1 !== false,
                        give_ideas_enabled: backupData.session_data.give_ideas_enabled !== false,
                        layer1_last_best_context_enabled: backupData.session_data.layer1_last_best_context_enabled !== false,
                        grade_vs_prompt_mode: backupData.session_data.grade_vs_prompt_mode === 'first' ? 'first' : 'current',
                        grader_setting_name: backupData.session_data.grader_setting_name || 'default',
                        min_grade: backupData.session_data.min_grade || 100,
                        max_iterations: backupData.session_data.max_iterations || 5
                    },
                    timestamp: new Date().toISOString(),
                    version: "2.0"
                };
                
                const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json;charset=utf-8' });
                const link = document.createElement('a');
                const url = URL.createObjectURL(blob);
                
                link.setAttribute('href', url);
                link.setAttribute('download', 'chat_backup_complete_' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
                link.style.visibility = 'hidden';
                
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                URL.revokeObjectURL(url);
                closeDownloadModal();
                
                console.log('✅ Complete chat backup downloaded with all continuity data');
            } else {
                alert('Failed to gather backup data: ' + result.error);
            }
        })
        .catch(error => {
            console.error('Error getting backup data:', error);
            alert('Error preparing backup: ' + error.message);
        });
}

function getSessionWeights() {
    const weights = {};
    const weightInputs = document.querySelectorAll('.weight-input');
    weightInputs.forEach(input => {
        weights[input.dataset.category] = parseFloat(input.value || 0) / 100;
    });
    return weights;
}

function getSessionLayer1aModel() {
    return document.getElementById('modelSelectA')?.value || 'default';
}

function getSessionLayer1bModel() {
    return document.getElementById('modelSelectB')?.value || 'default';
}

function triggerJsonUpload() {
    document.getElementById('jsonFileInput').click();
}

function handleJsonUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const jsonData = JSON.parse(e.target.result);
            
            fetch('/upload_chat_json', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ chat_data: jsonData })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    alert('Chat restored successfully! Reloading...');
                    setTimeout(() => {
                        window.location.reload();
                    }, 1000);
                } else {
                    alert('Error: ' + (data.error || 'Failed to upload chat'));
                }
            })
            .catch(error => {
                alert('Error uploading chat: ' + error.message);
            });
        } catch (error) {
            alert('Invalid JSON file: ' + error.message);
        }
    };
    reader.readAsText(file);
    
    event.target.value = '';
}

function updateUploadButtonState() {
    const uploadBtn = document.getElementById('uploadJsonBtn');
    const consoleDiv = document.querySelector('.console-output');
    const consoleText = consoleDiv?.innerText || '';
    
    if (consoleText.trim() === '') {
        uploadBtn.style.background = 'linear-gradient(135deg, #6c757d 0%, #5a6268 100%)';
        uploadBtn.style.boxShadow = '0 2px 8px rgba(108, 117, 125, 0.2)';
        uploadBtn.disabled = false;
    } else {
        uploadBtn.style.background = 'linear-gradient(135deg, #6c757d 0%, #5a6268 100%)';
        uploadBtn.style.boxShadow = '0 2px 8px rgba(108, 117, 125, 0.2)';
        uploadBtn.disabled = true;
    }
}

function applyModelA() {
    const selectedModel = document.getElementById('modelSelectA').value;
    
    fetch('/update_layer1a_model', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: selectedModel })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            if (data.warning) {
                showModelStatusA('⚠️ ' + data.warning, 'warning');
            } else {
                showModelStatusA('Layer1A model updated: ' + data.model, 'success');
            }
        } else {
            showModelStatusA('Error: ' + data.error, 'error');
        }
    })
    .catch(error => {
        showModelStatusA('Network error: ' + error.message, 'error');
    });
}

function resetModelA() {
    fetch('/reset_layer1a_model', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showModelStatusA('Reset to default model: ' + data.model, 'default');
            document.getElementById('modelSelectA').value = data.model;
        } else {
            showModelStatusA('Error: ' + data.error, 'error');
        }
    })
    .catch(error => {
        showModelStatusA('Network error: ' + error.message, 'error');
    });
}

function showModelStatusA(message, type) {
    const statusDiv = document.getElementById('modelStatusA');
    statusDiv.textContent = message;
    statusDiv.className = 'model-status ' + type;
}

function applyModelB() {
    const selectedModel = document.getElementById('modelSelectB').value;
    
    fetch('/update_layer1b_model', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: selectedModel })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            if (data.warning) {
                showModelStatusB('⚠️ ' + data.warning, 'warning');
            } else {
                showModelStatusB('Layer1B model updated: ' + data.model, 'success');
            }
        } else {
            showModelStatusB('Error: ' + data.error, 'error');
        }
    })
    .catch(error => {
        showModelStatusB('Network error: ' + error.message, 'error');
    });
}

function resetModelB() {
    fetch('/reset_layer1b_model', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showModelStatusB('Reset to default model: ' + data.model, 'default');
            document.getElementById('modelSelectB').value = data.model;
        } else {
            showModelStatusB('Error: ' + data.error, 'error');
        }
    })
    .catch(error => {
        showModelStatusB('Network error: ' + error.message, 'error');
    });
}

function showModelStatusB(message, type) {
    const statusDiv = document.getElementById('modelStatusB');
    statusDiv.textContent = message;
    statusDiv.className = 'model-status ' + type;
}

function applyModelLayer0() {
    const selectedModel = document.getElementById('modelSelectLayer0').value;
    
    fetch('/update_layer0_model', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: selectedModel })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showModelStatusLayer0('Layer0 model updated: ' + data.model, 'success');
        } else {
            showModelStatusLayer0('Error: ' + data.error, 'error');
        }
    })
    .catch(error => {
        showModelStatusLayer0('Network error: ' + error.message, 'error');
    });
}

function resetModelLayer0() {
    fetch('/reset_layer0_model', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showModelStatusLayer0('Reset to default model: ' + data.model, 'default');
            document.getElementById('modelSelectLayer0').value = data.model;
        } else {
            showModelStatusLayer0('Error: ' + data.error, 'error');
        }
    })
    .catch(error => {
        showModelStatusLayer0('Network error: ' + error.message, 'error');
    });
}

function showModelStatusLayer0(message, type) {
    const statusDiv = document.getElementById('modelStatusLayer0');
    statusDiv.textContent = message;
    statusDiv.className = 'model-status ' + type;
}

function applyModelLayer2() {
    const selectedModel = document.getElementById('modelSelectLayer2').value;
    
    fetch('/update_layer2_model', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: selectedModel })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showModelStatusLayer2('Layer2 model updated: ' + data.model, 'success');
        } else {
            showModelStatusLayer2('Error: ' + data.error, 'error');
        }
    })
    .catch(error => {
        showModelStatusLayer2('Network error: ' + error.message, 'error');
    });
}

function resetModelLayer2() {
    fetch('/reset_layer2_model', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showModelStatusLayer2('Reset to default model: ' + data.model, 'default');
            document.getElementById('modelSelectLayer2').value = data.model;
        } else {
            showModelStatusLayer2('Error: ' + data.error, 'error');
        }
    })
    .catch(error => {
        showModelStatusLayer2('Network error: ' + error.message, 'error');
    });
}

function showModelStatusLayer2(message, type) {
    const statusDiv = document.getElementById('modelStatusLayer2');
    statusDiv.textContent = message;
    statusDiv.className = 'model-status ' + type;
}

function applyGraderSetting(name) {
    fetch('/set_grader_setting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        if (data.success) {
            var config = data.config;

            if (config && config.keys) {
                DEEPER_ANALYSIS_GRADE_KEYS = config.keys;
                var equalW = {};
                config.keys.forEach(function(k) { equalW[k] = config.weights ? (config.weights[k] || (1 / config.keys.length)) : (1 / config.keys.length); });
                DEEPER_ANALYSIS_DEFAULT_WEIGHTS = equalW;
            }

            currentGraderConfigWeights = (name !== 'default' && config && config.weights) ? Object.assign({}, config.weights) : null;

            if (config && config.weights) {
                var container = document.getElementById('weightInputsCompact');
                if (container) {
                    var html = '';
                    var keys = config.keys || Object.keys(config.weights);
                    keys.forEach(function(k) {
                        var w = config.weights[k] || 0;
                        var pct = Math.round(w * 100);
                        html += '<div class="weight-item-compact">' +
                            '<span class="weight-label-compact">' + k + '</span>' +
                            '<input type="number" class="weight-input" data-category="' + k + '" data-weight-input="' + k + '" value="' + pct + '" min="0" max="100" step="1" onchange="checkManualWeightChanges()" oninput="updateWeightSumIndicator()" onkeypress="return event.key !== \'Enter\'">' +
                            '<span style="font-size: 0.75rem; color: rgba(255,255,255,0.7);">%</span>' +
                            '</div>';
                    });
                    container.innerHTML = html;
                    updateWeightSumIndicator();
                }
            }
        }
    })
    .catch(function(e) { console.error('Error setting grader:', e); });
}

// Weight control functions
function updateWeightPercentages() {}

function updateWeightSumIndicator() {
    var indicator = document.getElementById('weightSumIndicator');
    if (!indicator) return;
    var inputs = document.querySelectorAll('.weight-input');
    var sum = 0;
    inputs.forEach(function(input) { sum += parseFloat(input.value || 0); });
    indicator.textContent = Math.round(sum) + '%';
    indicator.style.color = Math.round(sum) === 100 ? '#2ecc71' : '#e74c3c';
}

function applyWeights() {
    const weights = {};
    const weightInputs = document.querySelectorAll('.weight-input');
    let total = 0;
    
    // Collect weights and calculate total
    weightInputs.forEach(input => {
        const category = input.dataset.category;
        const value = parseFloat(input.value || 0) / 100;
        weights[category] = value;
        total += value;
    });
    
    // Validate total
    if (Math.abs(total - 1.0) > 0.01) {
        showWeightStatus('Weights must sum to 100 (currently: ' + Math.round(total * 100) + ')', 'error');
        return;
    }
    
    const consoleDiv = document.querySelector('.console-output');
    const currentConsoleContent = consoleDiv ? consoleDiv.innerHTML : null;
    
    fetch('/update_weights', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ weights: weights })
    })
    .then(response => response.json())
    .then(data => {
        if (currentConsoleContent && consoleDiv) {
            consoleDiv.innerHTML = currentConsoleContent;
        }
        
        if (data.success) {
            const manualIndicatorTop = document.getElementById('manualIndicatorTop');
            const isManual = manualIndicatorTop && manualIndicatorTop.style.display !== 'none';
            
            const profileNames = {
                'balanced': 'Balanced',
                'accuracy': 'Accuracy-heavy',
                'creativity': 'Creativity-heavy',
                'conciseness': 'Conciseness-heavy'
            };
            const displayName = profileNames[currentGradeWeightsProfile] || currentGradeWeightsProfile;
            const statusMsg = isManual ? 'Manual weights applied' : `${displayName} selected`;
            showWeightStatus(statusMsg, 'success');
            if (data.prompt_history_preserved) {
                console.log(`✅ Domain change complete - ${data.prompt_history_preserved} prompts preserved`);
            }
            if (data.weights) {
                weightInputs.forEach(input => {
                    const category = input.dataset.category;
                    if (data.weights[category] !== undefined) {
                        input.value = Math.round(data.weights[category] * 100);
                    }
                });
            }
        } else {
            showWeightStatus('Error: ' + data.error, 'error');
        }
    })
    .catch(error => {
        if (currentConsoleContent && consoleDiv) {
            consoleDiv.innerHTML = currentConsoleContent;
        }
        showWeightStatus('Network error: ' + error.message, 'error');
        console.error('Error applying weights:', error);
    });
}

function resetWeights() {
    let weights;
    let displayName;

    if (currentGraderConfigWeights) {
        weights = currentGraderConfigWeights;
        const graderSelect = document.getElementById('graderSettingSelect');
        displayName = graderSelect ? graderSelect.value : 'grader config';
    } else {
        const profileName = currentGradeWeightsProfile;
        weights = GRADE_WEIGHTS[profileName];
        const profileNames = {
            'balanced': 'Balanced',
            'accuracy': 'Accuracy-heavy',
            'creativity': 'Creativity-heavy',
            'conciseness': 'Conciseness-heavy'
        };
        displayName = profileNames[profileName] || profileName;
    }

    if (!weights) {
        showWeightStatus('Error: Profile not found', 'error');
        return;
    }

    updateSidebarWeights(weights);
    updateWeightPercentages();
    checkManualWeightChanges();
    showWeightStatus(`Reset to ${displayName} weights`, 'default');
}

function showWeightStatus(message, type) {
    const statusDiv = document.getElementById('weightStatus');
    if (!statusDiv) return;
    statusDiv.textContent = message;
    // Handle both old and compact status classes
    const baseClass = statusDiv.classList.contains('weight-status-compact') ? 'weight-status-compact' : 'weight-status';
    statusDiv.className = baseClass + ' ' + type;
}

function closeDeeperAnalysisModal() {
    const modal = document.getElementById('deeperAnalysisModal');
    if (modal) {
        modal.classList.remove('show');
        console.log('Modal closed');
    }
}

function openDeeperAnalysis(promptNumber, iterations) {
    console.log('openDeeperAnalysis called with:', promptNumber, iterations);
    try {
        if (!iterations || iterations.length === 0) {
            console.error('No iteration data available');
            alert('No iteration data available');
            return;
        }
        
        var detectedKeys = null;
        for (var ii = 0; ii < iterations.length; ii++) {
            var it = iterations[ii];
            var g = (it && it.best_grades) || (it && it.layer1a_grades) || (it && it.layer1b_grades) || null;
            if (g && Object.keys(g).length > 0) { detectedKeys = Object.keys(g); break; }
        }
        if (detectedKeys && detectedKeys.length > 0) {
            DEEPER_ANALYSIS_GRADE_KEYS = detectedKeys;
            if (Object.keys(DEEPER_ANALYSIS_DEFAULT_WEIGHTS).sort().join(',') !== detectedKeys.sort().join(',')) {
                var equalW = {};
                detectedKeys.forEach(function(k) { equalW[k] = 1.0 / detectedKeys.length; });
                DEEPER_ANALYSIS_DEFAULT_WEIGHTS = equalW;
            }
        }
        const grading_keys = DEEPER_ANALYSIS_GRADE_KEYS;
        const initialWeights = getDeeperAnalysisInitialWeights();
        deeperAnalysisOriginalWeights = { ...initialWeights };
        let html = '';
        
        var graderSettingEl = document.getElementById('graderSettingSelect');
        var activeGraderName = graderSettingEl ? graderSettingEl.value : 'default';
        html += '<div style="margin-bottom: 12px; padding: 8px 14px; background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.15) 100%); border-radius: 8px; border-left: 4px solid #764ba2; display: flex; align-items: center; gap: 8px;">';
        html += '<span style="font-size: 0.85rem; font-weight: 700; color: #2d3436;">📋 Grader Setting:</span>';
        html += '<span style="font-size: 0.85rem; color: #6c5ce7; font-weight: 600;">' + activeGraderName + '</span>';
        html += '</div>';
        html += '<div class="deeper-analysis-section">';
        html += '<h3>📊 Average Grade Analysis</h3>';
        html += renderDeeperAnalysisWeightControls(initialWeights);
        html += '<div class="deeper-analysis-charts">';
        html += '<div class="deeper-analysis-chart-container">';
        html += '<canvas id="deeperAnalysisAvgChart"></canvas>';
        html += '</div>';
        html += '<div class="deeper-analysis-chart-container">';
        html += '<canvas id="deeperAnalysisRadarChart"></canvas>';
        html += '</div>';
        html += '</div>';
        html += '</div>';
        
        const hasTokenData = iterations.some(it => it.all_tools_token_usage && Object.keys(it.all_tools_token_usage).length > 0);
        html += '<div class="deeper-analysis-section">';
        html += '<h3>🔤 Token Usage & ⏱️ Runtime Analysis</h3>';
        html += '<div class="deeper-analysis-charts">';
        if (hasTokenData) {
            html += '<div class="deeper-analysis-chart-container">';
            html += '<h4 style="margin: 0 0 10px 0; color: #2d3436; font-size: 1rem; font-weight: 700;">🔤 Token Usage Analysis</h4>';
            html += '<canvas id="deeperAnalysisTokenChart" style="max-height: 240px; min-height: 200px;"></canvas>';
            html += '</div>';
        }
        html += '<div class="deeper-analysis-chart-container">';
        html += '<h4 style="margin: 0 0 10px 0; color: #2d3436; font-size: 1rem; font-weight: 700;">⏱️ Runtime Analysis</h4>';
        html += '<canvas id="deeperAnalysisRuntimeChart" style="max-height: 240px; min-height: 200px;"></canvas>';
        html += '</div>';
        html += '</div>';
        html += '</div>';
        
        html += '<div class="deeper-analysis-section">';
        html += '<h3>🎯 Individual Grading Key Analysis</h3>';
        html += '<div class="deeper-analysis-charts">';
        
        for (let key of grading_keys) {
            html += '<div class="deeper-analysis-chart-container">';
            html += `<canvas id="deeperAnalysisChart_${key}"></canvas>`;
            html += '</div>';
        }
        
        html += '</div>';
        html += '</div>';
        
        const modal = document.getElementById('deeperAnalysisModal');
        const body = document.getElementById('deeperAnalysisBody');
        
        if (!modal) {
            console.error('Modal element not found!');
            alert('Error: Modal element not found');
            return;
        }
        if (!body) {
            console.error('Modal body element not found!');
            alert('Error: Modal body element not found');
            return;
        }
        
        body.innerHTML = html;

        const avgSection = body.querySelector('.deeper-analysis-section');
        if (avgSection && !body.querySelector('#deeperAnalysisWeightControls')) {
            avgSection.insertAdjacentHTML('beforeend', renderDeeperAnalysisWeightControls(initialWeights));
        }
        updateDeeperAnalysisWeightIndicator();

        modal.classList.add('show');
        console.log('Modal opened successfully, class:', modal.className);
        
        setTimeout(() => {
            createDeeperAnalysisCharts(promptNumber, iterations, grading_keys);
        }, 100);
        
        window.currentDeeperAnalysisData = {
            promptNumber: promptNumber,
            iterations: iterations,
            grading_keys: grading_keys
        };
        
    } catch (e) {
        console.error('Error opening deeper analysis:', e);
        alert('Error opening analysis. Check console for details.');
    }
}

function updateDeeperAnalysisModal(promptNumber, iterations) {
    const modal = document.getElementById('deeperAnalysisModal');
    if (modal && modal.classList.contains('show')) {
        openDeeperAnalysis(promptNumber, iterations);
    }
}

function createDeeperAnalysisCharts(promptNumber, iterations, grading_keys) {
    console.log('Creating deeper analysis charts...');
    try {
        if (!window.Chart) {
            console.error('Chart.js not loaded');
            return;
        }
        
        console.log('Chart.js is available, proceeding with chart creation');
        const avgCtx = document.getElementById('deeperAnalysisAvgChart');
        if (avgCtx) {
            const labels = iterations.map(it => 'Iter ' + it.iteration);
            const layer1aModel = iterations[0].layer1a_model_used || 'Model 1';
            const layer1bModel = iterations[0].layer1b_model_used || 'Model 2';

            let degradationFlags = [];
            let bestFlags = [];

            const buildAverageSeries = () => {
                const weights = getDeeperAnalysisModalWeights();
                const layer1aScores = iterations.map(it => {
                    if (it.layer1a_grades && Object.keys(it.layer1a_grades).length > 0) {
                        return calculateDeeperAnalysisWeightedScore(it.layer1a_grades, weights);
                    }
                    return parseFloat(it.layer1a_score || 0) || 0;
                });
                const layer1bScores = iterations.map(it => {
                    if (it.layer1b_grades && Object.keys(it.layer1b_grades).length > 0) {
                        return calculateDeeperAnalysisWeightedScore(it.layer1b_grades, weights);
                    }
                    return parseFloat(it.layer1b_score || 0) || 0;
                });
                const winners = layer1aScores.map((scoreA, index) => Math.max(scoreA, layer1bScores[index]));
                const nextDegradationFlags = winners.map((score, index) => index > 0 && score < winners[index - 1]);
                const maxWinner = winners.length > 0 ? Math.max(...winners) : 0;
                const nextBestFlags = winners.map(score => score === maxWinner);

                return {
                    layer1aScores,
                    layer1bScores,
                    winners,
                    degradationFlags: nextDegradationFlags,
                    bestFlags: nextBestFlags
                };
            };

            const getBestBestSnapshot = () => {
                const getIterationAverage = (it) => {
                    const avgValue = parseFloat(it && it.average);
                    if (!isNaN(avgValue)) return avgValue;
                    const bestScoreValue = parseFloat(it && it.best_score);
                    if (!isNaN(bestScoreValue)) return bestScoreValue;
                    const scoreA = parseFloat((it && it.layer1a_score) || 0);
                    const scoreB = parseFloat((it && it.layer1b_score) || 0);
                    return Math.max(!isNaN(scoreA) ? scoreA : 0, !isNaN(scoreB) ? scoreB : 0);
                };

                const seriesForBestSelection = buildAverageSeries();
                const winners = seriesForBestSelection.winners || [];
                const maxWinner = winners.length > 0 ? Math.max(...winners) : -Infinity;

                let bestIteration = null;
                if (winners.length > 0 && maxWinner > -Infinity) {
                    let bestIndex = -1;
                    winners.forEach((value, idx) => {
                        if (value === maxWinner) bestIndex = idx;
                    });
                    if (bestIndex >= 0) {
                        bestIteration = iterations[bestIndex] || null;
                    }
                }

                if (!bestIteration) {
                    bestIteration = iterations.reduce((best, current) => {
                        if (!best) return current;
                        const bestAvg = getIterationAverage(best);
                        const currentAvg = getIterationAverage(current);
                        if (currentAvg > bestAvg) return current;
                        if (currentAvg < bestAvg) return best;
                        const bestIterNum = parseInt(best && best.iteration, 10) || 0;
                        const currentIterNum = parseInt(current && current.iteration, 10) || 0;
                        return currentIterNum >= bestIterNum ? current : best;
                    }, null);
                }

                const safeBestIteration = bestIteration || {};
                let grades = {};

                if (safeBestIteration.scores && Object.keys(safeBestIteration.scores).length > 0) {
                    grades = safeBestIteration.scores;
                } else {
                    const winner = (safeBestIteration.winner || '').toString().trim().toLowerCase();
                    const scoreA = parseFloat(safeBestIteration.layer1a_score);
                    const scoreB = parseFloat(safeBestIteration.layer1b_score);

                    if (winner === 'improved') {
                        grades = safeBestIteration.layer1b_grades || {};
                    } else if (winner === 'original') {
                        grades = safeBestIteration.layer1a_grades || {};
                    } else if (!isNaN(scoreA) && !isNaN(scoreB)) {
                        grades = scoreB >= scoreA ? (safeBestIteration.layer1b_grades || {}) : (safeBestIteration.layer1a_grades || {});
                    } else if (safeBestIteration.layer1b_grades && Object.keys(safeBestIteration.layer1b_grades).length > 0) {
                        grades = safeBestIteration.layer1b_grades;
                    } else {
                        grades = safeBestIteration.layer1a_grades || {};
                    }
                }

                const normalizedGrades = {};
                DEEPER_ANALYSIS_GRADE_KEYS.forEach(key => {
                    const value = parseFloat(grades[key]);
                    normalizedGrades[key] = !isNaN(value) ? value : 0;
                });

                const avgFromIteration = getIterationAverage(safeBestIteration);
                const baseAvg = !isNaN(avgFromIteration)
                    ? avgFromIteration
                    : (DEEPER_ANALYSIS_GRADE_KEYS.reduce((sum, key) => sum + normalizedGrades[key], 0) / DEEPER_ANALYSIS_GRADE_KEYS.length);

                return { grades: normalizedGrades, baseAvg };
            };

            const buildRadarSeries = () => {
                const bestBest = getBestBestSnapshot();
                const weights = getDeeperAnalysisModalWeights();

                return {
                    labels: DEEPER_ANALYSIS_GRADE_KEYS.map(key => key.charAt(0).toUpperCase() + key.slice(1)),
                    bestBestGrades: DEEPER_ANALYSIS_GRADE_KEYS.map(key => bestBest.grades[key] || 0),
                    baseAvg: bestBest.baseAvg,
                    weightedAvg: calculateDeeperAnalysisWeightedScore(bestBest.grades, weights)
                };
            };

            const series = buildAverageSeries();
            const radarSeries = buildRadarSeries();
            degradationFlags = series.degradationFlags;
            bestFlags = series.bestFlags;

            const ctx = avgCtx.getContext('2d');
            if (window.ChartDataLabels) {
                window.Chart.register(window.ChartDataLabels);
            }
            if (deeperAnalysisAvgChart) {
                deeperAnalysisAvgChart.destroy();
            }
            deeperAnalysisAvgChart = new Chart(ctx, {
                plugins: [ChartDataLabels],
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: layer1aModel,
                            data: series.layer1aScores,
                            backgroundColor: '#0984E3',
                            borderColor: '#0984E3',
                            borderWidth: 0,
                            borderRadius: 6,
                            yAxisID: 'y'
                        },
                        {
                            label: layer1bModel,
                            data: series.layer1bScores,
                            backgroundColor: '#E84393',
                            borderColor: '#E84393',
                            borderWidth: 0,
                            borderRadius: 6,
                            yAxisID: 'y'
                        },
                        {
                            label: 'Winner Score',
                            data: series.winners,
                            borderColor: function(context) {
                                const idx = context.dataIndex;
                                if (degradationFlags[idx]) return '#DC3545';
                                return '#00B894';
                            },
                            backgroundColor: function(context) {
                                const idx = context.dataIndex;
                                if (degradationFlags[idx]) return 'rgba(220, 53, 69, 0.15)';
                                return 'rgba(0, 184, 148, 0.15)';
                            },
                            borderWidth: 4,
                            type: 'line',
                            fill: false,
                            tension: 0.45,
                            pointRadius: 7,
                            pointHoverRadius: 9,
                            pointBackgroundColor: function(context) {
                                const idx = context.dataIndex;
                                if (bestFlags[idx]) return '#FFC107';
                                if (degradationFlags[idx]) return '#DC3545';
                                return '#00B894';
                            },
                            pointBorderColor: '#FFFFFF',
                            pointBorderWidth: 3,
                            yAxisID: 'y',
                            segment: {
                                borderDash: ctx => ctx.p0?.y > ctx.p1?.y ? [5, 5] : []
                            }
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    interaction: {
                        intersect: false,
                        mode: 'index'
                    },
                    plugins: {
                        legend: { display: true, position: 'bottom', labels: {font: {size: 13, weight: 600}, padding: 15, usePointStyle: true, boxWidth: 8} },
                        datalabels: {
                            display: true,
                            formatter: function(value, context) {
                                if (value === null || value === undefined) return '';
                                const numericValue = parseFloat(value);
                                return isNaN(numericValue) ? value : numericValue.toFixed(2);
                            },
                            color: '#000000',
                            backgroundColor: 'rgba(255, 255, 255, 0.8)',
                            borderRadius: 4,
                            padding: 4,
                            font: {
                                size: 13,
                                weight: 'bold'
                            },
                            anchor: 'top',
                            offset: function(context) {
                                return context.datasetIndex === 2 ? 12 : 6;
                            }
                        },
                        tooltip: {
                            backgroundColor: 'rgba(0, 0, 0, 0.85)',
                            padding: 13,
                            titleFont: {size: 13, weight: 'bold'},
                            bodyFont: {size: 12},
                            borderColor: 'rgba(255, 255, 255, 0.4)',
                            borderWidth: 2,
                            borderRadius: 6,
                            boxPadding: 8
                        }
                    },
                    scales: {
                        y: {
                            type: 'linear',
                            position: 'left',
                            beginAtZero: true,
                            max: 100,
                            grid: {
                                color: 'rgba(0, 0, 0, 0.06)',
                                drawBorder: false,
                                lineWidth: 1
                            },
                            ticks: {
                                color: '#666',
                                font: {size: 12, weight: 500}
                            }
                        },
                        x: {
                            grid: {
                                display: false,
                                drawBorder: false
                            },
                            ticks: {
                                color: '#666',
                                font: {size: 12, weight: 500}
                            }
                        }
                    }
                }
            });

            const radarCtx = document.getElementById('deeperAnalysisRadarChart');
            if (radarCtx) {
                const radarContext = radarCtx.getContext('2d');
                if (deeperAnalysisRadarChart) {
                    deeperAnalysisRadarChart.destroy();
                }
                deeperAnalysisRadarChart = new Chart(radarContext, {
                    type: 'radar',
                    data: {
                        labels: radarSeries.labels,
                        datasets: [
                            {
                                label: 'Best-Best Key Grades',
                                data: radarSeries.bestBestGrades,
                                borderColor: '#00B894',
                                backgroundColor: 'rgba(0, 184, 148, 0.22)',
                                pointBackgroundColor: '#00B894',
                                pointBorderColor: '#ffffff',
                                pointHoverBackgroundColor: '#ffffff',
                                pointHoverBorderColor: '#00B894',
                                borderWidth: 2
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: true,
                        plugins: {
                            title: { display: true, text: `Weighted Avg: ${radarSeries.weightedAvg.toFixed(2)}`, font: { size: 13, weight: 'bold' }, padding: { bottom: 8 } },
                            legend: { display: true, position: 'bottom', labels: { font: { size: 12, weight: 600 }, padding: 12, usePointStyle: true } },
                            tooltip: {
                                backgroundColor: 'rgba(0, 0, 0, 0.85)',
                                padding: 12,
                                titleFont: { size: 13, weight: 'bold' },
                                bodyFont: { size: 12 },
                                borderColor: 'rgba(255, 255, 255, 0.4)',
                                borderWidth: 1,
                                borderRadius: 6
                            }
                        },
                        scales: {
                            r: {
                                beginAtZero: true,
                                min: 0,
                                max: 100,
                                ticks: {
                                    display: true,
                                    backdropColor: 'transparent',
                                    color: '#666',
                                    stepSize: 20
                                },
                                pointLabels: {
                                    color: '#495057',
                                    font: { size: 12, weight: 600 }
                                },
                                grid: {
                                    color: 'rgba(0, 0, 0, 0.1)'
                                },
                                angleLines: {
                                    color: 'rgba(0, 0, 0, 0.1)'
                                }
                            }
                        }
                    }
                });
            }

            const popupWeightInputs = document.querySelectorAll('[data-deeper-weight-input]');
            popupWeightInputs.forEach(input => {
                input.addEventListener('input', () => {
                    updateDeeperAnalysisWeightIndicator();

                    if (deeperAnalysisAvgChart) {
                        const nextSeries = buildAverageSeries();
                        degradationFlags = nextSeries.degradationFlags;
                        bestFlags = nextSeries.bestFlags;
                        deeperAnalysisAvgChart.data.datasets[0].data = nextSeries.layer1aScores;
                        deeperAnalysisAvgChart.data.datasets[1].data = nextSeries.layer1bScores;
                        deeperAnalysisAvgChart.data.datasets[2].data = nextSeries.winners;
                        deeperAnalysisAvgChart.update();
                    }

                    if (deeperAnalysisRadarChart) {
                        const nextRadarSeries = buildRadarSeries();
                        deeperAnalysisRadarChart.data.labels = nextRadarSeries.labels;
                        deeperAnalysisRadarChart.data.datasets[0].data = nextRadarSeries.bestBestGrades;
                        deeperAnalysisRadarChart.options.plugins.title.text = `Weighted Avg: ${nextRadarSeries.weightedAvg.toFixed(2)}`;
                        deeperAnalysisRadarChart.update();
                    }
                });
            });
            updateDeeperAnalysisWeightIndicator();
        }
        
        const runtimeCtx = document.getElementById('deeperAnalysisRuntimeChart');
        if (runtimeCtx) {
            const labels = iterations.map(it => 'Iter ' + it.iteration);
            const layer1aTimes = iterations.map(it => (it.layer1a_time || 0));
            const layer1bTimes = iterations.map(it => (it.layer1b_time || 0));
            const layer1aModel = iterations[0].layer1a_model_used || 'Model 1';
            const layer1bModel = iterations[0].layer1b_model_used || 'Model 2';
            
            const ctx = runtimeCtx.getContext('2d');
            if (window.ChartDataLabels) {
                window.Chart.register(window.ChartDataLabels);
            }
            new Chart(ctx, {
                plugins: [ChartDataLabels],
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: layer1aModel + ' (seconds)',
                            data: layer1aTimes,
                            backgroundColor: '#0984E3',
                            borderColor: '#0984E3',
                            borderWidth: 0,
                            borderRadius: 6,
                            yAxisID: 'y'
                        },
                        {
                            label: layer1bModel + ' (seconds)',
                            data: layer1bTimes,
                            backgroundColor: '#E84393',
                            borderColor: '#E84393',
                            borderWidth: 0,
                            borderRadius: 6,
                            yAxisID: 'y'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    interaction: {
                        intersect: false,
                        mode: 'index'
                    },
                    plugins: {
                        legend: { display: true, position: 'bottom', labels: {font: {size: 13, weight: 600}, padding: 15, usePointStyle: true, boxWidth: 8} },
                        datalabels: {
                            display: true,
                            formatter: function(value, context) {
                                if (value === null || value === undefined) return '';
                                return value.toFixed(1) + 's';
                            },
                            color: '#000000',
                            backgroundColor: 'rgba(255, 255, 255, 0.8)',
                            borderRadius: 4,
                            padding: 4,
                            font: {
                                size: 13,
                                weight: 'bold'
                            },
                            anchor: 'top',
                            offset: 6
                        },
                        tooltip: {
                            backgroundColor: 'rgba(0, 0, 0, 0.85)',
                            padding: 13,
                            titleFont: {size: 13, weight: 'bold'},
                            bodyFont: {size: 12},
                            borderColor: 'rgba(255, 255, 255, 0.4)',
                            borderWidth: 2,
                            borderRadius: 6,
                            boxPadding: 8,
                            callbacks: {
                                label: function(context) {
                                    return context.dataset.label + ': ' + context.parsed.y.toFixed(2) + 's';
                                }
                            }
                        }
                    },
                    scales: {
                        y: { 
                            type: 'linear',
                            position: 'left',
                            beginAtZero: true,
                            grid: {
                                color: 'rgba(0, 0, 0, 0.06)',
                                drawBorder: false,
                                lineWidth: 1
                            },
                            ticks: {
                                color: '#666',
                                font: {size: 12, weight: 500},
                                callback: function(value) {
                                    return value + 's';
                                }
                            },
                            title: {
                                display: true,
                                text: 'Runtime (seconds)',
                                font: {size: 13, weight: 700}
                            }
                        },
                        x: {
                            grid: {
                                display: false,
                                drawBorder: false
                            },
                            ticks: {
                                color: '#666',
                                font: {size: 12, weight: 500}
                            }
                        }
                    }
                }
            });
        }
        
        const tokenCtx = document.getElementById('deeperAnalysisTokenChart');
        if (tokenCtx) {
            const labels = iterations.map(it => 'Iter ' + it.iteration);
            const layer1aInputTokens = iterations.map(it => {
                if (it.token_data && it.token_data.layer1a && it.token_data.layer1a.input_tokens) return it.token_data.layer1a.input_tokens;
                return 0;
            });
            const layer1aOutputTokens = iterations.map(it => {
                if (it.token_data && it.token_data.layer1a && it.token_data.layer1a.output_tokens) return it.token_data.layer1a.output_tokens;
                return 0;
            });
            const layer1bInputTokens = iterations.map(it => {
                if (it.token_data && it.token_data.layer1b && it.token_data.layer1b.input_tokens) return it.token_data.layer1b.input_tokens;
                return 0;
            });
            const layer1bOutputTokens = iterations.map(it => {
                if (it.token_data && it.token_data.layer1b && it.token_data.layer1b.output_tokens) return it.token_data.layer1b.output_tokens;
                return 0;
            });
            const layer1aTotal = layer1aInputTokens.map((inp, i) => inp + layer1aOutputTokens[i]);
            const layer1bTotal = layer1bInputTokens.map((inp, i) => inp + layer1bOutputTokens[i]);
            const hasTokenData = layer1aTotal.some(t => t > 0) || layer1bTotal.some(t => t > 0);
            console.log('Token chart check - hasTokenData:', hasTokenData, 'layer1aTotal:', layer1aTotal, 'layer1bTotal:', layer1bTotal);
            if (hasTokenData) {
                const layer1aModel = iterations[0].layer1a_model_used || 'Model 1';
                const layer1bModel = iterations[0].layer1b_model_used || 'Model 2';
                
                const ctx = tokenCtx.getContext('2d');
                if (window.ChartDataLabels) {
                    window.Chart.register(window.ChartDataLabels);
                }
                new Chart(ctx, {
                    plugins: [ChartDataLabels],
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [
                            {
                                label: layer1aModel + ' (input)',
                                data: layer1aInputTokens,
                                backgroundColor: 'rgba(9, 132, 227, 0.4)',
                                borderColor: 'rgba(9, 132, 227, 0.4)',
                                borderWidth: 0,
                                borderRadius: 6,
                                stack: 'layer1a',
                                yAxisID: 'y'
                            },
                            {
                                label: layer1aModel + ' (output)',
                                data: layer1aOutputTokens,
                                backgroundColor: '#0984E3',
                                borderColor: '#0984E3',
                                borderWidth: 0,
                                borderRadius: 6,
                                stack: 'layer1a',
                                yAxisID: 'y'
                            },
                            {
                                label: layer1bModel + ' (input)',
                                data: layer1bInputTokens,
                                backgroundColor: 'rgba(232, 67, 147, 0.4)',
                                borderColor: 'rgba(232, 67, 147, 0.4)',
                                borderWidth: 0,
                                borderRadius: 6,
                                stack: 'layer1b',
                                yAxisID: 'y'
                            },
                            {
                                label: layer1bModel + ' (output)',
                                data: layer1bOutputTokens,
                                backgroundColor: '#E84393',
                                borderColor: '#E84393',
                                borderWidth: 0,
                                borderRadius: 6,
                                stack: 'layer1b',
                                yAxisID: 'y'
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: true,
                        interaction: {
                            intersect: false,
                            mode: 'index'
                        },
                        plugins: {
                            legend: { display: true, position: 'bottom', labels: {font: {size: 13, weight: 600}, padding: 15, usePointStyle: true, boxWidth: 8} },
                            datalabels: {
                                labels: {
                                    value: {
                                        display: true,
                                        formatter: function(value, context) {
                                            if (!value || value === 0) return '';
                                            return value.toLocaleString();
                                        },
                                        color: '#000000',
                                        backgroundColor: 'rgba(255, 255, 255, 0.8)',
                                        borderRadius: 4,
                                        padding: {top: 2, bottom: 2, left: 4, right: 4},
                                        font: {
                                            size: 10,
                                            weight: 'bold'
                                        },
                                        anchor: 'center',
                                        align: 'center',
                                        clamp: false,
                                        clip: false
                                    },
                                    total: {
                                        display: function(context) {
                                            return context.datasetIndex === 1 || context.datasetIndex === 3;
                                        },
                                        formatter: function(value, context) {
                                            const dataIndex = context.dataIndex;
                                            const total = (context.datasetIndex === 1) ? layer1aTotal[dataIndex] : layer1bTotal[dataIndex];
                                            return total > 0 ? total.toLocaleString() : '';
                                        },
                                        color: '#000000',
                                        backgroundColor: 'rgba(255, 255, 255, 0.8)',
                                        borderRadius: 6,
                                        padding: {top: 3, bottom: 3, left: 6, right: 6},
                                        font: {
                                            size: 16,
                                            weight: 'bold'
                                        },
                                        anchor: 'end',
                                        align: 'top',
                                        offset: 4
                                    }
                                }
                            },
                            tooltip: {
                                backgroundColor: 'rgba(0, 0, 0, 0.85)',
                                padding: 13,
                                titleFont: {size: 13, weight: 'bold'},
                                bodyFont: {size: 12},
                                borderColor: 'rgba(255, 255, 255, 0.4)',
                                borderWidth: 2,
                                borderRadius: 6,
                                boxPadding: 8,
                                callbacks: {
                                    label: function(context) {
                                        return context.dataset.label + ': ' + context.parsed.y.toLocaleString();
                                    },
                                    footer: function(tooltipItems) {
                                        const dataIndex = tooltipItems[0].dataIndex;
                                        return 'Total: ' + (layer1aTotal[dataIndex] + layer1bTotal[dataIndex]).toLocaleString();
                                    }
                                }
                            }
                        },
                        scales: {
                            y: { 
                                type: 'linear',
                                position: 'left',
                                beginAtZero: true,
                                stacked: true,
                                grid: {
                                    color: 'rgba(0, 0, 0, 0.06)',
                                    drawBorder: false,
                                    lineWidth: 1
                                },
                                ticks: {
                                    color: '#666',
                                    font: {size: 12, weight: 500},
                                    callback: function(value) {
                                        return value.toLocaleString();
                                    }
                                },
                                title: {
                                    display: true,
                                    text: 'Tokens',
                                    font: {size: 13, weight: 700}
                                }
                            },
                            x: {
                                stacked: true,
                                grid: {
                                    display: false,
                                    drawBorder: false
                                },
                                ticks: {
                                    color: '#666',
                                    font: {size: 12, weight: 500}
                                }
                            }
                        }
                    }
                });
            }
        }
        
        const layer1aModelDeeper = iterations[0].layer1a_model_used || 'Model 1';
        const layer1bModelDeeper = iterations[0].layer1b_model_used || 'Model 2';
        
        for (let key of grading_keys) {
            const canvasId = `deeperAnalysisChart_${key}`;
            const canvasElement = document.getElementById(canvasId);
            
            if (canvasElement) {
                const labels = iterations.map(it => 'Iter ' + it.iteration);
                const layer1aData = iterations.map(it => {
                    const grades = it.layer1a_grades || {};
                    return grades[key] || 0;
                });
                const layer1bData = iterations.map(it => {
                    const grades = it.layer1b_grades || {};
                    return grades[key] || 0;
                });
                
                const ctx = canvasElement.getContext('2d');
                const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);
                
                if (window.ChartDataLabels) {
                    window.Chart.register(window.ChartDataLabels);
                }
                
                new Chart(ctx, {
                    plugins: [ChartDataLabels],
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [
                            {
                                label: layer1aModelDeeper,
                                data: layer1aData,
                                backgroundColor: '#0984E3',
                                borderColor: '#0984E3',
                                borderWidth: 0,
                                borderRadius: 6
                            },
                            {
                                label: layer1bModelDeeper,
                                data: layer1bData,
                                backgroundColor: '#E84393',
                                borderColor: '#E84393',
                                borderWidth: 0,
                                borderRadius: 6
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: true,
                        interaction: {
                            intersect: false,
                            mode: 'index'
                        },
                        plugins: {
                            legend: { display: true, position: 'bottom', labels: {font: {size: 13, weight: 600}, padding: 15, usePointStyle: true, boxWidth: 8} },
                            title: { display: true, text: capitalize(key), font: {size: 14, weight: 'bold'}, padding: 15 },
                            datalabels: {
                                display: true,
                                anchor: 'top',
                                offset: 6,
                                font: { weight: 'bold', size: 13 },
                                color: '#000000',
                                backgroundColor: 'rgba(255, 255, 255, 0.8)',
                                borderRadius: 4,
                                padding: 4,
                                formatter: function(value) { return value || ''; }
                            },
                            tooltip: {
                                backgroundColor: 'rgba(0, 0, 0, 0.85)',
                                padding: 12,
                                titleFont: {size: 13, weight: 'bold'},
                                bodyFont: {size: 12},
                                borderColor: 'rgba(255, 255, 255, 0.4)',
                                borderWidth: 2,
                                borderRadius: 6,
                                boxPadding: 8
                            }
                        },
                        scales: {
                            y: { 
                                beginAtZero: true, 
                                max: 100,
                                grid: {
                                    color: 'rgba(0, 0, 0, 0.06)',
                                    drawBorder: false,
                                    lineWidth: 1
                                },
                                ticks: {
                                    color: '#666',
                                    font: {size: 12, weight: 500}
                                }
                            },
                            x: {
                                grid: {
                                    display: false,
                                    drawBorder: false
                                },
                                ticks: {
                                    color: '#666',
                                    font: {size: 12, weight: 500}
                                }
                            }
                        }
                    }
                });
            }
        }
    } catch (e) {
        console.error('Error creating deeper analysis charts:', e);
    }
}

function toggleAdvancedSidebar() {
    const sidebar = document.getElementById('advancedSidebar');
    const btn = document.getElementById('advancedBtn');
    const btnText = document.getElementById('advancedBtnText');
    const btnIcon = document.getElementById('advancedBtnIcon');
    
    if (sidebar.classList.contains('collapsed')) {
        sidebar.classList.remove('collapsed');
        btn.classList.add('active');
        btnText.textContent = 'Close Advanced';
        btnIcon.textContent = '✖️';
        updateAdvancedSidebarIterations();
        loadAdvancedModels();
    } else {
        sidebar.classList.add('collapsed');
        btn.classList.remove('active');
        btnText.textContent = 'Advanced';
        btnIcon.textContent = '⚙️';
    }
}

function updateAdvancedSidebarIterations() {
    const maxIterationsInput = document.querySelector('input[name="max_iterations"]');
    if (!maxIterationsInput) return;
    
    const maxIterations = parseInt(maxIterationsInput.value) || 5;
    const sidebar = document.getElementById('advancedSidebar');
    
    if (!sidebar) return;
    
    const systemType = localStorage.getItem('systemType') || 'powerful';
    
    // Store current selections before rebuilding
    const currentSelections = {};
    document.querySelectorAll('.advanced-model-select').forEach(select => {
        const layer = select.dataset.layer;
        const iteration = select.dataset.iteration;
        const value = select.value;
        if (value) {
            currentSelections[`${layer}-${iteration}`] = value;
        }
    });
    
    // Get available models from the main model selectors
    const availableModelsA = Array.from(document.querySelectorAll('#modelSelectA option'))
        .map(o => o.value)
        .filter(v => v && v !== 'ADVANCED' && shouldShowModel(v, systemType));
    const availableModelsB = Array.from(document.querySelectorAll('#modelSelectB option'))
        .map(o => o.value)
        .filter(v => v && v !== 'ADVANCED' && shouldShowModel(v, systemType));
    const availableModelsLayer2 = Array.from(document.querySelectorAll('#modelSelectLayer2 option'))
        .map(o => o.value)
        .filter(v => v && shouldShowModel(v, systemType));
    
    // Build Layer1A HTML
    let layer1aHTML = `<h4 style="background: linear-gradient(135deg, rgba(100, 150, 200, 0.06) 0%, rgba(100, 150, 200, 0.09) 100%); color: #2d3436; margin-bottom: 12px; padding: 10px 12px; font-size: 0.95rem; font-weight: 700; border-radius: 8px; border-left: 4px solid #6b96c8;">
        🤖 Answer model 1
    </h4>`;
    
    for (let i = 1; i <= maxIterations; i++) {
        const currentValue = currentSelections[`a-${i}`] || '';
        layer1aHTML += `<div class="iteration-model-selector">
            <h5 style="font-size: 0.85rem;">Iter ${i}</h5>
            <select class="advanced-model-select" data-layer="a" data-iteration="${i}">
                <option value="">Default</option>`;
        
        availableModelsA.forEach(model => {
            const selected = currentValue === model ? 'selected' : '';
            const displayModel = (model.includes('gemini-') || model.includes('mistral-small-') || model.includes('magistral-small-') || model.includes('voxtral-mini-') || model.includes('open-mistral-')) ? `☁️ ${model}` : model;
            layer1aHTML += `<option value="${model}" ${selected}>${displayModel}</option>`;
        });
        
        layer1aHTML += `</select></div>`;
    }
    
    // Build Layer1B HTML
    let layer1bHTML = `<h4 style="background: linear-gradient(135deg, rgba(195, 130, 155, 0.06) 0%, rgba(195, 130, 155, 0.09) 100%); color: #2d3436; margin-bottom: 12px; padding: 10px 12px; font-size: 0.95rem; font-weight: 700; border-radius: 8px; border-left: 4px solid #c38299;">
        🤖 Answer model 2
    </h4>`;
    
    for (let i = 1; i <= maxIterations; i++) {
        const currentValue = currentSelections[`b-${i}`] || '';
        layer1bHTML += `<div class="iteration-model-selector">
            <h5 style="font-size: 0.85rem;">Iter ${i}</h5>
            <select class="advanced-model-select" data-layer="b" data-iteration="${i}">
                <option value="">Default</option>`;
        
        availableModelsB.forEach(model => {
            const selected = currentValue === model ? 'selected' : '';
            const displayModel = (model.includes('gemini-') || model.includes('mistral-small-') || model.includes('magistral-small-') || model.includes('voxtral-mini-') || model.includes('open-mistral-')) ? `☁️ ${model}` : model;
            layer1bHTML += `<option value="${model}" ${selected}>${displayModel}</option>`;
        });
        
        layer1bHTML += `</select></div>`;
    }
    
    // Build Layer2 HTML
    let layer2HTML = `<h4 style="background: linear-gradient(135deg, rgba(145, 140, 190, 0.06) 0%, rgba(145, 140, 190, 0.09) 100%); color: #2d3436; margin-bottom: 12px; padding: 10px 12px; font-size: 0.95rem; font-weight: 700; border-radius: 8px; border-left: 4px solid #918cbe;">
        🤖 Prompt Model
    </h4>`;
    
    for (let i = 1; i <= maxIterations; i++) {
        const currentValue = currentSelections[`layer2-${i}`] || '';
        layer2HTML += `<div class="iteration-model-selector">
            <h5 style="font-size: 0.85rem;">Iter ${i}</h5>
            <select class="advanced-model-select" data-layer="layer2" data-iteration="${i}">
                <option value="">Default</option>`;
        
        availableModelsLayer2.forEach(model => {
            const selected = currentValue === model ? 'selected' : '';
            const displayModel = (model.includes('gemini-') || model.includes('mistral-small-') || model.includes('magistral-small-') || model.includes('voxtral-mini-') || model.includes('open-mistral-')) ? `☁️ ${model}` : model;
            layer2HTML += `<option value="${model}" ${selected}>${displayModel}</option>`;
        });
        
        layer2HTML += `</select></div>`;
    }
    
    // Update the intro text with iteration count
    const introP = sidebar.querySelector('p');
    if (introP) {
        introP.innerHTML = `Set models per iteration or leave blank for defaults. Click Save.`;
    }
    
    // Find the three main container divs with margin-bottom: 22px
    const containerDivs = sidebar.querySelectorAll('div[style*="margin-bottom: 22px"]');
    if (containerDivs.length >= 3) {
        containerDivs[0].innerHTML = layer1aHTML;
        containerDivs[1].innerHTML = layer1bHTML;
        containerDivs[2].innerHTML = layer2HTML;
        colorizeModelOptions();
        // Reapply domain filter to newly created selects
        const savedDomainFilter = localStorage.getItem('selectedDomainFilter') || 'all';
        filterModelsByDomain(savedDomainFilter);
    }
}

function loadAdvancedModels() {
    fetch('/get_current_models', {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            const mainModelA = data.layer1a_model;
            const mainModelB = data.layer1b_model;
            const mainModelLayer2 = data.layer2_model;
            
            fetch('/get_advanced_models', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                }
            })
            .then(response => response.json())
            .then(advData => {
                if (advData.success) {
                    const layer1aModels = advData.layer1a_models || {};
                    const layer1bModels = advData.layer1b_models || {};
                    const layer2Models = advData.layer2_models || {};
                    
                    document.querySelectorAll('.advanced-model-select').forEach(select => {
                        const layer = select.dataset.layer;
                        const iteration = select.dataset.iteration;
                        
                        if (layer === 'a') {
                            if (layer1aModels[iteration]) {
                                select.value = layer1aModels[iteration];
                            } else {
                                select.value = mainModelA || '';
                            }
                        } else if (layer === 'b') {
                            if (layer1bModels[iteration]) {
                                select.value = layer1bModels[iteration];
                            } else {
                                select.value = mainModelB || '';
                            }
                        } else if (layer === 'layer2') {
                            if (layer2Models[iteration]) {
                                select.value = layer2Models[iteration];
                            } else {
                                select.value = mainModelLayer2 || '';
                            }
                        }
                    });
                    
                    updateMainSelectorDisplay();
                    colorizeModelOptions();
                }
            })
            .catch(error => {
                console.error('Error loading advanced models:', error);
            });
        }
    })
    .catch(error => {
        console.error('Error loading current models:', error);
    });
}

function saveAdvancedModels() {
    const layer1aModels = {};
    const layer1bModels = {};
    const layer2Models = {};
    
    document.querySelectorAll('.advanced-model-select').forEach(select => {
        const layer = select.dataset.layer;
        const iteration = select.dataset.iteration;
        const model = select.value;
        
        if (model) {
            if (layer === 'a') {
                layer1aModels[iteration] = model;
            } else if (layer === 'b') {
                layer1bModels[iteration] = model;
            } else if (layer === 'layer2') {
                layer2Models[iteration] = model;
            }
        }
    });
    
    fetch('/save_advanced_models', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            layer1a_models: layer1aModels,
            layer1b_models: layer1bModels,
            layer2_models: layer2Models
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showAdvancedStatus('💾 Advanced models saved ✓', 'success');
            updateMainSelectorDisplay();
            colorizeModelOptions();
            setTimeout(() => {
                toggleAdvancedSidebar();
            }, 300);
        } else {
            showAdvancedStatus('❌ Error: ' + data.error, 'error');
        }
    })
    .catch(error => {
        showAdvancedStatus('❌ Network error: ' + error.message, 'error');
    });
}

function clearAdvancedModels() {
    if (!confirm('🗑️  Clear all advanced configurations?')) {
        return;
    }
    
    fetch('/clear_advanced_models', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            document.querySelectorAll('.advanced-model-select').forEach(select => {
                select.value = '';
            });
            showAdvancedStatus('🗑️  Advanced models cleared ✓', 'info');
            updateMainSelectorDisplay();
            colorizeModelOptions();
        } else {
            showAdvancedStatus('❌ Error: ' + data.error, 'error');
        }
    })
    .catch(error => {
        showAdvancedStatus('❌ Network error: ' + error.message, 'error');
    });
}

function showAdvancedStatus(message, type) {
    const statusDiv = document.getElementById('advancedStatus');
    statusDiv.textContent = message;
    statusDiv.className = 'advanced-status ' + type;
    statusDiv.style.display = 'block';
    
    setTimeout(() => {
        statusDiv.style.display = 'none';
    }, 5000);
}

function updateMainSelectorDisplay() {
    fetch('/get_advanced_models', {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            const layer1aModels = data.layer1a_models || {};
            const layer1bModels = data.layer1b_models || {};
            const layer2Models = data.layer2_models || {};
            const hasAdvancedA = Object.keys(layer1aModels).length > 0;
            const hasAdvancedB = Object.keys(layer1bModels).length > 0;
            const hasAdvancedLayer2 = Object.keys(layer2Models).length > 0;
            
            const selectA = document.getElementById('modelSelectA');
            const selectB = document.getElementById('modelSelectB');
            const selectLayer2 = document.getElementById('modelSelectLayer2');
            
            if (hasAdvancedA) {
                const advancedOptionA = selectA.querySelector('option[value="ADVANCED"]');
                if (!advancedOptionA) {
                    const option = document.createElement('option');
                    option.value = 'ADVANCED';
                    option.textContent = '⚙️ Advanced (Per-Iteration)';
                    option.selected = true;
                    selectA.insertBefore(option, selectA.firstChild);
                } else {
                    advancedOptionA.selected = true;
                }
                selectA.disabled = true;
            } else {
                const advancedOptionA = selectA.querySelector('option[value="ADVANCED"]');
                if (advancedOptionA) {
                    advancedOptionA.remove();
                }
                selectA.disabled = false;
            }
            
            if (hasAdvancedB) {
                const advancedOptionB = selectB.querySelector('option[value="ADVANCED"]');
                if (!advancedOptionB) {
                    const option = document.createElement('option');
                    option.value = 'ADVANCED';
                    option.textContent = '⚙️ Advanced (Per-Iteration)';
                    option.selected = true;
                    selectB.insertBefore(option, selectB.firstChild);
                } else {
                    advancedOptionB.selected = true;
                }
                selectB.disabled = true;
            } else {
                const advancedOptionB = selectB.querySelector('option[value="ADVANCED"]');
                if (advancedOptionB) {
                    advancedOptionB.remove();
                }
                selectB.disabled = false;
            }
            
            if (hasAdvancedLayer2) {
                const advancedOptionLayer2 = selectLayer2.querySelector('option[value="ADVANCED"]');
                if (!advancedOptionLayer2) {
                    const option = document.createElement('option');
                    option.value = 'ADVANCED';
                    option.textContent = '⚙️ Advanced (Per-Iteration)';
                    option.selected = true;
                    selectLayer2.insertBefore(option, selectLayer2.firstChild);
                } else {
                    advancedOptionLayer2.selected = true;
                }
                selectLayer2.disabled = true;
                showModelStatusLayer2('⚙️ Advanced (Per-Iteration)', 'success');
            } else {
                const advancedOptionLayer2 = selectLayer2.querySelector('option[value="ADVANCED"]');
                if (advancedOptionLayer2) {
                    advancedOptionLayer2.remove();
                }
                selectLayer2.disabled = false;
            }
        }
    })
    .catch(error => {
        console.error('Error updating main selector display:', error);
    });
}

function switchAwayFromAdvanced() {
    const selectA = document.getElementById('modelSelectA');
    const selectB = document.getElementById('modelSelectB');
    const selectLayer2 = document.getElementById('modelSelectLayer2');
    
    const hasAdvancedOptionA = selectA && selectA.querySelector('option[value="ADVANCED"]');
    const hasAdvancedOptionB = selectB && selectB.querySelector('option[value="ADVANCED"]');
    const hasAdvancedOptionLayer2 = selectLayer2 && selectLayer2.querySelector('option[value="ADVANCED"]');
    
    const switchedAwayA = hasAdvancedOptionA && selectA.value !== 'ADVANCED';
    const switchedAwayB = hasAdvancedOptionB && selectB.value !== 'ADVANCED';
    const switchedAwayLayer2 = hasAdvancedOptionLayer2 && selectLayer2.value !== 'ADVANCED';
    
    if (switchedAwayA || switchedAwayB || switchedAwayLayer2) {
        fetch('/clear_advanced_models', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                console.log('Advanced models cleared due to main selector change');
                updateMainSelectorDisplay();
            }
        })
        .catch(error => {
            console.error('Error clearing advanced models:', error);
        });
    }
}

window.addEventListener('load', function() {
    updateMainSelectorDisplay();
    
    const selectA = document.getElementById('modelSelectA');
    const selectB = document.getElementById('modelSelectB');
    const selectLayer2 = document.getElementById('modelSelectLayer2');
    
    if (selectA) {
        selectA.addEventListener('change', switchAwayFromAdvanced);
    }
    if (selectB) {
        selectB.addEventListener('change', switchAwayFromAdvanced);
    }
    if (selectLayer2) {
        selectLayer2.addEventListener('change', switchAwayFromAdvanced);
    }
    
    if (window.Chart && window.ChartDataLabels) {
        Chart.register(window.ChartDataLabels);
    }
    
    const deeperAnalysisModal = document.getElementById('deeperAnalysisModal');
    if (deeperAnalysisModal) {
        deeperAnalysisModal.addEventListener('click', function(event) {
            if (event.target === this) {
                closeDeeperAnalysisModal();
            }
        });
    }
    
    document.querySelectorAll('.analyse-deeper-btn').forEach(btn => {
        btn.addEventListener('click', function(event) {
            event.preventDefault();
            const promptNumber = this.getAttribute('data-prompt-number');
            const iterationsJson = this.getAttribute('data-iterations');
            try {
                const iterations = JSON.parse(iterationsJson);
                console.log('Button clicked, opening modal with data:', promptNumber, iterations);
                openDeeperAnalysis(promptNumber, iterations);
            } catch (e) {
                console.error('Error parsing iterations data:', e, iterationsJson);
                alert('Error: Could not parse iteration data');
            }
        });
    });
});