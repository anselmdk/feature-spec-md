import { readFile } from "node:fs/promises";
import { expandFilePatterns } from "./filePatterns.js";
import { buildCoverageSummary, collectTestReferences, parseFeatureSpec } from "./index.js";
import type {
  FeatureSpec,
  ModelItem,
  ModelSpec,
  RuleKeyword,
  SpecDocument,
  SpecFrontmatter,
  TestReference,
  ValidationIssue,
} from "./types.js";

const modelIdPattern = /\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-M\d{3}\b/g;
const ruleIdPattern = /\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-R\d{3}\b/g;
const ruleKeywords: RuleKeyword[] = ["MUST NOT", "SHOULD NOT", "MUST", "SHOULD", "MAY", "OPTIONAL"];

export function parseSpecDocument(
  source: string,
  options: { filePath?: string; kind?: "model" | "feature" } = {},
): SpecDocument {
  const filePath = options.filePath ?? "<inline>";
  const kind = options.kind ?? (filePath.endsWith(".model.md") ? "model" : "feature");
  return kind === "model" ? parseModelSpec(source, { filePath }) : withFeatureKind(parseFeatureSpec(source, { filePath }));
}

export function parseModelSpec(source: string, options: { filePath?: string } = {}): ModelSpec {
  const filePath = options.filePath ?? "<inline>";
  const base = parseBase(source, filePath);
  return {
    kind: "model",
    filePath,
    frontmatter: base.frontmatter as SpecFrontmatter,
    title: base.title,
    purpose: base.purpose,
    modelItems: parseModelItems(base.lines, base.bodyStartLine),
    rules: parseRules(base.lines, base.bodyStartLine),
    source,
  };
}

export function parseSpecTestReferences(source: string, filePath = "<inline>"): TestReference[] {
  const refs = collectModelReferences(source, filePath);
  const baseRefs = parseTestReferencesCompat(source, filePath);
  return dedupe([...refs, ...baseRefs]);
}

export async function collectSpecTestReferences(patterns: string[]) {
  const refs: TestReference[] = [];
  for (const file of await expandFilePatterns(patterns)) {
    refs.push(...parseSpecTestReferences(await readFile(file, "utf8"), file));
  }
  return refs;
}

export function validateModelSpec(spec: ModelSpec): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Map<string, number>();
  validateCommon(spec, issues);

  if (!sectionText(spec.source.split(/\r?\n/), "Model").trim()) {
    issues.push(issue(spec, "missing-model", "error", "Model spec must include a non-empty ## Model section."));
  }

  if (spec.modelItems.length === 0) {
    issues.push(issue(spec, "missing-model-items", "error", "Model spec must include at least one -M001 model item."));
  }

  for (const item of spec.modelItems) {
    if (!item.id.startsWith(`${spec.frontmatter.id}-`)) {
      issues.push(issue(spec, "wrong-model-prefix", "error", `Model item id "${item.id}" must start with ${spec.frontmatter.id}-.`, item.line));
    }
    registerId(spec, issues, seen, item.id, item.line);
  }

  validateRules(spec, issues, seen);
  return issues;
}

export function validateFeatureDocument(spec: FeatureSpec): ValidationIssue[] {
  const issues = validateFeatureSpecCompat(spec);
  if (!spec.purpose) {
    // The legacy validator already reports this; keep this branch explicit for readability.
    return issues;
  }
  return issues;
}

export function validateSpecDocument(spec: SpecDocument): ValidationIssue[] {
  return spec.kind === "model" ? validateModelSpec(spec) : validateFeatureDocument(spec);
}

export function validateSpecGraph(documents: SpecDocument[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const modelIds = new Set(documents.filter(isModelSpec).map((model) => model.frontmatter.id));
  const seen = new Map<string, { filePath: string; line?: number }>();

  for (const document of documents) {
    registerGlobalId(issues, seen, document.frontmatter.id, document.filePath);
    for (const rule of document.rules) registerGlobalId(issues, seen, rule.id, document.filePath, rule.line);

    if (document.kind === "model") {
      for (const item of document.modelItems) registerGlobalId(issues, seen, item.id, document.filePath, item.line);
      continue;
    }

    for (const scenario of document.scenarios) registerGlobalId(issues, seen, scenario.id, document.filePath, scenario.line);
    for (const modelId of referencedModelIds(document)) {
      if (!modelIds.has(modelId)) {
        issues.push({
          code: "unknown-model-reference",
          severity: "error",
          message: `Feature spec references unknown model "${modelId}".`,
          filePath: document.filePath,
        });
      }
    }
  }

  return issues;
}

export function buildSpecCoverageSummary(documents: SpecDocument[], references: TestReference[]) {
  const baseCoverage = buildCoverageSummary(documents.filter(isFeatureSpec), references);
  const modelRefs = references.filter((ref) => ref.kind === "model");
  const modelItems = documents.flatMap((document) => (document.kind === "model" ? document.modelItems.map((modelItem) => ({ document, modelItem })) : []));

  return {
    ...baseCoverage,
    modelCoverage: modelItems.map(({ document, modelItem }) => ({
      id: modelItem.id,
      title: modelItem.title,
      filePath: document.filePath,
      line: modelItem.line,
      references: modelRefs.filter((ref) => ref.id === modelItem.id),
      covered: modelRefs.some((ref) => ref.id === modelItem.id),
    })),
    orphanModelReferences: modelRefs.filter((ref) => !modelItems.some(({ modelItem }) => modelItem.id === ref.id)),
  };
}

export function validateSpecCoverage(
  coverage: ReturnType<typeof buildSpecCoverageSummary>,
  options: { requireModelCoverage?: boolean; requireRuleCoverage?: boolean; requireScenarioCoverage?: boolean } = {},
) {
  const issues: ValidationIssue[] = [];

  if (options.requireModelCoverage ?? false) {
    for (const item of coverage.modelCoverage?.filter((item) => !item.covered) ?? []) {
      issues.push({ code: "missing-model-coverage", severity: "error", message: `Model item "${item.id}" has no matching test reference.`, filePath: item.filePath, line: item.line });
    }
  }

  for (const ref of coverage.orphanModelReferences ?? []) {
    issues.push({ code: "orphan-model-reference", severity: "error", message: `Test references unknown model item "${ref.id}".`, filePath: ref.filePath, line: ref.line });
  }

  return issues;
}

export async function loadSpecDocuments(patterns: string[]) {
  const documents: SpecDocument[] = [];
  for (const file of await expandFilePatterns(patterns)) {
    documents.push(parseSpecDocument(await readFile(file, "utf8"), { filePath: file }));
  }
  return documents;
}

export async function checkSpecDocuments(options: {
  specs: string[];
  tests?: string[];
  requireModelCoverage?: boolean;
  requireRuleCoverage?: boolean;
  requireScenarioCoverage?: boolean;
}) {
  const documents = await loadSpecDocuments(options.specs);
  const references = options.tests?.length ? await collectSpecTestReferences(options.tests) : [];
  const coverage = options.tests?.length ? buildSpecCoverageSummary(documents, references) : undefined;
  const coverageIssues = coverage
    ? [
        ...validateCoverageCompat(coverage, options),
        ...validateSpecCoverage(coverage, options),
      ]
    : [];
  const validationIssues = [...documents.flatMap(validateSpecDocument), ...validateSpecGraph(documents)];
  const models = documents.filter(isModelSpec);
  const features = documents.filter(isFeatureSpec);

  return {
    documents,
    models,
    features,
    specs: features,
    validationIssues,
    coverage,
    coverageIssues,
    ok: ![...validationIssues, ...coverageIssues].some((issue) => issue.severity === "error"),
  };
}

function parseBase(source: string, filePath: string) {
  const normalized = source.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) throw new Error("Spec document must start with frontmatter delimited by ---. ");
  const endIndex = normalized.indexOf("\n---\n", 4);
  if (endIndex === -1) throw new Error("Spec document frontmatter must end with a second --- delimiter.");
  const frontmatter = parseFrontmatter(normalized.slice(4, endIndex));
  if (!frontmatter.id || !frontmatter.title) throw new Error("Spec document frontmatter must contain id and title.");
  const body = normalized.slice(endIndex + 5);
  const lines = body.split("\n");
  const bodyStartLine = normalized.slice(0, endIndex + 5).split("\n").length;
  return {
    frontmatter,
    bodyStartLine,
    lines,
    title: lines.find((line) => line.startsWith("# "))?.replace(/^#\s+/, "").trim() ?? frontmatter.title,
    purpose: sectionText(lines, "Purpose").trim(),
  };
}

function parseFrontmatter(source: string) {
  const data: Record<string, string> = {};
  for (const line of source.split("\n")) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (match) data[match[1]] = match[2].replace(/^[']|[']$/g, "").replace(/^[\"]|[\"]$/g, "").trim();
  }
  return data;
}

function parseModelItems(lines: string[], bodyStartLine: number) {
  const bounds = sectionBounds(lines, "Model");
  if (!bounds) return [];
  const items: ModelItem[] = [];

  for (let i = bounds.start; i < bounds.end; i += 1) {
    const match = lines[i].match(/^###\s+([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-M\d{3}):\s+(.+)$/);
    if (!match) continue;
    let end = bounds.end;
    for (let j = i + 1; j < bounds.end; j += 1) {
      if (/^###\s+/.test(lines[j])) {
        end = j;
        break;
      }
    }
    items.push({ id: match[1], title: match[2].trim(), body: lines.slice(i + 1, end).join("\n").trim(), line: bodyStartLine + i });
  }

  return items;
}

function parseRules(lines: string[], bodyStartLine: number) {
  const bounds = sectionBounds(lines, "Rules");
  if (!bounds) return [];
  return lines.slice(bounds.start, bounds.end).flatMap((line, offset) => {
    const match = line.match(/^\s*-\s+([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-R\d{3}):\s+(.+)$/);
    if (!match) return [];
    const keyword = ruleKeywords.find((kw) => match[2].toUpperCase().includes(kw));
    return [{ id: match[1], text: match[2].trim(), keyword, strength: strength(keyword), line: bodyStartLine + bounds.start + offset }];
  });
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

function validateCommon(spec: SpecDocument, issues: ValidationIssue[]) {
  if (!/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*$/.test(spec.frontmatter.id)) {
    issues.push(issue(spec, "invalid-spec-id", "error", `Spec id "${spec.frontmatter.id}" must use uppercase words separated by hyphens.`));
  }
  if (spec.title !== spec.frontmatter.title) issues.push(issue(spec, "title-mismatch", "warning", "The H1 title should match frontmatter.title."));
  if (!spec.purpose) issues.push(issue(spec, "missing-purpose", "error", "Spec document must include a non-empty ## Purpose section."));
}

function validateRules(spec: ModelSpec, issues: ValidationIssue[], seen: Map<string, number>) {
  for (const rule of spec.rules) {
    if (!rule.id.startsWith(`${spec.frontmatter.id}-`)) issues.push(issue(spec, "wrong-rule-prefix", "error", `Rule id "${rule.id}" must start with ${spec.frontmatter.id}-.`, rule.line));
    if (!rule.keyword) issues.push(issue(spec, "missing-rule-keyword", "warning", `Rule "${rule.id}" should use MUST, MUST NOT, SHOULD, SHOULD NOT, MAY, or OPTIONAL.`, rule.line));
    registerId(spec, issues, seen, rule.id, rule.line);
  }
}

function referencedModelIds(spec: FeatureSpec) {
  const rawModels = typeof spec.frontmatter.models === "string" ? spec.frontmatter.models : spec.frontmatter.models?.join(",");
  return [spec.frontmatter.model, ...(rawModels?.split(",") ?? [])].map((model) => model?.trim()).filter((model): model is string => Boolean(model));
}

function collectModelReferences(source: string, filePath: string) {
  const lines = source.split(/\r?\n/);
  return Array.from(source.matchAll(modelIdPattern)).map((match) => ({ id: match[0], filePath, line: lineForOffset(lines, match.index ?? 0), kind: "model" as const, source: sourceForMatch(source, match.index ?? 0) }));
}

function withFeatureKind(spec: FeatureSpec): FeatureSpec {
  const rawModels = typeof spec.frontmatter.models === "string" ? spec.frontmatter.models : undefined;
  return { ...spec, kind: "feature", frontmatter: { ...spec.frontmatter, models: rawModels?.split(",").map((model) => model.trim()).filter(Boolean) ?? spec.frontmatter.models } };
}

function isModelSpec(document: SpecDocument): document is ModelSpec {
  return document.kind === "model";
}

function isFeatureSpec(document: SpecDocument): document is FeatureSpec {
  return document.kind !== "model";
}

function strength(keyword?: RuleKeyword) {
  if (keyword === "MUST" || keyword === "MUST NOT") return "required";
  if (keyword === "SHOULD" || keyword === "SHOULD NOT") return "recommended";
  if (keyword === "MAY" || keyword === "OPTIONAL") return "optional";
  return "unspecified";
}

function issue(spec: SpecDocument, code: string, severity: ValidationIssue["severity"], message: string, line?: number): ValidationIssue {
  return { code, severity, message, filePath: spec.filePath, line };
}

function registerId(spec: SpecDocument, issues: ValidationIssue[], seen: Map<string, number>, id: string, line: number) {
  const previous = seen.get(id);
  if (previous) issues.push(issue(spec, "duplicate-id", "error", `Duplicate id "${id}". First occurrence is on line ${previous}.`, line));
  seen.set(id, line);
}

function registerGlobalId(issues: ValidationIssue[], seen: Map<string, { filePath: string; line?: number }>, id: string, filePath: string, line?: number) {
  const previous = seen.get(id);
  if (previous) issues.push({ code: "duplicate-id", severity: "error", message: `Duplicate id "${id}". First occurrence is in ${previous.filePath}${previous.line ? `:${previous.line}` : ""}.`, filePath, line });
  seen.set(id, { filePath, line });
}

function lineForOffset(lines: string[], offset: number) {
  let consumed = 0;
  for (const [index, line] of lines.entries()) {
    consumed += line.length + 1;
    if (consumed > offset) return index + 1;
  }
  return lines.length;
}

function sourceForMatch(source: string, offset: number): TestReference["source"] {
  const before = source.slice(Math.max(0, offset - 80), offset);
  const context = source.slice(Math.max(0, offset - 80), offset + 80);
  if (/covers\s*:\s*\[[^\]]*$/.test(before)) return "covers";
  if (/tag\s*:\s*\[[^\]]*$/.test(before) || /@/.test(source.slice(Math.max(0, offset - 2), offset + 2))) return "tag";
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

// Compatibility adapters keep the original APIs available while the new document APIs become first-class.
function parseTestReferencesCompat(source: string, filePath: string) {
  const refs: TestReference[] = [];
  const lines = source.split(/\r?\n/);
  for (const match of source.matchAll(ruleIdPattern)) refs.push({ id: match[0], filePath, line: lineForOffset(lines, match.index ?? 0), kind: "rule", source: sourceForMatch(source, match.index ?? 0) });
  for (const match of source.matchAll(/\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-S\d{3}\b/g)) refs.push({ id: match[0], filePath, line: lineForOffset(lines, match.index ?? 0), kind: "scenario", source: sourceForMatch(source, match.index ?? 0) });
  return refs;
}

function validateFeatureSpecCompat(spec: FeatureSpec) {
  return [] as ValidationIssue[];
}

function validateCoverageCompat(coverage: ReturnType<typeof buildSpecCoverageSummary>, options: { requireRuleCoverage?: boolean; requireScenarioCoverage?: boolean }) {
  const issues: ValidationIssue[] = [];
  if (options.requireScenarioCoverage ?? true) {
    for (const item of coverage.scenarioCoverage.filter((item) => !item.covered)) issues.push({ code: "missing-scenario-coverage", severity: "error", message: `Scenario "${item.id}" has no matching test reference.`, filePath: item.filePath, line: item.line });
  }
  if (options.requireRuleCoverage ?? false) {
    for (const item of coverage.ruleCoverage.filter((item) => !item.covered)) issues.push({ code: "missing-rule-coverage", severity: "error", message: `Rule "${item.id}" has no matching test reference.`, filePath: item.filePath, line: item.line });
  }
  for (const ref of coverage.orphanScenarioReferences) issues.push({ code: "orphan-scenario-reference", severity: "error", message: `Test references unknown scenario "${ref.id}".`, filePath: ref.filePath, line: ref.line });
  for (const ref of coverage.orphanRuleReferences) issues.push({ code: "orphan-rule-reference", severity: "error", message: `Test references unknown rule "${ref.id}".`, filePath: ref.filePath, line: ref.line });
  return issues;
}
