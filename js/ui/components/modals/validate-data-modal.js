/**
 * validate-data-modal.js
 * Displays a full data-validation report for all scenarios in the data store.
 */

import { createModal } from './modal-factory.js';
import { validateAllData } from '../../../app/services/validation-service.js';

/**
 * Open a modal that runs and displays the data validation report.
 */
export async function openValidateDataModal() {
    const { modal, close } = createModal({
        contentClass: 'validate-data-modal',
        closeOnOverlay: true,
        closeOnEscape: true
    });

    // ---- Loading state ----
    modal.innerHTML = `
        <div class="modal-header">
            <h2>Validate Data</h2>
            <button class="icon-btn modal-close-btn" title="Close">✕</button>
        </div>
        <div class="modal-body">
            <p class="vd-loading">Running validation…</p>
        </div>
    `;
    modal.querySelector('.modal-close-btn').addEventListener('click', close);

    try {
        const result = await validateAllData();
        renderResult(modal, result, close);
    } catch (err) {
        renderError(modal, err, close);
    }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function renderResult(modal, result, close) {
    const isOk      = result.isValid;
    const summaryTxt = isOk
        ? `All ${result.scenarioCount} scenario(s) passed validation — no issues found.`
        : `Found ${result.totalIssues} issue(s) across ${result.scenarioCount} scenario(s).`;

    let bodyHtml = `
        <div class="vd-summary ${isOk ? 'vd-summary--ok' : 'vd-summary--error'}">
            <span class="vd-summary-icon">${isOk ? '✓' : '✗'}</span>
            ${summaryTxt}
        </div>
    `;

    if (!isOk) {
        for (const sc of result.scenarios) {
            if (sc.issues.length === 0) continue;

            const rowsHtml = sc.issues.map(iss => `
                <li class="vd-issue">
                    <span class="vd-issue-path">${escapeHtml(iss.path)}</span>
                    <span class="vd-issue-msg">${escapeHtml(iss.message)}</span>
                </li>
            `).join('');

            bodyHtml += `
                <div class="vd-scenario">
                    <div class="vd-scenario-header">
                        <span class="vd-scenario-name">${escapeHtml(sc.name)}</span>
                        <span class="vd-scenario-badge">${sc.issues.length} issue${sc.issues.length !== 1 ? 's' : ''}</span>
                    </div>
                    <ul class="vd-issue-list">${rowsHtml}</ul>
                </div>
            `;
        }
    }

    modal.innerHTML = `
        <div class="modal-header">
            <h2>Validate Data</h2>
            <button class="icon-btn modal-close-btn" title="Close">✕</button>
        </div>
        <div class="modal-body vd-body">
            ${bodyHtml}
        </div>
        <div class="modal-footer">
            <button class="icon-btn vd-close-footer" title="Close">✕</button>
        </div>
    `;

    modal.querySelector('.modal-close-btn').addEventListener('click', close);
    modal.querySelector('.vd-close-footer').addEventListener('click', close);
}

function renderError(modal, err, close) {
    modal.innerHTML = `
        <div class="modal-header">
            <h2>Validate Data</h2>
            <button class="icon-btn modal-close-btn" title="Close">✕</button>
        </div>
        <div class="modal-body vd-body">
            <div class="vd-summary vd-summary--error">
                <span class="vd-summary-icon">✗</span>
                Validation could not complete: ${escapeHtml(err.message)}
            </div>
        </div>
        <div class="modal-footer">
            <button class="icon-btn vd-close-footer" title="Close">✕</button>
        </div>
    `;
    modal.querySelector('.modal-close-btn').addEventListener('click', close);
    modal.querySelector('.vd-close-footer').addEventListener('click', close);
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
