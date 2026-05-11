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
