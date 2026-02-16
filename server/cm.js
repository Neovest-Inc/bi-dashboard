/**
 * CM (Change Management) Routes
 * 
 * Handles fetching CM tickets raised by VAL team in the last 30 days.
 */

const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { getJiraHeaders, getJiraBaseUrl } = require('./auth');

const router = express.Router();

/**
 * GET /api/cms
 * Fetches CM tickets raised in the last 30 days
 */
router.get('/cms', async (req, res) => {
  try {
    const headers = getJiraHeaders();
    const baseUrl = getJiraBaseUrl();

    // Fetch CM tickets created in the last 30 days for VAL team
    const response = await axios.post(`${baseUrl}/rest/api/3/search/jql`, {
      jql: 'project = CM AND "team[team]" = 6494989f-c283-4c5b-bcec-fe03915d63de AND created >= -30d ORDER BY created DESC',
      fields: [
        'summary',
        'reporter',
        'status',
        'issuetype',
        'components',
        'fixVersions',
        'customfield_13235',  // Client Environments
        'customfield_10751'   // TargetDeploymentDate
      ],
      maxResults: 200
    }, { headers });

    const issues = response.data.issues;

    // Transform the data
    const cms = issues.map(issue => ({
      key: issue.key,
      summary: issue.fields.summary,
      reporter: issue.fields.reporter?.displayName || null,
      status: issue.fields.status?.name || 'Unknown',
      issueType: issue.fields.issuetype?.name || 'Unknown',
      issueTypeIconUrl: issue.fields.issuetype?.iconUrl || null,
      components: (issue.fields.components || []).map(c => c.name),
      fixVersions: (issue.fields.fixVersions || []).map(v => v.name),
      clientEnvironments: (issue.fields.customfield_13235 || []).map(c => c.value),
      targetDeploymentDate: issue.fields.customfield_10751 || null
    }));

    // Save to cm.json
    const dataPath = path.join(__dirname, '..', 'cm.json');
    fs.writeFileSync(dataPath, JSON.stringify(cms, null, 2));

    res.json({
      jiraBaseUrl: baseUrl,
      cms: cms,
      count: cms.length
    });
  } catch (error) {
    console.error('CM API error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch CM tickets' });
  }
});

module.exports = router;
