/**
 * Hotfix Booking Routes
 * 
 * Handles hotfix version booking and tracking component versions per client.
 */

const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { getJiraHeaders, getJiraBaseUrl } = require('./auth');

const router = express.Router();

const BOOKINGS_FILE = path.join(__dirname, '..', 'data', 'hotfix-bookings.json');
const CLIENT_CONTEXT_ID = 14042;

/**
 * Load bookings from JSON file
 */
function loadBookings() {
  try {
    if (fs.existsSync(BOOKINGS_FILE)) {
      const data = fs.readFileSync(BOOKINGS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading bookings:', error.message);
  }
  return { bookings: [] };
}

/**
 * Save bookings to JSON file
 */
function saveBookings(data) {
  fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(data, null, 2));
}

/**
 * Parse version string into components
 * @param {string} version - e.g., "9.92.76"
 * @returns {object} - { major, minor, patch }
 */
function parseVersion(version) {
  const parts = version.split('.').map(Number);
  return {
    major: parts[0] || 0,
    minor: parts[1] || 0,
    patch: parts[2] || 0
  };
}

/**
 * Compare two versions
 * @returns {number} - positive if a > b, negative if a < b, 0 if equal
 */
function compareVersions(a, b) {
  const vA = parseVersion(a);
  const vB = parseVersion(b);
  if (vA.major !== vB.major) return vA.major - vB.major;
  if (vA.minor !== vB.minor) return vA.minor - vB.minor;
  return vA.patch - vB.patch;
}

/**
 * Fetch deployed CMs from Jira (shared function to avoid duplicate queries)
 * @param {boolean} deployedOnly - If true, only fetch CMs with deployed status
 * @returns {Promise<Array>} - Array of CM objects
 */
async function fetchDeployedCMs(deployedOnly = true) {
  const headers = getJiraHeaders();
  const baseUrl = getJiraBaseUrl();

  const statusFilter = deployedOnly 
    ? 'AND status in ("Deployment Completed", "Done")' 
    : '';

  const response = await axios.post(`${baseUrl}/rest/api/3/search/jql`, {
    jql: `project = CM ${statusFilter} AND created >= -100d ORDER BY created DESC`,
    fields: [
      'summary',
      'status',
      'components',
      'fixVersions',
      'customfield_13235',  // Client Environments
      'customfield_10751',  // TargetDeploymentDate
      'reporter'
    ],
    maxResults: 500
  }, { headers });

  return response.data.issues.map(issue => ({
    key: issue.key,
    summary: issue.fields.summary,
    status: issue.fields.status?.name || 'Unknown',
    components: (issue.fields.components || []).map(c => c.name),
    fixVersions: (issue.fields.fixVersions || []).map(v => v.name),
    clientEnvironments: (issue.fields.customfield_13235 || []).map(c => c.value),
    targetDeploymentDate: issue.fields.customfield_10751 || null,
    reporter: issue.fields.reporter?.displayName || null
  }));
}

/**
 * Fetch CMs by fixVersion pattern (for history - no date limit)
 * @param {number} major - Major version number (e.g., 9)
 * @param {number} minor - Minor version number (e.g., 92)
 * @returns {Promise<Array>} - Array of CM objects
 */
async function fetchCMsByVersion(major, minor) {
  const headers = getJiraHeaders();
  const baseUrl = getJiraBaseUrl();

  const response = await axios.post(`${baseUrl}/rest/api/3/search/jql`, {
    jql: `project = CM AND fixVersion ~ "${major}.${minor}.*" ORDER BY created DESC`,
    fields: [
      'summary',
      'status',
      'components',
      'fixVersions',
      'customfield_13235',  // Client Environments
      'customfield_10751',  // TargetDeploymentDate
      'reporter'
    ],
    maxResults: 500
  }, { headers });

  return response.data.issues.map(issue => ({
    key: issue.key,
    summary: issue.fields.summary,
    status: issue.fields.status?.name || 'Unknown',
    components: (issue.fields.components || []).map(c => c.name),
    fixVersions: (issue.fields.fixVersions || []).map(v => v.name),
    clientEnvironments: (issue.fields.customfield_13235 || []).map(c => c.value),
    targetDeploymentDate: issue.fields.customfield_10751 || null,
    reporter: issue.fields.reporter?.displayName || null
  }));
}

/**
 * Calculate next available version from CMs and bookings
 * Also performs auto-cleanup of bookings that have been deployed
 * @param {Array} cms - Array of CM objects
 * @returns {object} - { currentHighest, nextVersion, baseVersion }
 */
function calculateNextVersion(cms) {
  const allVersions = [];
  const deployedVersions = new Set();

  // Collect versions from deployed CMs
  cms.forEach(cm => {
    cm.fixVersions.forEach(v => {
      if (/^\d+\.\d+\.\d+$/.test(v)) {
        allVersions.push(v);
        deployedVersions.add(v);
      }
    });
  });

  // Load bookings and perform auto-cleanup
  const bookingsData = loadBookings();
  const originalCount = bookingsData.bookings.length;
  
  // Filter out bookings where the version now exists in Jira
  bookingsData.bookings = bookingsData.bookings.filter(booking => {
    const isDeployed = deployedVersions.has(booking.version);
    if (isDeployed) {
      console.log(`Auto-cleanup: Removing booking ${booking.version} (now deployed)`);
    }
    return !isDeployed;
  });
  
  // Save if any bookings were cleaned up
  if (bookingsData.bookings.length < originalCount) {
    saveBookings(bookingsData);
    console.log(`Auto-cleanup: Removed ${originalCount - bookingsData.bookings.length} deployed bookings`);
  }

  // Add remaining booked versions (not yet deployed)
  bookingsData.bookings.forEach(booking => {
    if (/^\d+\.\d+\.\d+$/.test(booking.version)) {
      allVersions.push(booking.version);
    }
  });

  if (allVersions.length === 0) {
    return { nextVersion: null, error: 'No deployed versions found.' };
  }

  // Find highest version
  allVersions.sort(compareVersions);
  const highestVersion = allVersions[allVersions.length - 1];
  const parsed = parseVersion(highestVersion);

  return {
    currentHighest: highestVersion,
    nextVersion: `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`,
    baseVersion: `${parsed.major}.${parsed.minor}.0`
  };
}

/**
 * GET /api/hotfix-booking/field-options
 * Fetches available components and client environments from Jira
 */
router.get('/hotfix-booking/field-options', async (req, res) => {
  try {
    const headers = getJiraHeaders();
    const baseUrl = getJiraBaseUrl();

    // Fetch components from CM project
    const componentsResponse = await axios.get(
      `${baseUrl}/rest/api/3/project/CM/components`,
      { headers }
    );

    const components = componentsResponse.data.map(c => ({
      id: c.id,
      name: c.name
    }));

    // Fetch client environments from custom field options
    const clientsResponse = await axios.get(
      `${baseUrl}/rest/api/3/field/customfield_13235/context/${CLIENT_CONTEXT_ID}/option`,
      { headers }
    );

    const clients = (clientsResponse.data.values || []).map(c => ({
      id: c.id,
      value: c.value
    }));

    res.json({
      components,
      clients
    });
  } catch (error) {
    console.error('Field options error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch field options' });
  }
});

/**
 * GET /api/hotfix-booking/deployed-cms
 * Fetches deployed CMs from the last 100 days (all teams)
 */
router.get('/hotfix-booking/deployed-cms', async (req, res) => {
  try {
    const cms = await fetchDeployedCMs(false);
    res.json({ cms });
  } catch (error) {
    console.error('Deployed CMs error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch deployed CMs' });
  }
});

/**
 * GET /api/hotfix-booking/next-version
 * Calculates the next available hotfix version
 */
router.get('/hotfix-booking/next-version', async (req, res) => {
  try {
    const cms = await fetchDeployedCMs(true);
    const result = calculateNextVersion(cms);
    
    if (result.error && !result.nextVersion) {
      return res.json({ nextVersion: null, error: result.error });
    }

    res.json(result);
  } catch (error) {
    console.error('Next version error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to calculate next version' });
  }
});

/**
 * GET /api/hotfix-booking/bookings
 * Returns all bookings
 */
router.get('/hotfix-booking/bookings', (req, res) => {
  const data = loadBookings();
  res.json(data);
});

/**
 * POST /api/hotfix-booking/book
 * Books a new hotfix version
 * Body: { version, components, clientEnvironments, bookedBy }
 */
router.post('/hotfix-booking/book', express.json(), (req, res) => {
  try {
    const { version, components, clientEnvironments, bookedBy } = req.body;

    if (!version || !components || !clientEnvironments) {
      return res.status(400).json({ error: 'Missing required fields: version, components, clientEnvironments' });
    }

    if (!Array.isArray(components) || components.length === 0) {
      return res.status(400).json({ error: 'At least one component is required' });
    }

    if (!Array.isArray(clientEnvironments) || clientEnvironments.length === 0) {
      return res.status(400).json({ error: 'At least one client environment is required' });
    }

    const data = loadBookings();

    // Check if version is already booked
    const existingBooking = data.bookings.find(b => b.version === version);
    if (existingBooking) {
      return res.status(409).json({ 
        error: `Version ${version} is already booked`,
        existingBooking 
      });
    }

    // Create new booking
    const newBooking = {
      id: `HB-${Date.now()}`,
      version,
      components,
      clientEnvironments,
      bookedBy: bookedBy || 'Unknown',
      bookedAt: new Date().toISOString(),
      status: 'booked'
    };

    data.bookings.push(newBooking);
    saveBookings(data);

    res.json({ 
      success: true, 
      booking: newBooking 
    });
  } catch (error) {
    console.error('Booking error:', error.message);
    res.status(500).json({ error: 'Failed to book version' });
  }
});

/**
 * GET /api/hotfix-booking/client-versions
 * Returns the version matrix: per-client per-component versions
 */
router.get('/hotfix-booking/client-versions', async (req, res) => {
  try {
    // Use shared function to fetch deployed CMs
    const cms = await fetchDeployedCMs(true);

    // Build version matrix
    // Structure: { clientEnv: { component: { version, cmKey, deployedAt } } }
    const versionMatrix = {};

    cms.forEach(cm => {
      // For each combination of client and component, track the highest version
      cm.clientEnvironments.forEach(client => {
        if (!versionMatrix[client]) {
          versionMatrix[client] = {};
        }

        cm.components.forEach(component => {
          cm.fixVersions.forEach(version => {
            if (!/^\d+\.\d+\.\d+$/.test(version)) return;

            const existing = versionMatrix[client][component];
            if (!existing || compareVersions(version, existing.version) > 0) {
              versionMatrix[client][component] = {
                version,
                cmKey: cm.key,
                deployedAt: cm.targetDeploymentDate
              };
            }
          });
        });
      });
    });

    // Get unique components and clients
    const allComponents = new Set();
    Object.values(versionMatrix).forEach(clientData => {
      Object.keys(clientData).forEach(comp => allComponents.add(comp));
    });

    res.json({
      matrix: versionMatrix,
      components: Array.from(allComponents).sort(),
      clients: Object.keys(versionMatrix).sort()
    });
  } catch (error) {
    console.error('Client versions error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch client versions' });
  }
});

/**
 * GET /api/hotfix-booking/history
 * Returns hotfix history for a specific minor version
 * Query params:
 *   - minor: The minor version number (e.g., 92 for 9.92.x)
 *   - major: Optional major version (defaults to 9)
 */
router.get('/hotfix-booking/history', async (req, res) => {
  try {
    const requestedMinor = req.query.minor ? parseInt(req.query.minor) : null;
    const requestedMajor = req.query.major ? parseInt(req.query.major) : 9;
    
    // First, fetch recent CMs to determine current minor version
    const recentCMs = await fetchDeployedCMs(false);
    
    // Determine current minor version from recent CMs
    let currentMajor = requestedMajor;
    let currentMinor = 0;
    
    recentCMs.forEach(cm => {
      cm.fixVersions.forEach(version => {
        if (/^\d+\.\d+\.\d+$/.test(version)) {
          const parsed = parseVersion(version);
          if (parsed.major === currentMajor && parsed.minor > currentMinor) {
            currentMinor = parsed.minor;
          }
        }
      });
    });
    
    // Generate last 5 minor versions
    const minorVersions = [];
    for (let i = 0; i < 5; i++) {
      if (currentMinor - i >= 0) {
        minorVersions.push({
          major: currentMajor,
          minor: currentMinor - i,
          label: `${currentMajor}.${currentMinor - i}.x`
        });
      }
    }
    
    // Use requested minor or default to current
    const targetMinor = requestedMinor !== null ? requestedMinor : currentMinor;
    
    // Fetch CMs specifically for the target version (no date limit)
    const versionCMs = await fetchCMsByVersion(currentMajor, targetMinor);
    
    // Load bookings
    const bookingsData = loadBookings();
    const bookings = bookingsData.bookings || [];
    
    // Build hotfixes list from version-specific CMs
    const hotfixes = [];
    
    // Add CMs from version query
    versionCMs.forEach(cm => {
      cm.fixVersions.forEach(version => {
        if (/^\d+\.\d+\.\d+$/.test(version)) {
          const parsed = parseVersion(version);
          if (parsed.major === currentMajor && parsed.minor === targetMinor) {
            hotfixes.push({
              version,
              type: 'deployed',
              cmKey: cm.key,
              summary: cm.summary,
              status: cm.status,
              components: cm.components,
              clientEnvironments: cm.clientEnvironments,
              deployedAt: cm.targetDeploymentDate,
              reporter: cm.reporter
            });
          }
        }
      });
    });
    
    // Add booked versions (not yet deployed)
    bookings.forEach(booking => {
      const parsed = parseVersion(booking.version);
      if (parsed.major === currentMajor && parsed.minor === targetMinor) {
        // Check if this version is already in deployed list
        const alreadyDeployed = hotfixes.some(h => h.version === booking.version && h.type === 'deployed');
        if (!alreadyDeployed) {
          hotfixes.push({
            version: booking.version,
            type: 'booked',
            cmKey: null,
            summary: null,
            status: 'Booked',
            components: booking.components,
            clientEnvironments: booking.clientEnvironments,
            bookedAt: booking.bookedAt,
            bookedBy: booking.bookedBy,
            reporter: booking.bookedBy
          });
        }
      }
    });
    
    // Sort by version descending
    hotfixes.sort((a, b) => compareVersions(b.version, a.version));
    
    res.json({
      minorVersions,
      currentMinor,
      targetMinor,
      hotfixes,
      jiraBaseUrl: getJiraBaseUrl()
    });
  } catch (error) {
    console.error('Hotfix history error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch hotfix history' });
  }
});

module.exports = router;
