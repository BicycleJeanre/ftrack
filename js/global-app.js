// --- Global Helper Functions ---
export function loadGlobals() {
        // Adds a global helper to get an element by its ID
        window.getEl = (id) => document.getElementById(id);

        // Adds a global helper to append a child element to a parent element
        window.add = (parentElement, childElement) => parentElement.appendChild(childElement);

        // Adds a global helper to toggle the display of an element (accordion style)
        window.toggleAccordion = (id) => {
            const panel = document.getElementById(id);

            if (!panel) return;

            const wasHidden = panel.classList.contains('hidden');
            panel.classList.toggle('hidden');

            // When opening, scroll the *individual accordion section* into the
            // middle of whichever element actually scrolls (page or a container).
            if (wasHidden) {
                const section = panel.parentElement;
                if (!section) return;

                const getScrollParent = (el) => {
                    let current = el?.parentElement;
                    while (current) {
                        const style = window.getComputedStyle(current);
                        const overflowY = style.overflowY;
                        const overflow = style.overflow;
                        const canScrollY = (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay'
                            || overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay');
                        if (canScrollY && current.scrollHeight > current.clientHeight + 1) {
                            return current;
                        }
                        current = current.parentElement;
                    }
                    return document.scrollingElement || document.documentElement;
                };

                const scrollParent = getScrollParent(section);

                const scrollSectionToCenter = (behavior) => {
                    const sectionRect = section.getBoundingClientRect();
                    const viewportHeight = (scrollParent === document.scrollingElement || scrollParent === document.documentElement || scrollParent === document.body)
                        ? (window.innerHeight || 0)
                        : scrollParent.getBoundingClientRect().height;

                    // Center as much of the section as can fit.
                    const effectiveHeight = Math.min(sectionRect.height, viewportHeight);
                    const desiredTopInViewport = (viewportHeight - effectiveHeight) / 2;

                    let targetScrollTop;
                    if (scrollParent === document.scrollingElement || scrollParent === document.documentElement || scrollParent === document.body) {
                        targetScrollTop = window.scrollY + sectionRect.top - desiredTopInViewport;
                        window.scrollTo({ top: Math.max(0, targetScrollTop), behavior: behavior || 'smooth' });
                    } else {
                        const parentRect = scrollParent.getBoundingClientRect();
                        targetScrollTop = scrollParent.scrollTop + (sectionRect.top - parentRect.top) - desiredTopInViewport;
                        scrollParent.scrollTo({ top: Math.max(0, targetScrollTop), behavior: behavior || 'smooth' });
                    }
                };

                // Wait for layout to settle after expanding.
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        // First pass: smooth scroll
                        scrollSectionToCenter('smooth');

                        // Projections can expand after Tabulator renders; re-center after a
                        // short delay so the final position is correct.
                        setTimeout(() => {
                            if (!panel.classList.contains('hidden')) scrollSectionToCenter('auto');
                        }, 250);

                        setTimeout(() => {
                            if (!panel.classList.contains('hidden')) scrollSectionToCenter('auto');
                        }, 800);
                    });
                });
            }
        };
}


