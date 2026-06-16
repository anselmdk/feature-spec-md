/**
 * Shared Markdown parsing primitives for frontmatter, sections, rules, stable
 * IDs, line numbers, and test-reference deduplication.
 */
import type { FeatureRule, RuleKeyword, TestReference } from "./types.js";

export const modelIdPattern = /\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-M\d{3}\b/g;
export const ruleIdPattern = /\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-R\d{3}\b/g;
export const scenarioIdPattern = /\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-S\d{3}\b/g;

const ruleKeywords: RuleKeyword[] = [
  "MUST NOT",
  "SHOULD NOT",
  "MUST",
  "SHOULD",
  "MAY",
  "OPTIONAL",
];

export type ParsedMarkdownDocument = {
  frontmatter: Record<string, string>;
  lines: string[];
  bodyStartLine: number;
  title: string;
  purpose: string;
};

export function parseMarkdownDocument(
  source: string,
  documentName = "Spec document",
): ParsedMarkdownDocument {
  const normalized = source.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    throw new Error(
      `${documentName} must start with frontmatter delimited by ---. `,
    );
  }

  const endIndex = normalized.indexOf("\n---\n", 4);
  if (endIndex === -1) {
    throw new Error(
      `${documentName} frontmatter must end with a second --- delimiter.`,
    );
  }

  const frontmatter = parseFrontmatter(normalized.slice(4, endIndex));
  if (!frontmatter.id || !frontmatter.title) {
    throw new Error(`${documentName} frontmatter must contain id and title.`);
  }

  const body = normalized.slice(endIndex + 5);
  const lines = body.split("\n");
  const bodyStartLine = normalized.slice(0, endIndex + 5).split("\n").length;

  return {
    frontmatter,
    lines,
    bodyStartLine,
    title:
      lines
        .find((line) => line.startsWith("# "))
        ?.replace(/^#\s+/, "")
        .trim() ?? frontmatter.title,
    purpose: sectionText(lines, "Purpose").trim(),
  };
}

export function sectionBounds(lines: string[], heading: string) {
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^##\s+/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return { start: start + 1, end };
}

export function sectionText(lines: string[], heading: string) {
  const bounds = sectionBounds(lines, heading);
  return bounds ? lines.slice(bounds.start, bounds.end).join("\n") : "";
}

export function parseRuleItems(
  lines: string[],
  bodyStartLine: number,
): FeatureRule[] {
  const bounds = sectionBounds(lines, "Rules");
  if (!bounds) return [];
  const rules: FeatureRule[] = [];

  for (let i = bounds.start; i < bounds.end; i += 1) {
    const match = lines[i].match(
      /^\s*-\s+([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-R\d{3}):\s+(.+)$/,
    );
    if (!match) continue;

    const keyword = ruleKeywords.find((kw) =>
      match[2].toUpperCase().includes(kw),
    );
    rules.push({
      id: match[1],
      text: match[2].trim(),
      keyword,
      strength: ruleStrength(keyword),
      line: bodyStartLine + i,
    });
  }

  return rules;
}

export function trimBlankLines(lines: string[]) {
  let start = 0;
  let end = lines.length;
  while (start < end && !lines[start].trim()) start += 1;
  while (end > start && !lines[end - 1].trim()) end -= 1;
  return lines.slice(start, end);
}

export function lineForOffset(lines: string[], offset: number) {
  let consumed = 0;
  for (const [index, line] of lines.entries()) {
    consumed += line.length + 1;
    if (consumed > offset) return index + 1;
  }
  return lines.length;
}

export function dedupeTestReferences(refs: TestReference[]) {
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = `${ref.kind}:${ref.id}:${ref.filePath}:${ref.line}:${ref.source}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseFrontmatter(source: string) {
  const data: Record<string, string> = {};
  for (const line of source.split("\n")) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (match) {
      data[match[1]] = match[2]
        .replace(/^[']|[']$/g, "")
        .replace(/^["]|["]$/g, "")
        .trim();
    }
  }
  return data;
}

function ruleStrength(keyword?: RuleKeyword): FeatureRule["strength"] {
  if (keyword === "MUST" || keyword === "MUST NOT") return "required";
  if (keyword === "SHOULD" || keyword === "SHOULD NOT") return "recommended";
  if (keyword === "MAY" || keyword === "OPTIONAL") return "optional";
  return "unspecified";
}
