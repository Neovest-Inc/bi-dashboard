# BI Dashboard

A Business Intelligence tool designed to serve all teams across the organization. This dashboard integrates with Jira to provide centralized visibility into project management, releases, and change tracking.

## Features

- **Releases Management** - Monitor software releases
- **Change Management (CM)** - Track change requests
- **Post-Release Hotfixes (PMH)** - Track hotfix status and history
- **Dependencies Tracking** - Visualize project dependencies
- **Projects Overview** - Centralized view of all projects

## Tech Stack

- **Backend:** Node.js, Express
- **Frontend:** Vanilla JavaScript, HTML, CSS
- **Integration:** Jira REST API

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file with your Jira credentials:
   ```
   JIRA_BASE_URL=https://[your-org].atlassian.net
   JIRA_EMAIL=your-email@example.com
   JIRA_API_TOKEN=your-api-token
   ```
4. Start the server:
   ```bash
   npm start
   ```

The app will run on `http://localhost:3000`.

## License

Internal use only.
