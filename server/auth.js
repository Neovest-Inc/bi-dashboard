require('dotenv').config();

/**
 * Get Jira authentication headers
 * @returns {Object} Headers object with Authorization, Accept, and Content-Type
 */
function getJiraHeaders() {
  const auth = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString('base64');
  return {
    'Authorization': `Basic ${auth}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  };
}

/**
 * Get the Jira base URL from environment
 * @returns {string} Jira base URL
 */
function getJiraBaseUrl() {
  return process.env.JIRA_BASE_URL;
}

module.exports = {
  getJiraHeaders,
  getJiraBaseUrl
};
