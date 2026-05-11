function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0s';
    const totalSeconds = Math.round(seconds);
    if (totalSeconds < 60) return totalSeconds + 's';
    const minutes = Math.floor(totalSeconds / 60);
    if (minutes < 60) return minutes + 'm';
    const hours = Math.floor(minutes / 60);
    return hours + 'h ' + (minutes % 60) + 'm';
}

function escapeHtml(text) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
}
