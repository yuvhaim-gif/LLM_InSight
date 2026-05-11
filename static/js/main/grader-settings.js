function applyGraderSetting(name) {
    fetch('/set_grader_setting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        if (data.success) {
            var config = data.config;

            if (config && config.keys) {
                DEEPER_ANALYSIS_GRADE_KEYS = config.keys;
                var equalW = {};
                config.keys.forEach(function(k) { equalW[k] = config.weights ? (config.weights[k] || (1 / config.keys.length)) : (1 / config.keys.length); });
                DEEPER_ANALYSIS_DEFAULT_WEIGHTS = equalW;
            }

            currentGraderConfigWeights = (name !== 'default' && config && config.weights) ? Object.assign({}, config.weights) : null;

            if (config && config.weights) {
                var container = document.getElementById('weightInputsCompact');
                if (container) {
                    var html = '';
                    var keys = config.keys || Object.keys(config.weights);
                    keys.forEach(function(k) {
                        var w = config.weights[k] || 0;
                        var pct = Math.round(w * 100);
                        html += '<div class="weight-item-compact">' +
                            '<span class="weight-label-compact">' + k + '</span>' +
                            '<input type="number" class="weight-input" data-category="' + k + '" data-weight-input="' + k + '" value="' + pct + '" min="0" max="100" step="1" onchange="checkManualWeightChanges()" oninput="updateWeightSumIndicator()" onkeypress="return event.key !== \'Enter\'">' +
                            '<span style="font-size: 0.75rem; color: rgba(255,255,255,0.7);">%</span>' +
                            '</div>';
                    });
                    container.innerHTML = html;
                    updateWeightSumIndicator();
                }
            }
        }
    })
    .catch(function(e) { console.error('Error setting grader:', e); });
}
