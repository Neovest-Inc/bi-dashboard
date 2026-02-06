document.addEventListener('DOMContentLoaded', () => {
  const loading = document.getElementById('loading');
  const error = document.getElementById('error');
  const dashboard = document.getElementById('dashboard');
  const projectsList = document.getElementById('projectsList');
  const refreshBtn = document.getElementById('refreshBtn');

  const projectCount = document.getElementById('projectCount');
  const epicCount = document.getElementById('epicCount');
  const storyCount = document.getElementById('storyCount');

  async function fetchData() {
    loading.style.display = 'flex';
    error.style.display = 'none';
    dashboard.style.display = 'none';

    try {
      const response = await fetch('/api/jira');
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      renderDashboard(data);
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
    const storiesHtml = epic.stories.length > 0
      ? `<div class="stories-list">${epic.stories.map(story => renderStory(story)).join('')}</div>`
      : `<div class="no-stories"><span class="material-icons">inbox</span><p>No stories in this epic</p></div>`;

    return `
      <div class="epic-card">
        <div class="epic-header" onclick="toggleEpic(this)">
          <span class="material-icons expand-icon">chevron_right</span>
          <div class="epic-icon">
            <span class="material-icons">bolt</span>
          </div>
          <div class="epic-info">
            <div class="epic-key">${escapeHtml(epic.key)}</div>
            <div class="epic-summary">${escapeHtml(epic.summary)}</div>
          </div>
          <span class="epic-stories-count">${epic.stories.length} stor${epic.stories.length !== 1 ? 'ies' : 'y'}</span>
        </div>
        <div class="epic-content">
          ${storiesHtml}
        </div>
      </div>
    `;
  }

  function renderStory(story) {
    const statusClass = getStatusClass(story.status);

    return `
      <div class="story-item">
        <div class="story-icon">
          <span class="material-icons">bookmark</span>
        </div>
        <div class="story-info">
          <div class="story-key">${escapeHtml(story.key)}</div>
          <div class="story-summary">${escapeHtml(story.summary)}</div>
        </div>
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
