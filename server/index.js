// process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { getJiraHeaders, getJiraBaseUrl } = require('./auth');
const pmhRoutes = require('./pmh');
const releasesRoutes = require('./releases');
const cmRoutes = require('./cm');
const dependenciesRoutes = require('./dependencies');
const hotfixBookingRoutes = require('./hotfix-booking');

// Test Jira connectivity on server startup
// (async () => {
//   try {
//     const auth = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString('base64');
//     const response = await axios.get(`${process.env.JIRA_BASE_URL}/rest/api/3/myself`, {
//       headers: {
//         'Authorization': `Basic ${auth}`,
//         'Accept': 'application/json'
//       }
//     });
//     console.log('Node Jira test successful:', response.data);
//   } catch (error) {
//     console.error('Jira connectivity test failed:', error.response?.data || error.message);
//   }
// })();

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from public folder
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Mount PMH (Post-Release Hotfix) routes
app.use('/api', pmhRoutes);

// Mount Releases routes
app.use('/api', releasesRoutes);

// Mount CM (Change Management) routes
app.use('/api', cmRoutes);

// Mount Dependencies routes
app.use('/api', dependenciesRoutes);

// Mount Hotfix Booking routes
app.use('/api', hotfixBookingRoutes);

app.get('/api/jira', async (req, res) => {
  try {
    const headers = getJiraHeaders();
    const baseUrl = getJiraBaseUrl();

    // 1. Fetch all Epics for project VT with Business Projects populated
    const epicsResponse = await axios.post(`${baseUrl}/rest/api/3/search/jql`, {
      jql: 'project = VT AND issuetype = Epic AND "Business Projects[Select List (multiple choices)]" is not empty',
      fields: ['summary', 'customfield_16369', 'duedate', 'customfield_13235'],
      maxResults: 100
    }, { headers });

    const epics = epicsResponse.data.issues;

    // 2. For each Epic, fetch Stories and build structure
    const businessProjectsMap = {};

    // Helper function to check if a story is completed
    const isStoryCompleted = (status) => {
      if (!status) return false;
      const statusLower = status.toLowerCase();
      return statusLower === 'done' || statusLower === 'ready' || statusLower === 'partial release';
    };

    // Helper function to calculate progress for an epic
    const calculateEpicProgress = (stories) => {
      let totalPoints = 0;
      let completedPoints = 0;

      stories.forEach(story => {
        const points = story.storyPoints;
        // Ignore stories with null, undefined, or 0 story points
        if (points && points > 0) {
          totalPoints += points;
          if (isStoryCompleted(story.status)) {
            completedPoints += points;
          }
        }
      });

      const progressPercentage = totalPoints > 0 
        ? Math.round((completedPoints / totalPoints) * 100) 
        : null;

      return { totalPoints, completedPoints, progressPercentage };
    };

    for (const epic of epics) {
      const epicKey = epic.key;
      const epicSummary = epic.fields.summary;
      const epicDueDate = epic.fields.duedate;
      const epicClientEnvironments = epic.fields.customfield_13235;
      const businessProjects = epic.fields.customfield_16369 || [];

      // Fetch Stories linked to this Epic
      const storiesResponse = await axios.post(`${baseUrl}/rest/api/3/search/jql`, {
        jql: `project = VT AND issuetype = Story AND "Epic Link" = ${epicKey}`,
        fields: ['summary', 'status', 'customfield_10115', 'customfield_10400', 'parent', 'customfield_16369'],
        maxResults: 100
      }, { headers });
      

      const stories = storiesResponse.data.issues.map(story => ({
        key: story.key,
        summary: story.fields.summary,
        status: story.fields.status?.name,
        storyPoints: story.fields.customfield_10115,
        responsibleForChange: story.fields.customfield_10400?.displayName,
        parent: story.fields.parent?.key,
        businessProjects: story.fields.customfield_16369 || []
      }));

      // Calculate progress for this epic
      const progress = calculateEpicProgress(stories);

      const epicData = {
        key: epicKey,
        summary: epicSummary,
        dueDate: epicDueDate,
        clientEnvironments: epicClientEnvironments,
        stories,
        type: 'epic',
        totalPoints: progress.totalPoints,
        completedPoints: progress.completedPoints,
        progressPercentage: progress.progressPercentage
      };

      // 3. Group by Business Project
      if (businessProjects.length === 0) {
        if (!businessProjectsMap['Uncategorized']) {
          businessProjectsMap['Uncategorized'] = [];
        }
        businessProjectsMap['Uncategorized'].push(epicData);
      } else {
        for (const bp of businessProjects) {
          const bpName = bp.value || bp;
          if (!businessProjectsMap[bpName]) {
            businessProjectsMap[bpName] = [];
          }
          businessProjectsMap[bpName].push(epicData);
        }
      }
    }

    // 4. Fetch Stories with Business Projects populated
    const standaloneStoriesResponse = await axios.post(`${baseUrl}/rest/api/3/search/jql`, {
      jql: 'project = VT AND issuetype = Story AND "Business Projects[Select List (multiple choices)]" is not empty',
      fields: ['summary', 'status', 'customfield_10115', 'customfield_10400', 'parent', 'customfield_16369'],
      maxResults: 100
    }, { headers });

    const standaloneStories = standaloneStoriesResponse.data.issues;

    // 5. Add Stories to their Business Projects
    for (const story of standaloneStories) {
      const storyKey = story.key;
      const storySummary = story.fields.summary;
      const storyStatus = story.fields.status?.name;
      const storyPoints = story.fields.customfield_10115;
      const responsibleForChange = story.fields.customfield_10400?.displayName;
      const parent = story.fields.parent?.key;
      const businessProjects = story.fields.customfield_16369 || [];

      const storyData = {
        key: storyKey,
        summary: storySummary,
        status: storyStatus,
        storyPoints: storyPoints,
        responsibleForChange: responsibleForChange,
        parent: parent,
        type: 'story',
        stories: [] // Empty array for consistency
      };

      // Group by Business Project
      if (businessProjects.length === 0) {
        if (!businessProjectsMap['Uncategorized']) {
          businessProjectsMap['Uncategorized'] = [];
        }
        businessProjectsMap['Uncategorized'].push(storyData);
      } else {
        for (const bp of businessProjects) {
          const bpName = bp.value || bp;
          if (!businessProjectsMap[bpName]) {
            businessProjectsMap[bpName] = [];
          }
          businessProjectsMap[bpName].push(storyData);
        }
      }
    }

    // 6. Calculate project-level progress for each business project
    const projectsWithProgress = {};
    Object.keys(businessProjectsMap).forEach(projectName => {
      const items = businessProjectsMap[projectName];
      let projectTotalPoints = 0;
      let projectCompletedPoints = 0;

      items.forEach(item => {
        if (item.type === 'epic') {
          projectTotalPoints += item.totalPoints || 0;
          projectCompletedPoints += item.completedPoints || 0;
        } else if (item.type === 'story') {
          // Include standalone stories in project progress
          const points = item.storyPoints;
          if (points && points > 0) {
            projectTotalPoints += points;
            if (isStoryCompleted(item.status)) {
              projectCompletedPoints += points;
            }
          }
        }
      });

      const projectProgressPercentage = projectTotalPoints > 0
        ? Math.round((projectCompletedPoints / projectTotalPoints) * 100)
        : null;

      projectsWithProgress[projectName] = {
        items: items,
        totalPoints: projectTotalPoints,
        completedPoints: projectCompletedPoints,
        progressPercentage: projectProgressPercentage
      };
    });

    // 7. Save to data/data.json
    const dataPath = path.join(__dirname, '..', 'data', 'data.json');
    fs.writeFileSync(dataPath, JSON.stringify(projectsWithProgress, null, 2));

    // 8. Return the JSON with Jira base URL for linking
    res.json({
      jiraBaseUrl: baseUrl,
      projects: projectsWithProgress
    });
  } catch (error) {
    console.error('Jira API error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch Jira issues' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
