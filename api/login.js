import { createSessionCookie, isAuthConfigured, validateCredentials } from "./_auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!isAuthConfigured()) {
    return res.status(200).json({ ok: true, authConfigured: false });
  }

  const { username, password } = req.body || {};

  if (!validateCredentials(username, password)) {
    return res.status(401).json({ error: "Invalid username or password" });
  }

  res.setHeader("Set-Cookie", createSessionCookie());
  return res.status(200).json({ ok: true, authConfigured: true });
}
