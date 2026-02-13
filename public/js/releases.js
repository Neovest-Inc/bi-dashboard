/**
 * Releases Module
 * 
 * Handles the Releases tab functionality.
 * Displays all stories and bugs included in a specific release version.
 */

(function() {
  // State
  let releaseVersionsLoaded = false;
  let releaseSortColumn = 'none'; // 'securityTypes', 'clients', 'developer', 'type'
  let releaseSortDirection = 'none'; // 'none', 'asc', 'desc'
  let currentReleaseData = null;
  let selectedReleaseHeatmapCells = []; // Array of {securityType, client}

  // DOM Elements
  let releaseVersionSelect;
  let checkReleaseBtn;
  let releaseLoading;
  let releaseResults;

  /**
   * Initialize the releases module
   */
  function init() {
    releaseVersionSelect = document.getElementById('releaseVersionSelect');
    checkReleaseBtn = document.getElementById('checkReleaseBtn');
    releaseLoading = document.getElementById('releaseLoading');
    releaseResults = document.getElementById('releaseResults');

    if (checkReleaseBtn) {
      checkReleaseBtn.addEventListener('click', checkRelease);
    }

    // Setup click handlers using event delegation
    document.addEventListener('click', handleReleaseClicks);
  }

  /**
   * Handle click events for release table sorting, heatmap cells, and clear filter
   */
  function handleReleaseClicks(e) {
    const releaseContainer = e.target.closest('#releaseResults');
    if (!releaseContainer) return;

    // Handle sort header clicks
    const sortHeader = e.target.closest('.release-sort-header');
    if (sortHeader && currentReleaseData) {
      const column = sortHeader.dataset.sort;
      
      if (releaseSortColumn === column) {
        if (releaseSortDirection === 'none') {
          releaseSortDirection = 'asc';
        } else if (releaseSortDirection === 'asc') {
          releaseSortDirection = 'desc';
        } else {
          releaseSortDirection = 'none';
          releaseSortColumn = 'none';
        }
      } else {
        releaseSortColumn = column;
        releaseSortDirection = 'asc';
      }
      
      renderReleaseResults(currentReleaseData, true, true);
      return;
    }

    // Handle heatmap cell clicks (within release context)
    const heatmapCell = e.target.closest('.heatmap-cell.clickable');
    if (heatmapCell && currentReleaseData) {
      const secType = heatmapCell.dataset.sectype;
      const client = heatmapCell.dataset.client;
      const count = parseInt(heatmapCell.dataset.count, 10);
      
      if (count === 0) return;
      
      const existingIndex = selectedReleaseHeatmapCells.findIndex(
        c => c.securityType === secType && c.client === client
      );
      
      if (existingIndex >= 0) {
        selectedReleaseHeatmapCells.splice(existingIndex, 1);
      } else {
        selectedReleaseHeatmapCells.push({ securityType: secType, client: client });
      }
      
      renderReleaseResults(currentReleaseData, true, true);
      return;
    }

    // Handle clear filter button click
    if (e.target.closest('#clearReleaseHeatmapFilter')) {
      selectedReleaseHeatmapCells = [];
      renderReleaseResults(currentReleaseData, true, false);
      return;
    }
  }

  /**
   * Load available release versions into the dropdown
   */
  async function loadReleaseVersions() {
    try {
      const response = await fetch('/api/release-versions');
      if (!response.ok) throw new Error('Failed to fetch versions');
      const data = await response.json();
      
      releaseVersionSelect.innerHTML = '<option value="">Select a version...</option>';
      data.versions.forEach(version => {
        const option = document.createElement('option');
        option.value = version;
        option.textContent = version;
        releaseVersionSelect.appendChild(option);
      });
      
      releaseVersionsLoaded = true;
    } catch (err) {
      console.error('Error loading release versions:', err);
      releaseResults.innerHTML = `
        <div class="release-error">
          <span class="material-icons">error_outline</span>
          <p>Failed to load versions. Please try again.</p>
        </div>
      `;
    }
  }

  /**
   * Check release contents
   */
  async function checkRelease() {
    const targetVersion = releaseVersionSelect.value;
    if (!targetVersion) {
      releaseResults.innerHTML = `
        <div class="release-info">
          <span class="material-icons">info</span>
          <p>Please select a target release version.</p>
        </div>
      `;
      return;
    }

    releaseLoading.style.display = 'flex';
    releaseResults.innerHTML = '';

    try {
      const response = await fetch(`/api/release-stories?targetVersion=${encodeURIComponent(targetVersion)}`);
      if (!response.ok) throw new Error('Failed to fetch release stories');
      const data = await response.json();
      
      // Reset filters when loading new data
      selectedReleaseHeatmapCells = [];
      releaseSortColumn = 'none';
      releaseSortDirection = 'none';
      
      renderReleaseResults(data);
    } catch (err) {
      console.error('Error fetching release:', err);
      releaseResults.innerHTML = `
        <div class="release-error">
          <span class="material-icons">error_outline</span>
          <p>Failed to fetch release data. Please try again.</p>
        </div>
      `;
    } finally {
      releaseLoading.style.display = 'none';
    }
  }

  /**
   * Render release results
   */
  function renderReleaseResults(data, preserveSort = false, preserveHeatmapSelection = false) {
    const { targetVersion, stories, jiraBaseUrl: baseUrl } = data;
    const { escapeHtml, getStatusClass, buildHeatmapData, renderHeatmap } = window.Utils;
    
    currentReleaseData = data;

    if (stories.length === 0) {
      releaseResults.innerHTML = `
        <div class="release-empty">
          <span class="material-icons">info</span>
          <p>No stories or bugs found for version ${escapeHtml(targetVersion)}.</p>
        </div>
      `;
      return;
    }

    if (!preserveSort) {
      releaseSortColumn = 'none';
      releaseSortDirection = 'none';
    }
    
    if (!preserveHeatmapSelection) {
      selectedReleaseHeatmapCells = [];
    }

    // Filter stories based on selected heatmap cells
    let filteredStories = [...stories];
    if (selectedReleaseHeatmapCells.length > 0) {
      filteredStories = stories.filter(story => {
        const storySecTypes = story.securityTypes || [];
        const storyClients = story.clientEnvironments || [];
        
        return selectedReleaseHeatmapCells.some(cell => 
          storySecTypes.includes(cell.securityType) && storyClients.includes(cell.client)
        );
      });
    }

    // Sort stories if needed
    let sortedStories = [...filteredStories];
    if (releaseSortColumn !== 'none' && releaseSortDirection !== 'none') {
      sortedStories.sort((a, b) => {
        let valA, valB;
        
        if (releaseSortColumn === 'type') {
          valA = (a.issueType || '').toLowerCase();
          valB = (b.issueType || '').toLowerCase();
        } else if (releaseSortColumn === 'securityTypes') {
          valA = (a.securityTypes && a.securityTypes.length > 0) ? a.securityTypes.join(', ').toLowerCase() : '';
          valB = (b.securityTypes && b.securityTypes.length > 0) ? b.securityTypes.join(', ').toLowerCase() : '';
        } else if (releaseSortColumn === 'clients') {
          valA = (a.clientEnvironments && a.clientEnvironments.length > 0) ? a.clientEnvironments.join(', ').toLowerCase() : '';
          valB = (b.clientEnvironments && b.clientEnvironments.length > 0) ? b.clientEnvironments.join(', ').toLowerCase() : '';
        } else if (releaseSortColumn === 'developer') {
          valA = (a.responsibleForChange || '').toLowerCase();
          valB = (b.responsibleForChange || '').toLowerCase();
        }
        
        if (!valA && !valB) return 0;
        if (!valA) return 1;
        if (!valB) return -1;
        
        const result = valA.localeCompare(valB);
        return releaseSortDirection === 'desc' ? -result : result;
      });
    }

    const getSortIcon = (column) => {
      if (releaseSortColumn !== column) return 'unfold_more';
      if (releaseSortDirection === 'asc') return 'arrow_upward';
      if (releaseSortDirection === 'desc') return 'arrow_downward';
      return 'unfold_more';
    };

    // Count by type
    const storyCount = stories.filter(s => s.issueType === 'Story').length;
    const bugCount = stories.filter(s => s.issueType === 'Bug').length;

    const isFiltered = selectedReleaseHeatmapCells.length > 0;
    const filterStatusHtml = isFiltered ? `
      <div class="release-filter-status">
        <span class="material-icons">filter_alt</span>
        <span>Filtered: ${sortedStories.length} of ${stories.length} items (${selectedReleaseHeatmapCells.length} cell${selectedReleaseHeatmapCells.length > 1 ? 's' : ''} selected)</span>
        <button class="clear-filter-btn" id="clearReleaseHeatmapFilter">
          <span class="material-icons">close</span>
          Clear Filter
        </button>
      </div>
    ` : '';

    const tableHtml = `
      <div class="release-results-header">
        <span class="material-icons">new_releases</span>
        <span>Release ${escapeHtml(targetVersion)}: ${stories.length} item${stories.length !== 1 ? 's' : ''} (${storyCount} stories, ${bugCount} bugs)</span>
      </div>
      ${filterStatusHtml}
      <table class="release-table${isFiltered ? ' filtered' : ''}">
        <thead>
          <tr>
            <th>Key</th>
            <th class="release-sort-header" data-sort="type">
              Type
              <span class="material-icons sort-icon">${getSortIcon('type')}</span>
            </th>
            <th>Summary</th>
            <th>Fix Versions</th>
            <th class="release-sort-header" data-sort="securityTypes">
              Security Types
              <span class="material-icons sort-icon">${getSortIcon('securityTypes')}</span>
            </th>
            <th class="release-sort-header" data-sort="clients">
              Clients
              <span class="material-icons sort-icon">${getSortIcon('clients')}</span>
            </th>
            <th class="release-sort-header" data-sort="developer">
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
              <td>
                <span class="issue-type-badge ${story.issueType === 'Bug' ? 'issue-type-bug' : 'issue-type-story'}">${escapeHtml(story.issueType)}</span>
              </td>
              <td class="summary-cell">${escapeHtml(story.summary)}</td>
              <td>
                <div class="fix-versions-list">
                  ${story.fixVersions.map(v => `<span class="fix-version-tag${v === targetVersion ? ' current-version' : ''}">${escapeHtml(v)}</span>`).join('')}
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

    const heatmapData = buildHeatmapData(stories);
    const heatmapHtml = renderHeatmap(heatmapData, selectedReleaseHeatmapCells);

    releaseResults.innerHTML = tableHtml + heatmapHtml;
  }

  /**
   * Called when the tab is shown
   */
  function onTabShow() {
    if (!releaseVersionsLoaded) {
      loadReleaseVersions();
    }
  }

  /**
   * Check if versions are loaded
   */
  function isVersionsLoaded() {
    return releaseVersionsLoaded;
  }

  // Export module
  window.ReleasesModule = {
    init,
    onTabShow,
    isVersionsLoaded
  };
})();
