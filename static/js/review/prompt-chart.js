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
