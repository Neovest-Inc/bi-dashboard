/**
 * Dependencies Routes
 * 
 * Handles fetching cross-team dependency data for VAL team by quarter.
 */

const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { getJiraHeaders, getJiraBaseUrl } = require('./auth');

const router = express.Router();

// Custom field IDs
const EPIC_QUARTER_FIELD = 'customfield_10552';  // Epic Quarter[Dropdown]
const CROSS_TEAM_DEPS_FIELD = 'customfield_12805';  // Cross Team Dependencies[Select List (multiple choices)]

/**
 * GET /api/dependencies/field-options
 * Fetches available quarters and teams from existing epics
 */
router.get('/dependencies/field-options', async (req, res) => {
  try {
    const headers = getJiraHeaders();
    const baseUrl = getJiraBaseUrl();

    const response = await axios.post(`${baseUrl}/rest/api/3/search/jql`, {
      jql: 'type = Epic AND "Epic Quarter[Dropdown]" is not EMPTY',
      fields: [EPIC_QUARTER_FIELD, CROSS_TEAM_DEPS_FIELD],
      maxResults: 500
    }, { headers });

    const quarters = new Set();
    const teams = new Set();
    
    response.data.issues.forEach(issue => {
      const quarterField = issue.fields[EPIC_QUARTER_FIELD];
      if (quarterField) {
        const val = typeof quarterField === 'object' ? quarterField.value : quarterField;
        if (val) quarters.add(val);
      }
      
      const teamsField = issue.fields[CROSS_TEAM_DEPS_FIELD];
      if (teamsField && Array.isArray(teamsField)) {
        teamsField.forEach(team => {
          const val = typeof team === 'object' ? team.value : team;
          if (val) teams.add(val);
        });
      }
    });

    res.json({
      quarters: Array.from(quarters).sort().reverse(),
      teams: Array.from(teams).sort()
    });
  } catch (error) {
    console.error('Dependencies field options error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch field options' });
  }
});

/**
 * GET /api/dependencies?quarter=26-1
 * Fetches dependency data for a specific quarter
 */
router.get('/dependencies', async (req, res) => {
  try {
    const { quarter } = req.query;
    if (!quarter) {
      return res.status(400).json({ error: 'quarter query parameter is required' });
    }

    const headers = getJiraHeaders();
    const baseUrl = getJiraBaseUrl();
    const VAL_TEAM_ID = '6494989f-c283-4c5b-bcec-fe03915d63de';

    // Outgoing: VAL epics with cross-team dependencies
    const outgoingResponse = await axios.post(`${baseUrl}/rest/api/3/search/jql`, {
      jql: `"team[team]" = ${VAL_TEAM_ID} AND type = Epic AND "Epic Quarter[Dropdown]" = "${quarter}" AND "Cross Team Dependencies[Select List (multiple choices)]" is not EMPTY`,
      fields: ['summary', 'status', 'duedate', EPIC_QUARTER_FIELD, CROSS_TEAM_DEPS_FIELD],
      maxResults: 200
    }, { headers });

    // Incoming: Other teams' epics that depend on VAL
    const incomingResponse = await axios.post(`${baseUrl}/rest/api/3/search/jql`, {
      jql: `"team[team]" != ${VAL_TEAM_ID} AND type = Epic AND "Epic Quarter[Dropdown]" = "${quarter}" AND "Cross Team Dependencies[Select List (multiple choices)]" = "Val Team"`,
      fields: ['summary', 'status', 'duedate', 'project', EPIC_QUARTER_FIELD, CROSS_TEAM_DEPS_FIELD],
      maxResults: 200
    }, { headers });

    // Process outgoing dependencies
    const outgoingEpics = outgoingResponse.data.issues.map(issue => {
      const depsField = issue.fields[CROSS_TEAM_DEPS_FIELD] || [];
      return {
        key: issue.key,
        summary: issue.fields.summary,
        status: issue.fields.status?.name || 'Unknown',
        dueDate: issue.fields.duedate,
        dependsOn: depsField.map(d => typeof d === 'object' ? d.value : d)
      };
    });

    // Process incoming dependencies
    const incomingEpics = incomingResponse.data.issues.map(issue => ({
      key: issue.key,
      summary: issue.fields.summary,
      status: issue.fields.status?.name || 'Unknown',
      dueDate: issue.fields.duedate,
      fromTeam: issue.fields.project?.name || 'Unknown'
    }));

    // Group by team
    const outgoingByTeam = {};
    outgoingEpics.forEach(epic => {
      epic.dependsOn.forEach(team => {
        if (!outgoingByTeam[team]) outgoingByTeam[team] = [];
        outgoingByTeam[team].push(epic);
      });
    });

    const incomingByTeam = {};
    incomingEpics.forEach(epic => {
      if (!incomingByTeam[epic.fromTeam]) incomingByTeam[epic.fromTeam] = [];
      incomingByTeam[epic.fromTeam].push(epic);
    });

    // Fetch story progress for all epics
    const allEpicKeys = [...outgoingEpics.map(e => e.key), ...incomingEpics.map(e => e.key)];
    const epicProgress = {};

    if (allEpicKeys.length > 0) {
      const storiesResponse = await axios.post(`${baseUrl}/rest/api/3/search/jql`, {
        jql: `"Epic Link" in (${allEpicKeys.join(',')}) OR parent in (${allEpicKeys.join(',')})`,
        fields: ['parent', 'customfield_10014', 'status', 'customfield_10016'],
        maxResults: 1000
      }, { headers });

      const storiesByEpic = {};
      storiesResponse.data.issues.forEach(story => {
        const epicKey = story.fields.parent?.key || story.fields.customfield_10014;
        if (epicKey) {
          if (!storiesByEpic[epicKey]) {
            storiesByEpic[epicKey] = { total: 0, done: 0, totalPts: 0, donePts: 0 };
          }
          storiesByEpic[epicKey].total++;
          const pts = story.fields.customfield_10016 || 0;
          storiesByEpic[epicKey].totalPts += pts;
          const st = story.fields.status?.name?.toLowerCase() || '';
          if (st.includes('done') || st.includes('closed') || st.includes('resolved')) {
            storiesByEpic[epicKey].done++;
            storiesByEpic[epicKey].donePts += pts;
          }
        }
      });

      Object.keys(storiesByEpic).forEach(k => {
        const d = storiesByEpic[k];
        epicProgress[k] = {
          storyCount: d.total,
          storiesDone: d.done,
          progressPercent: d.totalPts > 0 
            ? Math.round((d.donePts / d.totalPts) * 100) 
            : (d.total > 0 ? Math.round((d.done / d.total) * 100) : 0)
        };
      });
    }

    // Attach progress to epics
    outgoingEpics.forEach(e => {
      e.progress = epicProgress[e.key] || { storyCount: 0, storiesDone: 0, progressPercent: 0 };
    });
    incomingEpics.forEach(e => {
      e.progress = epicProgress[e.key] || { storyCount: 0, storiesDone: 0, progressPercent: 0 };
    });

    const result = {
      quarter,
      fetchedAt: new Date().toISOString(),
      outgoing: { byTeam: outgoingByTeam, epics: outgoingEpics },
      incoming: { byTeam: incomingByTeam, epics: incomingEpics }
    };

    // Save to data/dependencies.json
    const dataPath = path.join(__dirname, '..', 'data', 'dependencies.json');
    fs.writeFileSync(dataPath, JSON.stringify(result, null, 2));

    res.json({ jiraBaseUrl: baseUrl, ...result });
  } catch (error) {
    console.error('Dependencies API error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch dependencies' });
  }
});

module.exports = router;
