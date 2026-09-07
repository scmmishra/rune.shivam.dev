/**
 * The app icon lives in the Rune repo. Fetch it once per build so the site
 * always ships whatever is on `main` — this runs at build time, never in the
 * browser, so the markup is fully static.
 */
const SOURCE =
  "https://raw.githubusercontent.com/scmmishra/rune/refs/heads/main/Artwork/AppIcon.svg";

const response = await fetch(SOURCE);
if (!response.ok) {
  throw new Error(`Could not fetch AppIcon.svg: ${response.status} ${response.statusText}`);
}

/** Raw SVG markup, for inlining into the page. */
export const logoSvg = (await response.text()).trim();

/** The same artwork as a data URI, for the <link rel="icon">. */
export const logoDataUri = `data:image/svg+xml;base64,${Buffer.from(logoSvg).toString("base64")}`;
