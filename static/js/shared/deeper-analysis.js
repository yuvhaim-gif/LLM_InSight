let DEEPER_ANALYSIS_GRADE_KEYS = (typeof initialGraderWeights !== 'undefined' && initialGraderWeights && Object.keys(initialGraderWeights).length > 0) ? Object.keys(initialGraderWeights) : ["accuracy", "clarity", "conciseness", "creativity", "structure"];
let DEEPER_ANALYSIS_DEFAULT_WEIGHTS = (typeof initialGraderWeights !== 'undefined' && initialGraderWeights && Object.keys(initialGraderWeights).length > 0) ? Object.assign({}, initialGraderWeights) : { accuracy: 0.25, clarity: 0.25, conciseness: 0.15, creativity: 0.25, structure: 0.10 };
let deeperAnalysisAvgChart = null;
let deeperAnalysisRadarChart = null;
let deeperAnalysisOriginalWeights = null;

function getDeeperAnalysisInitialWeights() {
    if (window._currentDeeperAnalysisSavedWeights && Object.keys(window._currentDeeperAnalysisSavedWeights).length > 0) {
        return normalizeDeeperAnalysisWeights({ ...window._currentDeeperAnalysisSavedWeights });
    }
    const weights = {};
    const weightInputs = document.querySelectorAll('.weight-input');
    weightInputs.forEach(input => {
        const key = input.dataset && input.dataset.category;
        const value = parseFloat(input.value) / 100;
        if (key && !isNaN(value)) {
            weights[key] = value;
        }
    });
    if (Object.keys(weights).length === 0) {
        return { ...DEEPER_ANALYSIS_DEFAULT_WEIGHTS };
    }
    return normalizeDeeperAnalysisWeights(weights);
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
            if (Object.keys(DEEPER_ANALYSIS_DEFAULT_WEIGHTS).sort().join(',') !== detectedKeys.sort().join(',')) {
                var equalW = {};
                detectedKeys.forEach(function(k) { equalW[k] = 1.0 / detectedKeys.length; });
                DEEPER_ANALYSIS_DEFAULT_WEIGHTS = equalW;
            }
        }

        if (savedWeights && Object.keys(savedWeights).length > 0) {
            window._currentDeeperAnalysisSavedWeights = savedWeights;
            DEEPER_ANALYSIS_DEFAULT_WEIGHTS = { ...savedWeights };
        } else if (typeof savedWeights !== 'undefined') {
            if (detectedKeys && detectedKeys.length > 0) {
                var equalW2 = {};
                detectedKeys.forEach(function(k) { equalW2[k] = 1.0 / detectedKeys.length; });
                DEEPER_ANALYSIS_DEFAULT_WEIGHTS = equalW2;
                window._currentDeeperAnalysisSavedWeights = null;
            } else {
                window._currentDeeperAnalysisSavedWeights = null;
            }
        }

        var activeGraderName = graderSettingName || (document.getElementById('graderSettingSelect') ? document.getElementById('graderSettingSelect').value : 'default') || 'default';
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
        
        const hasTokenData = iterations.some(it => it.all_tools_token_usage && Object.keys(it.all_tools_token_usage).length > 0);
        html += '<div class="deeper-analysis-section">';
        html += '<h3>🔤 Token Usage & ⏱️ Runtime Analysis</h3>';
        html += '<div class="deeper-analysis-charts">';
        if (hasTokenData) {
            html += '<div class="deeper-analysis-chart-container">';
            html += '<h4 style="margin: 0 0 10px 0; color: #2d3436; font-size: 1rem; font-weight: 700;">🔤 Token Usage Analysis</h4>';
            html += '<canvas id="deeperAnalysisTokenChart" style="max-height: 240px; min-height: 200px;"></canvas>';
            html += '</div>';
        }
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
            html += '<canvas id="deeperAnalysisChart_' + key + '"></canvas>';
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

function updateDeeperAnalysisModal(promptNumber, iterations) {
    const modal = document.getElementById('deeperAnalysisModal');
    if (modal && modal.classList.contains('show')) {
        openDeeperAnalysis(promptNumber, iterations);
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
