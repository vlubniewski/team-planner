import { requireAuth } from "./_auth.js";

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;

  const { JIRA_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT_KEY } = process.env;
  const domain = process.env.JIRA_DOMAIN || process.env.VITE_JIRA_DOMAIN;

  if (!domain || !JIRA_EMAIL || !JIRA_API_TOKEN) {
    return res.status(500).json({
      error: "Jira environment variables are missing. Expected JIRA_DOMAIN (or VITE_JIRA_DOMAIN), JIRA_EMAIL, and JIRA_API_TOKEN.",
    });
  }

  const auth = `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64")}`;
  const headers = { Authorization: auth, Accept: "application/json" };

  const jql = req.query.jql
    ? req.query.jql
    : `project = ${JIRA_PROJECT_KEY} ORDER BY created DESC`;

  const url = `https://${domain}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=100&fields=summary,assignee,duedate,created,status,resolutiondate`;

  const response = await fetch(url, { headers });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return res.status(response.status).json({
      error: data.errorMessages?.join(" ") || data.errors?.summary || data.message || "Jira request failed.",
      jiraStatus: response.status,
      domain,
      jql,
    });
  }

  const isDoneQuery = req.query.jql && req.query.jql.includes("Done");

  if (isDoneQuery && data.issues?.length) {
    // Fetch changelogs in parallel for done tickets to get exact transition date
    const withDates = await Promise.all(
      data.issues.map(async (issue) => {
        try {
          const clRes = await fetch(
            `https://${domain}/rest/api/3/issue/${issue.key}/changelog`,
            { headers }
          );
          const cl = await clRes.json().catch(() => ({}));
          if (!clRes.ok) return issue;
          // Find the most recent transition TO Done or Deployed
          let transitionDate = null;
          const entries = (cl.values || []).slice().reverse(); // most recent first
          for (const entry of entries) {
            for (const item of entry.items || []) {
              if (item.field === "status") {
                const toStr = (item["toString"] || item.to || "").toLowerCase();
                if (toStr.includes("done") || toStr.includes("deployed")) {
                  transitionDate = entry.created;
                  break;
                }
              }
            }
            if (transitionDate) break;
          }
          return {
            ...issue,
            fields: {
              ...issue.fields,
              transitionDate: transitionDate || issue.fields.resolutiondate || null,
            },
          };
        } catch {
          return issue;
        }
      })
    );
    return res.status(200).json({ ...data, issues: withDates });
  }

  res.status(200).json(data);
}
