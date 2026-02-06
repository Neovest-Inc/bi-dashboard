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
      fields: ['summary', 'customfield_16369'],
      maxResults: 100
    }, { headers });

    const epics = epicsResponse.data.issues;

    // 2. For each Epic, fetch Stories and build structure
    const businessProjectsMap = {};

    for (const epic of epics) {
      const epicKey = epic.key;
      const epicSummary = epic.fields.summary;
      const businessProjects = epic.fields.customfield_16369 || [];

      // Fetch Stories linked to this Epic
      const storiesResponse = await axios.post(`${process.env.JIRA_BASE_URL}/rest/api/3/search/jql`, {
        jql: `project = VT AND issuetype = Story AND "Epic Link" = ${epicKey}`,
        fields: ['summary', 'status'],
        maxResults: 100
      }, { headers });

      const stories = storiesResponse.data.issues.map(story => ({
        key: story.key,
        summary: story.fields.summary,
        status: story.fields.status?.name
      }));

      const epicData = {
        key: epicKey,
        summary: epicSummary,
        stories
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

    // 5. Save to data.json
    const dataPath = path.join(__dirname, '..', 'data.json');
    fs.writeFileSync(dataPath, JSON.stringify(businessProjectsMap, null, 2));

    // 6. Return the JSON
    res.json(businessProjectsMap);
  } catch (error) {
    console.error('Jira API error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch Jira issues' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
