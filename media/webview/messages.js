(function () {
    'use strict';

    const vscode = acquireVsCodeApi();

    function openTab(btnId, panelId) {
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.label').forEach(t => t.classList.remove('active'));
        document.getElementById(panelId).classList.add('active');
        document.querySelector('[data-tab-btn="' + btnId + '"]').classList.add('active');
    }

    document.querySelectorAll('[data-tab-btn]').forEach(btn => {
        btn.addEventListener('click', () => openTab(btn.dataset.tabBtn, btn.dataset.tabPanel));
    });

    document.querySelectorAll('button.action-btn').forEach(btn => {
        btn.addEventListener('click', (event) => {
            event.stopPropagation();
            const action = btn.dataset.action;
            const seq = btn.dataset.seq;
            const id = btn.dataset.id || '';
            if (!action || !seq) {
                return;
            }
            btn.disabled = true;
            btn.textContent = action === 'delete' ? 'Deleting…' : 'Requeuing…';

            if (action === 'delete') {
                vscode.postMessage({
                    command: 'delete',
                    kind: btn.dataset.kind === 'dl' ? 'dl' : 'msg',
                    sequenceNumber: seq,
                    messageId: id,
                });
            } else if (action === 'requeue') {
                vscode.postMessage({
                    command: 'requeue',
                    sequenceNumber: seq,
                    messageId: id,
                });
            }
        });
    });
}());
