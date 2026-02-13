// Documentation Panel Controller - handles sidebar navigation and panel switching
(function() {
  // Initialize on DOM ready
  document.addEventListener('DOMContentLoaded', function() {
    const navLinks = document.querySelectorAll('.doc-panel-link');
    const docSections = Array.from(navLinks)
      .map(link => link.getAttribute('data-section'))
      .filter(Boolean);
    
    // Attach click handlers to sidebar links
    navLinks.forEach(link => {
      link.addEventListener('click', function(e) {
        e.preventDefault();
        const section = this.getAttribute('data-section');
        const anchorId = this.getAttribute('data-anchor');
        if (section) {
          showPanel(section, anchorId);
        }
      });
    });

    // Check for hash and show that section, otherwise show first
    const hash = window.location.hash.slice(1);
    const sectionFromHash = parseSectionFromHash(hash);
    if (sectionFromHash && docSections.includes(sectionFromHash)) {
      showPanel(sectionFromHash);
    } else if (docSections.length > 0) {
      showPanel(docSections[0]);
    }
  });

  function parseSectionFromHash(hash) {
    if (!hash) return null;
    if (hash.includes('/')) {
      return hash.split('/')[0];
    }
    return hash;
  }

  // Show a specific panel and update active state
  function showPanel(section, anchorId) {
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

      if (anchorId) {
        scrollToAnchor(anchorId);
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

  function scrollToAnchor(anchorId) {
    const contentContainer = document.querySelector('.doc-panel-content');
    const anchorEl = document.getElementById(anchorId);
    if (!contentContainer || !anchorEl) return;

    const containerRect = contentContainer.getBoundingClientRect();
    const anchorRect = anchorEl.getBoundingClientRect();
    const delta = anchorRect.top - containerRect.top;
    contentContainer.scrollTop += delta - 8;
  }

  window.showDocPanel = showPanel;
})();
