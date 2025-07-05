// Unified Navbar JS - injects the navbar into #main-navbar on every page
(function() {
  var navHtml = `
    <nav id="main-navbar">
      <a href="../start.html" id="nav-home">Home</a>
      <a href="accounts.html" id="nav-accounts">Accounts</a>
      <a href="transactions.html" id="nav-transactions">Transactions</a>
      <a href="forecast.html" id="nav-forecast">Financial Forecast</a>
      <a href="calculator.html" id="nav-calculator">Calculator</a>
      <a href="filemgmt.html" id="nav-filemgmt">File Management</a>
    </nav>
  `;
  function getPage() {
    var path = window.location.pathname.split('/').pop();
    if (path === '' || path === 'index.html') return 'start.html';
    return path;
  }
  function highlightActive() {
    var navMap = {
      'start.html': 'nav-home',
      'accounts.html': 'nav-accounts',
      'transactions.html': 'nav-transactions',
      'forecast.html': 'nav-forecast',
      'calculator.html': 'nav-calculator',
      'filemgmt.html': 'nav-filemgmt'
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
      navDiv.innerHTML = navHtml;
      highlightActive();
    }
  });
})();
