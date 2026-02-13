/**
 * Post-Release Hotfixes Module
 * 
 * Handles the Post-Release Hotfixes tab functionality.
 * Identifies stories included in hotfixes but missing from release versions.
 */

(function() {
  // State
  let hotfixVersionsLoaded = false;
  let hotfixSortColumn = 'none'; // 'securityTypes', 'clients', 'developer'
  let hotfixSortDirection = 'none'; // 'none', 'asc', 'desc'
  let currentHotfixData = null;
  let selectedHeatmapCells = []; // Array of {securityType, client}

  // DOM Elements
  let targetVersionSelect;
  let checkHotfixBtn;
  let hotfixLoading;
  let hotfixResults;

  /**
   * Initialize the hotfixes module
   */
  function init() {
    targetVersionSelect = document.getElementById('targetVersionSelect');
    checkHotfixBtn = document.getElementById('checkHotfixBtn');
    hotfixLoading = document.getElementById('hotfixLoading');
    hotfixResults = document.getElementById('hotfixResults');

    if (checkHotfixBtn) {
      checkHotfixBtn.addEventListener('click', checkHotfixes);
    }

    // Setup click handlers using event delegation
    document.addEventListener('click', handleHotfixClicks);
  }

  /**
   * Handle click events for hotfix table sorting, heatmap cells, and clear filter
   */
  function handleHotfixClicks(e) {
    // Only handle hotfix-related clicks
    if (!document.getElementById('hotfix-check')?.style.display !== 'none') {
      // Handle sort header clicks
      const sortHeader = e.target.closest('.hotfix-sort-header');
      if (sortHeader && currentHotfixData) {
        const column = sortHeader.dataset.sort;
        
        if (hotfixSortColumn === column) {
          if (hotfixSortDirection === 'none') {
            hotfixSortDirection = 'asc';
          } else if (hotfixSortDirection === 'asc') {
            hotfixSortDirection = 'desc';
          } else {
            hotfixSortDirection = 'none';
            hotfixSortColumn = 'none';
          }
        } else {
          hotfixSortColumn = column;
          hotfixSortDirection = 'asc';
        }
        
        renderHotfixResults(currentHotfixData, true, true);
        return;
      }

      // Handle heatmap cell clicks (within hotfix context)
      const hotfixContainer = e.target.closest('#hotfixResults');
      const heatmapCell = e.target.closest('.heatmap-cell.clickable');
      if (heatmapCell && hotfixContainer && currentHotfixData) {
        const secType = heatmapCell.dataset.sectype;
        const client = heatmapCell.dataset.client;
        const count = parseInt(heatmapCell.dataset.count, 10);
        
        if (count === 0) return;
        
        const existingIndex = selectedHeatmapCells.findIndex(
          c => c.securityType === secType && c.client === client
        );
        
        if (existingIndex >= 0) {
          selectedHeatmapCells.splice(existingIndex, 1);
        } else {
          selectedHeatmapCells.push({ securityType: secType, client: client });
        }
        
        renderHotfixResults(currentHotfixData, true, true);
        return;
      }

      // Handle clear filter button click
      if (e.target.closest('#clearHotfixHeatmapFilter')) {
        selectedHeatmapCells = [];
        renderHotfixResults(currentHotfixData, true, false);
        return;
      }
    }
  }

  /**
   * Load available hotfix versions into the dropdown
   */
  async function loadHotfixVersions() {
    try {
      const response = await fetch('/api/hotfix-versions');
      if (!response.ok) throw new Error('Failed to fetch versions');
      const data = await response.json();
      
      targetVersionSelect.innerHTML = '<option value="">Select a version...</option>';
      data.versions.forEach(version => {
        const option = document.createElement('option');
        option.value = version;
        option.textContent = version;
        targetVersionSelect.appendChild(option);
      });
      
      hotfixVersionsLoaded = true;
    } catch (err) {
      console.error('Error loading hotfix versions:', err);
      hotfixResults.innerHTML = `
        <div class="hotfix-error">
          <span class="material-icons">error_outline</span>
          <p>Failed to load versions. Please try again.</p>
        </div>
      `;
    }
  }

  /**
   * Check for missing hotfixes
   */
  async function checkHotfixes() {
    const targetVersion = targetVersionSelect.value;
    if (!targetVersion) {
      hotfixResults.innerHTML = `
        <div class="hotfix-info">
          <span class="material-icons">info</span>
          <p>Please select a target release version.</p>
        </div>
      `;
      return;
    }

    hotfixLoading.style.display = 'flex';
    hotfixResults.innerHTML = '';

    try {
      const response = await fetch(`/api/hotfix-check?targetVersion=${encodeURIComponent(targetVersion)}`);
      if (!response.ok) throw new Error('Failed to check hotfixes');
      const data = await response.json();
      
      // Reset filters when loading new data
      selectedHeatmapCells = [];
      hotfixSortColumn = 'none';
      hotfixSortDirection = 'none';
      
      renderHotfixResults(data);
    } catch (err) {
      console.error('Error checking hotfixes:', err);
      hotfixResults.innerHTML = `
        <div class="hotfix-error">
          <span class="material-icons">error_outline</span>
          <p>Failed to check hotfixes. Please try again.</p>
        </div>
      `;
    } finally {
      hotfixLoading.style.display = 'none';
    }
  }

  /**
   * Render hotfix check results
   */
  function renderHotfixResults(data, preserveSort = false, preserveHeatmapSelection = false) {
    const { targetVersion, missingStories, jiraBaseUrl: baseUrl } = data;
    const { escapeHtml, getStatusClass, buildHeatmapData, renderHeatmap } = window.Utils;
    
    currentHotfixData = data;

    if (missingStories.length === 0) {
      hotfixResults.innerHTML = `
        <div class="hotfix-success">
          <span class="material-icons">check_circle</span>
          <p>No missing stories found for version ${escapeHtml(targetVersion)}!</p>
          <p class="hotfix-success-subtitle">All hotfixed stories are included in this release.</p>
        </div>
      `;
      return;
    }

    if (!preserveSort) {
      hotfixSortColumn = 'none';
      hotfixSortDirection = 'none';
    }
    
    if (!preserveHeatmapSelection) {
      selectedHeatmapCells = [];
    }

    // Filter stories based on selected heatmap cells
    let filteredStories = [...missingStories];
    if (selectedHeatmapCells.length > 0) {
      filteredStories = missingStories.filter(story => {
        const storySecTypes = story.securityTypes || [];
        const storyClients = story.clientEnvironments || [];
        
        return selectedHeatmapCells.some(cell => 
          storySecTypes.includes(cell.securityType) && storyClients.includes(cell.client)
        );
      });
    }

    // Sort stories if needed
    let sortedStories = [...filteredStories];
    if (hotfixSortColumn !== 'none' && hotfixSortDirection !== 'none') {
      sortedStories.sort((a, b) => {
        let valA, valB;
        
        if (hotfixSortColumn === 'securityTypes') {
          valA = (a.securityTypes && a.securityTypes.length > 0) ? a.securityTypes.join(', ').toLowerCase() : '';
          valB = (b.securityTypes && b.securityTypes.length > 0) ? b.securityTypes.join(', ').toLowerCase() : '';
        } else if (hotfixSortColumn === 'clients') {
          valA = (a.clientEnvironments && a.clientEnvironments.length > 0) ? a.clientEnvironments.join(', ').toLowerCase() : '';
          valB = (b.clientEnvironments && b.clientEnvironments.length > 0) ? b.clientEnvironments.join(', ').toLowerCase() : '';
        } else if (hotfixSortColumn === 'developer') {
          valA = (a.responsibleForChange || '').toLowerCase();
          valB = (b.responsibleForChange || '').toLowerCase();
        }
        
        if (!valA && !valB) return 0;
        if (!valA) return 1;
        if (!valB) return -1;
        
        const result = valA.localeCompare(valB);
        return hotfixSortDirection === 'desc' ? -result : result;
      });
    }

    const getSortIcon = (column) => {
      if (hotfixSortColumn !== column) return 'unfold_more';
      if (hotfixSortDirection === 'asc') return 'arrow_upward';
      if (hotfixSortDirection === 'desc') return 'arrow_downward';
      return 'unfold_more';
    };

    const isFiltered = selectedHeatmapCells.length > 0;
    const filterStatusHtml = isFiltered ? `
      <div class="hotfix-filter-status">
        <span class="material-icons">filter_alt</span>
        <span>Filtered: ${sortedStories.length} of ${missingStories.length} stories (${selectedHeatmapCells.length} cell${selectedHeatmapCells.length > 1 ? 's' : ''} selected)</span>
        <button class="clear-filter-btn" id="clearHotfixHeatmapFilter">
          <span class="material-icons">close</span>
          Clear Filter
        </button>
      </div>
    ` : '';

    const tableHtml = `
      <div class="hotfix-results-header">
        <span class="material-icons">warning</span>
        <span>Found ${missingStories.length} stor${missingStories.length !== 1 ? 'ies' : 'y'} missing from ${escapeHtml(targetVersion)}</span>
      </div>
      ${filterStatusHtml}
      <table class="hotfix-table${isFiltered ? ' filtered' : ''}">
        <thead>
          <tr>
            <th>Key</th>
            <th>Summary</th>
            <th>Fix Versions</th>
            <th class="hotfix-sort-header" data-sort="securityTypes">
              Security Types
              <span class="material-icons sort-icon">${getSortIcon('securityTypes')}</span>
            </th>
            <th class="hotfix-sort-header" data-sort="clients">
              Clients
              <span class="material-icons sort-icon">${getSortIcon('clients')}</span>
            </th>
            <th class="hotfix-sort-header" data-sort="developer">
              Developer
              <span class="material-icons sort-icon">${getSortIcon('developer')}</span>
            </th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${sortedStories.map(story => `
            <tr>
              <td>
                <a href="${baseUrl}/browse/${escapeHtml(story.key)}" target="_blank" rel="noopener noreferrer" class="item-key">${escapeHtml(story.key)}</a>
              </td>
              <td class="summary-cell">${escapeHtml(story.summary)}</td>
              <td>
                <div class="fix-versions-list">
                  ${story.fixVersions.map(v => `<span class="fix-version-tag">${escapeHtml(v)}</span>`).join('')}
                </div>
              </td>
              <td>
                <div class="security-types-list">
                  ${story.securityTypes && story.securityTypes.length > 0 
                    ? story.securityTypes.map(st => `<span class="security-type-tag">${escapeHtml(st)}</span>`).join('') 
                    : '-'}
                </div>
              </td>
              <td>
                <div class="client-env-list">
                  ${story.clientEnvironments && story.clientEnvironments.length > 0 
                    ? story.clientEnvironments.map(ce => `<span class="client-env-tag">${escapeHtml(ce)}</span>`).join('') 
                    : '-'}
                </div>
              </td>
              <td>${story.responsibleForChange ? escapeHtml(story.responsibleForChange) : '-'}</td>
              <td><span class="story-status ${getStatusClass(story.status)}">${escapeHtml(story.status || 'Unknown')}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    const heatmapData = buildHeatmapData(missingStories);
    const heatmapHtml = renderHeatmap(heatmapData, selectedHeatmapCells);

    hotfixResults.innerHTML = tableHtml + heatmapHtml;
  }

  /**
   * Called when the tab is shown
   */
  function onTabShow() {
    if (!hotfixVersionsLoaded) {
      loadHotfixVersions();
    }
  }

  /**
   * Check if versions are loaded
   */
  function isVersionsLoaded() {
    return hotfixVersionsLoaded;
  }

  // Export module
  window.HotfixesModule = {
    init,
    onTabShow,
    isVersionsLoaded
  };
})();
