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

  const projectCount = document.getElementById('projectCount');
  const epicCount = document.getElementById('epicCount');
  const storyCount = document.getElementById('storyCount');

  let jiraBaseUrl = '';
  let currentData = null;
  let currentFilter = 'all';

  // Tab switching
  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      navTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      const tabId = tab.dataset.tab;
      if (tabId === 'dashboard') {
        dashboard.style.display = 'block';
        missingDataView.style.display = 'none';
      } else if (tabId === 'missing-data') {
        dashboard.style.display = 'none';
        missingDataView.style.display = 'block';
        if (currentData) renderMissingDataTable(currentData);
      }
    });
  });

  // Filter switching
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      if (currentData) renderMissingDataTable(currentData);
    });
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

    // Calculate stats
    const projects = Object.keys(data);
    let totalEpics = 0;
    let totalStories = 0;

    projects.forEach(project => {
      totalEpics += data[project].length;
      data[project].forEach(epic => {
        totalStories += epic.stories.length;
      });
    });

    projectCount.textContent = projects.length;
    epicCount.textContent = totalEpics;
    storyCount.textContent = totalStories;

    // Render projects
    projectsList.innerHTML = projects.map(projectName => {
      const epics = data[projectName];
      const epicCards = epics.map(epic => renderEpic(epic)).join('');

      return `
        <div class="business-project">
          <div class="project-header" onclick="toggleProject(this)">
            <span class="material-icons expand-icon">chevron_right</span>
            <div class="project-info">
              <div class="project-name">${escapeHtml(projectName)}</div>
              <div class="project-meta">${epics.length} epic${epics.length !== 1 ? 's' : ''}</div>
            </div>
            <span class="project-badge">${epics.reduce((sum, e) => sum + e.stories.length, 0)} stories</span>
          </div>
          <div class="project-content">
            ${epicCards}
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
          <span class="epic-due-date${hasNoDueDate ? ' date-warning' : ''}"><span class="material-icons">event</span>${dueDateDisplay}</span>
          <span class="epic-stories-count${hasNoStories ? ' count-warning' : ''}">${epic.stories.length} stor${epic.stories.length !== 1 ? 'ies' : 'y'}</span>
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

  function getStatusClass(status) {
    if (!status) return 'status-todo';
    const s = status.toLowerCase();
    if (s.includes('done') || s.includes('closed') || s.includes('resolved')) return 'status-done';
    if (s.includes('progress') || s.includes('review') || s.includes('testing')) return 'status-in-progress';
    return 'status-todo';
  }

  function renderMissingDataTable(data) {
    const missingItems = [];
    const seenEpics = new Set();

    // Collect all epics and stories with missing data
    Object.values(data).forEach(epics => {
      epics.forEach(epic => {
        // Check epic for missing fields (avoid duplicates)
        if (!seenEpics.has(epic.key)) {
          seenEpics.add(epic.key);
          const missingFields = [];
          if (!epic.dueDate) missingFields.push('Due Date');
          if (!epic.clientEnvironments || (Array.isArray(epic.clientEnvironments) && epic.clientEnvironments.length === 0)) {
            missingFields.push('Client Environment(s)');
          }
          
          if (missingFields.length > 0) {
            missingItems.push({
              type: 'epic',
              key: epic.key,
              summary: epic.summary,
              missingFields,
              dueDate: epic.dueDate,
              clientEnvironments: epic.clientEnvironments
            });
          }
        }

        // Check stories for missing fields
        epic.stories.forEach(story => {
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
        });
      });
    });

    // Apply filter
    const filteredItems = currentFilter === 'all' 
      ? missingItems 
      : missingItems.filter(item => item.type === currentFilter);

    if (filteredItems.length === 0) {
      missingDataTable.innerHTML = `
        <div class="no-missing-data">
          <span class="material-icons">check_circle</span>
          <p>All items have complete information!</p>
        </div>
      `;
      return;
    }

    const tableHtml = `
      <table class="missing-data-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Key</th>
            <th>Summary</th>
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

  refreshBtn.addEventListener('click', fetchData);

  // Initial load
  fetchData();
});
