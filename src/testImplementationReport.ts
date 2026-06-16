import type { CoverageItem, CoverageSummary, FeatureSpec } from "./types.js";

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

export type SpecImplementationReport = {
  specs: SpecImplementationItem[];
  implemented: SpecImplementationItem[];
  partial: SpecImplementationItem[];
  missing: SpecImplementationItem[];
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
): SpecImplementationReport {
  const scenarioCoverage = new Map(
    coverage.scenarioCoverage.map((item) => [item.id, item]),
  );
  const ruleCoverage = new Map(
    coverage.ruleCoverage.map((item) => [item.id, item]),
  );
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
    specs: items,
    implemented: items.filter((item) => item.status === "implemented"),
    partial: items.filter((item) => item.status === "partial"),
    missing: items.filter((item) => item.status === "missing"),
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
    totalRules: items.reduce((sum, item) => sum + item.totalRules, 0),
    coveredRules: items.reduce((sum, item) => sum + item.coveredRules, 0),
    missingRules: items.reduce(
      (sum, item) => sum + item.missingRules.length,
      0,
    ),
  };
}

export function formatSpecImplementationReport(
  report: SpecImplementationReport,
) {
  return [
    "Spec test implementation report",
    "",
    `Summary: ${report.implemented.length}/${report.totalSpecs} spec(s) implemented, ${report.coveredScenarios}/${report.totalScenarios} scenario(s) covered, ${report.coveredRules}/${report.totalRules} rule(s) covered.`,
    `Partial: ${report.partial.length}. Not implemented: ${report.missing.length}. Missing scenarios: ${report.missingScenarios}. Missing rules: ${report.missingRules}.`,
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
          `    covered rule ${rule.id}: ${rule.title ?? "Untitled rule"}`,
      ),
      ...spec.missingRules.map(
        (rule) =>
          `    missing rule ${rule.id}: ${rule.title ?? "Untitled rule"}`,
      ),
    ]),
  ].join("\n");
}
