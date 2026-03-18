import crypto from "node:crypto";

const COOKIE_NAME = "team_planner_session";

function parseCookies(req) {
  const cookieHeader = req.headers.cookie || "";
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        const key = separator >= 0 ? part.slice(0, separator) : part;
        const value = separator >= 0 ? part.slice(separator + 1) : "";
        return [key, decodeURIComponent(value)];
      })
  );
}

function getAuthConfig() {
  const username = process.env.APP_LOGIN_USER;
  const password = process.env.APP_LOGIN_PASSWORD;
  const secret = process.env.APP_LOGIN_SECRET || `${username || ""}:${password || ""}:team-planner`;
  return { username, password, secret };
}

function buildSessionToken() {
  const { username, password, secret } = getAuthConfig();
  return crypto.createHash("sha256").update(`${username}:${password}:${secret}`).digest("hex");
}

export function isAuthConfigured() {
  const { username, password } = getAuthConfig();
  return Boolean(username && password);
}

export function validateCredentials(username, password) {
  const config = getAuthConfig();
  return config.username === username && config.password === password;
}

export function createSessionCookie() {
  const isProd = process.env.NODE_ENV === "production";
  return `${COOKIE_NAME}=${buildSessionToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${isProd ? "; Secure" : ""}`;
}

export function clearSessionCookie() {
  const isProd = process.env.NODE_ENV === "production";
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isProd ? "; Secure" : ""}`;
}

export function isAuthenticated(req) {
  if (!isAuthConfigured()) return true;
  const cookies = parseCookies(req);
  return cookies[COOKIE_NAME] === buildSessionToken();
}

export function requireAuth(req, res) {
  if (isAuthenticated(req)) return true;
  res.status(401).json({ error: "Unauthorized" });
  return false;
}
