function openConfirmModal(filename) {
    selectedChatFile = filename;
    document.getElementById('confirmModal').style.display = 'block';
}

function closeModal() {
    document.getElementById('confirmModal').style.display = 'none';
    selectedChatFile = null;
}

let deleteTargetFile = null;

function openDeleteModal(filename, displayName) {
    console.log('[DELETE] openDeleteModal called with:', {filename, displayName});
    deleteTargetFile = filename;
    document.getElementById('deleteModalText').textContent = `Are you sure you want to delete "${displayName}"? This action cannot be undone.`;
    document.getElementById('deleteModal').style.display = 'block';
    console.log('[DELETE] Modal displayed, deleteTargetFile set to:', deleteTargetFile);
}

function closeDeleteModal() {
    console.log('[DELETE] closeDeleteModal called');
    document.getElementById('deleteModal').style.display = 'none';
    deleteTargetFile = null;
}

function confirmDelete() {
    console.log('[DELETE] confirmDelete called, deleteTargetFile:', deleteTargetFile);
    if (!deleteTargetFile) {
        console.log('[DELETE] ERROR: No deleteTargetFile set!');
        return;
    }
    
    console.log('[DELETE] Sending delete request for:', deleteTargetFile);
    fetch('/delete_chat_file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: deleteTargetFile })
    })
    .then(response => {
        console.log('[DELETE] Response status:', response.status);
        return response.json();
    })
    .then(data => {
        console.log('[DELETE] Response data:', data);
        if (data.success) {
            closeDeleteModal();
            loadChats();
        } else {
            alert('Error deleting chat: ' + (data.message || 'Unknown error'));
        }
    })
    .catch(error => {
        console.error('[DELETE] Error:', error);
        alert('Error deleting chat');
    });
}

function confirmLoad() {
    if (!selectedChatFile) return;
    
    fetch('/load_chat_from_review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: selectedChatFile })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            sessionStorage.setItem('loaded_last_prompt', data.last_prompt || '');
            sessionStorage.setItem('loaded_layer1a_model', data.layer1a_model || '');
            sessionStorage.setItem('loaded_layer1b_model', data.layer1b_model || '');
            sessionStorage.setItem('loaded_layer0_model', data.layer0_model || '');
            sessionStorage.setItem('loaded_layer2_model', data.layer2_model || '');
            sessionStorage.setItem('loaded_layer1_last_best_context_enabled', String(data.layer1_last_best_context_enabled !== false));
            sessionStorage.setItem('loaded_grade_vs_prompt_mode', data.grade_vs_prompt_mode === 'first' ? 'first' : 'current');
            sessionStorage.setItem('loaded_grader_setting_name', data.grader_setting_name || 'default');
            window.location.href = '/';
        } else {
            alert('Error loading chat: ' + (data.message || 'Unknown error'));
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('Error loading chat');
    });
}
