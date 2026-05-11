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

loadChats();
