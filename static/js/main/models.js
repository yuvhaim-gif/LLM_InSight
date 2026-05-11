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
