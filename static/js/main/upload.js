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
