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

window.addEventListener('load', function() {
    initializeGradeWeights();
    initializeDomainFilter();
    var consoleElement = document.querySelector('.console-output');
    if(consoleElement) {
        consoleElement.scrollTop = consoleElement.scrollHeight;
    }
});

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

// Reset button state on page load
window.addEventListener('load', function() {
    const analyzeBtn = document.getElementById('analyzeBtn');
    if (analyzeBtn) {
        analyzeBtn.disabled = false;
        analyzeBtn.textContent = '🎯 START ANALYSIS 🎯';
    }
    
    updateUploadButtonState();
});

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
