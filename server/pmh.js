const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { getJiraHeaders, getJiraBaseUrl } = require('./auth');

const router = express.Router();

/**
 * Parse a version string into numeric components
 * @param {string} versionName - Version string like "9.93.0" or "9.90.47"
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
 * Check if a story should be flagged as missing from target release
 * @param {Array} fixVersions - Array of version objects from Jira
 * @param {Object} targetParsed - Parsed target version { major, minor, patch }
 * @returns {boolean} True if story should be flagged
 */
function shouldFlagStory(fixVersions, targetParsed) {
  if (!fixVersions || fixVersions.length === 0) return false;

  let maxHotfixMinor = null;
  let maxReleaseMinorBeforeTarget = null;
  let hasTargetVersion = false;

  for (const fv of fixVersions) {
    const parsed = parseVersion(fv.name);
    if (!parsed) continue;

    // Ignore versions with lower major than target
    if (parsed.major < targetParsed.major) continue;

    // Check if this is the exact target version
    if (parsed.major === targetParsed.major && 
        parsed.minor === targetParsed.minor && 
        parsed.patch === targetParsed.patch) {
      hasTargetVersion = true;
    }

    // Categorize by patch (0 = release, non-0 = hotfix)
    if (parsed.patch === 0) {
      // Release version - only consider if minor <= target.minor
      if (parsed.minor <= targetParsed.minor) {
        if (maxReleaseMinorBeforeTarget === null || parsed.minor > maxReleaseMinorBeforeTarget) {
          maxReleaseMinorBeforeTarget = parsed.minor;
        }
      }
    } else {
      // Hotfix version - only consider if minor < target.minor
      if (parsed.minor < targetParsed.minor) {
        if (maxHotfixMinor === null || parsed.minor > maxHotfixMinor) {
          maxHotfixMinor = parsed.minor;
        }
      }
    }
  }

  // Flag if:
  // - maxHotfixMinor exists
  // - AND (maxReleaseMinorBeforeTarget is null OR maxHotfixMinor > maxReleaseMinorBeforeTarget)
  // - AND story does NOT include targetVersion exactly
  return maxHotfixMinor !== null && 
         (maxReleaseMinorBeforeTarget === null || maxHotfixMinor > maxReleaseMinorBeforeTarget) && 
         !hasTargetVersion;
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
    jql: 'project = VT AND issuetype in (Story, Bug) AND status in (Done, Ready, "Partial Release") AND fixVersion is not EMPTY',
    fields: ['summary', 'status', 'fixVersions', 'customfield_10400'],
    maxResults: 500
  }, { headers });

  return response.data.issues;
}

/**
 * GET /api/hotfix-versions
 * Returns available release versions for the dropdown
 */
router.get('/hotfix-versions', async (req, res) => {
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

    const releaseVersions = getAvailableReleaseVersions(Array.from(allVersionNames), 5);

    res.json({
      versions: releaseVersions
    });
  } catch (error) {
    console.error('Error fetching hotfix versions:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch versions' });
  }
});

/**
 * GET /api/hotfix-check?targetVersion=9.93.0
 * Returns stories that are missing from the target release
 */
router.get('/hotfix-check', async (req, res) => {
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

    const missingStories = [];

    for (const issue of issues) {
      const fixVersions = issue.fields.fixVersions || [];

      if (shouldFlagStory(fixVersions, targetParsed)) {
        missingStories.push({
          key: issue.key,
          summary: issue.fields.summary,
          fixVersions: fixVersions.map(fv => fv.name),
          responsibleForChange: issue.fields.customfield_10400?.displayName || null,
          status: issue.fields.status?.name || null
        });
      }
    }

    // Save to pmh.json
    const dataPath = path.join(__dirname, '..', 'pmh.json');
    const result = {
      targetVersion,
      fetchedAt: new Date().toISOString(),
      missingStories
    };
    fs.writeFileSync(dataPath, JSON.stringify(result, null, 2));

    res.json({
      jiraBaseUrl: getJiraBaseUrl(),
      targetVersion,
      missingStories
    });
  } catch (error) {
    console.error('Error in hotfix check:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to perform hotfix check' });
  }
});

module.exports = router;
