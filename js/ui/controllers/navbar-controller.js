// Unified Navbar JS - injects the navbar into #main-navbar on every page
import { downloadAppData, uploadAppData } from '../../app/services/export-service.js';
import { notifyError, notifySuccess, confirmDialog } from '../../shared/notifications.js';
import { openValidateDataModal } from '../components/modals/validate-data-modal.js';

// Web-only: Show clear data button for browser storage management
const clearDataBtn = '<button id="nav-clear" class="icon-btn icon-btn--danger" title="Clear all data from browser storage">⊗ Clear</button>';

// Build navigation hrefs relative to this module's URL so it works when hosted
// under a sub-path (e.g., GitHub Pages /<repo>/...) and in local dev.
const repoRootUrl = new URL('../../../', import.meta.url);

const logoPath = new URL('assets/ftrack-logo.svg', repoRootUrl).href;
const ftrackHref = new URL('pages/ftrack.html', repoRootUrl).href;

const navLinks = `
  <div class="navbar-brand">
    <img src="${logoPath}" alt="FTrack" class="navbar-logo" />
    <span class="navbar-title">FTrack</span>
  </div>
  <a href="${ftrackHref}" id="nav-ftrack">FTrack</a>
  <div class="nav-spacer"></div>
  <button id="nav-theme" class="icon-btn" title="Toggle theme"></button>
  <button id="nav-export" class="icon-btn" title="Export data to file">⬆ Export</button>
  <button id="nav-import" class="icon-btn" title="Import data from file">⬇ Import</button>
  <button id="nav-validate" class="icon-btn" title="Validate data file for errors">⊘ Validate</button>
  ${clearDataBtn}
`;

function getPage() {
  var pathname = window.location.pathname;
  var file = pathname.split('/').pop();
  if (file === '' || file === 'index.html') return 'index.html';
  if (pathname.includes('/pages/')) return file;
  return file;
}

function highlightActive() {
  var navMap = {
    'ftrack.html': 'nav-ftrack',
    'forecast.html': 'nav-ftrack',
    'index.html': 'nav-ftrack'
  };
  var activeId = navMap[getPage()];
  if (activeId) {
    var el = document.getElementById(activeId);
    if (el) el.classList.add('active');
  }
}

// Attach export/import handlers
async function attachDataHandlers() {
  // Dynamically import theme functions to avoid top-level dependency
  const { getTheme, setTheme } = await import('../../config.js');
  
  var themeBtn    = document.getElementById('nav-theme');
  var exportBtn   = document.getElementById('nav-export');
  var importBtn   = document.getElementById('nav-import');
  var validateBtn = document.getElementById('nav-validate');

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    if (themeBtn) {
      themeBtn.textContent = theme === 'dark' ? '☀ Light' : '☾ Dark';
    }
  }

  if (themeBtn) {
    applyTheme(getTheme());
    themeBtn.addEventListener('click', function(e) {
      e.preventDefault();
      var nextTheme = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      setTheme(nextTheme);
      applyTheme(nextTheme);
    });
  }
  
  if (exportBtn) {
    exportBtn.addEventListener('click', async function(e) {
      e.preventDefault();
      try {
        const success = await downloadAppData();
        if (success) {
        }
      } catch (err) {
        notifyError('Export failed: ' + err.message);
      }
    });
  }
  
  if (importBtn) {
    importBtn.addEventListener('click', async function(e) {
      e.preventDefault();
      try {
        const success = await uploadAppData(false); // false = replace mode
        if (success) {
        } else {
        }
      } catch (err) {
        notifyError('Import failed: ' + err.message);
      }
    });
  }
  
  if (validateBtn) {
    validateBtn.addEventListener('click', async function(e) {
      e.preventDefault();
      try {
        await openValidateDataModal();
      } catch (err) {
        notifyError('Validation error: ' + err.message);
      }
    });
  }

  // Clear data button (web only)
  var clearBtn = document.getElementById('nav-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', async function(e) {
      e.preventDefault();
      if (await confirmDialog('Are you sure you want to clear all data? This cannot be undone.\n\nConsider exporting your data first.')) {
        try {
          localStorage.removeItem('ftrack:app-data');
          notifySuccess('All data cleared successfully. The page will now reload.');
          window.location.reload();
        } catch (err) {
          notifyError('Failed to clear data: ' + err.message);
        }
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', function() {
  var navDiv = document.getElementById('main-navbar');
  if (navDiv) {
    navDiv.classList.add('bordered', 'rounded', 'centered');
    navDiv.innerHTML = navLinks;
    highlightActive();
    attachDataHandlers();
  }
});
