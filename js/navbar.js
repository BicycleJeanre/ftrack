// Unified Navbar JS - injects the navbar into #main-navbar on every page
(function() {
  var navLinks = `
    <a href="home.html" id="nav-home">Home</a>
    <a href="forecast.html" id="nav-forecast">Forecast</a>
    <a href="accounts-poc.html" id="nav-accounts-poc">Accounts POC</a>
    <a href="library-test.html" id="nav-library-test">Library Test</a>
  `;
  function getPage() {
    var path = window.location.pathname.split('/').pop();
    if (path === '' || path === 'index.html') return 'home.html';
    return path;
  }
  function highlightActive() {
    var navMap = {
      'home.html': 'nav-home',
      'forecast.html': 'nav-forecast',
      'accounts-poc.html': 'nav-accounts-poc',
      'library-test.html': 'nav-library-test'
    };
    var activeId = navMap[getPage()];
    if (activeId) {
      var el = document.getElementById(activeId);
      if (el) el.classList.add('active');
    }
  }
  document.addEventListener('DOMContentLoaded', function() {
    var navDiv = document.getElementById('main-navbar');
    if (navDiv) {
      navDiv.classList.add('bordered', 'rounded', 'centered');
      navDiv.innerHTML = navLinks;
      highlightActive();
    }
  });
})();
