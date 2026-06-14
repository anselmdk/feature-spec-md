import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expandFilePatterns } from "./filePatterns.js";
export { expandFilePatterns } from "./filePatterns.js";
export { renderHtmlReport } from "./reportTemplate.js";
export { collectSpecScreenshots } from "./screenshots.js";
export type {
  CoverageItem,
  CoverageSummary,
  FeatureFrontmatter,
  FeatureRule,
  FeatureScenario,
  FeatureSpec,
  FeatureStep,
  RuleKeyword,
  SpecScreenshot,
  StepKeyword,
  TestReference,
  ValidationIssue,
} from "./types.js";
import type {
  CoverageItem,
  CoverageSummary,
  FeatureFrontmatter,
  FeatureRule,
  FeatureScenario,
  FeatureSpec,
  RuleKeyword,
  StepKeyword,
  TestReference,
  ValidationIssue,
} from "./types.js";

const scenarioIdPattern = /\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-S\d{3}\b/g;
const ruleIdPattern = /\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-R\d{3}\b/g;
const ruleKeywords: RuleKeyword[] = [
  "MUST NOT",
  "SHOULD NOT",
  "MUST",
  "SHOULD",
  "MAY",
  "OPTIONAL",
];

/** Parse one feature spec Markdown document into structured metadata, rules, and scenarios. */
export function parseFeatureSpec(
  source: string,
  options: { filePath?: string } = {},
): FeatureSpec {
  const filePath = options.filePath ?? "<inline>";
  const normalized = source.replace(/\r\n/g, "\n");

  if (!normalized.startsWith("---\n")) {
    throw new Error(
      "Feature spec must start with frontmatter delimited by ---. ",
    );
  }

  const endIndex = normalized.indexOf("\n---\n", 4);
  if (endIndex === -1) {
    throw new Error(
      "Feature spec frontmatter must end with a second --- delimiter.",
    );
  }

  const frontmatter = parseFrontmatter(normalized.slice(4, endIndex));
  if (!frontmatter.id || !frontmatter.title) {
    throw new Error("Feature spec frontmatter must contain id and title.");
  }

  const body = normalized.slice(endIndex + 5);
  const bodyStartLine = normalized.slice(0, endIndex + 5).split("\n").length;
  const lines = body.split("\n");

  return {
    filePath,
    frontmatter: frontmatter as FeatureFrontmatter,
    title:
      lines
        .find((line) => line.startsWith("# "))
        ?.replace(/^#\s+/, "")
        .trim() ?? frontmatter.title,
    purpose: sectionText(lines, "Purpose").trim(),
    rules: parseRules(lines, bodyStartLine),
    scenarios: parseScenarios(lines, bodyStartLine),
    source,
  };
}

/** Validate spec structure, ID prefixes, duplicate IDs, and required sections. */
export function validateFeatureSpec(spec: FeatureSpec): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Map<string, number>();

  if (!/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*$/.test(spec.frontmatter.id)) {
    issues.push(
      issue(
        spec,
        "invalid-feature-id",
        "error",
        `Feature id "${spec.frontmatter.id}" must use uppercase words separated by hyphens.`,
      ),
    );
  }

  if (spec.title !== spec.frontmatter.title) {
    issues.push(
      issue(
        spec,
        "title-mismatch",
        "warning",
        "The H1 title should match frontmatter.title.",
      ),
    );
  }

  if (!spec.purpose) {
    issues.push(
      issue(
        spec,
        "missing-purpose",
        "error",
        "Feature spec must include a non-empty ## Purpose section.",
      ),
    );
  }

  if (spec.scenarios.length === 0) {
    issues.push(
      issue(
        spec,
        "missing-scenarios",
        "error",
        "Feature spec must include at least one scenario.",
      ),
    );
  }

  for (const rule of spec.rules) {
    if (!rule.id.startsWith(`${spec.frontmatter.id}-`)) {
      issues.push(
        issue(
          spec,
          "wrong-rule-prefix",
          "error",
          `Rule id "${rule.id}" must start with ${spec.frontmatter.id}-.`,
          rule.line,
        ),
      );
    }

    if (!rule.keyword) {
      issues.push(
        issue(
          spec,
          "missing-rule-keyword",
          "warning",
          `Rule "${rule.id}" should use MUST, MUST NOT, SHOULD, SHOULD NOT, MAY, or OPTIONAL.`,
          rule.line,
        ),
      );
    }

    registerId(spec, issues, seen, rule.id, rule.line);
  }

  for (const scenario of spec.scenarios) {
    if (!scenario.id.startsWith(`${spec.frontmatter.id}-`)) {
      issues.push(
        issue(
          spec,
          "wrong-scenario-prefix",
          "error",
          `Scenario id "${scenario.id}" must start with ${spec.frontmatter.id}-.`,
          scenario.line,
        ),
      );
    }

    for (const keyword of ["Given", "When", "Then"] as const) {
      if (!scenario.steps.some((step) => step.keyword === keyword)) {
        issues.push(
          issue(
            spec,
            `missing-${keyword.toLowerCase()}`,
            "warning",
            `Scenario "${scenario.id}" should include a ${keyword} step.`,
            scenario.line,
          ),
        );
      }
    }

    registerId(spec, issues, seen, scenario.id, scenario.line);
  }

  return issues;
}

/** Find rule and scenario IDs referenced by one test source file. */
export function parseTestReferences(
  source: string,
  filePath = "<inline>",
): TestReference[] {
  const lines = source.split(/\r?\n/);
  const refs: TestReference[] = [];

  for (const match of source.matchAll(scenarioIdPattern)) {
    refs.push({
      id: match[0],
      filePath,
      line: lineForOffset(lines, match.index ?? 0),
      kind: "scenario",
      source: sourceForMatch(source, match.index ?? 0),
    });
  }

  for (const match of source.matchAll(ruleIdPattern)) {
    refs.push({
      id: match[0],
      filePath,
      line: lineForOffset(lines, match.index ?? 0),
      kind: "rule",
      source: sourceForMatch(source, match.index ?? 0),
    });
  }

  return dedupe(refs);
}

/** Expand test file globs and collect all rule and scenario references from them. */
export async function collectTestReferences(patterns: string[]) {
  const refs: TestReference[] = [];
  for (const file of await expandFilePatterns(patterns)) {
    refs.push(...parseTestReferences(await readFile(file, "utf8"), file));
  }
  return refs;
}

/** Build rule and scenario coverage from parsed specs and collected test references. */
export function buildCoverageSummary(
  specs: FeatureSpec[],
  references: TestReference[],
): CoverageSummary {
  const scenarios = new Map(
    specs.flatMap((spec) =>
      spec.scenarios.map(
        (scenario) => [scenario.id, { spec, scenario }] as const,
      ),
    ),
  );
  const rules = new Map(
    specs.flatMap((spec) =>
      spec.rules.map((rule) => [rule.id, { spec, rule }] as const),
    ),
  );
  const scenarioRefs = references.filter((ref) => ref.kind === "scenario");
  const ruleRefs = references.filter((ref) => ref.kind === "rule");

  return {
    scenarioCoverage: Array.from(scenarios.entries()).map(([id, value]) =>
      item(
        id,
        value.scenario.title,
        value.spec.filePath,
        value.scenario.line,
        scenarioRefs,
      ),
    ),
    ruleCoverage: Array.from(rules.entries()).map(([id, value]) =>
      item(id, value.rule.text, value.spec.filePath, value.rule.line, ruleRefs),
    ),
    orphanScenarioReferences: scenarioRefs.filter(
      (ref) => !scenarios.has(ref.id),
    ),
    orphanRuleReferences: ruleRefs.filter((ref) => !rules.has(ref.id)),
  };
}

/** Validate coverage expectations and orphaned references. */
export function validateCoverage(
  coverage: CoverageSummary,
  options: {
    requireRuleCoverage?: boolean;
    requireScenarioCoverage?: boolean;
  } = {},
) {
  const issues: ValidationIssue[] = [];

  if (options.requireScenarioCoverage ?? true) {
    for (const item of coverage.scenarioCoverage.filter(
      (item) => !item.covered,
    )) {
      issues.push({
        code: "missing-scenario-coverage",
        severity: "error",
        message: `Scenario "${item.id}" has no matching test reference.`,
        filePath: item.filePath,
        line: item.line,
      });
    }
  }

  if (options.requireRuleCoverage ?? false) {
    for (const item of coverage.ruleCoverage.filter((item) => !item.covered)) {
      issues.push({
        code: "missing-rule-coverage",
        severity: "error",
        message: `Rule "${item.id}" has no matching test reference.`,
        filePath: item.filePath,
        line: item.line,
      });
    }
  }

  for (const ref of coverage.orphanScenarioReferences) {
    issues.push({
      code: "orphan-scenario-reference",
      severity: "error",
      message: `Test references unknown scenario "${ref.id}".`,
      filePath: ref.filePath,
      line: ref.line,
    });
  }

  for (const ref of coverage.orphanRuleReferences) {
    issues.push({
      code: "orphan-rule-reference",
      severity: "error",
      message: `Test references unknown rule "${ref.id}".`,
      filePath: ref.filePath,
      line: ref.line,
    });
  }

  return issues;
}

/** Load and parse all feature specs matching the provided globs. */
export async function loadFeatureSpecs(patterns: string[]) {
  const specs: FeatureSpec[] = [];
  for (const file of await expandFilePatterns(patterns)) {
    specs.push(
      parseFeatureSpec(await readFile(file, "utf8"), { filePath: file }),
    );
  }
  return specs;
}

/** Run spec validation and optional test coverage validation in one call. */
export async function checkFeatureSpecs(options: {
  specs: string[];
  tests?: string[];
  requireRuleCoverage?: boolean;
  requireScenarioCoverage?: boolean;
}) {
  const specs = await loadFeatureSpecs(options.specs);
  const validationIssues = specs.flatMap(validateFeatureSpec);
  const coverage = options.tests?.length
    ? buildCoverageSummary(specs, await collectTestReferences(options.tests))
    : undefined;
  const coverageIssues = coverage
    ? validateCoverage(coverage, {
        requireRuleCoverage: options.requireRuleCoverage,
        requireScenarioCoverage: options.requireScenarioCoverage,
      })
    : [];

  return {
    specs,
    validationIssues,
    coverage,
    coverageIssues,
    ok: ![...validationIssues, ...coverageIssues].some(
      (i) => i.severity === "error",
    ),
  };
}

/** Write text content to a path, creating the parent directory when needed. */
export async function writeTextFile(filePath: string, content: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

function parseFrontmatter(source: string) {
  const data: Record<string, string> = {};
  for (const line of source.split("\n")) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (match)
      data[match[1]] = match[2]
        .replace(/^[']|[']$/g, "")
        .replace(/^["]|["]$/g, "")
        .trim();
  }
  return data;
}

function sectionBounds(lines: string[], heading: string) {
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

function sectionText(lines: string[], heading: string) {
  const bounds = sectionBounds(lines, heading);
  return bounds ? lines.slice(bounds.start, bounds.end).join("\n") : "";
}

function parseRules(lines: string[], bodyStartLine: number) {
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
      strength: strength(keyword),
      line: bodyStartLine + i,
    });
  }

  return rules;
}

function parseScenarios(lines: string[], bodyStartLine: number) {
  const scenarios: FeatureScenario[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(
      /^###\s+([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-S\d{3}):\s+(.+)$/,
    );
    if (!match) continue;
    const steps: FeatureScenario["steps"] = [];

    for (let j = i + 1; j < lines.length; j += 1) {
      if (/^##?#\s+/.test(lines[j])) break;
      const step = lines[j].trim().match(/^(Given|When|Then|And|But)\s+(.+)$/);
      if (step)
        steps.push({
          keyword: step[1] as StepKeyword,
          text: step[2].trim(),
          line: bodyStartLine + j,
        });
    }

    scenarios.push({
      id: match[1],
      title: match[2].trim(),
      line: bodyStartLine + i,
      steps,
    });
  }

  return scenarios;
}

function strength(keyword?: RuleKeyword): FeatureRule["strength"] {
  if (keyword === "MUST" || keyword === "MUST NOT") return "required";
  if (keyword === "SHOULD" || keyword === "SHOULD NOT") return "recommended";
  if (keyword === "MAY" || keyword === "OPTIONAL") return "optional";
  return "unspecified";
}

function issue(
  spec: FeatureSpec,
  code: string,
  severity: ValidationIssue["severity"],
  message: string,
  line?: number,
): ValidationIssue {
  return { code, severity, message, filePath: spec.filePath, line };
}

function registerId(
  spec: FeatureSpec,
  issues: ValidationIssue[],
  seen: Map<string, number>,
  id: string,
  line: number,
) {
  const previous = seen.get(id);
  if (previous)
    issues.push(
      issue(
        spec,
        "duplicate-id",
        "error",
        `Duplicate id "${id}". First occurrence is on line ${previous}.`,
        line,
      ),
    );
  seen.set(id, line);
}

function item(
  id: string,
  title: string,
  filePath: string,
  line: number,
  refs: TestReference[],
): CoverageItem {
  const references = refs.filter((ref) => ref.id === id);
  return {
    id,
    title,
    filePath,
    line,
    references,
    covered: references.length > 0,
  };
}

function lineForOffset(lines: string[], offset: number) {
  let consumed = 0;
  for (const [index, line] of lines.entries()) {
    consumed += line.length + 1;
    if (consumed > offset) return index + 1;
  }
  return lines.length;
}

function sourceForMatch(
  source: string,
  offset: number,
): TestReference["source"] {
  const before = source.slice(Math.max(0, offset - 80), offset);
  const context = source.slice(Math.max(0, offset - 80), offset + 80);
  if (/covers\s*:\s*\[[^\]]*$/.test(before)) return "covers";
  if (
    /tag\s*:\s*\[[^\]]*$/.test(before) ||
    /@/.test(source.slice(Math.max(0, offset - 2), offset + 2))
  )
    return "tag";
  if (/annotation/.test(context)) return "annotation";
  if (/test|scenario/.test(before.slice(-40))) return "title";
  return "free-text";
}

function dedupe(refs: TestReference[]) {
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = `${ref.kind}:${ref.id}:${ref.filePath}:${ref.line}:${ref.source}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
