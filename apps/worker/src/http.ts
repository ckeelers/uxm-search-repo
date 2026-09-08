const USER_AGENT =
  process.env.CRAWL_USER_AGENT ??
  "searchexperience-bot/0.1 (+https://github.com/; contact via repo)";

const REQUEST_TIMEOUT_MS = 15_000;

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`HTTP ${status} for ${url}`);
    this.name = "HttpError";
  }
}

/** True for statuses that mean "blocked / rate-limited", not "gone". */
export function isBlock(err: unknown): boolean {
  return err instanceof HttpError && (err.status === 403 || err.status === 429);
}

/** GET JSON with a hard timeout and a polite User-Agent. */
export async function getJson<T>(url: string): Promise<T> {
  return requestJson<T>(url, "GET");
}

/** POST JSON with a hard timeout and a polite User-Agent. */
export async function postJson<T>(url: string, body: unknown): Promise<T> {
  return requestJson<T>(url, "POST", body);
}

async function requestJson<T>(
  url: string,
  method: "GET" | "POST",
  body?: unknown,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        "user-agent": USER_AGENT,
        accept: "application/json",
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    if (!res.ok) throw new HttpError(res.status, url);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Strip HTML to readable-ish plain text. Good enough for storage + keyword scans. */
export function htmlToText(html: string): string {
  return html
    // some boards return entity-encoded markup — reveal the tags first
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&(?:ndash|mdash|#8211|#8212);/gi, "-")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&[a-z]+;/gi, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
