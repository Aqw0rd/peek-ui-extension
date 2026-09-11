(function () {
    'use strict';

    function openTab(btnId, panelId) {
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.label').forEach(t => t.classList.remove('active'));
        document.getElementById(panelId).classList.add('active');
        document.querySelector('[data-tab-btn="' + btnId + '"]').classList.add('active');
    }

    document.querySelectorAll('[data-tab-btn]').forEach(btn => {
        btn.addEventListener('click', () => openTab(btn.dataset.tabBtn, btn.dataset.tabPanel));
    });
}());
