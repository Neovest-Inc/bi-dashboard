/**
 * Main Application - Tab routing and module coordination
 */
document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const error = document.getElementById('error');
  const dashboard = document.getElementById('dashboard');
  const dashboardLoading = document.getElementById('dashboardLoading');
  const dashboardContent = document.getElementById('dashboardContent');
  const missingDataView = document.getElementById('missing-data');
  const missingDataLoading = document.getElementById('missingDataLoading');
  const missingDataContent = document.getElementById('missingDataContent');
  const missingDataTable = document.getElementById('missingDataTable');
  const projectsList = document.getElementById('projectsList');
  const refreshBtn = document.getElementById('refreshBtn');
  const navTabs = document.querySelectorAll('.nav-tab');

  // Tab view elements
  const releasesView = document.getElementById('releases');
  const cmsView = document.getElementById('cms');
  
  // Releases sub-views
  const releaseContentsView = document.getElementById('releaseContentsView');
  const hotfixesView = document.getElementById('hotfixesView');
  const pillBtns = document.querySelectorAll('.pill-btn');

  // Stats elements
  const projectCount = document.getElementById('projectCount');
  const epicCount = document.getElementById('epicCount');
  const storyCount = document.getElementById('storyCount');

  // State
  let jiraBaseUrl = '';
  let currentData = null;
  let jiraDataLoaded = false;
  let dashboardRendered = false;
  let currentTab = 'dashboard';

  // Valid tabs for hash routing
  const validTabs = ['dashboard', 'missing-data', 'releases', 'cms'];

  // Initialize modules
  initializeModules();

  function initializeModules() {
    if (window.ProjectsModule) {
      window.ProjectsModule.init();
    }
    if (window.MissingDataModule) {
      window.MissingDataModule.init();
    }
    if (window.HotfixesModule) {
      window.HotfixesModule.init();
    }
    if (window.ReleasesModule) {
      window.ReleasesModule.init();
    }
    if (window.CmModule) {
      window.CmModule.init();
    }
  }

  // Tab switching
  function switchToTab(tabId, updateHash = true) {
    if (!validTabs.includes(tabId)) tabId = 'dashboard';
    currentTab = tabId;
    
    // Update nav tabs
    navTabs.forEach(t => t.classList.remove('active'));
    const activeTab = document.querySelector(`.nav-tab[data-tab="${tabId}"]`);
    if (activeTab) activeTab.classList.add('active');
    
    // Update URL hash
    if (updateHash) {
      window.location.hash = tabId;
    }
    
    // Hide all tab content
    dashboard.style.display = 'none';
    missingDataView.style.display = 'none';
    releasesView.style.display = 'none';
    cmsView.style.display = 'none';
    error.style.display = 'none';
    
    if (tabId === 'dashboard') {
      dashboard.style.display = 'block';
      if (!jiraDataLoaded) {
        fetchJiraData('dashboard');
      } else if (!dashboardRendered) {
        renderProjectsDashboard(currentData);
      } else {
        dashboardLoading.style.display = 'none';
        dashboardContent.style.display = 'block';
      }
    } else if (tabId === 'missing-data') {
      missingDataView.style.display = 'block';
      if (!jiraDataLoaded) {
        fetchJiraData('missing-data');
      } else {
        missingDataLoading.style.display = 'none';
        missingDataContent.style.display = 'block';
        if (window.MissingDataModule) {
          window.MissingDataModule.renderMissingDataTable(currentData, missingDataTable);
        }
      }
    } else if (tabId === 'releases') {
      releasesView.style.display = 'block';
      if (window.ReleasesModule) {
        window.ReleasesModule.onTabShow();
      }
      if (window.HotfixesModule) {
        window.HotfixesModule.onTabShow();
      }
    } else if (tabId === 'cms') {
      cmsView.style.display = 'block';
      if (window.CmModule) {
        window.CmModule.onTabShow();
      }
    }
  }

  // Nav tab click handlers
  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      switchToTab(tab.dataset.tab);
    });
  });

  // Pill toggle for Releases sub-views
  pillBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      pillBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const view = btn.dataset.view;
      if (view === 'contents') {
        releaseContentsView.style.display = 'block';
        hotfixesView.style.display = 'none';
      } else if (view === 'hotfixes') {
        releaseContentsView.style.display = 'none';
        hotfixesView.style.display = 'block';
      }
    });
  });

  // Fetch Jira data
  async function fetchJiraData(targetTab) {
    // Show loading in the target tab
    if (targetTab === 'dashboard') {
      dashboardLoading.style.display = 'flex';
      dashboardContent.style.display = 'none';
    } else if (targetTab === 'missing-data') {
      missingDataLoading.style.display = 'flex';
      missingDataContent.style.display = 'none';
    }
    error.style.display = 'none';

    try {
      const response = await fetch('/api/jira');
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      jiraBaseUrl = data.jiraBaseUrl || '';
      currentData = data.projects;
      jiraDataLoaded = true;
      
      // Update modules with base URL
      if (window.ProjectsModule) {
        window.ProjectsModule.setJiraBaseUrl(jiraBaseUrl);
      }
      if (window.MissingDataModule) {
        window.MissingDataModule.setJiraBaseUrl(jiraBaseUrl);
      }
      
      // Render based on which tab initiated the load
      if (targetTab === 'dashboard') {
        renderProjectsDashboard(data.projects);
      } else if (targetTab === 'missing-data') {
        missingDataLoading.style.display = 'none';
        missingDataContent.style.display = 'block';
        if (window.MissingDataModule) {
          window.MissingDataModule.renderMissingDataTable(data.projects, missingDataTable);
        }
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      dashboardLoading.style.display = 'none';
      missingDataLoading.style.display = 'none';
      error.style.display = 'flex';
    }
  }

  // Render Projects dashboard using ProjectsModule
  function renderProjectsDashboard(data) {
    dashboardRendered = true;
    if (window.ProjectsModule) {
      window.ProjectsModule.renderDashboard(data, {
        dashboardLoading,
        dashboardContent,
        projectsList,
        projectCount,
        epicCount,
        storyCount
      });
    }
  }

  // Context-aware refresh button
  refreshBtn.addEventListener('click', () => {
    if (currentTab === 'dashboard' || currentTab === 'missing-data') {
      jiraDataLoaded = false;
      dashboardRendered = false;
      fetchJiraData(currentTab);
    } else if (currentTab === 'releases') {
      const releaseVersionSelect = document.getElementById('releaseVersionSelect');
      const checkReleaseBtn = document.getElementById('checkReleaseBtn');
      const targetVersionSelect = document.getElementById('targetVersionSelect');
      const checkHotfixBtn = document.getElementById('checkHotfixBtn');
      
      if (releaseContentsView.style.display !== 'none' && releaseVersionSelect.value) {
        checkReleaseBtn.click();
      } else if (hotfixesView.style.display !== 'none' && targetVersionSelect.value) {
        checkHotfixBtn.click();
      }
    } else if (currentTab === 'cms') {
      if (window.CmModule) {
        window.CmModule.onTabShow();
      }
    }
  });

  // Handle browser back/forward buttons
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.slice(1) || 'dashboard';
    if (validTabs.includes(hash) && hash !== currentTab) {
      switchToTab(hash, false);
    }
  });

  // Initial load based on URL hash
  const initialTab = window.location.hash.slice(1) || 'dashboard';
  switchToTab(initialTab);
});
