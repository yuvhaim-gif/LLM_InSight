function selectPromptFromTable(chatIdx, promptNum) {
    const card = document.querySelectorAll('.chat-card')[chatIdx];
    const dropdown = card.querySelector('.selector-dropdown');
    if (dropdown) {
        dropdown.value = promptNum;
    }
    showPrompt(chatIdx, promptNum);
}

function showPrompt(chatIdx, promptNum) {
    const card = document.querySelectorAll('.chat-card')[chatIdx];
    const allPrompts = card.querySelectorAll('.prompt-content');
    const promptSummary = card.querySelector('.all-prompts-summary');
    
    allPrompts.forEach(p => p.classList.remove('active'));
    if (promptSummary) {
        promptSummary.classList.remove('active');
    }
    
    if (promptNum) {
        document.getElementById(`prompt-${chatIdx}-${promptNum}`).classList.add('active');
        
        setTimeout(() => {
            renderPromptChart(chatIdx, promptNum);
        }, 100);
    } else {
        if (promptSummary) {
            promptSummary.classList.add('active');
        }
    }
}

function renderIterationResults(promptData, container) {
    let html = '';
    
    if (promptData.iterations && promptData.iterations.length > 0) {
        promptData.iterations.forEach((iteration, idx) => {
            const layer1aScore = parseFloat(iteration.layer1a_score) || 0;
            const layer1bScore = parseFloat(iteration.layer1b_score) || 0;
            const bestScore = Math.max(layer1aScore, layer1bScore);
            const winner = layer1aScore >= layer1bScore ? 'original' : 'improved';
            const layer1aModel = iteration.layer1a_model_used || iteration.model_used || 'Model A';
            const layer1bModel = iteration.layer1b_model_used || iteration.model_used || 'Model B';
            
            console.log(`Iteration ${iteration.iteration}:`, { layer1aScore, layer1bScore, bestScore });
            
            let degradationWarning = '';
            if (idx > 0) {
                const prevScore = Math.max(promptData.iterations[idx - 1].layer1a_score || 0, promptData.iterations[idx - 1].layer1b_score || 0);
                if (bestScore < prevScore) {
                    degradationWarning = '<span style="color: #dc3545; font-weight: 600; margin-left: 8px;">⚠️ Degraded</span>';
                }
            }
            
            const isBestBest = iteration.is_best_best ? '🏆' : '';
            
            html += `
                <div style="margin-bottom: 12px; padding: 12px; background: #f8f9fa; border-radius: 8px; border-left: 3px solid ${winner === 'original' ? '#0984E3' : '#E84393'};">
                    <div style="font-weight: 600; margin-bottom: 8px;">Iteration ${iteration.iteration}</div>
                    <div style="font-size: 0.85rem; color: #666; margin-bottom: 6px;">
                        <span style="display: block; margin-bottom: 4px;"><strong>${layer1aModel}:</strong> <span style="color: #0984E3; font-weight: 700;">${layer1aScore}</span></span>
                        <span style="display: block;"><strong>${layer1bModel}:</strong> <span style="color: #E84393; font-weight: 700;">${layer1bScore}</span></span>
                    </div>
                    <div style="margin-top: 8px; display: flex; align-items: center; gap: 8px;">
                        <span style="background: ${winner === 'original' ? '#0984E3' : '#E84393'}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">
                            ${winner === 'original' ? 'Model 1' : 'Model 2'}
                        </span>
                        ${isBestBest}
                        ${degradationWarning}
                    </div>
                    <div style="margin-top: 6px; font-size: 0.85rem; font-weight: 600;">
                        Best: <span style="font-weight: 700; color: #0984e3;">${bestScore}</span>
                    </div>
                </div>
            `;
        });
    } else {
        html = '<p style="color: #999; text-align: center;">No iterations</p>';
    }
    
    container.innerHTML = html;
}
