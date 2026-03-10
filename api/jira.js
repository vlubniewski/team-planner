export default async function handler(req, res) {
  const { JIRA_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT_KEY } = process.env
  const domain = process.env.VITE_JIRA_DOMAIN

  const jql = `project = ${JIRA_PROJECT_KEY} AND issuetype = Story AND statusCategory != Done ORDER BY created DESC`
  const url = `https://${domain}/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=50&fields=summary,assignee,duedate,created,status`

  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64')}`,
      Accept: 'application/json',
    },
  })

  const data = await response.json()
  res.status(200).json(data)
}