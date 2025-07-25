# UI Refactor Instructions

## Step 1: Updates to the DOM Structure

- Remove unnecessary wrapper elements (.container, .section, .input-section, .desc, etc.) from:
  - accounts.html
  - home.html
  - pages/navbar.html (if present)
- Render main content (grids, modals, etc.) directly inside <body> or a single root <div id="app">.
- For modals, keep only the overlay and modal content divs, both using generic classes.
- For tables/grids, remove extra div wrappers—use only the <table> with the .table class.
- All buttons, icons, and SVGs: ensure they are direct children of their logical parent, no extra layout wrappers.
- Remove all inline styles, replacing with the .hidden class for hidden elements.
- Use .bordered, .rounded, or .centered only where needed for clarity.
- Ensure the navbar is always present on every page:
  - The navbar must be injected by navbar.js into a dedicated container (e.g., <div id="main-navbar"></div>) at the top of the main content/root element.
  - All pages must include the script reference to navbar.js and a navbar container as the first element inside <body> or <div id="app">.
  - If any page is missing this, add both the container and the script reference.

## Step 2: Updates to the CSS Styles

- Define only these classes in app.css:
  - .bg-main — background color for all backgrounds
  - .text-main — text color for all text
  - .btn — all buttons and clickable SVGs
  - .table — all tables
  - .hidden — display: none !important
  - .bordered — (optional) border for separation
  - .rounded — (optional) border-radius
  - .centered — (optional) centering content
- Remove all other classes, media queries, and color/font/background variations.

## Step 3: Updates to Style/Class References in DOM Elements

- In all HTML and JS files listed below:
  - All buttons, clickable icons, and SVGs: add .btn
  - All text: add .text-main
  - All backgrounds: add .bg-main
  - All tables: add .table
  - All elements that should be hidden: add .hidden
  - Add .bordered, .rounded, .centered only where needed
  - Remove all references to old classes and update dynamic class assignments in JS.

---

### Files to Update
- accounts.html
- home.html
- pages/navbar.html (if present)
- editable-grid.js
- modal.js
- accounts.js
- styles/app.css
- js/navbar.js (ensure it injects the navbar into #main-navbar)

---

## Detailed Plan by File

### accounts.html
- Ensure <div id="main-navbar"></div> is the first element inside <body> or <div id="app">.
- Confirm <script src="../js/navbar.js"></script> is present in the <head>.
- Remove unnecessary wrappers as per previous instructions.
- Render main content after the navbar container.
- Update all class usage as per steps 2 and 3.

### home.html
- Ensure <div id="main-navbar"></div> is the first element inside <body> or <div id="app">.
- Confirm <script src="../js/navbar.js"></script> is present in the <head>.
- Remove unnecessary wrappers and update class usage as per previous instructions.
- Render main content after the navbar container.

### js/navbar.js
- Ensure it injects the navbar into the element with id main-navbar on every page.
- Confirm it highlights the active page link.

### editable-grid.js, modal.js, accounts.js
- Remove references to old classes and update dynamic class assignments.
- Ensure no code interferes with the navbar container or its placement.
- Update all class usage as per steps 2 and 3.

### styles/app.css
- Define only the required classes as per step 2.
- Remove all other classes, media queries, and color/font/background variations.
- Ensure styles do not hide or misplace the navbar.

---

## Summary of What Needs to Happen

- All pages must have a <div id="main-navbar"></div> as the first element in the main content/root.
- All pages must include <script src="../js/navbar.js"></script> in the <head>.
- Remove unnecessary wrappers and update class usage in all listed files.
- Only use the specified CSS classes in styles/app.css.
- Remove static navbars and rely on JS-injected navbar.
- Ensure js/navbar.js injects and highlights the navbar correctly.
- Update all dynamic and static class assignments in JS and HTML files as per the new class list.
