import type {
  CoverageItem,
  CoverageSummary,
  FeatureSpec,
  ModelSpec,
} from "./types.js";

export type SpecImplementationStatus = "implemented" | "partial" | "missing";

export type SpecImplementationItem = {
  id: string;
  title: string;
  filePath: string;
  totalScenarios: number;
  coveredScenarios: number;
  totalRules: number;
  coveredRules: number;
  missingScenarios: CoverageItem[];
  coveredRuleItems: CoverageItem[];
  missingRules: CoverageItem[];
  status: SpecImplementationStatus;
};

export type ModelImplementationItem = {
  id: string;
  title: string;
  filePath: string;
  totalItems: number;
  coveredItems: number;
  totalRules: number;
  coveredRules: number;
  coveredModelItems: CoverageItem[];
  missingModelItems: CoverageItem[];
  coveredRuleItems: CoverageItem[];
  missingRules: CoverageItem[];
};

export type SpecImplementationReport = {
  models: ModelImplementationItem[];
  specs: SpecImplementationItem[];
  implemented: SpecImplementationItem[];
  partial: SpecImplementationItem[];
  missing: SpecImplementationItem[];
  totalModels: number;
  totalModelItems: number;
  coveredModelItems: number;
  missingModelItems: number;
  totalSpecs: number;
  totalScenarios: number;
  coveredScenarios: number;
  missingScenarios: number;
  totalRules: number;
  coveredRules: number;
  missingRules: number;
};

export function buildSpecImplementationReport(
  specs: FeatureSpec[],
  coverage: CoverageSummary,
  models: ModelSpec[] = [],
): SpecImplementationReport {
  const modelCoverage = new Map(
    coverage.modelCoverage?.map((item) => [item.id, item]) ?? [],
  );
  const scenarioCoverage = new Map(
    coverage.scenarioCoverage.map((item) => [item.id, item]),
  );
  const ruleCoverage = new Map(
    coverage.ruleCoverage.map((item) => [item.id, item]),
  );
  const modelItems = models.map((model) => {
    const coverageItems = model.modelItems.map(
      (modelItem) =>
        modelCoverage.get(modelItem.id) ?? {
          id: modelItem.id,
          title: modelItem.title,
          filePath: model.filePath,
          line: modelItem.line,
          covered: false,
          references: [],
        },
    );
    const coveredModelItems = coverageItems.filter((item) => item.covered);
    const missingModelItems = coverageItems.filter((item) => !item.covered);
    const rules = model.rules.map(
      (rule) =>
        ruleCoverage.get(rule.id) ?? {
          id: rule.id,
          title: rule.text,
          filePath: model.filePath,
          line: rule.line,
          covered: false,
          references: [],
        },
    );
    const coveredRuleItems = rules.filter((rule) => rule.covered);
    const missingRules = rules.filter((rule) => !rule.covered);

    return {
      id: model.frontmatter.id,
      title: model.title,
      filePath: model.filePath,
      totalItems: coverageItems.length,
      coveredItems: coveredModelItems.length,
      totalRules: rules.length,
      coveredRules: coveredRuleItems.length,
      coveredModelItems,
      missingModelItems,
      coveredRuleItems,
      missingRules,
    };
  });

  const items = specs.map((spec) => {
    const scenarios = spec.scenarios.map(
      (scenario) =>
        scenarioCoverage.get(scenario.id) ?? {
          id: scenario.id,
          title: scenario.title,
          filePath: spec.filePath,
          line: scenario.line,
          covered: false,
          references: [],
        },
    );
    const rules = spec.rules.map(
      (rule) =>
        ruleCoverage.get(rule.id) ?? {
          id: rule.id,
          title: rule.text,
          filePath: spec.filePath,
          line: rule.line,
          covered: false,
          references: [],
        },
    );
    const missingScenarios = scenarios.filter((scenario) => !scenario.covered);
    const coveredScenarios = scenarios.length - missingScenarios.length;
    const coveredRuleItems = rules.filter((rule) => rule.covered);
    const missingRules = rules.filter((rule) => !rule.covered);
    const status = statusForCoverage(coveredScenarios, scenarios.length);

    return {
      id: spec.frontmatter.id,
      title: spec.title,
      filePath: spec.filePath,
      totalScenarios: scenarios.length,
      coveredScenarios,
      totalRules: rules.length,
      coveredRules: coveredRuleItems.length,
      missingScenarios,
      coveredRuleItems,
      missingRules,
      status,
    };
  });

  return {
    models: modelItems,
    specs: items,
    implemented: items.filter((item) => item.status === "implemented"),
    partial: items.filter((item) => item.status === "partial"),
    missing: items.filter((item) => item.status === "missing"),
    totalModels: modelItems.length,
    totalModelItems: modelItems.reduce((sum, item) => sum + item.totalItems, 0),
    coveredModelItems: modelItems.reduce(
      (sum, item) => sum + item.coveredItems,
      0,
    ),
    missingModelItems: modelItems.reduce(
      (sum, item) => sum + item.missingModelItems.length,
      0,
    ),
    totalSpecs: items.length,
    totalScenarios: items.reduce((sum, item) => sum + item.totalScenarios, 0),
    coveredScenarios: items.reduce(
      (sum, item) => sum + item.coveredScenarios,
      0,
    ),
    missingScenarios: items.reduce(
      (sum, item) => sum + item.missingScenarios.length,
      0,
    ),
    totalRules: coverage.ruleCoverage.length,
    coveredRules: coverage.ruleCoverage.filter((item) => item.covered).length,
    missingRules: coverage.ruleCoverage.filter((item) => !item.covered).length,
  };
}

export function formatSpecImplementationReport(
  report: SpecImplementationReport,
) {
  const modelSummary =
    report.totalModelItems > 0
      ? `, ${report.coveredModelItems}/${report.totalModelItems} model item(s) covered`
      : "";
  const missingModelSummary =
    report.totalModelItems > 0
      ? `. Missing model items: ${report.missingModelItems}`
      : "";
  return [
    "Spec test implementation report",
    "",
    `Summary: ${report.implemented.length}/${report.totalSpecs} spec(s) implemented, ${report.coveredScenarios}/${report.totalScenarios} scenario(s) covered, ${report.coveredRules}/${report.totalRules} rule(s) covered${modelSummary}.`,
    `Partial: ${report.partial.length}. Not implemented: ${report.missing.length}. Missing scenarios: ${report.missingScenarios}. Missing rules: ${report.missingRules}${missingModelSummary}.`,
    ...(report.totalModels > 0 ? ["", formatModelSection(report.models)] : []),
    "",
    formatSection("Implemented", report.implemented),
    "",
    formatSection("Partial", report.partial),
    "",
    formatSection("Not implemented", report.missing),
  ].join("\n");
}

function statusForCoverage(
  coveredScenarios: number,
  totalScenarios: number,
): SpecImplementationStatus {
  if (totalScenarios > 0 && coveredScenarios === totalScenarios)
    return "implemented";
  if (coveredScenarios > 0) return "partial";
  return "missing";
}

function formatSection(title: string, specs: SpecImplementationItem[]) {
  if (!specs.length) return `${title}:\n  (none)`;
  return [
    `${title}:`,
    ...specs.flatMap((spec) => [
      `  - ${spec.id}: ${spec.title} (${spec.coveredScenarios}/${spec.totalScenarios} scenarios, ${spec.coveredRules}/${spec.totalRules} rules) ${spec.filePath}`,
      ...spec.missingScenarios.map(
        (scenario) =>
          `    missing ${scenario.id}: ${scenario.title ?? "Untitled scenario"}`,
      ),
      ...spec.coveredRuleItems.map(
        (rule) =>
          `    covered rule ${rule.id}: ${rule.title ?? "Untitled rule"}${formatCoverageReferenceSuffix(rule)}`,
      ),
      ...spec.missingRules.map(
        (rule) =>
          `    missing rule ${rule.id}: ${rule.title ?? "Untitled rule"}`,
      ),
    ]),
  ].join("\n");
}

function formatModelSection(models: ModelImplementationItem[]) {
  if (!models.length) return "Models:\n  (none)";
  return [
    "Models:",
    ...models.flatMap((model) => [
      `  - ${model.id}: ${model.title} (${model.coveredItems}/${model.totalItems} model items, ${model.coveredRules}/${model.totalRules} rules) ${model.filePath}`,
      ...model.coveredModelItems.map(
        (item) =>
          `    covered model ${item.id}: ${item.title ?? "Untitled model item"}${formatCoverageReferenceSuffix(item)}`,
      ),
      ...model.missingModelItems.map(
        (item) =>
          `    missing model ${item.id}: ${item.title ?? "Untitled model item"}`,
      ),
      ...model.coveredRuleItems.map(
        (rule) =>
          `    covered rule ${rule.id}: ${rule.title ?? "Untitled rule"}${formatCoverageReferenceSuffix(rule)}`,
      ),
      ...model.missingRules.map(
        (rule) =>
          `    missing rule ${rule.id}: ${rule.title ?? "Untitled rule"}`,
      ),
    ]),
  ].join("\n");
}

function formatCoverageReferenceSuffix(item: CoverageItem) {
  const references = coverageReferenceLabels(item);
  return references.length ? ` (${references.join(", ")})` : "";
}

function coverageReferenceLabels(item: CoverageItem) {
  return Array.from(
    new Set(
      item.references.map((reference) => {
        const line = reference.line ? `:${reference.line}` : "";
        return `${reference.filePath}${line}`;
      }),
    ),
  );
}
