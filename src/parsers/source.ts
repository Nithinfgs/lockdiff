import type { Source } from "../model.js";

/** Classify an artifact URL / spec into a Source. */
export function sourceFromUrl(raw: string | undefined): Source | undefined {
  if (!raw) return undefined;
  if (raw.startsWith("git+") || raw.startsWith("git://") || raw.endsWith(".git")) {
    return { kind: "git", host: hostOf(raw.replace(/^git\+/, "")) };
  }
  if (raw.startsWith("file:") || raw.startsWith("link:") || raw.startsWith("workspace:")) {
    return { kind: "path" };
  }
  if (/^https?:\/\//i.test(raw)) {
    const host = hostOf(raw);
    // Tarballs served by code hosts are git sources in disguise.
    if (host === "codeload.github.com" || host === "github.com" || host === "gitlab.com") {
      return { kind: "git", host, insecure: raw.startsWith("http:") };
    }
    return { kind: "registry", host, insecure: raw.toLowerCase().startsWith("http:") };
  }
  return undefined;
}

export function hostOf(url: string): string | undefined {
  const m = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]*@)?([^/:?#]+)/i.exec(url);
  return m?.[1]?.toLowerCase();
}

/** Normalise a hash for comparison across spellings (sha512-xxx vs sha512:xxx). */
export function normHash(h: string): string {
  return h.trim();
}
