/**
 * Projects Module - Handles rendering of the Projects/Dashboard tab
 */
(function() {
  'use strict';

  let jiraBaseUrl = '';

  function init(baseUrl) {
    jiraBaseUrl = baseUrl || '';
  }

  function setJiraBaseUrl(url) {
    jiraBaseUrl = url || '';
  }

  function renderDashboard(data, elements) {
    const { dashboardLoading, dashboardContent, projectsList, projectCount, epicCount, storyCount } = elements;
    
    dashboardLoading.style.display = 'none';
    dashboardContent.style.display = 'block';

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
          const blueAmount = Math.round((projectProgress / 30) * 100);
          progressGradient = `linear-gradient(90deg, #9aa0a6 0%, #9aa0a6 ${100 - blueAmount}%, #5f9dea ${blueAmount}%, #1a73e8 100%)`;
        } else if (projectProgress < 70) {
          progressGradient = 'linear-gradient(90deg, #1a73e8 0%, #1967d2 100%)';
        } else {
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

  function getIssueTypeIcon(issueType) {
    if (!issueType) return 'bookmark';
    const type = issueType.toLowerCase();
    if (type === 'bug') return 'bug_report';
    if (type === 'task') return 'check_box';
    return 'bookmark'; // Story
  }

  function renderStory(story) {
    const statusClass = getStatusClass(story.status);
    const hasNoPoints = story.storyPoints === null || story.storyPoints === undefined;
    const storyPointsDisplay = hasNoPoints ? 'No SP' : `${story.storyPoints} SP`;
    const responsibleDisplay = story.responsibleForChange 
      ? `<span class="story-responsible"><span class="material-icons">person</span>${escapeHtml(story.responsibleForChange)}</span>`
      : '';
    const issueIcon = getIssueTypeIcon(story.issueType);

    return `
      <div class="story-item${hasNoPoints ? ' story-warning' : ''}">
        <div class="story-icon">
          <span class="material-icons">${issueIcon}</span>
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
    const issueIcon = getIssueTypeIcon(story.issueType);

    return `
      <div class="standalone-story-card${hasWarning ? ' story-warning' : ''}">
        <div class="standalone-story-header">
          <div class="story-icon">
            <span class="material-icons">${issueIcon}</span>
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

  // Export module
  window.ProjectsModule = {
    init,
    setJiraBaseUrl,
    renderDashboard
  };
})();
