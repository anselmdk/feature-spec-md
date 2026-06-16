/**
 * Feature-spec parsing, validation, test-reference extraction, and coverage
 * checks for `*.feature.md` documents.
 */
import { readFile } from "node:fs/promises";
import { expandFilePatterns } from "./filePatterns.js";
import {
  dedupeTestReferences,
  lineForOffset,
  parseMarkdownDocument,
  parseRuleItems,
  ruleIdPattern,
  scenarioIdPattern,
} from "./specMarkdown.js";
import type {
  CoverageItem,
  CoverageSummary,
  FeatureFrontmatter,
  FeatureScenario,
  FeatureSpec,
  StepKeyword,
  TestReference,
  ValidationIssue,
} from "./types.js";

/** Parse one feature spec Markdown document into structured metadata, rules, and scenarios. */
export function parseFeatureSpec(
  source: string,
  options: { filePath?: string } = {},
): FeatureSpec {
  const filePath = options.filePath ?? "<inline>";
  const parsed = parseMarkdownDocument(source, "Feature spec");

  return {
    filePath,
    frontmatter: parsed.frontmatter as FeatureFrontmatter,
    title: parsed.title,
    purpose: parsed.purpose,
    rules: parseRuleItems(parsed.lines, parsed.bodyStartLine),
    scenarios: parseScenarios(parsed.lines, parsed.bodyStartLine),
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

  return dedupeTestReferences(refs);
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
