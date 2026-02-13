document.addEventListener('DOMContentLoaded', () => {
  const loading = document.getElementById('loading');
  const error = document.getElementById('error');
  const dashboard = document.getElementById('dashboard');
  const missingDataView = document.getElementById('missing-data');
  const missingDataTable = document.getElementById('missingDataTable');
  const projectsList = document.getElementById('projectsList');
  const refreshBtn = document.getElementById('refreshBtn');
  const navTabs = document.querySelectorAll('.nav-tab');
  const filterBtns = document.querySelectorAll('.filter-btn');

  // Hotfix check elements
  const hotfixCheckView = document.getElementById('hotfix-check');
  const targetVersionSelect = document.getElementById('targetVersionSelect');
  const checkHotfixBtn = document.getElementById('checkHotfixBtn');
  const hotfixLoading = document.getElementById('hotfixLoading');
  const hotfixResults = document.getElementById('hotfixResults');

  const projectCount = document.getElementById('projectCount');
  const epicCount = document.getElementById('epicCount');
  const storyCount = document.getElementById('storyCount');

  let jiraBaseUrl = '';
  let currentData = null;
  let currentFilter = 'all';
  let developerSortState = 'none'; // 'none', 'desc', 'asc'
  let originalMissingItems = [];
  let hotfixVersionsLoaded = false;

  // Tab switching
  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      navTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      const tabId = tab.dataset.tab;
      if (tabId === 'dashboard') {
        dashboard.style.display = 'block';
        missingDataView.style.display = 'none';
        hotfixCheckView.style.display = 'none';
      } else if (tabId === 'missing-data') {
        dashboard.style.display = 'none';
        missingDataView.style.display = 'block';
        hotfixCheckView.style.display = 'none';
        if (currentData) renderMissingDataTable(currentData);
      } else if (tabId === 'hotfix-check') {
        dashboard.style.display = 'none';
        missingDataView.style.display = 'none';
        hotfixCheckView.style.display = 'block';
        if (!hotfixVersionsLoaded) {
          loadHotfixVersions();
        }
      }
    });
  });

  // Filter switching
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

  async function fetchData() {
    loading.style.display = 'flex';
    error.style.display = 'none';
    dashboard.style.display = 'none';
    missingDataView.style.display = 'none';

    try {
      const response = await fetch('/api/jira');
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      jiraBaseUrl = data.jiraBaseUrl || '';
      currentData = data.projects;
      renderDashboard(data.projects);
    } catch (err) {
      console.error('Error fetching data:', err);
      loading.style.display = 'none';
      error.style.display = 'flex';
    }
  }

  function renderDashboard(data) {
    loading.style.display = 'none';
    dashboard.style.display = 'block';
    
    // Switch to dashboard tab
    navTabs.forEach(t => t.classList.remove('active'));
    const dashboardTab = document.querySelector('.nav-tab[data-tab="dashboard"]');
    if (dashboardTab) dashboardTab.classList.add('active');

    // Calculate stats
    const projects = Object.keys(data);
    let totalEpics = 0;
    let totalStories = 0;

    projects.forEach(project => {
      const items = data[project].items || data[project];
      items.forEach(item => {
        if (item.type === 'epic') {
          totalEpics++;
          totalStories += item.stories.length;
        } else if (item.type === 'story') {
          totalStories++;
        }
      });
    });

    projectCount.textContent = projects.length;
    epicCount.textContent = totalEpics;
    storyCount.textContent = totalStories;

    // Render projects
    projectsList.innerHTML = projects.map(projectName => {
      const projectData = data[projectName];
      const items = projectData.items || projectData;
      const projectProgress = projectData.progressPercentage;
      const projectTotalPoints = projectData.totalPoints || 0;
      const projectCompletedPoints = projectData.completedPoints || 0;
      
      const epics = items.filter(item => item.type === 'epic');
      const stories = items.filter(item => item.type === 'story');
      
      const itemCards = items.map(item => {
        if (item.type === 'epic') {
          return renderEpic(item);
        } else {
          return renderStandaloneStory(item);
        }
      }).join('');

      const totalStoriesInEpics = epics.reduce((sum, e) => sum + e.stories.length, 0);
      const totalStories = totalStoriesInEpics + stories.length;
      const itemCountText = `${epics.length} epic${epics.length !== 1 ? 's' : ''}, ${stories.length} standalone stor${stories.length !== 1 ? 'ies' : 'y'}`;

      // Progress display with dynamic gradient
      let progressGradient = '';
      if (projectProgress !== null && projectProgress !== undefined) {
        if (projectProgress < 30) {
          // 0-30%: gray to slightly blue
          const blueAmount = Math.round((projectProgress / 30) * 100);
          progressGradient = `linear-gradient(90deg, #9aa0a6 0%, #9aa0a6 ${100 - blueAmount}%, #5f9dea ${blueAmount}%, #1a73e8 100%)`;
        } else if (projectProgress < 70) {
          // 30-70%: blue
          progressGradient = 'linear-gradient(90deg, #1a73e8 0%, #1967d2 100%)';
        } else {
          // 70-100%: blue to green
          const greenStart = Math.round(((projectProgress - 70) / 30) * 100);
          progressGradient = `linear-gradient(90deg, #1a73e8 0%, #1a73e8 ${100 - greenStart}%, #34a853 ${greenStart}%, #34a853 100%)`;
        }
      }
      
      const progressDisplay = projectProgress !== null && projectProgress !== undefined
        ? `
          <div class="project-progress-container">
            <div class="project-progress-bar">
              <div class="project-progress-fill" style="width: ${projectProgress}%; background: ${progressGradient};"></div>
            </div>
            <span class="project-progress-text">${projectProgress}% (${projectCompletedPoints}/${projectTotalPoints} points)</span>
          </div>
        `
        : '<div class="project-progress-container"><span class="project-progress-text no-estimates">No estimates yet</span></div>';

      return `
        <div class="business-project">
          <div class="project-header" onclick="toggleProject(this)">
            <span class="material-icons expand-icon">chevron_right</span>
            <div class="project-info">
              <div class="project-name">${escapeHtml(projectName)}</div>
              ${progressDisplay}
              <div class="project-meta">${itemCountText}</div>
            </div>
            <span class="project-badge">${totalStories} stor${totalStories !== 1 ? 'ies' : 'y'}</span>
          </div>
          <div class="project-content">
            ${itemCards}
          </div>
        </div>
      `;
    }).join('');
  }

  function renderEpic(epic) {
    const hasNoStories = epic.stories.length === 0;
    const hasNoDueDate = !epic.dueDate;
    const hasNoClientEnv = !epic.clientEnvironments || (Array.isArray(epic.clientEnvironments) && epic.clientEnvironments.length === 0);
    const hasWarning = hasNoStories || hasNoDueDate || hasNoClientEnv;
    const dueDateDisplay = epic.dueDate 
      ? new Date(epic.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : 'No Due Date';
    
    // Client Environments display
    const clientEnvDisplay = hasNoClientEnv
      ? `<span class="epic-client-env client-env-warning"><span class="material-icons">cloud_off</span>No Client</span>`
      : epic.clientEnvironments.map(env => 
          `<span class="epic-client-env"><span class="material-icons">cloud</span>${escapeHtml(env.value)}</span>`
        ).join('');
    
    // Progress display - last badge on the right
    let progressBadgeClass = '';
    if (epic.progressPercentage !== null && epic.progressPercentage !== undefined) {
      if (epic.progressPercentage === 100) {
        progressBadgeClass = ' complete';
      } else if (epic.progressPercentage >= 30) {
        progressBadgeClass = ' in-progress';
      }
      // else: 0-29% uses default gray style
    }
    const progressDisplay = epic.progressPercentage !== null && epic.progressPercentage !== undefined
      ? `<span class="epic-progress-badge${progressBadgeClass}">${epic.progressPercentage}%</span>`
      : '<span class="epic-progress-badge no-estimates">No estimates</span>';

    const storiesHtml = epic.stories.length > 0
      ? `<div class="stories-list">${epic.stories.map(story => renderStory(story)).join('')}</div>`
      : `<div class="no-stories"><span class="material-icons">inbox</span><p>No stories in this epic</p></div>`;

    return `
      <div class="epic-card${hasWarning ? ' epic-warning' : ''}">
        <div class="epic-header" onclick="toggleEpic(this)">
          <span class="material-icons expand-icon">chevron_right</span>
          <div class="epic-icon">
            <span class="material-icons">bolt</span>
          </div>
          <div class="epic-info">
            <div class="epic-key"><a href="${jiraBaseUrl}/browse/${escapeHtml(epic.key)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">${escapeHtml(epic.key)}</a></div>
            <div class="epic-summary">${escapeHtml(epic.summary)}</div>
          </div>
          ${clientEnvDisplay}
          <span class="epic-due-date${hasNoDueDate ? ' date-warning' : ''}"><span class="material-icons">event</span>${dueDateDisplay}</span>
          <span class="epic-stories-count${hasNoStories ? ' count-warning' : ''}">${epic.stories.length} stor${epic.stories.length !== 1 ? 'ies' : 'y'}</span>
          ${progressDisplay}
        </div>
        <div class="epic-content">
          ${storiesHtml}
        </div>
      </div>
    `;
  }

  function renderStory(story) {
    const statusClass = getStatusClass(story.status);
    const hasNoPoints = story.storyPoints === null || story.storyPoints === undefined;
    const storyPointsDisplay = hasNoPoints ? 'No SP' : `${story.storyPoints} SP`;
    const responsibleDisplay = story.responsibleForChange 
      ? `<span class="story-responsible"><span class="material-icons">person</span>${escapeHtml(story.responsibleForChange)}</span>`
      : '';

    return `
      <div class="story-item${hasNoPoints ? ' story-warning' : ''}">
        <div class="story-icon">
          <span class="material-icons">bookmark</span>
        </div>
        <div class="story-info">
          <div class="story-key"><a href="${jiraBaseUrl}/browse/${escapeHtml(story.key)}" target="_blank" rel="noopener noreferrer">${escapeHtml(story.key)}</a></div>
          <div class="story-summary">${escapeHtml(story.summary)}</div>
        </div>
        ${responsibleDisplay}
        <span class="story-points${hasNoPoints ? ' points-warning' : ''}">${storyPointsDisplay}</span>
        <span class="story-status ${statusClass}">${escapeHtml(story.status || 'To Do')}</span>
      </div>
    `;
  }

  function renderStandaloneStory(story) {
    const statusClass = getStatusClass(story.status);
    const hasNoPoints = story.storyPoints === null || story.storyPoints === undefined;
    const storyPointsDisplay = hasNoPoints ? 'No SP' : `${story.storyPoints} SP`;
    const responsibleDisplay = story.responsibleForChange 
      ? `<span class="story-responsible"><span class="material-icons">person</span>${escapeHtml(story.responsibleForChange)}</span>`
      : '';
    const hasWarning = hasNoPoints;

    return `
      <div class="standalone-story-card${hasWarning ? ' story-warning' : ''}">
        <div class="standalone-story-header">
          <div class="story-icon">
            <span class="material-icons">bookmark</span>
          </div>
          <div class="story-info">
            <div class="story-key"><a href="${jiraBaseUrl}/browse/${escapeHtml(story.key)}" target="_blank" rel="noopener noreferrer">${escapeHtml(story.key)}</a></div>
            <div class="story-summary">${escapeHtml(story.summary)}</div>
          </div>
          ${responsibleDisplay}
          <span class="story-points${hasNoPoints ? ' points-warning' : ''}">${storyPointsDisplay}</span>
          <span class="story-status ${statusClass}">${escapeHtml(story.status || 'To Do')}</span>
        </div>
      </div>
    `;
  }

  function getStatusClass(status) {
    if (!status) return 'status-todo';
    const s = status.toLowerCase();
    if (s.includes('done') || s.includes('closed') || s.includes('resolved') || s.includes('ready') || s.includes('partial')) return 'status-done';
    if (s.includes('progress') || s.includes('review') || s.includes('testing')) return 'status-in-progress';
    return 'status-todo';
  }

  function renderMissingDataTable(data) {
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
                <span class="type-badge type-${item.type}">
                  <span class="material-icons">${item.type === 'epic' ? 'bolt' : 'bookmark'}</span>
                  ${item.type === 'epic' ? 'Epic' : 'Story'}
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

  // Global toggle functions
  window.toggleProject = function(header) {
    header.classList.toggle('expanded');
    const content = header.nextElementSibling;
    content.classList.toggle('expanded');
  };

  window.toggleEpic = function(header) {
    header.classList.toggle('expanded');
    const content = header.nextElementSibling;
    content.classList.toggle('expanded');
  };

  // Hotfix Check Functions
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

  function renderHotfixResults(data) {
    const { targetVersion, missingStories, jiraBaseUrl: baseUrl } = data;

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

    const tableHtml = `
      <div class="hotfix-results-header">
        <span class="material-icons">warning</span>
        <span>Found ${missingStories.length} stor${missingStories.length !== 1 ? 'ies' : 'y'} missing from ${escapeHtml(targetVersion)}</span>
      </div>
      <table class="hotfix-table">
        <thead>
          <tr>
            <th>Key</th>
            <th>Summary</th>
            <th>Fix Versions</th>
            <th>Responsible</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${missingStories.map(story => `
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
              <td>${story.responsibleForChange ? escapeHtml(story.responsibleForChange) : '-'}</td>
              <td><span class="story-status ${getStatusClass(story.status)}">${escapeHtml(story.status || 'Unknown')}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    hotfixResults.innerHTML = tableHtml;
  }

  checkHotfixBtn.addEventListener('click', checkHotfixes);

  refreshBtn.addEventListener('click', fetchData);

  // Initial load
  fetchData();
});
