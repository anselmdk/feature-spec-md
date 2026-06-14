import { glob, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type FeatureSpec = {
  filePath: string;
  frontmatter: FeatureFrontmatter;
  title: string;
  purpose: string;
  rules: FeatureRule[];
  scenarios: FeatureScenario[];
  source: string;
};

export type FeatureFrontmatter = {
  id: string;
  title: string;
  status?: "draft" | "active" | "deprecated";
  owner?: string;
};

export type FeatureRule = {
  id: string;
  text: string;
  keyword?: RuleKeyword;
  strength: "required" | "recommended" | "optional" | "unspecified";
  line: number;
};

export type FeatureScenario = {
  id: string;
  title: string;
  line: number;
  steps: FeatureStep[];
};

export type RuleKeyword =
  | "MUST"
  | "MUST NOT"
  | "SHOULD"
  | "SHOULD NOT"
  | "MAY"
  | "OPTIONAL";
export type StepKeyword = "Given" | "When" | "Then" | "And" | "But";

export type FeatureStep = {
  keyword: StepKeyword;
  text: string;
  line: number;
};

export type ValidationIssue = {
  code: string;
  severity: "error" | "warning";
  message: string;
  filePath?: string;
  line?: number;
};

export type TestReference = {
  id: string;
  filePath: string;
  line: number;
  kind: "scenario" | "rule";
  source: "title" | "tag" | "covers" | "annotation" | "free-text";
};

export type CoverageItem = {
  id: string;
  title?: string;
  filePath?: string;
  line?: number;
  covered: boolean;
  references: TestReference[];
};

export type CoverageSummary = {
  scenarioCoverage: CoverageItem[];
  ruleCoverage: CoverageItem[];
  orphanScenarioReferences: TestReference[];
  orphanRuleReferences: TestReference[];
};

export type SpecScreenshot = {
  specPath: string;
  line: number;
  path: string;
  title?: string;
  testPath?: string;
};

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

export async function collectTestReferences(patterns: string[]) {
  const refs: TestReference[] = [];
  for (const file of await expandFilePatterns(patterns)) {
    refs.push(...parseTestReferences(await readFile(file, "utf8"), file));
  }
  return refs;
}

export async function collectSpecScreenshots(patterns: string[]) {
  const screenshots: SpecScreenshot[] = [];
  for (const file of await expandArtifactPatterns(patterns)) {
    const parsed = JSON.parse(await readFile(file, "utf8")) as unknown;
    const entries = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed.screenshots)
        ? parsed.screenshots
        : [];

    for (const entry of entries) {
      const screenshot = normalizeScreenshot(entry);
      if (screenshot) screenshots.push(screenshot);
    }
  }
  return screenshots;
}

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

export async function loadFeatureSpecs(patterns: string[]) {
  const specs: FeatureSpec[] = [];
  for (const file of await expandFilePatterns(patterns)) {
    specs.push(
      parseFeatureSpec(await readFile(file, "utf8"), { filePath: file }),
    );
  }
  return specs;
}

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

export function renderHtmlReport(
  specs: FeatureSpec[],
  options: {
    coverage?: CoverageSummary;
    screenshots?: SpecScreenshot[];
    validationIssues?: ValidationIssue[];
    title?: string;
    generatedAt?: string;
  } = {},
) {
  const title = options.title ?? "Feature Spec Report";
  const issues = options.validationIssues ?? [];

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${html(title)}</title><style>body{font-family:system-ui,sans-serif;max-width:1180px;margin:0 auto;padding:40px 24px;color:#1f2328}.panel{border:1px solid #d0d7de;border-radius:8px;padding:20px;margin:18px 0}.ok{color:#1a7f37}.missing,.error{color:#cf222e}.warning{color:#9a6700}.badge{border:1px solid #d0d7de;border-radius:999px;padding:2px 8px;font-size:12px;white-space:nowrap}.step{border-left:3px solid #d0d7de;margin:12px 0;padding:2px 0 2px 12px}.step p{margin:8px 0}.screenshots{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin:10px 0 14px}.screenshot{border:1px solid #d0d7de;border-radius:8px;overflow:hidden;background:#f6f8fa}.screenshot img{display:block;width:100%;height:auto}.screenshot figcaption{font-size:12px;padding:8px;color:#57606a}</style></head><body><h1>${html(title)}</h1><p>Generated ${html(options.generatedAt ?? new Date().toISOString())}.</p>${renderIssues(issues)}${specs.map((spec) => renderSpec(spec, options.coverage, options.screenshots ?? [])).join("")}</body></html>`;
}

export async function writeTextFile(filePath: string, content: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

export async function expandFilePatterns(patterns: string[]) {
  const files = new Set<string>();
  for (const pattern of patterns) {
    for await (const file of glob(pattern, {
      exclude: ["node_modules/**", ".git/**", "dist/**", "test-results/**"],
    })) {
      files.add(file);
    }
  }
  return Array.from(files).sort();
}

async function expandArtifactPatterns(patterns: string[]) {
  const files = new Set<string>();
  for (const pattern of patterns) {
    for await (const file of glob(pattern, {
      exclude: ["node_modules/**", ".git/**", "dist/**"],
    })) {
      files.add(file);
    }
  }
  return Array.from(files).sort();
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

function renderIssues(issues: ValidationIssue[]) {
  if (!issues.length)
    return `<section class="panel"><h2>Validation</h2><p class="ok">No validation issues found.</p></section>`;
  return `<section class="panel"><h2>Validation</h2><ul>${issues.map((i) => `<li class="${i.severity}"><code>${html(`${i.filePath ?? ""}${i.line ? `:${i.line}` : ""}`)}</code> ${html(i.message)}</li>`).join("")}</ul></section>`;
}

function renderSpec(
  spec: FeatureSpec,
  coverage?: CoverageSummary,
  screenshots: SpecScreenshot[] = [],
) {
  const screenshotsByLine = groupScreenshotsByLine(screenshots);
  return `<section class="panel"><p><span class="badge">${html(spec.frontmatter.status ?? "draft")}</span></p><h2>${html(spec.frontmatter.id)} ${html(spec.title)}</h2><p>${html(spec.purpose)}</p><h3>Rules</h3><ul>${spec.rules.map((r) => `<li><code>${html(r.id)}</code>: ${html(r.text)} ${coverageBadge(coverage?.ruleCoverage.find((i) => i.id === r.id)?.covered)}</li>`).join("")}</ul><h3>Scenarios</h3>${spec.scenarios.map((s) => `<article class="panel"><h4><code>${html(s.id)}</code>: ${html(s.title)} ${coverageBadge(coverage?.scenarioCoverage.find((i) => i.id === s.id)?.covered)}</h4>${s.steps.map((step) => renderStep(spec, step, screenshotsByLine)).join("")}</article>`).join("")}</section>`;
}

function renderStep(
  spec: FeatureSpec,
  step: FeatureStep,
  screenshotsByLine: Map<string, SpecScreenshot[]>,
) {
  const screenshots =
    screenshotsByLine.get(screenshotKey(spec.filePath, step.line)) ?? [];
  return `<div class="step"><p><strong>${html(step.keyword)}</strong> ${html(step.text)} <span class="badge">line ${step.line}</span> ${screenshots.length ? `<span class="badge ok">${screenshots.length} screenshot${screenshots.length === 1 ? "" : "s"}</span>` : `<span class="badge missing">missing screenshot</span>`}</p>${renderScreenshots(screenshots)}</div>`;
}

function renderScreenshots(screenshots: SpecScreenshot[]) {
  if (!screenshots.length) return "";
  return `<div class="screenshots">${screenshots.map((screenshot) => `<figure class="screenshot"><img src="${html(screenshot.path)}" alt="${html(screenshot.title ?? `Screenshot for ${screenshot.specPath}:${screenshot.line}`)}"><figcaption>${html(screenshot.title ?? `${screenshot.specPath}:${screenshot.line}`)}</figcaption></figure>`).join("")}</div>`;
}

function coverageBadge(covered?: boolean) {
  return covered === undefined
    ? ""
    : covered
      ? `<span class="badge ok">covered</span>`
      : `<span class="badge missing">missing coverage</span>`;
}

function html(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function groupScreenshotsByLine(screenshots: SpecScreenshot[]) {
  const grouped = new Map<string, SpecScreenshot[]>();
  for (const screenshot of screenshots) {
    const key = screenshotKey(screenshot.specPath, screenshot.line);
    grouped.set(key, [...(grouped.get(key) ?? []), screenshot]);
  }
  return grouped;
}

function screenshotKey(filePath: string, line: number) {
  return `${normalizeFilePath(filePath)}:${line}`;
}

function normalizeFilePath(filePath: string) {
  return filePath.replace(/\\/g, "/").replace(/^\.\//, "");
}

function normalizeScreenshot(value: unknown): SpecScreenshot | null {
  if (!isRecord(value)) return null;
  const specPath = value.specPath;
  const line = value.line;
  const imagePath = value.path ?? value.imagePath;
  if (
    typeof specPath !== "string" ||
    typeof line !== "number" ||
    typeof imagePath !== "string"
  ) {
    return null;
  }
  return {
    specPath: normalizeFilePath(specPath),
    line,
    path: imagePath,
    title: typeof value.title === "string" ? value.title : undefined,
    testPath: typeof value.testPath === "string" ? value.testPath : undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
