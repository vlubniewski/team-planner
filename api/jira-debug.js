export default async function handler(req, res) {
  const { JIRA_EMAIL, JIRA_API_TOKEN } = process.env;
  const domain = process.env.JIRA_DOMAIN || process.env.VITE_JIRA_DOMAIN;
  const key = req.query.key; // e.g. /api/jira-debug?key=WOPS-123

  if (!key) return res.status(400).json({ error: "Pass ?key=WOPS-XXX" });
  if (!domain || !JIRA_EMAIL || !JIRA_API_TOKEN) {
    return res.status(500).json({
      error: "Jira environment variables are missing. Expected JIRA_DOMAIN (or VITE_JIRA_DOMAIN), JIRA_EMAIL, and JIRA_API_TOKEN.",
    });
  }

  const auth = `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64")}`;
  const response = await fetch(
    `https://${domain}/rest/api/3/issue/${key}/changelog`,
    { headers: { Authorization: auth, Accept: "application/json" } }
  );
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return res.status(response.status).json({
      error: data.errorMessages?.join(" ") || data.message || "Jira changelog request failed.",
      jiraStatus: response.status,
      domain,
      key,
    });
  }

  // Return just the status-related changelog items so it's easy to read
  const statusChanges = (data.values || []).map(entry => ({
    created: entry.created,
    items: (entry.items || []).filter(i => i.field === "status").map(i => ({
      field: i.field,
      from: i.fromString,
      to: i.toString,
      toId: i.to,
    }))
  })).filter(e => e.items.length > 0);

  res.status(200).json({ raw: data.values?.[0], statusChanges });
}
