// Unified Navbar JS - injects the navbar into #main-navbar on every page
(function() {
  var navLinks = `
    <a href="home.html" id="nav-home">Home</a>
    <a href="forecast.html" id="nav-forecast">Forecast</a>
    <div class="nav-spacer"></div>
    <button id="nav-export" class="btn btn-secondary" title="Export data to file">Export Data</button>
    <button id="nav-import" class="btn btn-secondary" title="Import data from file">Import Data</button>
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
          // Dynamic import to avoid loading on every page
          const module = await import('./data-export-import.js');
          const success = await module.downloadAppData();
          if (success) {
            console.log('[Navbar] Data exported successfully');
          }
        } catch (err) {
          console.error('[Navbar] Export failed:', err);
          alert('Export failed: ' + err.message);
        }
      });
    }
    
    if (importBtn) {
      importBtn.addEventListener('click', async function(e) {
        e.preventDefault();
        try {
          // Dynamic import to avoid loading on every page
          const module = await import('./data-export-import.js');
          const success = await module.uploadAppData(false); // false = replace mode
          if (success) {
            console.log('[Navbar] Data imported successfully');
          }
        } catch (err) {
          console.error('[Navbar] Import failed:', err);
          alert('Import failed: ' + err.message);
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
