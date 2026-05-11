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
