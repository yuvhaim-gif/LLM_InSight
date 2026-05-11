function loadChats() {
    fetch('/get_chat_stats')
        .then(response => response.json())
        .then(data => {
            console.log('Chat stats response:', data);
            if (!data.success) {
                document.getElementById('chatsContainer').innerHTML = '<div class="empty-state"><h2>Error: Not authenticated</h2></div>';
                return;
            }
            if (data.chats.length === 0) {
                document.getElementById('chatsContainer').innerHTML = '<div class="empty-state"><h2>No chats found</h2><p>Downloaded chats will appear here</p></div>';
                return;
            }

            allChatsData = data.chats;
            console.log('Loaded', data.chats.length, 'chats');
            renderChats();
        })
        .catch(error => {
            console.error('Error loading chats:', error);
            document.getElementById('chatsContainer').innerHTML = '<div class="empty-state"><h2>Error loading chats</h2><p>' + error.message + '</p></div>';
        });
}

function renderChats() {
    const container = document.getElementById('chatsContainer');
    container.innerHTML = '';
    
    if (allChatsData.length === 0) {
        container.innerHTML = '<div class="empty-state"><h2>No chats found</h2><p>Downloaded chats will appear here</p></div>';
        return;
    }
    
    allChatsData.forEach((chat, chatIdx) => {
        const prompts = Object.keys(chat.prompts_data);
        console.log(`Chat ${chatIdx} (${chat.display_name}): ${prompts.length} prompts`, prompts);
        
        const card = document.createElement('div');
        card.className = 'chat-card';
        
        let html = `
            <div class="chat-header">
                <span class="chat-title">${chat.display_name}</span>
                <span class="chat-time">${chat.timestamp}</span>
            </div>
`;
        
        if (prompts.length > 0) {
            html += `
            <div class="prompt-selector">
                <label class="selector-label">Select Prompt:</label>
                <select class="selector-dropdown" onchange="showPrompt(${chatIdx}, this.value)">
                    <option value="">-- Choose a prompt --</option>
    `;
            
            prompts.forEach(promptNum => {
                const promptData = chat.prompts_data[promptNum];
                const promptName = promptData.prompt_text.substring(0, 80) + (promptData.prompt_text.length > 80 ? '...' : '');
                html += `<option value="${promptNum}">📝 ${promptName} (${promptData.iteration_count} iterations)</option>`;
            });
            
            html += `</select></div>`;
            
            var summaryGradeKeys = [];
            for (var pi = 0; pi < prompts.length; pi++) {
                var pScores = chat.prompts_data[prompts[pi]].best_best_scores;
                if (pScores && Object.keys(pScores).length > 0) {
                    summaryGradeKeys = Object.keys(pScores);
                    break;
                }
            }
            if (summaryGradeKeys.length === 0) {
                for (var pi = 0; pi < prompts.length; pi++) {
                    var pIters = chat.prompts_data[prompts[pi]].iterations || [];
                    for (var ii = 0; ii < pIters.length; ii++) {
                        var ig = pIters[ii].best_grades || pIters[ii].layer1a_grades || pIters[ii].layer1b_grades;
                        if (ig && Object.keys(ig).length > 0) { summaryGradeKeys = Object.keys(ig); break; }
                    }
                    if (summaryGradeKeys.length > 0) break;
                }
            }

            html += `
            <div class="all-prompts-summary active">
                <h3 style="color: #2d3436; margin: 0 0 20px 0; font-size: 1.2rem; font-weight: 600;">📊 All Prompts Summary</h3>
                <div style="overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                        <thead style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; font-weight: 600;">
                            <tr>
                                <th style="padding: 14px; text-align: left; border-bottom: 2px solid #667eea;">Prompt</th>
                                <th style="padding: 8px 4px; text-align: center; border-bottom: 2px solid #667eea; white-space: nowrap; font-size: 0.85em;">Best Score</th>
                                ${summaryGradeKeys.map(k => `<th style="padding: 8px 4px; text-align: center; border-bottom: 2px solid #667eea; white-space: nowrap; font-size: 0.85em;">${k.charAt(0).toUpperCase() + k.slice(1)}</th>`).join('')}
                                <th style="padding: 8px 4px; text-align: center; border-bottom: 2px solid #667eea; white-space: nowrap; font-size: 0.85em;">Model</th>
                                <th style="padding: 8px 4px; text-align: center; border-bottom: 2px solid #667eea; white-space: nowrap; font-size: 0.85em;">Iterations</th>
                            </tr>
                        </thead>
                        <tbody>
    `;
            
            prompts.forEach(promptNum => {
                const promptData = chat.prompts_data[promptNum];
                const promptPreview = promptData.prompt_text.substring(0, 100) + (promptData.prompt_text.length > 100 ? '...' : '');
                const bestScoreValue = parseFloat(promptData.best_best_average);
                const bestScore = !isNaN(bestScoreValue) ? bestScoreValue : 0;
                const scores = promptData.best_best_scores || {};
                const model = promptData.best_best_model || 'N/A';
                const iterations = promptData.iteration_count || 0;
                
                const scoreColor = bestScore >= 75 ? '#00B894' : bestScore >= 50 ? '#f39c12' : '#e74c3c';
                
                html += `
                    <tr style="border-bottom: 1px solid #ecf0f1; transition: background-color 0.2s;">
                        <td style="padding: 12px 14px; color: #2d3436; font-weight: 500; cursor: pointer;" title="${promptData.prompt_text}" onclick="selectPromptFromTable(${chatIdx}, '${promptNum}');">
                            <span style="color: #667eea; font-weight: 600;">P${promptNum}:</span> ${promptPreview}
                        </td>
                        <td style="padding: 8px 4px; text-align: center; color: white; background: ${scoreColor}; font-weight: 600; border-radius: 4px; white-space: nowrap;">${bestScore}</td>
                        ${summaryGradeKeys.map(k => `<td style="padding: 8px 4px; text-align: center; color: #2d3436; white-space: nowrap;">${(parseFloat(scores[k] || 0)).toFixed(2)}</td>`).join('')}
                        <td style="padding: 8px 4px; text-align: center; color: #666; font-size: 0.8em; white-space: nowrap;">${model}</td>
                        <td style="padding: 8px 4px; text-align: center; color: #2d3436; font-weight: 500; white-space: nowrap;">${iterations}</td>
                    </tr>
                `;
            });
            
            html += `
                        </tbody>
                    </table>
                </div>
            </div>
`;
            
            prompts.forEach((promptNum, idx) => {
                const promptData = chat.prompts_data[promptNum];
                html += `
                    <div class="prompt-content" id="prompt-${chatIdx}-${promptNum}">
                        <div class="prompt-info">
                            <h3 style="color: #2d3436; margin: 0 0 12px 0; font-size: 1.1rem; display: flex; align-items: center; gap: 8px;">📝 Prompt Name</h3>
                            <div class="prompt-text" style="background: #f8f9fa; padding: 12px; border-radius: 6px; margin-bottom: 15px; border-left: 3px solid #667eea; color: #2d3436;">${promptData.prompt_text}</div>
                        </div>
                        <div style="margin-bottom: 15px; padding: 10px; background: #f0f4ff; border-radius: 5px;">
                            <div class="score-badge" style="background: linear-gradient(135deg, #764ba2 0%, #667eea 100%); font-size: 1em; padding: 6px 12px;">Best-Best Avg: <span style="color: #ffd700; font-weight: bold;">${promptData.best_best_average}</span> ${promptData.best_best_model ? `<span style="color: #fff; margin-left: 10px; font-size: 0.9em;">(${promptData.best_best_model})</span>` : ''}</div>
                            ${promptData.best_best_scores && Object.keys(promptData.best_best_scores).length > 0 ? `
                            <div class="score-grid" style="margin-top: 10px;">
                                ${Object.entries(promptData.best_best_scores).map(([k, v]) => `<div class="score-item"><span class="score-key">${k.charAt(0).toUpperCase() + k.slice(1, 6)}</span><span class="score-val">${(typeof v === 'number' ? v.toFixed(2) : parseFloat(v || 0).toFixed(2))}</span></div>`).join('')}
                            </div>
                            ` : ''}
                        </div>
                        <div style="display: flex; gap: 20px; margin-bottom: 30px;">
                            <!-- Graphic Display Area (Left) -->
                            <div style="flex: 1; min-width: 350px; background: linear-gradient(135deg, rgba(255, 255, 255, 0.97) 0%, rgba(248, 249, 250, 0.95) 100%); border-radius: 15px; padding: 25px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08); border: 1px solid rgba(227, 232, 237, 0.5);">
                                <h4 style="color: #2d3436; margin-bottom: 20px; font-size: 1.1rem; font-weight: 600; display: flex; align-items: center; gap: 8px;">📊 Scores & Performance</h4>
                                <canvas id="chart-review-${chatIdx}-${promptNum}" style="max-height: 350px; min-height: 320px;"></canvas>
                            </div>
                            
                            <!-- Iteration Results (Right) -->
                            <div style="flex: 1; min-width: 300px;" id="results-review-${chatIdx}-${promptNum}"></div>
                        </div>
                        <div style="display: flex; justify-content: center; margin-bottom: 20px;">
                            <button type="button" class="analyse-deeper-btn-review" data-iterations='${JSON.stringify(promptData.iterations || [])}' data-grader-setting="${chat.grader_setting_name || 'default'}" data-saved-weights='${JSON.stringify(chat.saved_weights || {})}' style="padding: 8px 16px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.95rem; font-weight: 500; transition: transform 0.2s, box-shadow 0.2s; display: flex; align-items: center; gap: 6px;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 5px 15px rgba(102, 126, 234, 0.4)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none';">Analyze Deeper<span class="info-icon" data-tooltip="View detailed charts and grading analysis">i</span></button>
                        </div>
                        <div class="iterations-grid">
                `;
                
                if (promptData.iterations && promptData.iterations.length > 0) {
                    const iterAverages = promptData.iterations.map((iter, idx) => ({
                        idx,
                        avg: iter.average
                    }));
                    const maxAvg = Math.max(...iterAverages.map(a => a.avg));
                    const bestIterations = iterAverages.filter(a => a.avg === maxAvg).map(a => a.idx);
                    
                    promptData.iterations.forEach((iter, iterIdx) => {
                        const iterAvg = iter.average;
                        const isBest = bestIterations.includes(iterIdx);
                        const cardStyle = isBest ? 'border: 3px solid #ffd700; background: #fffef0; box-shadow: 0 0 10px rgba(255, 215, 0, 0.5);' : '';
                        
                        html += `
                            <div class="iteration-card" id="iter-card-${chatIdx}-${promptNum}-${iterIdx}" style="${cardStyle}">
                                ${isBest ? '<div style="color: #ffd700; font-weight: bold; margin-bottom: 5px;">⭐ BEST</div>' : ''}
                                <div class="iteration-title">Iteration ${iter.iteration}</div>
                                <div class="score-badge" style="${isBest ? 'background: linear-gradient(135deg, #ffd700 0%, #ffed4e 100%); color: #333;' : ''}">Avg: ${iterAvg}</div>
                                ${iter.model_used ? `<div style="font-size: 0.8em; color: #666; margin-top: 5px; font-weight: 500;">${iter.model_used}</div>` : ''}
                                <div class="score-grid" style="margin-top: 10px;">
                                    ${Object.entries(iter.scores).map(([k, v]) => `<div class="score-item"><span class="score-key">${k.charAt(0).toUpperCase() + k.slice(1, 6)}</span><span class="score-val">${(typeof v === 'number' ? v.toFixed(2) : parseFloat(v || 0).toFixed(2))}</span></div>`).join('')}
                                </div>
                            </div>
                        `;
                    });
                } else {
                    html += `<div class="iteration-card"><div class="iteration-title">No iterations available</div></div>`;
                }
                
                html += `
                        </div>
                    </div>
                `;
            });
        } else {
            html += `<div style="color: #999; padding: 20px; text-align: center;">No prompts data available</div>`;
        }
        
        html += `<div style="display: flex; gap: 10px;">
            <button class="action-btn" style="flex: 1;" data-filename="${chat.filename}" onclick="openConfirmModal(this.dataset.filename)">📥 Load This Chat</button>
            <button class="action-btn" style="flex: 1; background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);" data-filename="${chat.filename}" data-displayname="${chat.display_name}" onclick="openDeleteModal(this.dataset.filename, this.dataset.displayname)">🗑️ Delete Chat</button>
        </div>`;
        
        card.innerHTML = html;
        container.appendChild(card);
    });
    
    document.querySelectorAll('.analyse-deeper-btn-review').forEach(btn => {
        btn.addEventListener('click', function() {
            const iterations = JSON.parse(this.dataset.iterations || '[]');
            const gsn = this.dataset.graderSetting || 'default';
            const savedWeights = JSON.parse(this.dataset.savedWeights || '{}');
            openDeeperAnalysis(0, iterations, gsn, savedWeights);
        });
    });
}
