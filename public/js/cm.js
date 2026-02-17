/**
 * CM (Change Management) Module
 * 
 * Handles the CMs tab functionality.
 * Displays CM tickets raised by VAL team in the last 30 days.
 */

(function() {
  // State
  let cmDataLoaded = false;
  let cmSortColumn = 'none';
  let cmSortDirection = 'none';
  let currentCmData = null;
  let jiraBaseUrl = '';

  // Pre-defined colors for components (consistent color assignment)
  const COMPONENT_COLORS = [
    { bg: '#e8f0fe', text: '#1967d2', border: '#d2e3fc' },  // Blue
    { bg: '#fce8e6', text: '#c5221f', border: '#f5c6cb' },  // Red
    { bg: '#e6f4ea', text: '#1e8e3e', border: '#c6e6cf' },  // Green
    { bg: '#fef7e0', text: '#e37400', border: '#fde69e' },  // Orange
    { bg: '#f3e8fd', text: '#8430ce', border: '#e5cffa' },  // Purple
    { bg: '#e0f7fa', text: '#00838f', border: '#b2ebf2' },  // Cyan
    { bg: '#fce4ec', text: '#c2185b', border: '#f8bbd9' },  // Pink
    { bg: '#e8eaf6', text: '#3f51b5', border: '#c5cae9' },  // Indigo
    { bg: '#fff3e0', text: '#e65100', border: '#ffccbc' },  // Deep Orange
    { bg: '#e0f2f1', text: '#00695c', border: '#b2dfdb' },  // Teal
  ];

  // Cache for component-to-color mapping
  const componentColorCache = {};
  let colorIndex = 0;

  // DOM Elements
  let cmLoading;
  let cmResults;

  /**
   * Initialize the cm module
   */
  function init() {
    cmLoading = document.getElementById('cmLoading');
    cmResults = document.getElementById('cmResults');

    // Setup click handlers using event delegation
    document.addEventListener('click', handleCmClicks);
  }

  /**
   * Get a consistent color for a component
   */
  function getComponentColor(componentName) {
    if (!componentColorCache[componentName]) {
      componentColorCache[componentName] = COMPONENT_COLORS[colorIndex % COMPONENT_COLORS.length];
      colorIndex++;
    }
    return componentColorCache[componentName];
  }

  /**
   * Get CSS class for CM status badges
   */
  function getCmStatusClass(status) {
    if (!status) return 'cm-status-default';
    const statusLower = status.toLowerCase();
    if (statusLower === 'done' || statusLower === 'deployment completed') {
      return 'cm-status-done';
    }
    if (statusLower === 'cancelled' || statusLower === 'canceled') {
      return 'cm-status-cancelled';
    }
    return 'cm-status-default';
  }

  /**
   * Render a collapsible list of tags
   * @param {Array} items - Array of items to render
   * @param {string} type - 'client' or 'component'
   * @param {number} maxVisible - Maximum items to show before collapsing
   * @param {string} rowId - Unique identifier for this row
   */
  function renderCollapsibleList(items, type, maxVisible, rowId) {
    const { escapeHtml } = window.Utils;
    
    if (!items || items.length === 0) {
      return '-';
    }

    const visibleItems = items.slice(0, maxVisible);
    const hiddenItems = items.slice(maxVisible);
    const hasMore = hiddenItems.length > 0;

    let html = `<div class="collapsible-list" data-row="${rowId}" data-type="${type}">`;
    html += '<div class="collapsible-visible">';
    
    if (type === 'component') {
      html += visibleItems.map(comp => {
        const color = getComponentColor(comp);
        return `<span class="component-tag" style="background-color: ${color.bg}; color: ${color.text}; border-color: ${color.border};">${escapeHtml(comp)}</span>`;
      }).join('');
    } else {
      html += visibleItems.map(ce => `<span class="client-env-tag">${escapeHtml(ce)}</span>`).join('');
    }
    
    if (hasMore) {
      html += `<span class="expand-tags-btn" data-row="${rowId}" data-type="${type}">+${hiddenItems.length} more</span>`;
    }
    
    html += '</div>';
    
    if (hasMore) {
      html += '<div class="collapsible-hidden" style="display: none;">';
      if (type === 'component') {
        html += hiddenItems.map(comp => {
          const color = getComponentColor(comp);
          return `<span class="component-tag" style="background-color: ${color.bg}; color: ${color.text}; border-color: ${color.border};">${escapeHtml(comp)}</span>`;
        }).join('');
      } else {
        html += hiddenItems.map(ce => `<span class="client-env-tag">${escapeHtml(ce)}</span>`).join('');
      }
      html += `<span class="collapse-tags-btn" data-row="${rowId}" data-type="${type}">Show less</span>`;
      html += '</div>';
    }
    
    html += '</div>';
    return html;
  }

  /**
   * Handle click events for CM table sorting and expand/collapse
   */
  function handleCmClicks(e) {
    const cmContainer = e.target.closest('#cmResults');
    if (!cmContainer) return;

    // Handle expand tags click
    const expandBtn = e.target.closest('.expand-tags-btn');
    if (expandBtn) {
      const rowId = expandBtn.dataset.row;
      const type = expandBtn.dataset.type;
      const container = expandBtn.closest('.collapsible-list');
      if (container) {
        container.querySelector('.collapsible-visible').style.display = 'none';
        container.querySelector('.collapsible-hidden').style.display = 'flex';
      }
      return;
    }

    // Handle collapse tags click
    const collapseBtn = e.target.closest('.collapse-tags-btn');
    if (collapseBtn) {
      const container = collapseBtn.closest('.collapsible-list');
      if (container) {
        container.querySelector('.collapsible-visible').style.display = 'flex';
        container.querySelector('.collapsible-hidden').style.display = 'none';
      }
      return;
    }

    // Handle sort header clicks
    const sortHeader = e.target.closest('.cm-sort-header');
    if (sortHeader && currentCmData) {
      const column = sortHeader.dataset.sort;
      
      if (cmSortColumn === column) {
        if (cmSortDirection === 'none') {
          cmSortDirection = 'asc';
        } else if (cmSortDirection === 'asc') {
          cmSortDirection = 'desc';
        } else {
          cmSortDirection = 'none';
          cmSortColumn = 'none';
        }
      } else {
        cmSortColumn = column;
        cmSortDirection = 'asc';
      }
      
      renderCmResults(currentCmData, true);
      return;
    }
  }

  /**
   * Load CM data
   */
  async function loadCmData() {
    try {
      cmLoading.style.display = 'flex';
      cmResults.innerHTML = '';

      const response = await fetch('/api/cms');
      if (!response.ok) throw new Error('Failed to fetch CM tickets');
      const data = await response.json();
      
      jiraBaseUrl = data.jiraBaseUrl;
      currentCmData = data;
      cmDataLoaded = true;
      
      // Reset sort state
      cmSortColumn = 'none';
      cmSortDirection = 'none';
      
      renderCmResults(data);
    } catch (err) {
      console.error('Error loading CM tickets:', err);
      cmResults.innerHTML = `
        <div class="cm-error">
          <span class="material-icons">error_outline</span>
          <p>Failed to load CM tickets. Please try again.</p>
        </div>
      `;
    } finally {
      cmLoading.style.display = 'none';
    }
  }

  /**
   * Format date for display
   */
  function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('en-GB', { 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric' 
    });
  }

  /**
   * Render CM results
   */
  function renderCmResults(data, preserveSort = false) {
    const { cms, jiraBaseUrl: baseUrl } = data;
    const { escapeHtml } = window.Utils;
    
    currentCmData = data;

    if (cms.length === 0) {
      cmResults.innerHTML = `
        <div class="cm-empty">
          <span class="material-icons">info</span>
          <p>No CMs found in the last 30 days.</p>
        </div>
      `;
      return;
    }

    if (!preserveSort) {
      cmSortColumn = 'none';
      cmSortDirection = 'none';
    }

    // Sort CMs if needed
    let sortedCms = [...cms];
    if (cmSortColumn !== 'none' && cmSortDirection !== 'none') {
      sortedCms.sort((a, b) => {
        let valA, valB;
        
        if (cmSortColumn === 'reporter') {
          valA = (a.reporter || '').toLowerCase();
          valB = (b.reporter || '').toLowerCase();
        } else if (cmSortColumn === 'status') {
          valA = (a.status || '').toLowerCase();
          valB = (b.status || '').toLowerCase();
        } else if (cmSortColumn === 'targetDate') {
          valA = a.targetDeploymentDate || '';
          valB = b.targetDeploymentDate || '';
        } else if (cmSortColumn === 'components') {
          valA = (a.components && a.components.length > 0) ? a.components.join(', ').toLowerCase() : '';
          valB = (b.components && b.components.length > 0) ? b.components.join(', ').toLowerCase() : '';
        } else if (cmSortColumn === 'fixVersions') {
          valA = (a.fixVersions && a.fixVersions.length > 0) ? a.fixVersions.join(', ').toLowerCase() : '';
          valB = (b.fixVersions && b.fixVersions.length > 0) ? b.fixVersions.join(', ').toLowerCase() : '';
        }
        
        if (!valA && !valB) return 0;
        if (!valA) return 1;
        if (!valB) return -1;
        
        const result = valA.localeCompare(valB);
        return cmSortDirection === 'desc' ? -result : result;
      });
    }

    const getSortIcon = (column) => {
      if (cmSortColumn !== column) return 'unfold_more';
      if (cmSortDirection === 'asc') return 'arrow_upward';
      if (cmSortDirection === 'desc') return 'arrow_downward';
      return 'unfold_more';
    };

    const tableHtml = `
      <div class="cm-results-header">
        <span class="material-icons">swap_horiz</span>
        <span>Change Management Tickets: ${cms.length} found in the last 30 days</span>
      </div>
      <div class="cm-table-wrapper">
        <table class="cm-table">
          <thead>
            <tr>
              <th>Key</th>
              <th class="cm-type-header">Type</th>
              <th>Summary</th>
              <th>Client Environment(s)</th>
              <th class="cm-sort-header" data-sort="reporter">
                Reporter
                <span class="material-icons sort-icon">${getSortIcon('reporter')}</span>
              </th>
              <th class="cm-sort-header" data-sort="targetDate">
                Target Deployment
                <span class="material-icons sort-icon">${getSortIcon('targetDate')}</span>
              </th>
              <th class="cm-sort-header" data-sort="components">
                Components
                <span class="material-icons sort-icon">${getSortIcon('components')}</span>
              </th>
              <th class="cm-sort-header" data-sort="fixVersions">
                Fix Versions
                <span class="material-icons sort-icon">${getSortIcon('fixVersions')}</span>
              </th>
              <th class="cm-sort-header" data-sort="status">
                Status
                <span class="material-icons sort-icon">${getSortIcon('status')}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            ${sortedCms.map((cm, index) => `
              <tr>
                <td>
                  <a href="${baseUrl}/browse/${escapeHtml(cm.key)}" target="_blank" rel="noopener noreferrer" class="item-key">${escapeHtml(cm.key)}</a>
                </td>
                <td class="cm-type-cell">
                  ${cm.issueTypeIconUrl 
                    ? `<img src="${escapeHtml(cm.issueTypeIconUrl)}" alt="${escapeHtml(cm.issueType)}" title="${escapeHtml(cm.issueType)}" class="cm-type-icon" />`
                    : '-'}
                </td>
                <td class="summary-cell">${escapeHtml(cm.summary)}</td>
                <td>
                  ${renderCollapsibleList(cm.clientEnvironments, 'client', 2, `${cm.key}-clients`)}
                </td>
                <td>${cm.reporter ? escapeHtml(cm.reporter) : '-'}</td>
                <td>${formatDate(cm.targetDeploymentDate)}</td>
                <td>
                  ${renderCollapsibleList(cm.components, 'component', 2, `${cm.key}-components`)}
                </td>
                <td>
                  <div class="fix-versions-list">
                    ${cm.fixVersions && cm.fixVersions.length > 0 
                      ? cm.fixVersions.map(v => `<span class="fix-version-tag">${escapeHtml(v)}</span>`).join('') 
                      : '-'}
                  </div>
                </td>
                <td><span class="cm-status ${getCmStatusClass(cm.status)}">${escapeHtml(cm.status || 'Unknown')}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    cmResults.innerHTML = tableHtml;
  }

  /**
   * Called when the tab is shown
   */
  function onTabShow() {
    // Always refresh data when tab is shown
    loadCmData();
  }

  /**
   * Force refresh the data with toast notification
   */
  async function refresh() {
    try {
      await loadCmData();
      Utils.showToast('CMs data refreshed', 'success');
    } catch (error) {
      console.error('CM refresh failed:', error);
      Utils.showToast('Failed to refresh CMs data', 'error');
    }
  }

  /**
   * Check if data is loaded
   */
  function isDataLoaded() {
    return cmDataLoaded;
  }

  // Export module
  window.CmModule = {
    init,
    onTabShow,
    refresh,
    isDataLoaded
  };
})();
