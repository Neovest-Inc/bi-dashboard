/**
 * Dependencies Module
 * 
 * Handles the Dependency Map tab functionality.
 * Shows cross-team dependencies with VAL team by quarter.
 */

(function() {
  'use strict';

  // State
  let dataLoaded = false;
  let currentData = null;
  let jiraBaseUrl = '';
  let selectedQuarter = '';
  let selectedEdge = null;  // { team, direction } or null

  // DOM Elements
  let depLoading;
  let depResults;
  let quarterSelect;

  // Sankey graph config
  const GRAPH_CONFIG = {
    width: 900,
    height: 520,
    padding: 50,
    nodeWidth: 20,
    nodeGap: 16,
    minNodeHeight: 44,
    flowScaleFactor: 10, // pixels per dependency count
    columns: {
      left: 0.15,    // Teams depending on VAL
      center: 0.5,   // VAL
      right: 0.85    // Teams VAL depends on
    }
  };

  // Custom team abbreviations
  const TEAM_ABBREVIATIONS = {
    'Integrations Team': 'INT',
    'Core Team': 'CRT',
    'Infrastructure Team': 'INFRA',
    'Infrastructure': 'INFRA',
    'Val Team': 'VAL',
    'UI Team': 'UIT',
    'Compliance Team': 'COMP',
    'DV Team': 'DV'
  };

  // Normalize team names (map variants to canonical name)
  const TEAM_CANONICAL_NAMES = {
    'Infrastructure': 'Infrastructure Team'
  };

  // Google Material Design inspired color palette
  const TEAM_COLORS = [
    '#1e8e3e',  // Google Green
    '#9334e6',  // Google Purple  
    '#fa7b17',  // Google Orange
    '#d93025',  // Google Red
    '#1a73e8',  // Google Blue (lighter)
    '#e52592',  // Google Pink
    '#12b5cb',  // Google Cyan
    '#f9ab00',  // Google Yellow
    '#7b1fa2',  // Deep Purple
    '#00897b'   // Teal
  ];

  // VAL team color - Google Blue
  const VAL_COLOR = '#1a73e8';

  // Team color cache for consistent colors
  let teamColorMap = {};

  /**
   * Get consistent color for a team
   */
  function getTeamColor(teamName) {
    if (!teamColorMap[teamName]) {
      const usedColors = Object.values(teamColorMap);
      const availableColors = TEAM_COLORS.filter(c => !usedColors.includes(c));
      teamColorMap[teamName] = availableColors.length > 0 
        ? availableColors[0] 
        : TEAM_COLORS[Object.keys(teamColorMap).length % TEAM_COLORS.length];
    }
    return teamColorMap[teamName];
  }

  /**
   * Reset team colors when quarter changes
   */
  function resetTeamColors() {
    teamColorMap = {};
  }

  /**
   * Normalize a byTeam object to merge team name variants into canonical names
   */
  function normalizeByTeam(byTeam) {
    const normalized = {};
    for (const [team, issues] of Object.entries(byTeam || {})) {
      const canonicalName = TEAM_CANONICAL_NAMES[team] || team;
      if (!normalized[canonicalName]) {
        normalized[canonicalName] = [];
      }
      normalized[canonicalName].push(...issues);
    }
    return normalized;
  }

  /**
   * Initialize the dependencies module
   */
  function init() {
    depLoading = document.getElementById('depLoading');
    depResults = document.getElementById('depResults');
    quarterSelect = document.getElementById('quarterSelect');

    if (quarterSelect) {
      quarterSelect.addEventListener('change', handleQuarterChange);
    }

    document.addEventListener('click', handleClicks);
  }

  /**
   * Called when tab becomes visible
   */
  function onTabShow() {
    if (!dataLoaded) {
      loadFieldOptions();
    }
  }

  /**
   * Load available quarters and teams
   */
  async function loadFieldOptions() {
    depLoading.style.display = 'flex';
    depResults.innerHTML = '';

    try {
      const response = await fetch('/api/dependencies/field-options');
      if (!response.ok) throw new Error('Failed to fetch options');
      const data = await response.json();

      // Populate quarter dropdown
      quarterSelect.innerHTML = '<option value="">Select a quarter...</option>';
      data.quarters.forEach(q => {
        const option = document.createElement('option');
        option.value = q;
        option.textContent = formatQuarter(q);
        quarterSelect.appendChild(option);
      });

      depLoading.style.display = 'none';
      depResults.innerHTML = `
        <div class="dep-placeholder">
          <span class="material-icons">account_tree</span>
          <p>Select a quarter to view dependencies</p>
        </div>
      `;
      dataLoaded = true;
    } catch (error) {
      console.error('Error loading field options:', error);
      depLoading.style.display = 'none';
      depResults.innerHTML = `
        <div class="dep-error">
          <span class="material-icons">error_outline</span>
          <p>Failed to load options. Please try again.</p>
        </div>
      `;
    }
  }

  /**
   * Handle quarter selection change
   */
  async function handleQuarterChange() {
    selectedQuarter = quarterSelect.value;
    selectedEdge = null;
    resetTeamColors();

    if (!selectedQuarter) {
      depResults.innerHTML = `
        <div class="dep-placeholder">
          <span class="material-icons">account_tree</span>
          <p>Select a quarter to view dependencies</p>
        </div>
      `;
      return;
    }

    await loadDependencies(selectedQuarter);
  }

  /**
   * Load dependencies for a quarter
   */
  async function loadDependencies(quarter) {
    depLoading.style.display = 'flex';
    depResults.innerHTML = '';

    try {
      const response = await fetch(`/api/dependencies?quarter=${encodeURIComponent(quarter)}`);
      if (!response.ok) throw new Error('Failed to fetch dependencies');
      
      currentData = await response.json();
      jiraBaseUrl = currentData.jiraBaseUrl || '';

      // Normalize team names to merge variants (e.g., "Infrastructure" -> "Infrastructure Team")
      if (currentData.outgoing?.byTeam) {
        currentData.outgoing.byTeam = normalizeByTeam(currentData.outgoing.byTeam);
      }
      if (currentData.incoming?.byTeam) {
        currentData.incoming.byTeam = normalizeByTeam(currentData.incoming.byTeam);
      }

      depLoading.style.display = 'none';
      renderGraph();
    } catch (error) {
      console.error('Error loading dependencies:', error);
      depLoading.style.display = 'none';
      depResults.innerHTML = `
        <div class="dep-error">
          <span class="material-icons">error_outline</span>
          <p>Failed to load dependencies. Please try again.</p>
        </div>
      `;
    }
  }

  /**
   * Render the dependency graph
   */
  function renderGraph() {
    if (!currentData) return;

    const { outgoing, incoming } = currentData;

    // Collect all unique teams first to assign consistent colors
    const allTeamNames = new Set([
      ...Object.keys(incoming.byTeam || {}),
      ...Object.keys(outgoing.byTeam || {})
    ]);
    
    // Assign colors to all teams first
    allTeamNames.forEach(team => getTeamColor(team));

    // Separate teams into left (incoming - depend on VAL) and right (outgoing - VAL depends on)
    const leftTeams = Object.keys(incoming.byTeam || {}).map(team => ({
      team,
      count: (incoming.byTeam[team] || []).length,
      direction: 'incoming'
    })).filter(t => t.count > 0);

    const rightTeams = Object.keys(outgoing.byTeam || {}).map(team => ({
      team,
      count: (outgoing.byTeam[team] || []).length,
      direction: 'outgoing'
    })).filter(t => t.count > 0);

    if (leftTeams.length === 0 && rightTeams.length === 0) {
      depResults.innerHTML = `
        <div class="dep-placeholder">
          <span class="material-icons">check_circle</span>
          <p>No cross-team dependencies found for ${formatQuarter(selectedQuarter)}</p>
        </div>
      `;
      return;
    }

    const { width, height, padding, nodeWidth, nodeGap, minNodeHeight, flowScaleFactor, columns } = GRAPH_CONFIG;
    const usableHeight = height - padding * 2;

    // Calculate node heights and positions
    const calculateNodePositions = (teams, columnX, centerVertically = false) => {
      if (teams.length === 0) return [];
      
      const totalFlow = teams.reduce((sum, t) => sum + t.count, 0);
      const totalGaps = (teams.length - 1) * nodeGap;
      const availableHeight = usableHeight - totalGaps;
      
      // Calculate total height needed
      let totalHeight = 0;
      const nodesWithHeight = teams.map(t => {
        const nodeHeight = Math.max(minNodeHeight, (t.count / totalFlow) * availableHeight);
        totalHeight += nodeHeight;
        return { ...t, height: nodeHeight, color: getTeamColor(t.team) };
      });
      totalHeight += totalGaps;
      
      // Starting Y position (centered or from top)
      let y = centerVertically ? (height - totalHeight) / 2 : padding;
      
      return nodesWithHeight.map(t => {
        const result = { ...t, x: columnX, y };
        y += t.height + nodeGap;
        return result;
      });
    };

    // Calculate totals
    const totalIncoming = leftTeams.reduce((sum, t) => sum + t.count, 0);
    const totalOutgoing = rightTeams.reduce((sum, t) => sum + t.count, 0);
    
    // VAL node dimensions - height based on max of incoming/outgoing flows
    const maxFlow = Math.max(totalIncoming, totalOutgoing);
    const valFlowHeight = maxFlow * flowScaleFactor;
    const valHeight = Math.max(100, Math.min(usableHeight * 0.7, valFlowHeight + 40));
    const valY = (height - valHeight) / 2;
    const valX = width * columns.center;

    // Position teams (center them vertically)
    const leftNodes = calculateNodePositions(leftTeams, width * columns.left, true);
    const rightNodes = calculateNodePositions(rightTeams, width * columns.right, true);

    // Create smooth curved flow path
    const createFlowPath = (sourceX, sourceY, targetX, targetY, flowWidth) => {
      const cpOffset = Math.abs(targetX - sourceX) * 0.5;

      const topSourceY = sourceY;
      const topTargetY = targetY;
      const botSourceY = sourceY + flowWidth;
      const botTargetY = targetY + flowWidth;

      return `M ${sourceX},${topSourceY}
              C ${sourceX + cpOffset},${topSourceY} 
                ${targetX - cpOffset},${topTargetY} 
                ${targetX},${topTargetY}
              L ${targetX},${botTargetY}
              C ${targetX - cpOffset},${botTargetY} 
                ${sourceX + cpOffset},${botSourceY} 
                ${sourceX},${botSourceY}
              Z`;
    };

    // Build SVG
    let svg = `
      <svg class="dep-graph sankey" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
        <defs>
          <!-- Soft shadow filter -->
          <filter id="nodeShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.15"/>
          </filter>
    `;

    // Generate gradients for each flow with softer opacity
    leftNodes.forEach((node, index) => {
      svg += `
        <linearGradient id="grad-in-${index}" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="${node.color}" stop-opacity="0.5"/>
          <stop offset="50%" stop-color="${node.color}" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="${VAL_COLOR}" stop-opacity="0.5"/>
        </linearGradient>
      `;
    });

    rightNodes.forEach((node, index) => {
      svg += `
        <linearGradient id="grad-out-${index}" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="${VAL_COLOR}" stop-opacity="0.5"/>
          <stop offset="50%" stop-color="${node.color}" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="${node.color}" stop-opacity="0.5"/>
        </linearGradient>
      `;
    });

    svg += '</defs>';

    // Track Y offsets for VAL node connections
    // VAL bar is wider than team bars for prominence and to fit text
    const valNodeWidth = 44;
    const valLeftX = valX - valNodeWidth / 2;  // Left edge of VAL
    const valRightX = valX + valNodeWidth / 2; // Right edge of VAL
    let valLeftYOffset = 0;
    let valRightYOffset = 0;

    // Calculate starting Y for flows on VAL node (centered)
    const totalLeftFlowHeight = totalIncoming * flowScaleFactor;
    const totalRightFlowHeight = totalOutgoing * flowScaleFactor;
    const valLeftStartY = valY + (valHeight - totalLeftFlowHeight) / 2;
    const valRightStartY = valY + (valHeight - totalRightFlowHeight) / 2;

    // Draw incoming flows (left teams → VAL)
    leftNodes.forEach((node, index) => {
      const flowWidth = node.count * flowScaleFactor;
      const isSelected = selectedEdge?.team === node.team && selectedEdge?.direction === 'incoming';
      
      const sourceX = node.x + nodeWidth;
      const sourceY = node.y + (node.height - flowWidth) / 2;
      const targetX = valLeftX;
      const targetY = valLeftStartY + valLeftYOffset;
      
      const path = createFlowPath(sourceX, sourceY, targetX, targetY, flowWidth);
      
      svg += `
        <path class="dep-flow dep-flow-in ${isSelected ? 'selected' : ''}" 
              d="${path}" 
              fill="url(#grad-in-${index})"
              data-team="${escapeHtml(node.team)}" 
              data-direction="incoming">
          <title>${escapeHtml(node.team)} → VAL (${node.count} epic${node.count !== 1 ? 's' : ''})</title>
        </path>
      `;
      
      valLeftYOffset += flowWidth;
    });

    // Draw outgoing flows (VAL → right teams)
    rightNodes.forEach((node, index) => {
      const flowWidth = node.count * flowScaleFactor;
      const isSelected = selectedEdge?.team === node.team && selectedEdge?.direction === 'outgoing';
      
      const sourceX = valRightX;
      const sourceY = valRightStartY + valRightYOffset;
      const targetX = node.x;
      const targetY = node.y + (node.height - flowWidth) / 2;
      
      const path = createFlowPath(sourceX, sourceY, targetX, targetY, flowWidth);
      
      svg += `
        <path class="dep-flow dep-flow-out ${isSelected ? 'selected' : ''}" 
              d="${path}" 
              fill="url(#grad-out-${index})"
              data-team="${escapeHtml(node.team)}" 
              data-direction="outgoing">
          <title>VAL → ${escapeHtml(node.team)} (${node.count} epic${node.count !== 1 ? 's' : ''})</title>
        </path>
      `;
      
      valRightYOffset += flowWidth;
    });

    // Draw left team nodes with rounded pill shape
    leftNodes.forEach(node => {
      const isSelected = selectedEdge?.team === node.team;
      const rx = Math.min(nodeWidth / 2, node.height / 2, 10);
      svg += `
        <g class="dep-node dep-node-team ${isSelected ? 'selected' : ''}" data-team="${escapeHtml(node.team)}" data-direction="incoming">
          <rect x="${node.x}" y="${node.y}" width="${nodeWidth}" height="${node.height}" 
                rx="${rx}" fill="${node.color}" filter="url(#nodeShadow)" class="dep-node-rect"/>
          <text x="${node.x - 12}" y="${node.y + node.height / 2}" 
                text-anchor="end" dominant-baseline="middle" 
                class="dep-node-label">${escapeHtml(truncateTeamName(node.team))}</text>
          <title>${escapeHtml(node.team)} (${node.count})</title>
        </g>
      `;
    });

    // Draw right team nodes
    rightNodes.forEach(node => {
      const isSelected = selectedEdge?.team === node.team;
      const rx = Math.min(nodeWidth / 2, node.height / 2, 10);
      svg += `
        <g class="dep-node dep-node-team ${isSelected ? 'selected' : ''}" data-team="${escapeHtml(node.team)}" data-direction="outgoing">
          <rect x="${node.x}" y="${node.y}" width="${nodeWidth}" height="${node.height}" 
                rx="${rx}" fill="${node.color}" filter="url(#nodeShadow)" class="dep-node-rect"/>
          <text x="${node.x + nodeWidth + 12}" y="${node.y + node.height / 2}" 
                text-anchor="start" dominant-baseline="middle" 
                class="dep-node-label">${escapeHtml(truncateTeamName(node.team))}</text>
          <title>${escapeHtml(node.team)} (${node.count})</title>
        </g>
      `;
    });

    // Draw VAL node (center) - wider and more prominent
    const valRx = Math.min(valNodeWidth / 2, valHeight / 2, 12);
    svg += `
      <g class="dep-node dep-node-val">
        <rect x="${valLeftX}" y="${valY}" width="${valNodeWidth}" height="${valHeight}" 
              rx="${valRx}" fill="${VAL_COLOR}" filter="url(#nodeShadow)" class="dep-node-rect dep-node-rect-val"/>
        <text x="${valX}" y="${valY + valHeight / 2}" 
              text-anchor="middle" dominant-baseline="middle" 
              class="dep-node-label dep-node-label-val">VAL</text>
      </g>
    `;

    svg += '</svg>';

    // Build legend with team colors
    let legendTeams = '';
    allTeamNames.forEach(team => {
      const color = getTeamColor(team);
      legendTeams += `
        <div class="legend-team">
          <span class="legend-dot" style="background: ${color}"></span>
          <span>${escapeHtml(truncateTeamName(team))}</span>
        </div>
      `;
    });

    const legend = `
      <div class="dep-legend sankey-legend">
        <div class="legend-direction">
          <span class="legend-arrow">←</span>
          <span>Depends on VAL</span>
        </div>
        <div class="legend-center">VAL</div>
        <div class="legend-direction">
          <span>VAL depends on</span>
          <span class="legend-arrow">→</span>
        </div>
      </div>
    `;

    // Summary stats - Google style cards (clickable)
    const incomingSelected = selectedEdge?.team === 'all' && selectedEdge?.direction === 'incoming';
    const outgoingSelected = selectedEdge?.team === 'all' && selectedEdge?.direction === 'outgoing';
    const stats = `
      <div class="dep-stats">
        <div class="dep-stat dep-stat-clickable ${incomingSelected ? 'selected' : ''}" data-direction="incoming">
          <span class="dep-stat-value">${totalIncoming}</span>
          <span class="dep-stat-label">Incoming</span>
        </div>
        <div class="dep-stat-divider"></div>
        <div class="dep-stat dep-stat-clickable ${outgoingSelected ? 'selected' : ''}" data-direction="outgoing">
          <span class="dep-stat-value">${totalOutgoing}</span>
          <span class="dep-stat-label">Outgoing</span>
        </div>
      </div>
    `;

    // Build detail panel
    const detailPanel = selectedEdge ? renderDetailPanel() : `
      <div class="dep-detail-placeholder">
        <span class="material-icons">touch_app</span>
        <p>Click a flow to see epic details</p>
      </div>
    `;

    depResults.innerHTML = `
      <div class="dep-container sankey-container">
        <div class="dep-graph-container">
          ${legend}
          ${svg}
          ${stats}
        </div>
        <div class="dep-detail-panel">
          ${detailPanel}
        </div>
      </div>
    `;
  }

  /**
   * Render the detail panel for selected edge
   */
  function renderDetailPanel() {
    if (!selectedEdge || !currentData) return '';

    const { team, direction } = selectedEdge;
    const { outgoing, incoming } = currentData;

    // Handle "all" selection (clicked on stats)
    if (team === 'all') {
      return renderAllEpicsPanel(direction);
    }

    let epics = [];
    let title = '';

    if (direction === 'outgoing') {
      epics = outgoing.byTeam[team] || [];
      title = `VAL depends on ${team}`;
    } else {
      epics = incoming.byTeam[team] || [];
      title = `${team} depends on VAL`;
    }

    if (epics.length === 0) {
      return `<div class="dep-detail-empty">No epics found</div>`;
    }

    const epicRows = renderEpicRows(epics);

    return `
      <div class="dep-detail-header">
        <span class="material-icons">${direction === 'outgoing' ? 'arrow_forward' : 'arrow_back'}</span>
        <h3>${escapeHtml(title)}</h3>
        <span class="dep-epic-count">${epics.length} epic${epics.length !== 1 ? 's' : ''}</span>
      </div>
      <div class="dep-epic-list">
        ${epicRows}
      </div>
    `;
  }

  /**
   * Render all epics grouped by team
   */
  function renderAllEpicsPanel(direction) {
    const { outgoing, incoming } = currentData;
    const byTeam = direction === 'outgoing' ? outgoing.byTeam : incoming.byTeam;
    const directionLabel = direction === 'outgoing' ? 'VAL depends on' : 'Depends on VAL';
    const icon = direction === 'outgoing' ? 'arrow_forward' : 'arrow_back';
    
    const teams = Object.keys(byTeam || {}).filter(t => (byTeam[t] || []).length > 0);
    const totalEpics = teams.reduce((sum, t) => sum + (byTeam[t] || []).length, 0);

    if (teams.length === 0) {
      return `<div class="dep-detail-empty">No epics found</div>`;
    }

    let html = `
      <div class="dep-detail-header">
        <span class="material-icons">${icon}</span>
        <h3>All ${directionLabel}</h3>
        <span class="dep-epic-count">${totalEpics} epic${totalEpics !== 1 ? 's' : ''}</span>
      </div>
    `;

    teams.forEach(team => {
      const epics = byTeam[team] || [];
      const color = getTeamColor(team);
      
      html += `
        <div class="dep-team-section">
          <div class="dep-team-header">
            <span class="dep-team-dot" style="background: ${color}"></span>
            <span class="dep-team-name">${escapeHtml(team)}</span>
            <span class="dep-team-count">${epics.length}</span>
          </div>
          <div class="dep-epic-list">
            ${renderEpicRows(epics)}
          </div>
        </div>
      `;
    });

    return html;
  }

  /**
   * Render epic rows
   */
  function renderEpicRows(epics) {
    return epics.map(epic => {
      const statusClass = getStatusClass(epic.status);
      const progress = epic.progress || { storyCount: 0, storiesDone: 0, progressPercent: 0 };
      const dueDisplay = epic.dueDate 
        ? new Date(epic.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : 'No date';

      return `
        <div class="dep-epic-row">
          <div class="dep-epic-info">
            <a href="${jiraBaseUrl}/browse/${escapeHtml(epic.key)}" target="_blank" class="dep-epic-key">${escapeHtml(epic.key)}</a>
            <span class="dep-epic-summary">${escapeHtml(epic.summary)}</span>
          </div>
          <div class="dep-epic-meta">
            <span class="dep-epic-status ${statusClass}">${escapeHtml(epic.status)}</span>
            <span class="dep-epic-due">${dueDisplay}</span>
            <span class="dep-epic-progress" title="${progress.storiesDone}/${progress.storyCount} stories">
              <div class="mini-progress-bar">
                <div class="mini-progress-fill" style="width: ${progress.progressPercent}%"></div>
              </div>
              ${progress.progressPercent}%
            </span>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Handle clicks for flow/node/stat selection
   */
  function handleClicks(e) {
    // Click on stat card
    const stat = e.target.closest('.dep-stat-clickable');
    if (stat) {
      const direction = stat.dataset.direction;
      
      // Toggle selection
      if (selectedEdge?.team === 'all' && selectedEdge?.direction === direction) {
        selectedEdge = null;
      } else {
        selectedEdge = { team: 'all', direction };
      }
      
      renderGraph();
      return;
    }

    // Click on flow band
    const flow = e.target.closest('.dep-flow');
    if (flow) {
      const team = flow.dataset.team;
      const direction = flow.dataset.direction;
      
      // Toggle selection
      if (selectedEdge?.team === team && selectedEdge?.direction === direction) {
        selectedEdge = null;
      } else {
        selectedEdge = { team, direction };
      }
      
      renderGraph();
      return;
    }

    // Click on team node
    const node = e.target.closest('.dep-node-team');
    if (node) {
      const team = node.dataset.team;
      const direction = node.dataset.direction;
      
      // Toggle selection
      if (selectedEdge?.team === team && selectedEdge?.direction === direction) {
        selectedEdge = null;
      } else {
        selectedEdge = { team, direction };
      }
      
      renderGraph();
    }
  }

  /**
   * Format quarter string (e.g., "26-1" -> "Q1 2026")
   */
  function formatQuarter(q) {
    if (!q) return '';
    const parts = q.split('-');
    if (parts.length === 2) {
      return `Q${parts[1]} 20${parts[0]}`;
    }
    return q;
  }

  /**
   * Truncate team name for node display
   */
  function truncateTeamName(name) {
    if (!name) return '';
    // Check custom abbreviation mapping first
    if (TEAM_ABBREVIATIONS[name]) {
      return TEAM_ABBREVIATIONS[name];
    }
    // Fall back to automatic truncation
    const words = name.split(/\s+/);
    if (words.length === 1) {
      return name.length > 8 ? name.substring(0, 7) + '…' : name;
    }
    // Get initials for multi-word names
    if (name.length > 10) {
      return words.map(w => w[0]).join('').toUpperCase();
    }
    return name;
  }

  /**
   * Get status CSS class
   */
  function getStatusClass(status) {
    if (!status) return 'status-todo';
    const s = status.toLowerCase();
    if (s.includes('done') || s.includes('closed') || s.includes('resolved')) return 'status-done';
    if (s.includes('progress') || s.includes('review')) return 'status-in-progress';
    return 'status-todo';
  }

  /**
   * Escape HTML
   */
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Export module
  window.DependenciesModule = {
    init,
    onTabShow
  };
})();
