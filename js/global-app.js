// --- Global Helper Functions ---
export function loadGlobals() {
        // Adds a global helper to get an element by its ID
        window.getEl = (id) => document.getElementById(id);

        // Adds a global helper to append a child element to a parent element
        window.add = (parentElement, childElement) => parentElement.appendChild(childElement);

        // Adds a global helper to toggle the display of an element (accordion style)
        window.toggleAccordion = (id) => {
            const panel = document.getElementById(id);
            panel.style.display = (panel.style.display === 'none') ? 'block' : 'none';
        };
}


