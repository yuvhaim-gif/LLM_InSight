let selectedChatFile = null;
            let allChatsData = [];

            function formatTime(seconds) {
                if (!seconds || isNaN(seconds)) return '0s';
                const totalSeconds = Math.round(seconds);
                if (totalSeconds < 60) return totalSeconds + 's';
                const minutes = Math.floor(totalSeconds / 60);
                if (minutes < 60) return minutes + 'm';
                const hours = Math.floor(minutes / 60);
                return hours + 'h ' + (minutes % 60) + 'm';
            }

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
            
            function renderPromptChart(chatIdx, promptNum) {
                const chatData = allChatsData[chatIdx];
                const promptData = chatData.prompts_data[promptNum];
                
                if (!promptData || !promptData.iterations || promptData.iterations.length === 0) return;
                
                const chartCanvasId = `chart-review-${chatIdx}-${promptNum}`;
                const resultsContainerId = `results-review-${chatIdx}-${promptNum}`;
                const chartCanvas = document.getElementById(chartCanvasId);
                const resultsContainer = document.getElementById(resultsContainerId);
                
                if (!chartCanvas || !resultsContainer) return;
                
                renderIterationResults(promptData, resultsContainer);
                
                const iterations = promptData.iterations;
                const labels = iterations.map(it => 'Iteration ' + it.iteration);
                
                const layer1aScores = iterations.map(it => parseFloat(it.layer1a_score) || 0);
                const layer1bScores = iterations.map(it => parseFloat(it.layer1b_score) || 0);
                
                console.log('Chart data:', { labels, layer1aScores, layer1bScores });
                
                const winners = iterations.map((it, idx) => {
                    const a = parseFloat(it.layer1a_score) || 0;
                    const b = parseFloat(it.layer1b_score) || 0;
                    return a >= b ? a : b;
                });
                
                const degradationFlags = [];
                for (let i = 0; i < winners.length; i++) {
                    if (i > 0 && winners[i] < winners[i-1]) {
                        degradationFlags[i] = true;
                    } else {
                        degradationFlags[i] = false;
                    }
                }
                
                const ctx = chartCanvas.getContext('2d');
                if (window.chartInstance && window.chartInstance[chartCanvasId]) {
                    window.chartInstance[chartCanvasId].destroy();
                }
                if (!window.chartInstance) window.chartInstance = {};
                
                const chartConfig = {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [
                            {
                                label: 'Answer Model 1',
                                data: layer1aScores,
                                backgroundColor: '#0984E3',
                                borderColor: '#0984E3',
                                borderWidth: 0,
                                borderRadius: 8,
                                yAxisID: 'y',
                                hoverBackgroundColor: '#0565C8',
                                barPercentage: 0.75
                            },
                            {
                                label: 'Answer Model 2',
                                data: layer1bScores,
                                backgroundColor: '#E84393',
                                borderColor: '#E84393',
                                borderWidth: 0,
                                borderRadius: 8,
                                yAxisID: 'y',
                                hoverBackgroundColor: '#D1216E',
                                barPercentage: 0.75
                            },
                            {
                                label: 'Winner Score',
                                data: winners,
                                borderColor: function(context) {
                                    const idx = context.dataIndex;
                                    if (degradationFlags[idx]) return '#DC3545';
                                    return '#00B894';
                                },
                                backgroundColor: function(context) {
                                    const idx = context.dataIndex;
                                    if (degradationFlags[idx]) return 'rgba(220, 53, 69, 0.15)';
                                    return 'rgba(0, 184, 148, 0.15)';
                                },
                                borderWidth: 4,
                                type: 'line',
                                fill: false,
                                tension: 0.45,
                                pointRadius: 9,
                                pointHoverRadius: 12,
                                pointBackgroundColor: function(context) {
                                    const idx = context.dataIndex;
                                    if (degradationFlags[idx]) return '#DC3545';
                                    return '#00B894';
                                },
                                pointBorderColor: '#FFFFFF',
                                pointBorderWidth: 3,
                                yAxisID: 'y'
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: true,
                        interaction: {
                            intersect: false,
                            mode: 'index'
                        },
                        plugins: {
                            datalabels: {
                                display: true,
                                formatter: function(value) {
                                    if (value === null || value === undefined) return '';
                                    return value;
                                },
                                color: '#000000',
                                backgroundColor: 'rgba(255, 255, 255, 0.8)',
                                borderRadius: 4,
                                padding: 4,
                                font: {
                                    size: 13,
                                    weight: 'bold'
                                },
                                anchor: 'top',
                                offset: function(context) {
                                    return context.datasetIndex === 2 ? 12 : 6;
                                }
                            },
                            legend: {
                                display: true,
                                position: 'bottom',
                                labels: {
                                    font: {size: 14, weight: 700},
                                    padding: 20,
                                    usePointStyle: true,
                                    boxWidth: 12,
                                    color: '#333'
                                }
                            },
                            tooltip: {
                                backgroundColor: 'rgba(0, 0, 0, 0.9)',
                                padding: 16,
                                titleFont: {size: 17, weight: 'bold'},
                                bodyFont: {size: 16},
                                borderColor: 'rgba(255, 255, 255, 0.5)',
                                borderWidth: 2,
                                borderRadius: 8,
                                boxPadding: 10,
                                displayColors: true
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                max: 100,
                                ticks: {
                                    color: '#666',
                                    font: {size: 12}
                                },
                                grid: {
                                    color: 'rgba(200, 200, 200, 0.2)',
                                    drawBorder: false
                                }
                            },
                            x: {
                                ticks: {
                                    color: '#666',
                                    font: {size: 12}
                                },
                                grid: {
                                    display: false
                                }
                            }
                        }
                    }
                };
                
                Chart.register(ChartDataLabels);
                chartConfig.plugins = [ChartDataLabels];
                window.chartInstance[chartCanvasId] = new Chart(ctx, chartConfig);
            }



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

            window.onclick = function(event) {
                const confirmModal = document.getElementById('confirmModal');
                const deleteModal = document.getElementById('deleteModal');
                const deeperAnalysisModal = document.getElementById('deeperAnalysisModal');
                if (event.target == confirmModal) {
                    closeModal();
                }
                if (event.target == deleteModal) {
                    closeDeleteModal();
                }
                if (event.target == deeperAnalysisModal) {
                    closeDeeperAnalysisModal();
                }
            }

            if (window.Chart && window.ChartDataLabels && !window.ChartDataLabelsRegistered) {
                Chart.register(ChartDataLabels);
                window.ChartDataLabelsRegistered = true;
            }

            let DEEPER_ANALYSIS_GRADE_KEYS = ["accuracy", "clarity", "conciseness", "creativity", "structure"];
            let DEEPER_ANALYSIS_DEFAULT_WEIGHTS = { accuracy: 0.25, clarity: 0.25, conciseness: 0.15, creativity: 0.25, structure: 0.10 };
            let deeperAnalysisAvgChart = null;
            let deeperAnalysisRadarChart = null;
            let deeperAnalysisOriginalWeights = null;

            function getDeeperAnalysisInitialWeights() {
                if (window._currentDeeperAnalysisSavedWeights && Object.keys(window._currentDeeperAnalysisSavedWeights).length > 0) {
                    return normalizeDeeperAnalysisWeights({ ...window._currentDeeperAnalysisSavedWeights });
                }
                return { ...DEEPER_ANALYSIS_DEFAULT_WEIGHTS };
            }

            function renderDeeperAnalysisWeightControls(weights) {
                var wkeys = Object.keys(weights);
                if (wkeys.length === 0) wkeys = DEEPER_ANALYSIS_GRADE_KEYS;
                const entries = wkeys.map(key => {
                    const value = weights[key] || 0;
                    return `<div style="display: flex; align-items: center; gap: 6px; background: rgba(255,255,255,0.95); border: 1px solid rgba(102, 126, 234, 0.2); border-radius: 8px; padding: 6px 8px;"><span style="font-size: 0.78rem; font-weight: 600; color: #2d3436; text-transform: capitalize;">${key}</span><input type="number" data-deeper-weight-input="${key}" value="${value.toFixed(2)}" min="0" max="1" step="0.01" style="width: 66px; padding: 3px 6px; border: 1px solid #d0d7de; border-radius: 6px; font-size: 0.78rem;"><span data-deeper-weight-percent="${key}" style="font-size: 0.75rem; color: #636e72;">${(value * 100).toFixed(0)}%</span></div>`;
                }).join('');

                const total = wkeys.reduce((sum, key) => sum + (weights[key] || 0), 0);
                return `<div id="deeperAnalysisWeightControls" style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 0 0 14px 0;"><span style="font-size: 0.85rem; font-weight: 700; color: #2d3436; margin-right: 6px;">⚖️ Avg Graph Weights</span><span id="deeperAnalysisWeightTotalIndicator" style="font-size: 0.78rem; font-weight: 700; padding: 3px 8px; border-radius: 999px; background: #e9ecef; color: #495057;">Total: ${(total * 100).toFixed(0)}%</span><button type="button" id="deeperAnalysisWeightResetBtn" onclick="resetDeeperAnalysisWeightsToOriginal()" style="border: none; border-radius: 8px; padding: 4px 10px; font-size: 0.75rem; font-weight: 700; cursor: pointer; background: #e2e3e5; color: #6c757d;">Reset</button>${entries}</div>`;
            }

            function areDeeperAnalysisWeightsAtOriginal(currentWeights) {
                if (!deeperAnalysisOriginalWeights) {
                    return true;
                }
                var keys = Object.keys(currentWeights);
                if (keys.length === 0) keys = DEEPER_ANALYSIS_GRADE_KEYS;
                return keys.every(key => Math.abs((currentWeights[key] || 0) - (deeperAnalysisOriginalWeights[key] || 0)) < 0.001);
            }

            function resetDeeperAnalysisWeightsToOriginal() {
                if (!deeperAnalysisOriginalWeights) {
                    return;
                }

                const inputs = document.querySelectorAll('[data-deeper-weight-input]');
                if (!inputs.length) {
                    return;
                }

                inputs.forEach(input => {
                    const key = input.getAttribute('data-deeper-weight-input');
                    if (key in deeperAnalysisOriginalWeights) {
                        input.value = deeperAnalysisOriginalWeights[key].toFixed(2);
                    }
                });

                updateDeeperAnalysisWeightIndicator();
                inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
            }

            function updateDeeperAnalysisWeightIndicator() {
                const inputs = document.querySelectorAll('[data-deeper-weight-input]');
                const indicator = document.getElementById('deeperAnalysisWeightTotalIndicator');
                const resetBtn = document.getElementById('deeperAnalysisWeightResetBtn');

                if (!inputs.length || !indicator) {
                    return;
                }

                let total = 0;
                const currentWeights = {};
                inputs.forEach(input => {
                    const key = input.getAttribute('data-deeper-weight-input');
                    const value = parseFloat(input.value);
                    const safeValue = !isNaN(value) && value >= 0 ? value : 0;
                    total += safeValue;
                    if (key) {
                        currentWeights[key] = safeValue;
                    }

                    const percentLabel = document.querySelector(`[data-deeper-weight-percent="${key}"]`);
                    if (percentLabel) {
                        percentLabel.textContent = (safeValue * 100).toFixed(0) + '%';
                    }
                });

                const totalPercent = total * 100;
                indicator.textContent = `Total: ${totalPercent.toFixed(0)}%`;

                if (Math.abs(total - 1) < 0.001) {
                    indicator.style.background = '#d1f7e5';
                    indicator.style.color = '#0f8f56';
                } else if (total < 1) {
                    indicator.style.background = '#fff3cd';
                    indicator.style.color = '#b26a00';
                } else {
                    indicator.style.background = '#fde2e2';
                    indicator.style.color = '#c0392b';
                }

                if (resetBtn) {
                    if (areDeeperAnalysisWeightsAtOriginal(currentWeights)) {
                        resetBtn.style.background = '#e2e3e5';
                        resetBtn.style.color = '#6c757d';
                    } else {
                        resetBtn.style.background = '#f8d7da';
                        resetBtn.style.color = '#842029';
                    }
                }
            }

            function getDeeperAnalysisModalWeights() {
                const weights = { ...DEEPER_ANALYSIS_DEFAULT_WEIGHTS };
                const inputs = document.querySelectorAll('[data-deeper-weight-input]');

                inputs.forEach(input => {
                    const key = input.getAttribute('data-deeper-weight-input');
                    const value = parseFloat(input.value);
                    if (key && !isNaN(value)) {
                        weights[key] = value;
                    }
                });

                return normalizeDeeperAnalysisWeights(weights);
            }

            function normalizeDeeperAnalysisWeights(weights) {
                const normalized = {};
                let total = 0;
                var keys = Object.keys(weights);
                if (keys.length === 0) keys = DEEPER_ANALYSIS_GRADE_KEYS;

                keys.forEach(key => {
                    const value = parseFloat(weights[key]);
                    const safeValue = !isNaN(value) && value >= 0 ? value : 0;
                    normalized[key] = safeValue;
                    total += safeValue;
                });

                if (total <= 0) {
                    return { ...DEEPER_ANALYSIS_DEFAULT_WEIGHTS };
                }

                keys.forEach(key => {
                    normalized[key] = normalized[key] / total;
                });

                return normalized;
            }

            function calculateDeeperAnalysisWeightedScore(grades, weights) {
                let total = 0;
                var keys = Object.keys(weights);
                if (keys.length === 0) keys = DEEPER_ANALYSIS_GRADE_KEYS;

                keys.forEach(key => {
                    const gradeValue = grades && grades[key] !== undefined ? parseFloat(grades[key]) : 0;
                    const safeGrade = !isNaN(gradeValue) ? gradeValue : 0;
                    total += safeGrade * (weights[key] || 0);
                });

                return total;
            }

            function closeDeeperAnalysisModal() {
                const modal = document.getElementById('deeperAnalysisModal');
                if (modal) {
                    modal.classList.remove('show');
                    console.log('Modal closed');
                }
            }

            function openDeeperAnalysis(promptNumber, iterations, graderSettingName, savedWeights) {
                console.log('openDeeperAnalysis called with:', promptNumber, iterations);
                try {
                    if (!iterations || iterations.length === 0) {
                        console.error('No iteration data available');
                        alert('No iteration data available');
                        return;
                    }
                    
                    var detectedKeys = null;
                    for (var ii = 0; ii < iterations.length; ii++) {
                        var it = iterations[ii];
                        var g = (it && it.best_grades) || (it && it.layer1a_grades) || (it && it.layer1b_grades) || null;
                        if (g && Object.keys(g).length > 0) { detectedKeys = Object.keys(g); break; }
                    }
                    if (detectedKeys && detectedKeys.length > 0) {
                        DEEPER_ANALYSIS_GRADE_KEYS = detectedKeys;
                    }

                    if (savedWeights && Object.keys(savedWeights).length > 0) {
                        window._currentDeeperAnalysisSavedWeights = savedWeights;
                        DEEPER_ANALYSIS_DEFAULT_WEIGHTS = { ...savedWeights };
                    } else if (detectedKeys && detectedKeys.length > 0) {
                        var equalW = {};
                        detectedKeys.forEach(function(k) { equalW[k] = 1.0 / detectedKeys.length; });
                        DEEPER_ANALYSIS_DEFAULT_WEIGHTS = equalW;
                        window._currentDeeperAnalysisSavedWeights = null;
                    } else {
                        window._currentDeeperAnalysisSavedWeights = null;
                    }

                    var activeGraderName = graderSettingName || 'default';
                    const grading_keys = DEEPER_ANALYSIS_GRADE_KEYS;
                    const initialWeights = getDeeperAnalysisInitialWeights();
                    deeperAnalysisOriginalWeights = { ...initialWeights };
                    let html = '';
                    
                    html += '<div style="margin-bottom: 12px; padding: 8px 14px; background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.15) 100%); border-radius: 8px; border-left: 4px solid #764ba2; display: flex; align-items: center; gap: 8px;">';
                    html += '<span style="font-size: 0.85rem; font-weight: 700; color: #2d3436;">📋 Grader Setting:</span>';
                    html += '<span style="font-size: 0.85rem; color: #6c5ce7; font-weight: 600;">' + activeGraderName + '</span>';
                    html += '</div>';
                    html += '<div class="deeper-analysis-section">';
                    html += '<h3>📊 Average Grade Analysis</h3>';
                    html += renderDeeperAnalysisWeightControls(initialWeights);
                    html += '<div class="deeper-analysis-charts">';
                    html += '<div class="deeper-analysis-chart-container">';
                    html += '<canvas id="deeperAnalysisAvgChart"></canvas>';
                    html += '</div>';
                    html += '<div class="deeper-analysis-chart-container">';
                    html += '<canvas id="deeperAnalysisRadarChart"></canvas>';
                    html += '</div>';
                    html += '</div>';
                    html += '</div>';
                    
                    html += '<div class="deeper-analysis-section">';
                    html += '<h3>🔤 Token Usage & ⏱️ Runtime Analysis</h3>';
                    html += '<div class="deeper-analysis-charts">';
                    html += '<div class="deeper-analysis-chart-container">';
                    html += '<h4 style="margin: 0 0 10px 0; color: #2d3436; font-size: 1rem; font-weight: 700;">🔤 Token Usage Analysis</h4>';
                    html += '<canvas id="deeperAnalysisTokenChart" style="max-height: 240px; min-height: 200px;"></canvas>';
                    html += '</div>';
                    html += '<div class="deeper-analysis-chart-container">';
                    html += '<h4 style="margin: 0 0 10px 0; color: #2d3436; font-size: 1rem; font-weight: 700;">⏱️ Runtime Analysis</h4>';
                    html += '<canvas id="deeperAnalysisRuntimeChart" style="max-height: 240px; min-height: 200px;"></canvas>';
                    html += '</div>';
                    html += '</div>';
                    html += '</div>';
                    
                    html += '<div class="deeper-analysis-section">';
                    html += '<h3>🎯 Individual Grading Key Analysis</h3>';
                    html += '<div class="deeper-analysis-charts">';
                    
                    for (let key of grading_keys) {
                        html += '<div class="deeper-analysis-chart-container">';
                        html += `<canvas id="deeperAnalysisChart_${key}"></canvas>`;
                        html += '</div>';
                    }
                    
                    html += '</div>';
                    html += '</div>';
                    
                    const modal = document.getElementById('deeperAnalysisModal');
                    const body = document.getElementById('deeperAnalysisBody');
                    
                    if (!modal) {
                        console.error('Modal element not found!');
                        alert('Error: Modal element not found');
                        return;
                    }
                    if (!body) {
                        console.error('Modal body element not found!');
                        alert('Error: Modal body element not found');
                        return;
                    }
                    
                    body.innerHTML = html;

                    const avgSection = body.querySelector('.deeper-analysis-section');
                    if (avgSection && !body.querySelector('#deeperAnalysisWeightControls')) {
                        avgSection.insertAdjacentHTML('beforeend', renderDeeperAnalysisWeightControls(initialWeights));
                    }
                    updateDeeperAnalysisWeightIndicator();

                    modal.classList.add('show');
                    console.log('Modal opened successfully, class:', modal.className);
                    
                    setTimeout(() => {
                        createDeeperAnalysisCharts(promptNumber, iterations, grading_keys);
                    }, 100);
                    
                    window.currentDeeperAnalysisData = {
                        promptNumber: promptNumber,
                        iterations: iterations,
                        grading_keys: grading_keys
                    };
                    
                } catch (e) {
                    console.error('Error opening deeper analysis:', e);
                    alert('Error opening analysis. Check console for details.');
                }
            }

            function createDeeperAnalysisCharts(promptNumber, iterations, grading_keys) {
                console.log('Creating deeper analysis charts...');
                try {
                    if (!window.Chart) {
                        console.error('Chart.js not loaded');
                        return;
                    }
                    
                    console.log('Chart.js is available, proceeding with chart creation');
                    const avgCtx = document.getElementById('deeperAnalysisAvgChart');
                    if (avgCtx) {
                        const labels = iterations.map(it => 'Iter ' + it.iteration);
                        const layer1aModel = iterations[0].layer1a_model_used || 'Model 1';
                        const layer1bModel = iterations[0].layer1b_model_used || 'Model 2';

                        let degradationFlags = [];
                        let bestFlags = [];

                        const buildAverageSeries = () => {
                            const weights = getDeeperAnalysisModalWeights();
                            const layer1aScores = iterations.map(it => {
                                if (it.layer1a_grades && Object.keys(it.layer1a_grades).length > 0) {
                                    return calculateDeeperAnalysisWeightedScore(it.layer1a_grades, weights);
                                }
                                return parseFloat(it.layer1a_score || 0) || 0;
                            });
                            const layer1bScores = iterations.map(it => {
                                if (it.layer1b_grades && Object.keys(it.layer1b_grades).length > 0) {
                                    return calculateDeeperAnalysisWeightedScore(it.layer1b_grades, weights);
                                }
                                return parseFloat(it.layer1b_score || 0) || 0;
                            });
                            const winners = layer1aScores.map((scoreA, index) => Math.max(scoreA, layer1bScores[index]));
                            const nextDegradationFlags = winners.map((score, index) => index > 0 && score < winners[index - 1]);
                            const maxWinner = winners.length > 0 ? Math.max(...winners) : 0;
                            const nextBestFlags = winners.map(score => score === maxWinner);

                            return {
                                layer1aScores,
                                layer1bScores,
                                winners,
                                degradationFlags: nextDegradationFlags,
                                bestFlags: nextBestFlags
                            };
                        };

                        const getBestBestSnapshot = () => {
                            const getIterationAverage = (it) => {
                                const avgValue = parseFloat(it && it.average);
                                if (!isNaN(avgValue)) return avgValue;
                                const bestScoreValue = parseFloat(it && it.best_score);
                                if (!isNaN(bestScoreValue)) return bestScoreValue;
                                const scoreA = parseFloat((it && it.layer1a_score) || 0);
                                const scoreB = parseFloat((it && it.layer1b_score) || 0);
                                return Math.max(!isNaN(scoreA) ? scoreA : 0, !isNaN(scoreB) ? scoreB : 0);
                            };

                            const seriesForBestSelection = buildAverageSeries();
                            const winners = seriesForBestSelection.winners || [];
                            const maxWinner = winners.length > 0 ? Math.max(...winners) : -Infinity;

                            let bestIteration = null;
                            if (winners.length > 0 && maxWinner > -Infinity) {
                                let bestIndex = -1;
                                winners.forEach((value, idx) => {
                                    if (value === maxWinner) bestIndex = idx;
                                });
                                if (bestIndex >= 0) {
                                    bestIteration = iterations[bestIndex] || null;
                                }
                            }

                            if (!bestIteration) {
                                bestIteration = iterations.reduce((best, current) => {
                                    if (!best) return current;
                                    const bestAvg = getIterationAverage(best);
                                    const currentAvg = getIterationAverage(current);
                                    if (currentAvg > bestAvg) return current;
                                    if (currentAvg < bestAvg) return best;
                                    const bestIterNum = parseInt(best && best.iteration, 10) || 0;
                                    const currentIterNum = parseInt(current && current.iteration, 10) || 0;
                                    return currentIterNum >= bestIterNum ? current : best;
                                }, null);
                            }

                            const safeBestIteration = bestIteration || {};
                            let grades = {};

                            if (safeBestIteration.scores && Object.keys(safeBestIteration.scores).length > 0) {
                                grades = safeBestIteration.scores;
                            } else {
                                const winner = (safeBestIteration.winner || '').toString().trim().toLowerCase();
                                const scoreA = parseFloat(safeBestIteration.layer1a_score);
                                const scoreB = parseFloat(safeBestIteration.layer1b_score);

                                if (winner === 'improved') {
                                    grades = safeBestIteration.layer1b_grades || {};
                                } else if (winner === 'original') {
                                    grades = safeBestIteration.layer1a_grades || {};
                                } else if (!isNaN(scoreA) && !isNaN(scoreB)) {
                                    grades = scoreB >= scoreA ? (safeBestIteration.layer1b_grades || {}) : (safeBestIteration.layer1a_grades || {});
                                } else if (safeBestIteration.layer1b_grades && Object.keys(safeBestIteration.layer1b_grades).length > 0) {
                                    grades = safeBestIteration.layer1b_grades;
                                } else {
                                    grades = safeBestIteration.layer1a_grades || {};
                                }
                            }

                            const normalizedGrades = {};
                            DEEPER_ANALYSIS_GRADE_KEYS.forEach(key => {
                                const value = parseFloat(grades[key]);
                                normalizedGrades[key] = !isNaN(value) ? value : 0;
                            });

                            const avgFromIteration = getIterationAverage(safeBestIteration);
                            const baseAvg = !isNaN(avgFromIteration)
                                ? avgFromIteration
                                : (DEEPER_ANALYSIS_GRADE_KEYS.reduce((sum, key) => sum + normalizedGrades[key], 0) / DEEPER_ANALYSIS_GRADE_KEYS.length);

                            return { grades: normalizedGrades, baseAvg };
                        };

                        const buildRadarSeries = () => {
                            const bestBest = getBestBestSnapshot();
                            const weights = getDeeperAnalysisModalWeights();

                            return {
                                labels: DEEPER_ANALYSIS_GRADE_KEYS.map(key => key.charAt(0).toUpperCase() + key.slice(1)),
                                bestBestGrades: DEEPER_ANALYSIS_GRADE_KEYS.map(key => bestBest.grades[key] || 0),
                                baseAvg: bestBest.baseAvg,
                                weightedAvg: calculateDeeperAnalysisWeightedScore(bestBest.grades, weights)
                            };
                        };

                        const series = buildAverageSeries();
                        const radarSeries = buildRadarSeries();
                        degradationFlags = series.degradationFlags;
                        bestFlags = series.bestFlags;

                        const ctx = avgCtx.getContext('2d');
                        if (window.ChartDataLabels) {
                            window.Chart.register(window.ChartDataLabels);
                        }
                        if (deeperAnalysisAvgChart) {
                            deeperAnalysisAvgChart.destroy();
                        }
                        deeperAnalysisAvgChart = new Chart(ctx, {
                            plugins: [ChartDataLabels],
                            type: 'bar',
                            data: {
                                labels: labels,
                                datasets: [
                                    {
                                        label: layer1aModel,
                                        data: series.layer1aScores,
                                        backgroundColor: '#0984E3',
                                        borderColor: '#0984E3',
                                        borderWidth: 0,
                                        borderRadius: 6,
                                        yAxisID: 'y'
                                    },
                                    {
                                        label: layer1bModel,
                                        data: series.layer1bScores,
                                        backgroundColor: '#E84393',
                                        borderColor: '#E84393',
                                        borderWidth: 0,
                                        borderRadius: 6,
                                        yAxisID: 'y'
                                    },
                                    {
                                        label: 'Winner Score',
                                        data: series.winners,
                                        borderColor: function(context) {
                                            const idx = context.dataIndex;
                                            if (degradationFlags[idx]) return '#DC3545';
                                            return '#00B894';
                                        },
                                        backgroundColor: function(context) {
                                            const idx = context.dataIndex;
                                            if (degradationFlags[idx]) return 'rgba(220, 53, 69, 0.15)';
                                            return 'rgba(0, 184, 148, 0.15)';
                                        },
                                        borderWidth: 4,
                                        type: 'line',
                                        fill: false,
                                        tension: 0.45,
                                        pointRadius: 7,
                                        pointHoverRadius: 9,
                                        pointBackgroundColor: function(context) {
                                            const idx = context.dataIndex;
                                            if (bestFlags[idx]) return '#FFC107';
                                            if (degradationFlags[idx]) return '#DC3545';
                                            return '#00B894';
                                        },
                                        pointBorderColor: '#FFFFFF',
                                        pointBorderWidth: 3,
                                        yAxisID: 'y',
                                        segment: {
                                            borderDash: ctx => ctx.p0?.y > ctx.p1?.y ? [5, 5] : []
                                        }
                                    }
                                ]
                            },
                            options: {
                                responsive: true,
                                maintainAspectRatio: true,
                                interaction: {
                                    intersect: false,
                                    mode: 'index'
                                },
                                plugins: {
                                    legend: { display: true, position: 'bottom', labels: {font: {size: 13, weight: 600}, padding: 15, usePointStyle: true, boxWidth: 8} },
                                    datalabels: {
                                        display: true,
                                        formatter: function(value, context) {
                                            if (value === null || value === undefined) return '';
                                            const numericValue = parseFloat(value);
                                            return isNaN(numericValue) ? value : numericValue.toFixed(2);
                                        },
                                        color: '#000000',
                                        backgroundColor: 'rgba(255, 255, 255, 0.8)',
                                        borderRadius: 4,
                                        padding: 4,
                                        font: {
                                            size: 13,
                                            weight: 'bold'
                                        },
                                        anchor: 'top',
                                        offset: function(context) {
                                            return context.datasetIndex === 2 ? 12 : 6;
                                        }
                                    },
                                    tooltip: {
                                        backgroundColor: 'rgba(0, 0, 0, 0.85)',
                                        padding: 13,
                                        titleFont: {size: 13, weight: 'bold'},
                                        bodyFont: {size: 12},
                                        borderColor: 'rgba(255, 255, 255, 0.4)',
                                        borderWidth: 2,
                                        borderRadius: 6,
                                        boxPadding: 8
                                    }
                                },
                                scales: {
                                    y: {
                                        type: 'linear',
                                        position: 'left',
                                        beginAtZero: true,
                                        max: 100,
                                        grid: {
                                            color: 'rgba(0, 0, 0, 0.06)',
                                            drawBorder: false,
                                            lineWidth: 1
                                        },
                                        ticks: {
                                            color: '#666',
                                            font: {size: 12, weight: 500}
                                        }
                                    },
                                    x: {
                                        grid: {
                                            display: false,
                                            drawBorder: false
                                        },
                                        ticks: {
                                            color: '#666',
                                            font: {size: 12, weight: 500}
                                        }
                                    }
                                }
                            }
                        });

                        const radarCtx = document.getElementById('deeperAnalysisRadarChart');
                        if (radarCtx) {
                            const radarContext = radarCtx.getContext('2d');
                            if (deeperAnalysisRadarChart) {
                                deeperAnalysisRadarChart.destroy();
                            }
                            deeperAnalysisRadarChart = new Chart(radarContext, {
                                type: 'radar',
                                data: {
                                    labels: radarSeries.labels,
                                    datasets: [
                                        {
                                            label: 'Best-Best Key Grades',
                                            data: radarSeries.bestBestGrades,
                                            borderColor: '#00B894',
                                            backgroundColor: 'rgba(0, 184, 148, 0.22)',
                                            pointBackgroundColor: '#00B894',
                                            pointBorderColor: '#ffffff',
                                            pointHoverBackgroundColor: '#ffffff',
                                            pointHoverBorderColor: '#00B894',
                                            borderWidth: 2
                                        }
                                    ]
                                },
                                options: {
                                    responsive: true,
                                    maintainAspectRatio: true,
                                    plugins: {
                                        title: { display: true, text: `Weighted Avg: ${radarSeries.weightedAvg.toFixed(2)}`, font: { size: 13, weight: 'bold' }, padding: { bottom: 8 } },
                                        legend: { display: true, position: 'bottom', labels: { font: { size: 12, weight: 600 }, padding: 12, usePointStyle: true } },
                                        tooltip: {
                                            backgroundColor: 'rgba(0, 0, 0, 0.85)',
                                            padding: 12,
                                            titleFont: { size: 13, weight: 'bold' },
                                            bodyFont: { size: 12 },
                                            borderColor: 'rgba(255, 255, 255, 0.4)',
                                            borderWidth: 1,
                                            borderRadius: 6
                                        }
                                    },
                                    scales: {
                                        r: {
                                            beginAtZero: true,
                                            min: 0,
                                            max: 100,
                                            ticks: {
                                                display: true,
                                                backdropColor: 'transparent',
                                                color: '#666',
                                                stepSize: 20
                                            },
                                            pointLabels: {
                                                color: '#495057',
                                                font: { size: 12, weight: 600 }
                                            },
                                            grid: {
                                                color: 'rgba(0, 0, 0, 0.1)'
                                            },
                                            angleLines: {
                                                color: 'rgba(0, 0, 0, 0.1)'
                                            }
                                        }
                                    }
                                }
                            });
                        }

                        const popupWeightInputs = document.querySelectorAll('[data-deeper-weight-input]');
                        popupWeightInputs.forEach(input => {
                            input.addEventListener('input', () => {
                                updateDeeperAnalysisWeightIndicator();

                                if (deeperAnalysisAvgChart) {
                                    const nextSeries = buildAverageSeries();
                                    degradationFlags = nextSeries.degradationFlags;
                                    bestFlags = nextSeries.bestFlags;
                                    deeperAnalysisAvgChart.data.datasets[0].data = nextSeries.layer1aScores;
                                    deeperAnalysisAvgChart.data.datasets[1].data = nextSeries.layer1bScores;
                                    deeperAnalysisAvgChart.data.datasets[2].data = nextSeries.winners;
                                    deeperAnalysisAvgChart.update();
                                }

                                if (deeperAnalysisRadarChart) {
                                    const nextRadarSeries = buildRadarSeries();
                                    deeperAnalysisRadarChart.data.labels = nextRadarSeries.labels;
                                    deeperAnalysisRadarChart.data.datasets[0].data = nextRadarSeries.bestBestGrades;
                                    deeperAnalysisRadarChart.options.plugins.title.text = `Weighted Avg: ${nextRadarSeries.weightedAvg.toFixed(2)}`;
                                    deeperAnalysisRadarChart.update();
                                }
                            });
                        });
                        updateDeeperAnalysisWeightIndicator();
                    }
                    
                    const runtimeCtx = document.getElementById('deeperAnalysisRuntimeChart');
                    if (runtimeCtx) {
                        const labels = iterations.map(it => 'Iter ' + it.iteration);
                        const layer1aTimes = iterations.map(it => (it.layer1a_time || 0));
                        const layer1bTimes = iterations.map(it => (it.layer1b_time || 0));
                        const layer1aModel = iterations[0].layer1a_model_used || 'Model 1';
                        const layer1bModel = iterations[0].layer1b_model_used || 'Model 2';
                        
                        const ctx = runtimeCtx.getContext('2d');
                        if (window.ChartDataLabels) {
                            window.Chart.register(window.ChartDataLabels);
                        }
                        new Chart(ctx, {
                            plugins: [ChartDataLabels],
                            type: 'bar',
                            data: {
                                labels: labels,
                                datasets: [
                                    {
                                        label: layer1aModel + ' (seconds)',
                                        data: layer1aTimes,
                                        backgroundColor: '#0984E3',
                                        borderColor: '#0984E3',
                                        borderWidth: 0,
                                        borderRadius: 6,
                                        yAxisID: 'y'
                                    },
                                    {
                                        label: layer1bModel + ' (seconds)',
                                        data: layer1bTimes,
                                        backgroundColor: '#E84393',
                                        borderColor: '#E84393',
                                        borderWidth: 0,
                                        borderRadius: 6,
                                        yAxisID: 'y'
                                    }
                                ]
                            },
                            options: {
                                responsive: true,
                                maintainAspectRatio: true,
                                interaction: {
                                    intersect: false,
                                    mode: 'index'
                                },
                                plugins: {
                                    legend: { display: true, position: 'bottom', labels: {font: {size: 13, weight: 600}, padding: 15, usePointStyle: true, boxWidth: 8} },
                                    datalabels: {
                                        display: true,
                                        formatter: function(value, context) {
                                            if (value === null || value === undefined) return '';
                                            return value.toFixed(1) + 's';
                                        },
                                        color: '#000000',
                                        backgroundColor: 'rgba(255, 255, 255, 0.8)',
                                        borderRadius: 4,
                                        padding: 4,
                                        font: {
                                            size: 13,
                                            weight: 'bold'
                                        },
                                        anchor: 'top',
                                        offset: 6
                                    },
                                    tooltip: {
                                        backgroundColor: 'rgba(0, 0, 0, 0.85)',
                                        padding: 13,
                                        titleFont: {size: 13, weight: 'bold'},
                                        bodyFont: {size: 12},
                                        borderColor: 'rgba(255, 255, 255, 0.4)',
                                        borderWidth: 2,
                                        borderRadius: 6,
                                        boxPadding: 8,
                                        callbacks: {
                                            label: function(context) {
                                                return context.dataset.label + ': ' + context.parsed.y.toFixed(2) + 's';
                                            }
                                        }
                                    }
                                },
                                scales: {
                                    y: { 
                                        type: 'linear',
                                        position: 'left',
                                        beginAtZero: true,
                                        grid: {
                                            color: 'rgba(0, 0, 0, 0.06)',
                                            drawBorder: false,
                                            lineWidth: 1
                                        },
                                        ticks: {
                                            color: '#666',
                                            font: {size: 12, weight: 500},
                                            callback: function(value) {
                                                return value + 's';
                                            }
                                        },
                                        title: {
                                            display: true,
                                            text: 'Runtime (seconds)',
                                            font: {size: 13, weight: 700}
                                        }
                                    },
                                    x: {
                                        grid: {
                                            display: false,
                                            drawBorder: false
                                        },
                                        ticks: {
                                            color: '#666',
                                            font: {size: 12, weight: 500}
                                        }
                                    }
                                }
                            }
                        });
                    }
                    
                    const tokenCtx = document.getElementById('deeperAnalysisTokenChart');
                    if (tokenCtx) {
                        const labels = iterations.map(it => 'Iter ' + it.iteration);
                        const layer1aInputTokens = iterations.map(it => {
                            if (it.token_data && it.token_data.layer1a && it.token_data.layer1a.input_tokens) return it.token_data.layer1a.input_tokens;
                            return 0;
                        });
                        const layer1aOutputTokens = iterations.map(it => {
                            if (it.token_data && it.token_data.layer1a && it.token_data.layer1a.output_tokens) return it.token_data.layer1a.output_tokens;
                            return 0;
                        });
                        const layer1bInputTokens = iterations.map(it => {
                            if (it.token_data && it.token_data.layer1b && it.token_data.layer1b.input_tokens) return it.token_data.layer1b.input_tokens;
                            return 0;
                        });
                        const layer1bOutputTokens = iterations.map(it => {
                            if (it.token_data && it.token_data.layer1b && it.token_data.layer1b.output_tokens) return it.token_data.layer1b.output_tokens;
                            return 0;
                        });
                        const layer1aTotal = layer1aInputTokens.map((inp, i) => inp + layer1aOutputTokens[i]);
                        const layer1bTotal = layer1bInputTokens.map((inp, i) => inp + layer1bOutputTokens[i]);
                        const hasTokenData = layer1aTotal.some(t => t > 0) || layer1bTotal.some(t => t > 0);
                        console.log('Token chart check - hasTokenData:', hasTokenData, 'layer1aTotal:', layer1aTotal, 'layer1bTotal:', layer1bTotal);
                        if (hasTokenData) {
                            const layer1aModel = iterations[0].layer1a_model_used || 'Model 1';
                            const layer1bModel = iterations[0].layer1b_model_used || 'Model 2';
                            
                            const ctx = tokenCtx.getContext('2d');
                            if (window.ChartDataLabels) {
                                window.Chart.register(window.ChartDataLabels);
                            }
                            new Chart(ctx, {
                                plugins: [ChartDataLabels],
                                type: 'bar',
                                data: {
                                    labels: labels,
                                    datasets: [
                                        {
                                            label: layer1aModel + ' (input)',
                                            data: layer1aInputTokens,
                                            backgroundColor: 'rgba(9, 132, 227, 0.4)',
                                            borderColor: 'rgba(9, 132, 227, 0.4)',
                                            borderWidth: 0,
                                            borderRadius: 6,
                                            stack: 'layer1a',
                                            yAxisID: 'y'
                                        },
                                        {
                                            label: layer1aModel + ' (output)',
                                            data: layer1aOutputTokens,
                                            backgroundColor: '#0984E3',
                                            borderColor: '#0984E3',
                                            borderWidth: 0,
                                            borderRadius: 6,
                                            stack: 'layer1a',
                                            yAxisID: 'y'
                                        },
                                        {
                                            label: layer1bModel + ' (input)',
                                            data: layer1bInputTokens,
                                            backgroundColor: 'rgba(232, 67, 147, 0.4)',
                                            borderColor: 'rgba(232, 67, 147, 0.4)',
                                            borderWidth: 0,
                                            borderRadius: 6,
                                            stack: 'layer1b',
                                            yAxisID: 'y'
                                        },
                                        {
                                            label: layer1bModel + ' (output)',
                                            data: layer1bOutputTokens,
                                            backgroundColor: '#E84393',
                                            borderColor: '#E84393',
                                            borderWidth: 0,
                                            borderRadius: 6,
                                            stack: 'layer1b',
                                            yAxisID: 'y'
                                        }
                                    ]
                                },
                                options: {
                                    responsive: true,
                                    maintainAspectRatio: true,
                                    interaction: {
                                        intersect: false,
                                        mode: 'index'
                                    },
                                    plugins: {
                                        legend: { display: true, position: 'bottom', labels: {font: {size: 13, weight: 600}, padding: 15, usePointStyle: true, boxWidth: 8} },
                                        datalabels: {
                                            labels: {
                                                value: {
                                                    display: true,
                                                    formatter: function(value, context) {
                                                        if (!value || value === 0) return '';
                                                        return value.toLocaleString();
                                                    },
                                                    color: '#000000',
                                                    backgroundColor: 'rgba(255, 255, 255, 0.8)',
                                                    borderRadius: 4,
                                                    padding: {top: 2, bottom: 2, left: 4, right: 4},
                                                    font: {
                                                        size: 10,
                                                        weight: 'bold'
                                                    },
                                                    anchor: 'center',
                                                    align: 'center',
                                                    clamp: false,
                                                    clip: false
                                                },
                                                total: {
                                                    display: function(context) {
                                                        return context.datasetIndex === 1 || context.datasetIndex === 3;
                                                    },
                                                    formatter: function(value, context) {
                                                        const dataIndex = context.dataIndex;
                                                        const total = (context.datasetIndex === 1) ? layer1aTotal[dataIndex] : layer1bTotal[dataIndex];
                                                        return total > 0 ? total.toLocaleString() : '';
                                                    },
                                                    color: '#000000',
                                                    backgroundColor: 'rgba(255, 255, 255, 0.8)',
                                                    borderRadius: 6,
                                                    padding: {top: 3, bottom: 3, left: 6, right: 6},
                                                    font: {
                                                        size: 16,
                                                        weight: 'bold'
                                                    },
                                                    anchor: 'end',
                                                    align: 'top',
                                                    offset: 4
                                                }
                                            }
                                        },
                                        tooltip: {
                                            backgroundColor: 'rgba(0, 0, 0, 0.85)',
                                            padding: 13,
                                            titleFont: {size: 13, weight: 'bold'},
                                            bodyFont: {size: 12},
                                            borderColor: 'rgba(255, 255, 255, 0.4)',
                                            borderWidth: 2,
                                            borderRadius: 6,
                                            boxPadding: 8,
                                            callbacks: {
                                                label: function(context) {
                                                    return context.dataset.label + ': ' + context.parsed.y.toLocaleString();
                                                },
                                                footer: function(tooltipItems) {
                                                    const dataIndex = tooltipItems[0].dataIndex;
                                                    return 'Total: ' + (layer1aTotal[dataIndex] + layer1bTotal[dataIndex]).toLocaleString();
                                                }
                                            }
                                        }
                                    },
                                    scales: {
                                        y: { 
                                            type: 'linear',
                                            position: 'left',
                                            beginAtZero: true,
                                            stacked: true,
                                            grid: {
                                                color: 'rgba(0, 0, 0, 0.06)',
                                                drawBorder: false,
                                                lineWidth: 1
                                            },
                                            ticks: {
                                                color: '#666',
                                                font: {size: 12, weight: 500},
                                                callback: function(value) {
                                                    return value.toLocaleString();
                                                }
                                            },
                                            title: {
                                                display: true,
                                                text: 'Tokens',
                                                font: {size: 13, weight: 700}
                                            }
                                        },
                                        x: {
                                            stacked: true,
                                            grid: {
                                                display: false,
                                                drawBorder: false
                                            },
                                            ticks: {
                                                color: '#666',
                                                font: {size: 12, weight: 500}
                                            }
                                        }
                                    }
                                }
                            });
                        }
                    }
                    
                    const layer1aModelDeeper = iterations[0].layer1a_model_used || 'Model 1';
                    const layer1bModelDeeper = iterations[0].layer1b_model_used || 'Model 2';
                    
                    for (let key of grading_keys) {
                        const canvasId = `deeperAnalysisChart_${key}`;
                        const canvasElement = document.getElementById(canvasId);
                        
                        if (canvasElement) {
                            const labels = iterations.map(it => 'Iter ' + it.iteration);
                            const layer1aData = iterations.map(it => {
                                const grades = it.layer1a_grades || {};
                                return grades[key] || 0;
                            });
                            const layer1bData = iterations.map(it => {
                                const grades = it.layer1b_grades || {};
                                return grades[key] || 0;
                            });
                            
                            const ctx = canvasElement.getContext('2d');
                            const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);
                            
                            if (window.ChartDataLabels) {
                                window.Chart.register(window.ChartDataLabels);
                            }
                            
                            new Chart(ctx, {
                                plugins: [ChartDataLabels],
                                type: 'bar',
                                data: {
                                    labels: labels,
                                    datasets: [
                                        {
                                            label: layer1aModelDeeper,
                                            data: layer1aData,
                                            backgroundColor: '#0984E3',
                                            borderColor: '#0984E3',
                                            borderWidth: 0,
                                            borderRadius: 6
                                        },
                                        {
                                            label: layer1bModelDeeper,
                                            data: layer1bData,
                                            backgroundColor: '#E84393',
                                            borderColor: '#E84393',
                                            borderWidth: 0,
                                            borderRadius: 6
                                        }
                                    ]
                                },
                                options: {
                                    responsive: true,
                                    maintainAspectRatio: true,
                                    interaction: {
                                        intersect: false,
                                        mode: 'index'
                                    },
                                    plugins: {
                                        legend: { display: true, position: 'bottom', labels: {font: {size: 13, weight: 600}, padding: 15, usePointStyle: true, boxWidth: 8} },
                                        title: { display: true, text: capitalize(key), font: {size: 14, weight: 'bold'}, padding: 15 },
                                        datalabels: {
                                            display: true,
                                            anchor: 'top',
                                            offset: 6,
                                            font: { weight: 'bold', size: 13 },
                                            color: '#000000',
                                            backgroundColor: 'rgba(255, 255, 255, 0.8)',
                                            borderRadius: 4,
                                            padding: 4,
                                            formatter: function(value) { return value || ''; }
                                        },
                                        tooltip: {
                                            backgroundColor: 'rgba(0, 0, 0, 0.85)',
                                            padding: 12,
                                            titleFont: {size: 13, weight: 'bold'},
                                            bodyFont: {size: 12},
                                            borderColor: 'rgba(255, 255, 255, 0.4)',
                                            borderWidth: 2,
                                            borderRadius: 6,
                                            boxPadding: 8
                                        }
                                    },
                                    scales: {
                                        y: { 
                                            beginAtZero: true, 
                                            max: 100,
                                            grid: {
                                                color: 'rgba(0, 0, 0, 0.06)',
                                                drawBorder: false,
                                                lineWidth: 1
                                            },
                                            ticks: {
                                                color: '#666',
                                                font: {size: 12, weight: 500}
                                            }
                                        },
                                        x: {
                                            grid: {
                                                display: false,
                                                drawBorder: false
                                            },
                                            ticks: {
                                                color: '#666',
                                                font: {size: 12, weight: 500}
                                            }
                                        }
                                    }
                                }
                            });
                        }
                    }
                } catch (e) {
                    console.error('Error creating deeper analysis charts:', e);
                }
            }

            loadChats();