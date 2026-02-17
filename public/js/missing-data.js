/**
 * Missing Data Module - Handles rendering of the Missing Data tab
 */
(function() {
  'use strict';

  let jiraBaseUrl = '';
  let currentFilter = 'all';
  let developerSortState = 'none'; // 'none', 'desc', 'asc'
  let originalMissingItems = [];
  let currentData = null;
  let missingDataTableEl = null;

  function init(baseUrl) {
    jiraBaseUrl = baseUrl || '';
    setupEventListeners();
  }

  function setJiraBaseUrl(url) {
    jiraBaseUrl = url || '';
  }

  function setupEventListeners() {
    // Filter switching
    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        developerSortState = 'none'; // Reset sort when changing filter
        if (currentData) renderMissingDataTable(currentData);
      });
    });

    // Developer sort handler (event delegation)
    document.addEventListener('click', (e) => {
      if (e.target.closest('.developer-sort-header')) {
        // Cycle through sort states: none -> asc -> desc -> none
        if (developerSortState === 'none') {
          developerSortState = 'asc';
        } else if (developerSortState === 'asc') {
          developerSortState = 'desc';
        } else {
          developerSortState = 'none';
        }
        if (currentData) renderMissingDataTable(currentData);
      }
    });
  }

  function renderMissingDataTable(data, tableElement) {
    currentData = data;
    if (tableElement) {
      missingDataTableEl = tableElement;
    }
    
    const missingDataTable = missingDataTableEl || document.getElementById('missingDataTable');
    if (!missingDataTable) return;

    const missingItems = [];
    const seenEpics = new Set();
    const seenStories = new Set();

    // Collect all epics and stories with missing data
    Object.values(data).forEach(projectData => {
      const items = projectData.items || projectData;
      items.forEach(item => {
        if (item.type === 'epic') {
          // Check epic for missing fields (avoid duplicates)
          if (!seenEpics.has(item.key)) {
            seenEpics.add(item.key);
            const missingFields = [];
            if (!item.dueDate) missingFields.push('Due Date');
            if (!item.clientEnvironments || (Array.isArray(item.clientEnvironments) && item.clientEnvironments.length === 0)) {
              missingFields.push('Client Environment(s)');
            }
            
            if (missingFields.length > 0) {
              missingItems.push({
                type: 'epic',
                key: item.key,
                summary: item.summary,
                missingFields,
                dueDate: item.dueDate,
                clientEnvironments: item.clientEnvironments,
                responsibleForChange: null
              });
            }
          }

          // Check stories within epic for missing fields
          item.stories.forEach(story => {
            if (!seenStories.has(story.key)) {
              seenStories.add(story.key);
              const missingFields = [];
              if (story.storyPoints === null || story.storyPoints === undefined) missingFields.push('Story Points');
              if (!story.responsibleForChange) missingFields.push('Responsible for Change');
              if (!story.parent) missingFields.push('Parent');

              if (missingFields.length > 0) {
                missingItems.push({
                  type: 'story',
                  key: story.key,
                  summary: story.summary,
                  missingFields,
                  storyPoints: story.storyPoints,
                  responsibleForChange: story.responsibleForChange,
                  parent: story.parent
                });
              }
            }
          });
        } else if (item.type === 'story') {
          // Check standalone story for missing fields (avoid duplicates)
          if (!seenStories.has(item.key)) {
            seenStories.add(item.key);
            const missingFields = [];
            if (item.storyPoints === null || item.storyPoints === undefined) missingFields.push('Story Points');
            if (!item.responsibleForChange) missingFields.push('Responsible for Change');
            if (!item.parent) missingFields.push('Parent');

            if (missingFields.length > 0) {
              missingItems.push({
                type: 'story',
                key: item.key,
                summary: item.summary,
                missingFields,
                storyPoints: item.storyPoints,
                responsibleForChange: item.responsibleForChange,
                parent: item.parent
              });
            }
          }
        }
      });
    });

    // Store original order
    if (developerSortState === 'none') {
      originalMissingItems = [...missingItems];
    }

    // Apply filter
    let filteredItems = currentFilter === 'all' 
      ? missingItems 
      : missingItems.filter(item => item.type === currentFilter);

    // Apply developer sort
    if (developerSortState !== 'none') {
      filteredItems = [...filteredItems].sort((a, b) => {
        const devA = (a.responsibleForChange || '').toLowerCase();
        const devB = (b.responsibleForChange || '').toLowerCase();
        
        // Empty values go to the end
        if (!devA && !devB) return 0;
        if (!devA) return 1;
        if (!devB) return -1;
        
        if (developerSortState === 'desc') {
          return devB.localeCompare(devA);
        } else {
          return devA.localeCompare(devB);
        }
      });
    }

    if (filteredItems.length === 0) {
      missingDataTable.innerHTML = `
        <div class="no-missing-data">
          <span class="material-icons">check_circle</span>
          <p>All items have complete information!</p>
        </div>
      `;
      return;
    }

    const getSortIcon = () => {
      if (developerSortState === 'desc') return 'arrow_downward';
      if (developerSortState === 'asc') return 'arrow_upward';
      return 'unfold_more';
    };

    const tableHtml = `
      <table class="missing-data-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Key</th>
            <th>Summary</th>
            <th class="developer-sort-header">
              Developer
              <span class="material-icons sort-icon">${getSortIcon()}</span>
            </th>
            <th>Missing Fields</th>
          </tr>
        </thead>
        <tbody>
          ${filteredItems.map(item => `
            <tr class="${item.type}-row">
              <td>
                <span class="type-badge type-${item.type}${item.issueType ? ' type-' + item.issueType.toLowerCase() : ''}">
                  <span class="material-icons">${item.type === 'epic' ? 'bolt' : (item.issueType === 'Bug' ? 'bug_report' : (item.issueType === 'Task' ? 'check_box' : 'bookmark'))}</span>
                  ${item.type === 'epic' ? 'Epic' : (item.issueType || 'Story')}
                </span>
              </td>
              <td>
                <a href="${jiraBaseUrl}/browse/${escapeHtml(item.key)}" target="_blank" rel="noopener noreferrer" class="item-key">${escapeHtml(item.key)}</a>
              </td>
              <td class="summary-cell">${escapeHtml(item.summary)}</td>
              <td>${item.responsibleForChange ? escapeHtml(item.responsibleForChange) : '-'}</td>
              <td>
                <div class="missing-fields">
                  ${item.missingFields.map(field => `<span class="missing-field-tag">${escapeHtml(field)}</span>`).join('')}
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="missing-data-summary">
        <span class="material-icons">info</span>
        Showing ${filteredItems.length} item${filteredItems.length !== 1 ? 's' : ''} with missing information
      </div>
    `;

    missingDataTable.innerHTML = tableHtml;
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Export module
  window.MissingDataModule = {
    init,
    setJiraBaseUrl,
    renderMissingDataTable
  };
})();
