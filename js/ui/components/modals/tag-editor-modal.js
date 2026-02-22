// tag-editor-modal.js
// Modal for editing tags on any entity (accounts, transactions, etc.)

import { notifySuccess, notifyError } from '../../../shared/notifications.js';

const commonTags = {
  account: ['checking', 'savings', 'investment', 'credit-card', 'mortgage', 'auto-loan', 'primary', 'secondary', 'inactive', 'joint'],
  transaction: ['salary', 'rent', 'groceries', 'utilities', 'medical', 'entertainment', 'savings', 'investment', 'transfer'],
  default: ['important', 'review', 'pending', 'archived']
};

export function openTagEditorModal(currentTags = [], entityType = 'default', onSave) {
  const tags = Array.isArray(currentTags) ? [...currentTags] : [];
  const suggestions = [...new Set([...commonTags[entityType] || [], ...commonTags.default])];

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'modal modal-tag-editor';

  const header = document.createElement('div');
  header.className = 'modal-header';
  header.innerHTML = '<h2>Edit Tags</h2>';

  const content = document.createElement('div');
  content.className = 'modal-content';

  // Current tags display
  const tagsContainer = document.createElement('div');
  tagsContainer.className = 'tag-editor-tags';

  const renderTags = () => {
    tagsContainer.innerHTML = '';
    tags.forEach((tag, idx) => {
      const tagEl = document.createElement('span');
      tagEl.className = 'tag-badge';
      tagEl.innerHTML = `${tag} <button type="button" class="tag-remove" aria-label="Remove tag">×</button>`;
      tagEl.querySelector('.tag-remove').addEventListener('click', () => {
        tags.splice(idx, 1);
        renderTags();
      });
      tagsContainer.appendChild(tagEl);
    });
  };

  renderTags();
  content.appendChild(tagsContainer);

  // Input field
  const inputLabel = document.createElement('label');
  inputLabel.textContent = 'Add tag:';
  inputLabel.className = 'tag-editor-label';
  content.appendChild(inputLabel);

  const inputWrapper = document.createElement('div');
  inputWrapper.className = 'tag-editor-input-wrapper';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'tag-editor-input';
  input.placeholder = 'Type tag name...';
  input.autocomplete = 'off';

  const dropdown = document.createElement('div');
  dropdown.className = 'tag-editor-dropdown hidden';

  const showSuggestions = (query) => {
    if (!query) {
      dropdown.classList.add('hidden');
      return;
    }

    const filtered = suggestions.filter(
      (s) => s.toLowerCase().includes(query.toLowerCase()) && !tags.includes(s)
    );

    dropdown.innerHTML = '';
    if (filtered.length > 0) {
      filtered.forEach((suggestion) => {
        const item = document.createElement('div');
        item.className = 'tag-editor-dropdown-item';
        item.textContent = suggestion;
        item.addEventListener('click', () => {
          addTag(suggestion);
          input.value = '';
          dropdown.classList.add('hidden');
        });
        dropdown.appendChild(item);
      });
      dropdown.classList.remove('hidden');
    } else {
      dropdown.classList.add('hidden');
    }
  };

  const addTag = (tag) => {
    const trimmed = tag.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      tags.push(trimmed);
      renderTags();
    }
  };

  input.addEventListener('input', (e) => {
    showSuggestions(e.target.value);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag(input.value);
      input.value = '';
      dropdown.classList.add('hidden');
    }
    if (e.key === 'Escape') {
      dropdown.classList.add('hidden');
    }
  });

  input.addEventListener('blur', () => {
    setTimeout(() => dropdown.classList.add('hidden'), 200);
  });

  inputWrapper.appendChild(input);
  inputWrapper.appendChild(dropdown);
  content.appendChild(inputWrapper);

  // Suggestions list
  const suggestionsLabel = document.createElement('label');
  suggestionsLabel.className = 'tag-editor-label';
  suggestionsLabel.textContent = 'Quick add:';
  content.appendChild(suggestionsLabel);

  const quickAddContainer = document.createElement('div');
  quickAddContainer.className = 'tag-editor-quick-add';

  suggestions.forEach((suggestion) => {
    if (!tags.includes(suggestion)) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tag-quick-add-btn';
      btn.textContent = suggestion;
      btn.addEventListener('click', () => {
        addTag(suggestion);
      });
      quickAddContainer.appendChild(btn);
    }
  });

  content.appendChild(quickAddContainer);

  // Footer with buttons
  const footer = document.createElement('div');
  footer.className = 'modal-footer';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-secondary';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => {
    overlay.remove();
  });

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-primary';
  saveBtn.textContent = 'Save Tags';
  saveBtn.addEventListener('click', () => {
    onSave(tags);
    overlay.remove();
  });

  footer.appendChild(cancelBtn);
  footer.appendChild(saveBtn);

  modal.appendChild(header);
  modal.appendChild(content);
  modal.appendChild(footer);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  input.focus();
}
