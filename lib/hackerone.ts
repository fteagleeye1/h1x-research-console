const HACKERONE_API_BASE = "https://api.hackerone.com/v1";

/**
 * Error carrying the upstream HTTP status so API routes can map it to
 * meaningful responses without leaking internals (see spec section 26).
 */
export class HackerOneError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HackerOneError";
    this.status = status;
  }
}

function getCredentials() {
  const username = process.env.H1_USERNAME;
  const token = process.env.H1_TOKEN;

  if (!username || !token) {
    throw new HackerOneError(
      500,
      "HackerOne credentials are not configured. Set H1_USERNAME and H1_TOKEN."
    );
  }

  return { username, token };
}

export async function hackeroneFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const { username, token } = getCredentials();

  const credentials = Buffer.from(`${username}:${token}`).toString("base64");

  const response = await fetch(`${HACKERONE_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${credentials}`,
      ...options.headers,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();

    throw new HackerOneError(
      response.status,
      `HackerOne API error ${response.status}: ${body.slice(0, 500)}`
    );
  }

  return response.json() as Promise<T>;
}
