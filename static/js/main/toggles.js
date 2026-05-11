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
