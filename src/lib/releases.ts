import { marked } from "marked";

/**
 * Release notes live on GitHub. Fetch them once per build so the changelog
 * always matches what was published. This runs at build time, never in the
 * browser, so the markup is fully static.
 */
const SOURCE = "https://api.github.com/repos/scmmishra/rune/releases?per_page=100";

type GitHubRelease = { tag_name: string; html_url: string; published_at: string; body: string | null; draft: boolean };

export type Release = { version: string; url: string; date: string; isoDate: string; summary: string; html: string };

const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

const response = await fetch(SOURCE, { headers });
if (!response.ok) {
  throw new Error(`Could not fetch releases: ${response.status} ${response.statusText}`);
}

const GENERIC_HEADINGS = new Set(["new", "improvements", "fixes", "changed shortcuts", "also new"]);

/** One short line for a release: its first topical heading, else its first bold phrase, else its first sentence. */
function summarize(body: string): string {
  for (const line of body.split("\n").map(line => line.trim()).filter(Boolean)) {
    const heading = line.match(/^#+\s+(.*)/)?.[1];
    if (heading) {
      if (GENERIC_HEADINGS.has(heading.toLowerCase())) continue;
      return heading;
    }
    const bold = line.match(/\*\*(.+?)\*\*/)?.[1];
    return (bold ?? line.replace(/^-\s+/, "").split(". ")[0]).replace(/\.$/, "");
  }
  return "";
}

const dateFormat = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export const releases: Release[] = ((await response.json()) as GitHubRelease[])
  .filter(release => !release.draft)
  .map(release => ({
    version: release.tag_name,
    url: release.html_url,
    date: dateFormat.format(new Date(release.published_at)),
    isoDate: release.published_at.slice(0, 10),
    summary: summarize(release.body ?? ""),
    html: marked.parse(release.body ?? "", { async: false }),
  }));

export const latest = releases[0];
