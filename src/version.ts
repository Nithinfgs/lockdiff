import type { BumpKind } from "./model.js";

interface Parsed {
  nums: number[];
  pre: boolean;
}

// A suffix only counts as a pre-release when it names one. Platform suffixes such as
// "-darwin-arm64" and build metadata are common on npm and are not pre-releases.
const PRE =
  /^[-.]?(a|b|c|rc|alpha|beta|dev|pre|preview|canary|next|snapshot|nightly|experimental|insiders)(?![a-z])/i;
const GO_PSEUDO = /^-(\d+\.)?\d{14}-[0-9a-f]{12}/;

export function parseVersion(v: string): Parsed {
  const s = v.replace(/^v/i, "");
  const m = /^(\d+(?:\.\d+)*)/.exec(s);
  const nums = m?.[1] ? m[1].split(".").map(Number) : [];
  const rest = m ? s.slice(m[1]?.length ?? 0) : s;
  const pre = PRE.test(rest) || GO_PSEUDO.test(rest);
  return { nums, pre };
}

/** Negative when a < b. Falls back to 0 when the strings are not comparable. */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  const len = Math.max(pa.nums.length, pb.nums.length);
  for (let i = 0; i < len; i++) {
    const d = (pa.nums[i] ?? 0) - (pb.nums[i] ?? 0);
    if (d !== 0) return d;
  }
  if (pa.pre !== pb.pre) return pa.pre ? -1 : 1;
  return 0;
}

export function classifyBump(from: string, to: string): BumpKind {
  const pf = parseVersion(from);
  const pt = parseVersion(to);
  if (pf.nums.length === 0 || pt.nums.length === 0) return "other";
  const cmp = compareVersions(from, to);
  if (cmp > 0) return "downgrade";
  if (cmp === 0) return pf.pre !== pt.pre || from !== to ? "prerelease" : "other";
  const len = Math.max(pf.nums.length, pt.nums.length);
  for (let i = 0; i < len; i++) {
    if ((pf.nums[i] ?? 0) !== (pt.nums[i] ?? 0))
      return i === 0 ? "major" : i === 1 ? "minor" : "patch";
  }
  return pf.pre !== pt.pre ? "prerelease" : "other";
}

export function isPrerelease(v: string): boolean {
  return parseVersion(v).pre;
}
