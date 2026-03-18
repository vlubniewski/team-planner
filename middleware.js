export default async function middleware(request) {
  const username = process.env.BASIC_AUTH_USER;
  const password = process.env.BASIC_AUTH_PASSWORD;

  // Leave the site open if credentials are not configured yet.
  if (!username || !password) {
    return fetch(request);
  }

  const authorization = request.headers.get("authorization");

  if (authorization?.startsWith("Basic ")) {
    try {
      const encoded = authorization.slice(6);
      const decoded = atob(encoded);
      const separator = decoded.indexOf(":");
      const providedUser = separator >= 0 ? decoded.slice(0, separator) : decoded;
      const providedPassword = separator >= 0 ? decoded.slice(separator + 1) : "";

      if (providedUser === username && providedPassword === password) {
        return fetch(request);
      }
    } catch {
      // Fall through to the auth challenge below.
    }
  }

  return new Response("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Team Planner"',
      "Cache-Control": "no-store",
    },
  });
}
