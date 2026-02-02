// Documentation Panel Controller - handles sidebar navigation and panel switching
(function() {
  // Configuration for documentation sections
  const docSections = [
    'getting-started',
    'accounts',
    'transactions',
    'projections',
    'recurrence',
    'periodic-changes',
    'scenarios',
    'shortcuts',
    'glossary',
    'faq'
  ];

  // Initialize on DOM ready
  document.addEventListener('DOMContentLoaded', function() {
    const navLinks = document.querySelectorAll('.doc-panel-link');
    
    // Attach click handlers to sidebar links
    navLinks.forEach(link => {
      link.addEventListener('click', function(e) {
        e.preventDefault();
        const section = this.getAttribute('data-section');
        if (section) {
          showPanel(section);
        }
      });
    });

    // Check for hash and show that section, otherwise show first
    const hash = window.location.hash.slice(1);
    if (hash && docSections.includes(hash)) {
      showPanel(hash);
    } else if (docSections.length > 0) {
      showPanel(docSections[0]);
    }
  });

  // Show a specific panel and update active state
  function showPanel(section) {
    // Hide all panels
    const allPanels = document.querySelectorAll('.doc-panel');
    allPanels.forEach(panel => {
      panel.classList.remove('active');
    });

    // Show the selected panel
    const targetPanel = document.getElementById(`panel-${section}`);
    if (targetPanel) {
      targetPanel.classList.add('active');
      
      // Scroll to top of panel content
      const contentContainer = document.querySelector('.doc-panel-content');
      if (contentContainer) {
        contentContainer.scrollTop = 0;
      }
    }

    // Update active state in sidebar
    const navLinks = document.querySelectorAll('.doc-panel-link');
    navLinks.forEach(link => {
      if (link.getAttribute('data-section') === section) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  }
})();
