/**
 * Releases Routes
 * 
 * Handles fetching stories/bugs by release version.
 * This module provides API endpoints to:
 * - Get available release versions (x.xx.0 format)
 * - Get all stories/bugs that include a specific release version
 */

const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { getJiraHeaders, getJiraBaseUrl } = require('./auth');

const router = express.Router();

/**
 * Parse a version string into numeric components
 * @param {string} versionName - Version string like "9.93.0"
 * @returns {Object|null} { major, minor, patch } or null if invalid
 */
function parseVersion(versionName) {
  if (!versionName) return null;
  const match = versionName.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10)
  };
}

/**
 * Get available release versions (patch == 0), limited to last N versions
 * @param {Array} allVersions - All fix versions from fetched stories
 * @param {number} limit - Maximum number of versions to return
 * @returns {Array} Array of version names sorted descending
 */
function getAvailableReleaseVersions(allVersions, limit = 5) {
  const releaseVersions = new Set();

  for (const versionName of allVersions) {
    const parsed = parseVersion(versionName);
    if (parsed && parsed.patch === 0) {
      releaseVersions.add(versionName);
    }
  }

  // Sort descending by major, minor
  return Array.from(releaseVersions)
    .sort((a, b) => {
      const pa = parseVersion(a);
      const pb = parseVersion(b);
      if (pa.major !== pb.major) return pb.major - pa.major;
      return pb.minor - pa.minor;
    })
    .slice(0, limit);
}

/**
 * Fetch all stories/bugs with fixVersion populated
 */
async function fetchStoriesWithFixVersions() {
  const headers = getJiraHeaders();
  const baseUrl = getJiraBaseUrl();

  const response = await axios.post(`${baseUrl}/rest/api/3/search/jql`, {
    jql: 'project = VT AND issuetype in (Story, Bug) AND fixVersion is not EMPTY',
    fields: ['summary', 'status', 'fixVersions', 'issuetype', 'customfield_10400', 'customfield_16068', 'customfield_13235'],
    maxResults: 1000
  }, { headers });

  return response.data.issues;
}

/**
 * GET /api/release-versions
 * Returns available release versions for the dropdown
 */
router.get('/release-versions', async (req, res) => {
  try {
    const issues = await fetchStoriesWithFixVersions();

    // Collect all version names
    const allVersionNames = new Set();
    for (const issue of issues) {
      const fixVersions = issue.fields.fixVersions || [];
      for (const fv of fixVersions) {
        if (fv.name) {
          allVersionNames.add(fv.name);
        }
      }
    }

    const releaseVersions = getAvailableReleaseVersions(Array.from(allVersionNames), 10);

    res.json({
      versions: releaseVersions
    });
  } catch (error) {
    console.error('Error fetching release versions:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch versions' });
  }
});

/**
 * GET /api/release-stories?targetVersion=9.93.0
 * Returns all stories/bugs that have the target version in their fixVersions
 */
router.get('/release-stories', async (req, res) => {
  try {
    const { targetVersion } = req.query;

    if (!targetVersion) {
      return res.status(400).json({ error: 'targetVersion query parameter is required' });
    }

    const targetParsed = parseVersion(targetVersion);
    if (!targetParsed) {
      return res.status(400).json({ error: 'Invalid version format. Expected X.Y.Z' });
    }

    if (targetParsed.patch !== 0) {
      return res.status(400).json({ error: 'Target version must be a release version (patch must be 0)' });
    }

    const issues = await fetchStoriesWithFixVersions();

    const releaseStories = [];

    for (const issue of issues) {
      const fixVersions = issue.fields.fixVersions || [];
      
      // Check if the target version is in the fixVersions
      const hasTargetVersion = fixVersions.some(fv => fv.name === targetVersion);

      if (hasTargetVersion) {
        const securityTypes = issue.fields.customfield_16068 || [];
        const clientEnvironments = issue.fields.customfield_13235 || [];
        
        releaseStories.push({
          key: issue.key,
          summary: issue.fields.summary,
          issueType: issue.fields.issuetype?.name || 'Unknown',
          fixVersions: fixVersions.map(fv => fv.name),
          securityTypes: securityTypes.map(st => st.value),
          clientEnvironments: clientEnvironments.map(ce => ce.value),
          responsibleForChange: issue.fields.customfield_10400?.displayName || null,
          status: issue.fields.status?.name || null
        });
      }
    }

    // Save to releases.json
    const dataPath = path.join(__dirname, '..', 'releases.json');
    const result = {
      targetVersion,
      fetchedAt: new Date().toISOString(),
      stories: releaseStories
    };
    fs.writeFileSync(dataPath, JSON.stringify(result, null, 2));

    res.json({
      jiraBaseUrl: getJiraBaseUrl(),
      targetVersion,
      stories: releaseStories
    });
  } catch (error) {
    console.error('Error fetching release stories:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch release stories' });
  }
});

module.exports = router;
