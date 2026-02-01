// Unified Navbar JS - injects the navbar into #main-navbar on every page
import { downloadAppData, uploadAppData } from './data-export-import.js';
import { isElectronEnv } from './core/platform.js';

(function() {
  // Platform detection
  var isElectron = isElectronEnv();
  
  // Add clear data button only for web
  var clearDataBtn = !isElectron ? '<button id="nav-clear" class="btn btn-danger" title="Clear all data from browser storage">Clear Data</button>' : '';
  
  // Determine the correct path to assets based on current location
  var logoPath = 'assets/ftrack-logo.svg';
  var path = window.location.pathname;
  if (path.includes('/pages/')) {
    logoPath = '../assets/ftrack-logo.svg';
  }
  
  var navLinks = `
    <div class="navbar-brand">
      <img src="${logoPath}" alt="FTrack" class="navbar-logo" />
      <span class="navbar-title">FTrack</span>
    </div>
    <a href="home.html" id="nav-home">Home</a>
    <a href="forecast.html" id="nav-forecast">Forecast</a>
    <div class="nav-spacer"></div>
    <button id="nav-export" class="btn btn-secondary" title="Export data to file">Export Data</button>
    <button id="nav-import" class="btn btn-secondary" title="Import data from file">Import Data</button>
    ${clearDataBtn}
  `;
  function getPage() {
    var path = window.location.pathname.split('/').pop();
    if (path === '' || path === 'index.html') return 'home.html';
    return path;
  }
  function highlightActive() {
    var navMap = {
      'home.html': 'nav-home',
      'forecast.html': 'nav-forecast'
    };
    var activeId = navMap[getPage()];
    if (activeId) {
      var el = document.getElementById(activeId);
      if (el) el.classList.add('active');
    }
  }
  
  // Attach export/import handlers
  function attachDataHandlers() {
    var exportBtn = document.getElementById('nav-export');
    var importBtn = document.getElementById('nav-import');
    
    if (exportBtn) {
      exportBtn.addEventListener('click', async function(e) {
        e.preventDefault();
        try {
          const success = await downloadAppData();
          if (success) {
          }
        } catch (err) {
          alert('Export failed: ' + err.message);
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
          alert('Import failed: ' + err.message);
        }
      });
    }
    
    // Clear data button (web only)
    var clearBtn = document.getElementById('nav-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', function(e) {
        e.preventDefault();
        if (confirm('Are you sure you want to clear all data? This cannot be undone.\n\nConsider exporting your data first.')) {
          try {
            localStorage.removeItem('ftrack:app-data');
            alert('All data cleared successfully. The page will now reload.');
            window.location.reload();
          } catch (err) {
            alert('Failed to clear data: ' + err.message);
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
})();
