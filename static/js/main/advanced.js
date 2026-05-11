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
