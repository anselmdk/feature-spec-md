import { readFile } from "node:fs/promises";
import { expandFilePatterns } from "./filePatterns.js";
import { buildCoverageSummary, parseFeatureSpec, parseTestReferences, validateCoverage, validateFeatureSpec } from "./index.js";
import type { FeatureSpec, ModelItem, ModelSpec, SpecDocument, SpecFrontmatter, TestReference, ValidationIssue } from "./types.js";

const modelIdPattern = /\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-M\d{3}\b/g;
type DocumentIdEntry = { id: string; filePath: string; line?: number };

export function parseSpecDocument(source: string, options: { filePath?: string; kind?: "model" | "feature" } = {}): SpecDocument {
  const filePath = options.filePath ?? "<inline>";
  const kind = options.kind ?? (filePath.endsWith(".model.md") ? "model" : "feature");
  return kind === "model" ? parseModelSpec(source, { filePath }) : { ...parseFeatureSpec(source, { filePath }), kind: "feature" };
}

export function parseModelSpec(source: string, options: { filePath?: string } = {}): ModelSpec {
  const filePath = options.filePath ?? "<inline>";
  const parsed = parseBase(source);
  return { kind: "model", filePath, frontmatter: parsed.frontmatter as SpecFrontmatter, title: parsed.title, purpose: parsed.purpose, modelItems: parseModelItems(parsed.lines, parsed.bodyStartLine), rules: parseRules(parsed.lines, parsed.bodyStartLine), source };
}

export async function loadSpecDocuments(patterns: string[]) {
  const documents: SpecDocument[] = [];
  for (const file of await expandFilePatterns(patterns)) documents.push(parseSpecDocument(await readFile(file, "utf8"), { filePath: file }));
  return documents;
}

export function parseSpecTestReferences(source: string, filePath = "<inline>"): TestReference[] {
  const lines = source.split(/\r?\n/);
  const modelRefs = Array.from(source.matchAll(modelIdPattern)).map((match) => ({
    id: match[0],
    filePath,
    line: lineForOffset(lines, match.index ?? 0),
    kind: "model" as const,
    source: "free-text" as const,
  }));
  return dedupe([...parseTestReferences(source, filePath), ...modelRefs]);
}

export async function collectSpecTestReferences(patterns: string[]) {
  const refs: TestReference[] = [];
  for (const file of await expandFilePatterns(patterns)) refs.push(...parseSpecTestReferences(await readFile(file, "utf8"), file));
  return refs;
}

export function validateModelSpec(spec: ModelSpec): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!spec.purpose) issues.push(issue(spec, "missing-purpose", "error", "Model spec must include a non-empty ## Purpose section."));
  if (!spec.modelItems.length) issues.push(issue(spec, "missing-model-items", "error", "Model spec must include at least one -M001 model item."));
  for (const item of spec.modelItems) if (!item.id.startsWith(`${spec.frontmatter.id}-`)) issues.push(issue(spec, "wrong-model-prefix", "error", `Model item id "${item.id}" must start with ${spec.frontmatter.id}-.`, item.line));
  return issues;
}

export function validateSpecDocument(spec: SpecDocument): ValidationIssue[] {
  return spec.kind === "model" ? validateModelSpec(spec) : validateFeatureSpec(spec);
}

export function validateSpecGraph(documents: SpecDocument[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const modelIds = new Set(documents.filter(isModelSpec).map((model) => model.frontmatter.id));
  const seen = new Map<string, { filePath: string; line?: number }>();
  for (const doc of documents) {
    for (const entry of documentIds(doc)) {
      const first = seen.get(entry.id);
      if (first) issues.push({ code: "duplicate-id", severity: "error", message: `Duplicate id "${entry.id}".`, filePath: entry.filePath, line: entry.line });
      seen.set(entry.id, entry);
    }
    if (doc.kind !== "model") for (const modelId of referencedModelIds(doc)) if (!modelIds.has(modelId)) issues.push({ code: "unknown-model-reference", severity: "error", message: `Feature spec references unknown model "${modelId}".`, filePath: doc.filePath });
  }
  return issues;
}

export function buildSpecCoverageSummary(documents: SpecDocument[], references: TestReference[]) {
  const baseCoverage = buildCoverageSummary(documents.filter(isFeatureSpec), references);
  const modelRefs = references.filter((ref) => ref.kind === "model");
  const modelItems = documents.flatMap((doc) => doc.kind === "model" ? doc.modelItems.map((modelItem) => ({ doc, modelItem })) : []);
  return { ...baseCoverage, modelCoverage: modelItems.map(({ doc, modelItem }) => ({ id: modelItem.id, title: modelItem.title, filePath: doc.filePath, line: modelItem.line, references: modelRefs.filter((ref) => ref.id === modelItem.id), covered: modelRefs.some((ref) => ref.id === modelItem.id) })), orphanModelReferences: modelRefs.filter((ref) => !modelItems.some(({ modelItem }) => modelItem.id === ref.id)) };
}

export async function checkSpecDocuments(options: { specs: string[]; tests?: string[]; requireModelCoverage?: boolean; requireRuleCoverage?: boolean; requireScenarioCoverage?: boolean }) {
  const documents = await loadSpecDocuments(options.specs);
  const references = options.tests?.length ? await collectSpecTestReferences(options.tests) : [];
  const coverage = options.tests?.length ? buildSpecCoverageSummary(documents, references) : undefined;
  const validationIssues = [...documents.flatMap(validateSpecDocument), ...validateSpecGraph(documents)];
  const coverageIssues: ValidationIssue[] = coverage ? [...validateCoverage(coverage, options), ...validateModelCoverage(coverage, options.requireModelCoverage)] : [];
  const models = documents.filter(isModelSpec);
  const features = documents.filter(isFeatureSpec);
  return { documents, models, features, specs: features, validationIssues, coverage, coverageIssues, ok: ![...validationIssues, ...coverageIssues].some((issue) => issue.severity === "error") };
}

function validateModelCoverage(coverage: ReturnType<typeof buildSpecCoverageSummary>, required = false) {
  const issues: ValidationIssue[] = [];
  if (required) for (const item of coverage.modelCoverage?.filter((item) => !item.covered) ?? []) issues.push({ code: "missing-model-coverage", severity: "error", message: `Model item "${item.id}" has no matching test reference.`, filePath: item.filePath, line: item.line });
  for (const ref of coverage.orphanModelReferences ?? []) issues.push({ code: "orphan-model-reference", severity: "error", message: `Test references unknown model item "${ref.id}".`, filePath: ref.filePath, line: ref.line });
  return issues;
}

function parseBase(source: string) {
  const normalized = source.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) throw new Error("Spec document must start with frontmatter delimited by ---. ");
  const endIndex = normalized.indexOf("\n---\n", 4);
  if (endIndex === -1) throw new Error("Spec document frontmatter must end with a second --- delimiter.");
  const frontmatter = parseFrontmatter(normalized.slice(4, endIndex));
  if (!frontmatter.id || !frontmatter.title) throw new Error("Spec document frontmatter must contain id and title.");
  const body = normalized.slice(endIndex + 5);
  const lines = body.split("\n");
  const bodyStartLine = normalized.slice(0, endIndex + 5).split("\n").length;
  return { frontmatter, lines, bodyStartLine, title: lines.find((line) => line.startsWith("# "))?.replace(/^#\s+/, "").trim() ?? frontmatter.title, purpose: sectionText(lines, "Purpose").trim() };
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
    if (match) items.push({ id: match[1], title: match[2].trim(), body: "", line: bodyStartLine + i });
  }
  return items;
}

function parseRules(lines: string[], bodyStartLine: number) {
  const bounds = sectionBounds(lines, "Rules");
  if (!bounds) return [];
  return lines.slice(bounds.start, bounds.end).flatMap((line, index) => {
    const match = line.match(/^\s*-\s+([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-R\d{3}):\s+(.+)$/);
    return match ? [{ id: match[1], text: match[2].trim(), strength: "unspecified" as const, line: bodyStartLine + bounds.start + index }] : [];
  });
}

function sectionBounds(lines: string[], heading: string) {
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) if (/^##\s+/.test(lines[i])) { end = i; break; }
  return { start: start + 1, end };
}
function sectionText(lines: string[], heading: string) { const bounds = sectionBounds(lines, heading); return bounds ? lines.slice(bounds.start, bounds.end).join("\n") : ""; }
function issue(spec: SpecDocument, code: string, severity: ValidationIssue["severity"], message: string, line?: number): ValidationIssue { return { code, severity, message, filePath: spec.filePath, line }; }
function referencedModelIds(spec: FeatureSpec) { const models = typeof spec.frontmatter.models === "string" ? spec.frontmatter.models.split(",") : spec.frontmatter.models ?? []; return [spec.frontmatter.model, ...models].map((model) => model?.trim()).filter((model): model is string => Boolean(model)); }
function isModelSpec(doc: SpecDocument): doc is ModelSpec { return doc.kind === "model"; }
function isFeatureSpec(doc: SpecDocument): doc is FeatureSpec { return doc.kind !== "model"; }
function documentIds(doc: SpecDocument): DocumentIdEntry[] { return [{ id: doc.frontmatter.id, filePath: doc.filePath }, ...doc.rules.map((rule) => ({ id: rule.id, filePath: doc.filePath, line: rule.line })), ...(doc.kind === "model" ? doc.modelItems.map((item) => ({ id: item.id, filePath: doc.filePath, line: item.line })) : doc.scenarios.map((scenario) => ({ id: scenario.id, filePath: doc.filePath, line: scenario.line })))]; }
function lineForOffset(lines: string[], offset: number) { let consumed = 0; for (const [index, line] of lines.entries()) { consumed += line.length + 1; if (consumed > offset) return index + 1; } return lines.length; }
function dedupe(refs: TestReference[]) { const seen = new Set<string>(); return refs.filter((ref) => { const key = `${ref.kind}:${ref.id}:${ref.filePath}:${ref.line}:${ref.source}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
