let isEditMode = false;
let currentSettingName = INITIAL_SETTING_NAME;
let pendingSaveData = null;

document.addEventListener('DOMContentLoaded', function() {
    renderKeys(INITIAL_CONFIG);
    updateUIState();
    updateWeightTotal();
});

function renderKeys(config) {
    const tbody = document.getElementById('keysBody');
    tbody.innerHTML = '';
    const keys = config.keys || [];
    const rubrics = config.rubrics || {};
    const graderModels = config.grader_models || {};
    const weights = config.weights || {};

    keys.forEach(function(key) {
        addKeyRowWithData(key, rubrics[key] || '', graderModels[key] || '', weights[key] || 0);
    });
    updateWeightTotal();
}

function addKeyRowWithData(keyName, rubric, grader, weight) {
    const tbody = document.getElementById('keysBody');
    if (tbody.querySelectorAll('tr').length >= 8) {
        showStatus('Maximum 8 grading keys allowed', 'error');
        return;
    }
    const tr = document.createElement('tr');
    var w = (weight !== undefined && weight !== null) ? parseFloat(weight) : 0;
    if (isNaN(w)) w = 0;
    var pct = Math.round(w * 100);

    let modelOptions = AVAILABLE_GRADER_MODELS.map(function(m) {
        return '<option value="' + m + '"' + (m === grader ? ' selected' : '') + '>' + m + '</option>';
    }).join('');

    tr.innerHTML =
        '<td><input type="text" class="key-name-input" value="' + escapeHtml(keyName) + '" placeholder="key name"></td>' +
        '<td><textarea class="key-rubric-input" placeholder="Rubric description...">' + escapeHtml(rubric) + '</textarea></td>' +
        '<td><select class="key-grader-select">' + modelOptions + '</select></td>' +
        '<td><input type="number" class="key-weight-input" value="' + pct + '" min="0" max="100" step="1" placeholder="20" oninput="updateWeightTotal()">%</td>' +
        '<td><button class="btn-remove-key" onclick="removeKeyRow(this)">Remove</button></td>';

    tbody.appendChild(tr);
}

function addKeyRow() {
    addKeyRowWithData('', '', AVAILABLE_GRADER_MODELS[0] || '', 0);
    updateWeightTotal();
}

function removeKeyRow(btn) {
    btn.closest('tr').remove();
    updateWeightTotal();
}

function updateWeightTotal() {
    var inputs = document.querySelectorAll('.key-weight-input');
    var total = 0;
    inputs.forEach(function(input) {
        var v = parseFloat(input.value);
        if (!isNaN(v) && v >= 0) total += v;
    });
    var indicator = document.getElementById('weightTotalIndicator');
    if (indicator) {
        indicator.textContent = 'Total: ' + Math.round(total) + '%';
        if (Math.abs(total - 100) < 0.5) {
            indicator.style.background = '#d1f7e5';
            indicator.style.color = '#0f8f56';
        } else {
            indicator.style.background = '#fde2e2';
            indicator.style.color = '#c0392b';
        }
    }
}

function loadSetting() {
    const name = document.getElementById('settingSelector').value;
    fetch('/grader_setting/' + encodeURIComponent(name))
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.success) {
                currentSettingName = name;
                const config = { keys: [], rubrics: {}, grader_models: {}, weights: {} };
                data.entries.forEach(function(e) {
                    config.keys.push(e.key);
                    config.rubrics[e.key] = e.rubric;
                    config.grader_models[e.key] = e.grader;
                    config.weights[e.key] = e.weight !== undefined ? e.weight : 0;
                });
                renderKeys(config);
                document.getElementById('settingNameInput').value = name === 'default' ? '' : name;
                cancelEditMode();
                updateUIState();
                showStatus('Loaded setting: ' + name, 'success');
            } else {
                showStatus('Error loading setting: ' + (data.error || 'Unknown'), 'error');
            }
        })
        .catch(function(e) { showStatus('Error: ' + e.message, 'error'); });
}

function enterEditMode() {
    if (currentSettingName === 'default') {
        document.getElementById('settingNameInput').value = '';
        showStatus('Default is read-only. Edit and save with a new name.', 'warning');
    }
    isEditMode = true;
    document.getElementById('keysContainer').classList.remove('view-mode');
    document.getElementById('btnEdit').style.display = 'none';
    document.getElementById('btnCancelEdit').style.display = 'inline-block';
}

function cancelEditMode() {
    isEditMode = false;
    document.getElementById('keysContainer').classList.add('view-mode');
    document.getElementById('btnEdit').style.display = 'inline-block';
    document.getElementById('btnCancelEdit').style.display = 'none';
}

function updateUIState() {
    const isDefault = currentSettingName === 'default';
    document.getElementById('readonlyNotice').style.display = isDefault ? 'inline' : 'none';
}

function collectEntries() {
    const rows = document.querySelectorAll('#keysBody tr');
    const entries = [];
    let valid = true;

    rows.forEach(function(row) {
        const keyInput = row.querySelector('.key-name-input');
        const rubricInput = row.querySelector('.key-rubric-input');
        const graderSelect = row.querySelector('.key-grader-select');
        const weightInput = row.querySelector('.key-weight-input');

        const key = (keyInput.value || '').trim().toLowerCase().replace(/\s+/g, '_');
        const rubric = (rubricInput.value || '').trim();
        const grader = graderSelect.value;
        var weightPct = parseFloat(weightInput ? weightInput.value : 0);
        if (isNaN(weightPct) || weightPct < 0) weightPct = 0;

        if (!key || !rubric || !grader) {
            valid = false;
            return;
        }

        entries.push({ key: key, rubric: rubric, grader: grader, weight: weightPct / 100 });
    });

    if (!valid || entries.length === 0) {
        return null;
    }

    var seen = {};
    for (var i = 0; i < entries.length; i++) {
        if (seen[entries[i].key]) {
            showStatus('Duplicate key name: ' + entries[i].key, 'error');
            return null;
        }
        seen[entries[i].key] = true;
    }

    return entries;
}

function saveSetting() {
    const name = (document.getElementById('settingNameInput').value || '').trim().toLowerCase().replace(/\s+/g, '_');

    if (!name) {
        showStatus('Please enter a setting name', 'error');
        return;
    }
    if (name === 'default') {
        showStatus('Cannot modify the default grader setting', 'error');
        return;
    }

    var weightInputs = document.querySelectorAll('.key-weight-input');
    var totalPct = 0;
    weightInputs.forEach(function(input) {
        var v = parseFloat(input.value);
        if (!isNaN(v) && v >= 0) totalPct += v;
    });
    if (Math.abs(totalPct - 100) > 0.5) {
        showStatus('Weight total must equal 100% (currently ' + Math.round(totalPct) + '%)', 'error');
        return;
    }

    const entries = collectEntries();
    if (!entries) {
        showStatus('All keys must have a name, rubric, and grader model', 'error');
        return;
    }

    pendingSaveData = { name: name, entries: entries };

    fetch('/grader_setting/' + encodeURIComponent(name))
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.success) {
                document.getElementById('overwriteModal').classList.add('active');
            } else {
                doSave(pendingSaveData);
            }
        })
        .catch(function() {
            doSave(pendingSaveData);
        });
}

function confirmOverwrite() {
    closeOverwriteModal();
    if (pendingSaveData) {
        doSave(pendingSaveData);
    }
}

function closeOverwriteModal() {
    document.getElementById('overwriteModal').classList.remove('active');
}

function doSave(saveData) {
    document.getElementById('btnSave').disabled = true;

    fetch('/save_grader_setting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(saveData)
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        document.getElementById('btnSave').disabled = false;
        if (data.success) {
            currentSettingName = saveData.name;
            showStatus('Setting "' + saveData.name + '" saved successfully!' + (data.overwritten ? ' (overwritten)' : ''), 'success');

            var sel = document.getElementById('settingSelector');
            var exists = false;
            for (var i = 0; i < sel.options.length; i++) {
                if (sel.options[i].value === saveData.name) {
                    exists = true;
                    sel.selectedIndex = i;
                    break;
                }
            }
            if (!exists) {
                var opt = document.createElement('option');
                opt.value = saveData.name;
                opt.textContent = saveData.name;
                sel.appendChild(opt);
                sel.value = saveData.name;
            }
            cancelEditMode();
            updateUIState();
        } else {
            showStatus('Error: ' + (data.error || 'Failed to save'), 'error');
        }
    })
    .catch(function(e) {
        document.getElementById('btnSave').disabled = false;
        showStatus('Error: ' + e.message, 'error');
    });

    pendingSaveData = null;
}

function showStatus(msg, type) {
    var el = document.getElementById('statusMsg');
    el.textContent = msg;
    el.className = 'status-msg ' + type;

    if (type === 'success') {
        setTimeout(function() { el.className = 'status-msg'; }, 4000);
    }
}

function escapeHtml(text) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
}
