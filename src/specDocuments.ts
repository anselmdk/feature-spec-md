/**
 * Cross-document parsing, validation, graph checks, and coverage aggregation
 * for model, feature, stack, and design spec documents.
 */
import { readFile } from "node:fs/promises";
import { expandFilePatterns } from "./filePatterns.js";
import {
  buildCoverageSummary,
  parseFeatureSpec,
  parseTestReferences,
  validateCoverage,
  validateFeatureSpec,
} from "./featureSpecs.js";
import {
  dedupeTestReferences,
  lineForOffset,
  modelIdPattern,
  parseMarkdownDocument,
  parseRuleItems,
  sectionBounds,
  sectionText,
  trimBlankLines,
} from "./specMarkdown.js";
import type {
  DesignSpec,
  FeatureSpec,
  ModelItem,
  ModelSpec,
  SpecDocument,
  SpecFrontmatter,
  StackSpec,
  TestReference,
  ValidationIssue,
} from "./types.js";

type DocumentIdEntry = { id: string; filePath: string; line?: number };
type SpecKind = "model" | "feature" | "stack" | "design";

export function parseSpecDocument(
  source: string,
  options: { filePath?: string; kind?: SpecKind } = {},
): SpecDocument {
  const filePath = options.filePath ?? "<inline>";
  const kind = options.kind ?? kindFromPath(filePath);

  if (kind === "model") return parseModelSpec(source, { filePath });
  if (kind === "stack") return parseStackSpec(source, { filePath });
  if (kind === "design") return parseDesignSpec(source, { filePath });

  return { ...parseFeatureSpec(source, { filePath }), kind: "feature" };
}

export function parseModelSpec(
  source: string,
  options: { filePath?: string } = {},
): ModelSpec {
  const filePath = options.filePath ?? "<inline>";
  const parsed = parseMarkdownDocument(source);
  return {
    kind: "model",
    filePath,
    frontmatter: parsed.frontmatter as SpecFrontmatter,
    title: parsed.title,
    purpose: parsed.purpose,
    modelItems: parseModelItems(parsed.lines, parsed.bodyStartLine),
    rules: parseRuleItems(parsed.lines, parsed.bodyStartLine),
    source,
  };
}

export function parseStackSpec(
  source: string,
  options: { filePath?: string } = {},
): StackSpec {
  const filePath = options.filePath ?? "<inline>";
  const parsed = parseMarkdownDocument(source);
  return {
    kind: "stack",
    filePath,
    frontmatter: parsed.frontmatter as SpecFrontmatter,
    title: parsed.title,
    purpose: parsed.purpose,
    stack: sectionText(parsed.lines, "Stack").trim(),
    context: sectionText(parsed.lines, "Context").trim(),
    rationale: sectionText(parsed.lines, "Rationale").trim(),
    consequences: sectionText(parsed.lines, "Consequences").trim(),
    rules: parseRuleItems(parsed.lines, parsed.bodyStartLine),
    source,
  };
}

export function parseDesignSpec(
  source: string,
  options: { filePath?: string } = {},
): DesignSpec {
  const filePath = options.filePath ?? "<inline>";
  const parsed = parseMarkdownDocument(source);
  return {
    kind: "design",
    filePath,
    frontmatter: parsed.frontmatter as DesignSpec["frontmatter"],
    title: parsed.title,
    purpose: parsed.purpose,
    design: sectionText(parsed.lines, "Design").trim(),
    principles: sectionText(parsed.lines, "Principles").trim(),
    layout: sectionText(parsed.lines, "Layout").trim(),
    interaction: sectionText(parsed.lines, "Interaction").trim(),
    visualStyle: sectionText(parsed.lines, "Visual style").trim(),
    rules: parseRuleItems(parsed.lines, parsed.bodyStartLine),
    source,
  };
}

export async function loadSpecDocuments(patterns: string[]) {
  const documents: SpecDocument[] = [];
  for (const file of await expandFilePatterns(patterns)) {
    documents.push(
      parseSpecDocument(await readFile(file, "utf8"), { filePath: file }),
    );
  }
  return documents;
}

export function parseSpecTestReferences(
  source: string,
  filePath = "<inline>",
): TestReference[] {
  const lines = source.split(/\r?\n/);
  const modelRefs = Array.from(source.matchAll(modelIdPattern)).map(
    (match) => ({
      id: match[0],
      filePath,
      line: lineForOffset(lines, match.index ?? 0),
      kind: "model" as const,
      source: "free-text" as const,
    }),
  );
  return dedupeTestReferences([
    ...parseTestReferences(source, filePath),
    ...modelRefs,
  ]);
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
  validateCommonSpec(spec, issues);

  if (!spec.modelItems.length) {
    issues.push(
      issue(
        spec,
        "missing-model-items",
        "error",
        "Model spec must include at least one -M001 model item.",
      ),
    );
  }

  for (const item of spec.modelItems) {
    if (!item.id.startsWith(`${spec.frontmatter.id}-`)) {
      issues.push(
        issue(
          spec,
          "wrong-model-prefix",
          "error",
          `Model item id "${item.id}" must start with ${spec.frontmatter.id}-.`,
          item.line,
        ),
      );
    }
  }

  return issues;
}

export function validateStackSpec(spec: StackSpec): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  validateCommonSpec(spec, issues);

  if (!spec.stack) {
    issues.push(
      issue(
        spec,
        "missing-stack",
        "error",
        "Stack spec must include a non-empty ## Stack section.",
      ),
    );
  }

  return issues;
}

export function validateDesignSpec(spec: DesignSpec): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  validateCommonSpec(spec, issues);

  if (!spec.design) {
    issues.push(
      issue(
        spec,
        "missing-design",
        "error",
        "Design spec must include a non-empty ## Design section.",
      ),
    );
  }

  return issues;
}

export function validateSpecDocument(spec: SpecDocument): ValidationIssue[] {
  if (spec.kind === "model") return validateModelSpec(spec);
  if (spec.kind === "stack") return validateStackSpec(spec);
  if (spec.kind === "design") return validateDesignSpec(spec);
  return validateFeatureSpec(spec);
}

export function validateSpecGraph(
  documents: SpecDocument[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const modelIds = new Set(
    documents.filter(isModelSpec).map((model) => model.frontmatter.id),
  );
  const seen = new Map<string, { filePath: string; line?: number }>();

  for (const doc of documents) {
    for (const entry of documentIds(doc)) {
      const first = seen.get(entry.id);
      if (first) {
        issues.push({
          code: "duplicate-id",
          severity: "error",
          message: `Duplicate id "${entry.id}".`,
          filePath: entry.filePath,
          line: entry.line,
        });
      }
      seen.set(entry.id, entry);
    }

    if (isModelReferencingSpec(doc)) {
      for (const modelId of referencedModelIds(doc)) {
        if (!modelIds.has(modelId)) {
          issues.push({
            code: "unknown-model-reference",
            severity: "error",
            message: `Spec references unknown model "${modelId}".`,
            filePath: doc.filePath,
          });
        }
      }
    }
  }

  return issues;
}

export function buildSpecCoverageSummary(
  documents: SpecDocument[],
  references: TestReference[],
) {
  const baseCoverage = buildCoverageSummary(
    documents.filter(isFeatureSpec),
    references,
  );
  const modelRefs = references.filter((ref) => ref.kind === "model");
  const ruleRefs = references.filter((ref) => ref.kind === "rule");
  const rules = documents.flatMap((doc) =>
    doc.rules.map((rule) => ({ doc, rule })),
  );
  const modelItems = documents.flatMap((doc) =>
    doc.kind === "model"
      ? doc.modelItems.map((modelItem) => ({ doc, modelItem }))
      : [],
  );

  return {
    ...baseCoverage,
    ruleCoverage: rules.map(({ doc, rule }) =>
      coverageItem(rule.id, rule.text, doc.filePath, rule.line, ruleRefs),
    ),
    orphanRuleReferences: ruleRefs.filter(
      (ref) => !rules.some(({ rule }) => rule.id === ref.id),
    ),
    modelCoverage: modelItems.map(({ doc, modelItem }) => ({
      id: modelItem.id,
      title: modelItem.title,
      filePath: doc.filePath,
      line: modelItem.line,
      references: modelRefs.filter((ref) => ref.id === modelItem.id),
      covered: modelRefs.some((ref) => ref.id === modelItem.id),
    })),
    orphanModelReferences: modelRefs.filter(
      (ref) => !modelItems.some(({ modelItem }) => modelItem.id === ref.id),
    ),
  };
}

function coverageItem(
  id: string,
  title: string,
  filePath: string,
  line: number,
  references: TestReference[],
) {
  const matchingReferences = references.filter((ref) => ref.id === id);
  return {
    id,
    title,
    filePath,
    line,
    references: matchingReferences,
    covered: matchingReferences.length > 0,
  };
}

export async function checkSpecDocuments(options: {
  specs: string[];
  tests?: string[];
  requireModelCoverage?: boolean;
  requireRuleCoverage?: boolean;
  requireScenarioCoverage?: boolean;
}) {
  const documents = await loadSpecDocuments(options.specs);
  const references = options.tests?.length
    ? await collectSpecTestReferences(options.tests)
    : [];
  const coverage = options.tests?.length
    ? buildSpecCoverageSummary(documents, references)
    : undefined;
  const validationIssues = [
    ...documents.flatMap(validateSpecDocument),
    ...validateSpecGraph(documents),
  ];
  const coverageIssues: ValidationIssue[] = coverage
    ? [
        ...validateCoverage(coverage, options),
        ...validateModelCoverage(coverage, options.requireModelCoverage),
      ]
    : [];
  const models = documents.filter(isModelSpec);
  const features = documents.filter(isFeatureSpec);
  const stacks = documents.filter(isStackSpec);
  const designs = documents.filter(isDesignSpec);

  return {
    documents,
    models,
    features,
    stacks,
    designs,
    specs: features,
    validationIssues,
    coverage,
    coverageIssues,
    ok: ![...validationIssues, ...coverageIssues].some(
      (issue) => issue.severity === "error",
    ),
  };
}

function validateModelCoverage(
  coverage: ReturnType<typeof buildSpecCoverageSummary>,
  required = false,
) {
  const issues: ValidationIssue[] = [];
  if (required) {
    for (const item of coverage.modelCoverage?.filter(
      (item) => !item.covered,
    ) ?? []) {
      issues.push({
        code: "missing-model-coverage",
        severity: "error",
        message: `Model item "${item.id}" has no matching test reference.`,
        filePath: item.filePath,
        line: item.line,
      });
    }
  }
  for (const ref of coverage.orphanModelReferences ?? []) {
    issues.push({
      code: "orphan-model-reference",
      severity: "error",
      message: `Test references unknown model item "${ref.id}".`,
      filePath: ref.filePath,
      line: ref.line,
    });
  }
  return issues;
}

function parseModelItems(lines: string[], bodyStartLine: number) {
  const bounds = sectionBounds(lines, "Model");
  if (!bounds) return [];
  const items: ModelItem[] = [];
  for (let i = bounds.start; i < bounds.end; i += 1) {
    const match = lines[i].match(
      /^###\s+([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-M\d{3}):\s+(.+)$/,
    );
    if (match) {
      const bodyStart = i + 1;
      let bodyEnd = bounds.end;
      for (let j = bodyStart; j < bounds.end; j += 1) {
        if (
          /^###\s+([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-M\d{3}):\s+(.+)$/.test(
            lines[j],
          )
        ) {
          bodyEnd = j;
          break;
        }
      }
      items.push({
        id: match[1],
        title: match[2].trim(),
        body: trimBlankLines(lines.slice(bodyStart, bodyEnd)).join("\n"),
        line: bodyStartLine + i,
      });
      i = bodyEnd - 1;
    }
  }
  return items;
}

function validateCommonSpec(spec: SpecDocument, issues: ValidationIssue[]) {
  if (!spec.purpose) {
    issues.push(
      issue(
        spec,
        "missing-purpose",
        "error",
        "Spec document must include a non-empty ## Purpose section.",
      ),
    );
  }
}

function issue(
  spec: SpecDocument,
  code: string,
  severity: ValidationIssue["severity"],
  message: string,
  line?: number,
): ValidationIssue {
  return { code, severity, message, filePath: spec.filePath, line };
}

function referencedModelIds(spec: FeatureSpec | DesignSpec) {
  const models =
    typeof spec.frontmatter.models === "string"
      ? spec.frontmatter.models.split(",")
      : (spec.frontmatter.models ?? []);
  return [spec.frontmatter.model, ...models]
    .map((model) => model?.trim())
    .filter((model): model is string => Boolean(model));
}

function kindFromPath(filePath: string): SpecKind {
  if (filePath.endsWith(".model.md")) return "model";
  if (filePath.endsWith(".stack.md")) return "stack";
  if (filePath.endsWith(".design.md")) return "design";
  return "feature";
}

function isModelSpec(doc: SpecDocument): doc is ModelSpec {
  return doc.kind === "model";
}
function isFeatureSpec(doc: SpecDocument): doc is FeatureSpec {
  return doc.kind === "feature" || doc.kind === undefined;
}
function isStackSpec(doc: SpecDocument): doc is StackSpec {
  return doc.kind === "stack";
}
function isDesignSpec(doc: SpecDocument): doc is DesignSpec {
  return doc.kind === "design";
}
function isModelReferencingSpec(
  doc: SpecDocument,
): doc is FeatureSpec | DesignSpec {
  return isFeatureSpec(doc) || isDesignSpec(doc);
}
function documentIds(doc: SpecDocument): DocumentIdEntry[] {
  return [
    { id: doc.frontmatter.id, filePath: doc.filePath },
    ...doc.rules.map((rule) => ({
      id: rule.id,
      filePath: doc.filePath,
      line: rule.line,
    })),
    ...(doc.kind === "model"
      ? doc.modelItems.map((item) => ({
          id: item.id,
          filePath: doc.filePath,
          line: item.line,
        }))
      : isFeatureSpec(doc)
        ? doc.scenarios.map((scenario) => ({
            id: scenario.id,
            filePath: doc.filePath,
            line: scenario.line,
          }))
        : []),
  ];
}
