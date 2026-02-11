// process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

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

app.get('/api/jira', async (req, res) => {
  try {
    const auth = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString('base64');
    const headers = {
      'Authorization': `Basic ${auth}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };

    // 1. Fetch all Epics for project VT with Business Projects populated
    const epicsResponse = await axios.post(`${process.env.JIRA_BASE_URL}/rest/api/3/search/jql`, {
      jql: 'project = VT AND issuetype = Epic AND "Business Projects[Select List (multiple choices)]" is not empty',
      fields: ['summary', 'customfield_16369', 'duedate', 'customfield_13235'],
      maxResults: 100
    }, { headers });

    const epics = epicsResponse.data.issues;

    // 2. For each Epic, fetch Stories and build structure
    const businessProjectsMap = {};

    for (const epic of epics) {
      const epicKey = epic.key;
      const epicSummary = epic.fields.summary;
      const epicDueDate = epic.fields.duedate;
      const epicClientEnvironments = epic.fields.customfield_13235;
      const businessProjects = epic.fields.customfield_16369 || [];

      // Fetch Stories linked to this Epic
      const storiesResponse = await axios.post(`${process.env.JIRA_BASE_URL}/rest/api/3/search/jql`, {
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

      const epicData = {
        key: epicKey,
        summary: epicSummary,
        dueDate: epicDueDate,
        clientEnvironments: epicClientEnvironments,
        stories,
        type: 'epic'
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
    const standaloneStoriesResponse = await axios.post(`${process.env.JIRA_BASE_URL}/rest/api/3/search/jql`, {
      jql: 'project = VT AND issuetype = Story AND "Business Projects[Select List (multiple choices)]" is not empty',
      fields: ['summary', 'status', 'customfield_10115', 'customfield_10400', 'parent', 'customfield_16369'],
      maxResults: 100
    }, { headers });

    const standaloneStories = standaloneStoriesResponse.data.issues;
console.log('Fetched standalone stories:', standaloneStories.length);
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

    // 6. Save to data.json
    const dataPath = path.join(__dirname, '..', 'data.json');
    fs.writeFileSync(dataPath, JSON.stringify(businessProjectsMap, null, 2));

    // 6. Return the JSON with Jira base URL for linking
    res.json({
      jiraBaseUrl: process.env.JIRA_BASE_URL,
      projects: businessProjectsMap
    });
  } catch (error) {
    console.error('Jira API error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch Jira issues' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
