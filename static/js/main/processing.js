function showProcessingScreen() {
    const main = document.querySelector('.main-layout');

    window.lastDisplayedIteration = 1;
    window.lastDisplayedModelsExecuted = 0;
    
    let promptNum = 1;
    
    fetch('/get_backup_data')
        .then(response => response.json())
        .then(data => {
            if (data.success && data.backup_data) {
                const historyCount = data.backup_data.prompt_history ? data.backup_data.prompt_history.length : 0;
                const iterHistoryCount = data.backup_data.iteration_history && data.backup_data.iteration_history.prompts 
                    ? Object.keys(data.backup_data.iteration_history.prompts).length 
                    : 0;
                promptNum = Math.max(historyCount, iterHistoryCount) + 1;
            }
            displayProcessingScreen(promptNum);
        })
        .catch(() => {
            if (iterationHistory && iterationHistory.prompts) {
                const promptKeys = Object.keys(iterationHistory.prompts);
                if (promptKeys.length > 0) {
                    const lastPromptNum = Math.max(...promptKeys.map(key => {
                        const data = iterationHistory.prompts[key];
                        return data.prompt_number || parseInt(key.replace('prompt_', '')) || 0;
                    }));
                    promptNum = lastPromptNum + 1;
                }
            }
            displayProcessingScreen(promptNum);
        });
}

function displayProcessingScreen(promptNum) {
    const main = document.querySelector('.main-layout');
    
    main.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; width: 100%; height: 100vh; background: linear-gradient(135deg, #050209 0%, #0f0620 25%, #1a0f2e 50%, #0d0620 75%, #050209 100%) fixed; position: fixed; top: 0; left: 0; z-index: 10000;">
            <style>
                @keyframes pulse { 0%, 100% { box-shadow: 0 15px 35px rgba(102, 126, 234, 0.3); } 50% { box-shadow: 0 15px 50px rgba(102, 126, 234, 0.6); } }
            </style>
            <div style="width: 720px; height: 720px; border-radius: 50%; background-image: url('/static/login-background.gif'); background-size: cover; background-position: center; background-repeat: no-repeat; display: flex; align-items: center; justify-content: center; padding: 12px; box-sizing: border-box;">
                <div style="width: 450px; height: 450px; border-radius: 50%; background: rgba(255, 255, 255, 0.15); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); padding: 40px; box-shadow: 0 25px 50px rgba(0, 0, 0, 0.15); display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden;">
                    <div style="width: 140px; height: 140px; border-radius: 50%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; box-shadow: 0 15px 35px rgba(102, 126, 234, 0.3); border: 3px solid rgba(255, 255, 255, 0.2); animation: pulse 3s ease-in-out infinite;">
                        <div style="font-family: 'Dancing Script', cursive; color: #ffffff; font-size: 1.8rem; font-weight: 700; text-shadow: 0 4px 20px rgba(0,0,0,0.2); text-align: center; letter-spacing: -0.5px;">LLM🔍InSights</div>
                    </div>
                <h2 style="color: white; margin: 8px 0; font-size: 18px;">🔄 Processing Analysis</h2>
                <p style="color: white; font-size: 12px; margin: 3px 0;">Prompt: ${promptNum}</p>
                <p style="color: white; font-size: 12px; margin: 3px 0;">Iteration: <span id="currentIteration">1</span></p>
                <p style="color: white; font-size: 12px; margin: 3px 0;">Model Runs completed: <span id="modelsExecuted">0</span></p>
                <p style="color: white; font-size: 12px; margin: 3px 0;">Elapsed time: <span id="elapsedSeconds">0</span>s</p>
                </div>
            </div>
        </div>
    `;
    
    if (!window.processingStartTime) {
        window.processingStartTime = Date.now();
    }
    
    window.processingTimerId = setInterval(() => {
        const elapsedMs = Date.now() - window.processingStartTime;
        const seconds = Math.floor(elapsedMs / 1000);
        const elem = document.getElementById('elapsedSeconds');
        if (elem) elem.textContent = seconds;
    }, 1000);
    
    pollProcessing();
}

function pollProcessing() {
    const checkInterval = setInterval(() => {
        fetch('/is-processing').then(r => r.json()).then(processingData => {
            fetch('/iteration').then(r => r.json()).then(iterationData => {
                const reportedIteration = Number(iterationData.iteration);
                const normalizedIteration = Number.isFinite(reportedIteration)
                    ? Math.max(0, Math.floor(reportedIteration))
                    : 0;
                const visibleIteration = processingData.processing
                    ? Math.max(1, normalizedIteration)
                    : normalizedIteration;
                window.lastDisplayedIteration = Math.max(Number(window.lastDisplayedIteration) || 1, visibleIteration);

                const reportedModelsExecuted = Number(processingData.models_executed);
                const normalizedModelsExecuted = Number.isFinite(reportedModelsExecuted)
                    ? Math.max(0, Math.floor(reportedModelsExecuted))
                    : 0;
                window.lastDisplayedModelsExecuted = Math.max(Number(window.lastDisplayedModelsExecuted) || 0, normalizedModelsExecuted);

                const iterElem = document.getElementById('currentIteration');
                if (iterElem) {
                    iterElem.textContent = window.lastDisplayedIteration;
                }
                const modelsElem = document.getElementById('modelsExecuted');
                if (modelsElem) {
                    modelsElem.textContent = window.lastDisplayedModelsExecuted;
                }
                if (!processingData.processing) {
                    clearInterval(checkInterval);
                    if (window.processingTimerId) clearInterval(window.processingTimerId);
                    delete window.processingStartTime;
                    fetch('/iteration').then(r => r.json()).then(finalData => {
                        const finalIterElem = document.getElementById('currentIteration');
                        if (finalIterElem) {
                            const finalReportedIteration = Number(finalData.iteration);
                            const finalIteration = Number.isFinite(finalReportedIteration)
                                ? Math.max(0, Math.floor(finalReportedIteration))
                                : 0;
                            finalIterElem.textContent = Math.max(finalIteration, Number(window.lastDisplayedIteration) || 0);
                        }
                        setTimeout(() => window.location.reload(), 500);
                    }).catch(() => {
                        setTimeout(() => window.location.reload(), 500);
                    });
                }
            });
        }).catch(() => {});
    }, 2000);
}
