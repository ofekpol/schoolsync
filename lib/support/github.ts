import "server-only";

/**
 * Staff support reports become issues in a PRIVATE GitHub repo (the app repo
 * is public and reports carry names and emails). GitHub emails the repo's
 * watchers on every new issue.
 *
 * GITHUB_SUPPORT_REPO   "owner/name" of the private repo (no default on purpose)
 * GITHUB_SUPPORT_TOKEN  fine-grained token with Issues: read & write on that repo only
 */
export function isSupportEnabled(): boolean {
  return Boolean(process.env.GITHUB_SUPPORT_REPO && process.env.GITHUB_SUPPORT_TOKEN);
}

export interface SupportIssue {
  title: string;
  body: string;
  labels: string[];
}

/** Creates the issue and returns its number. Throws on any GitHub error. */
export async function createSupportIssue(issue: SupportIssue): Promise<number> {
  const repo = process.env.GITHUB_SUPPORT_REPO;
  const token = process.env.GITHUB_SUPPORT_TOKEN;
  if (!repo || !token) throw new Error("support reports are not configured");

  const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "content-type": "application/json",
    },
    body: JSON.stringify(issue),
  });
  if (!res.ok) throw new Error(`GitHub issue creation failed: ${res.status}`);
  const created = (await res.json()) as { number: number };
  return created.number;
}
