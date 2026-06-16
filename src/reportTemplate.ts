import { html } from "./html.js";
import { screenshotKey } from "./screenshots.js";
import type {
  CoverageItem,
  CoverageSummary,
  DesignSpec,
  FeatureSpec,
  FeatureStep,
  ModelSpec,
  SpecScreenshot,
  StackSpec,
  ValidationIssue,
} from "./types.js";

export type ReportOptions = {
  coverage?: CoverageSummary;
  models?: ModelSpec[];
  stacks?: StackSpec[];
  designs?: DesignSpec[];
  screenshots?: SpecScreenshot[];
  validationIssues?: ValidationIssue[];
  title?: string;
  generatedAt?: string;
};

type RuleScenarioLink = {
  ruleId: string;
  scenarioId: string;
};

/** Render a complete self-contained feature spec report as HTML. */
export function renderHtmlReport(
  specs: FeatureSpec[],
  options: ReportOptions = {},
) {
  const title = options.title ?? "Feature Spec Report";
  const issues = options.validationIssues ?? [];
  const screenshots = options.screenshots ?? [];

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${html(title)}</title>
    <style>
      body{font-family:system-ui,sans-serif;max-width:1180px;margin:0 auto;padding:40px 24px;color:#1f2328}
      .panel{border:1px solid #d0d7de;border-radius:8px;padding:20px;margin:18px 0}
      .ok{color:#1a7f37}.missing,.error{color:#cf222e}.warning{color:#9a6700}
      .badge{border:1px solid #d0d7de;border-radius:999px;padding:2px 8px;font-size:12px;white-space:nowrap}
      .feature-header{display:flex;gap:12px;align-items:center;justify-content:space-between}
      .scenario{border:1px solid #d0d7de;border-radius:8px;margin:12px 0;background:#fff}
      .scenario summary{cursor:pointer;padding:14px 16px;font-weight:600}
      .scenario-body{padding:0 16px 16px}
      .step{border-left:3px solid #d0d7de;margin:12px 0;padding:2px 0 2px 12px}
      .step p{margin:8px 0}
      .screenshots{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin:10px 0 14px}
      .screenshot{border:1px solid #d0d7de;border-radius:8px;overflow:hidden;background:#f6f8fa}
      .screenshot img{display:block;width:100%;height:auto}
      .screenshot figcaption{font-size:12px;padding:8px;color:#57606a}
    </style>
  </head>
  <body>
    <h1>${html(title)}</h1>
    <p>Generated ${html(options.generatedAt ?? new Date().toISOString())}.</p>
    ${renderIssues(issues)}
    ${renderModels(options.models ?? [], options.coverage)}
    ${specs.map((spec) => renderSpec(spec, options.coverage, screenshots)).join("\n")}
  </body>
</html>`;
}

function renderIssues(issues: ValidationIssue[]) {
  if (!issues.length) {
    return `<section class="panel"><h2>Validation</h2><p class="ok">No validation issues found.</p></section>`;
  }

  return `<section class="panel"><h2>Validation</h2><ul>${issues
    .map(
      (issue) =>
        `<li class="${issue.severity}"><code>${html(`${issue.filePath ?? ""}${issue.line ? `:${issue.line}` : ""}`)}</code> ${html(issue.message)}</li>`,
    )
    .join("")}</ul></section>`;
}

function renderModels(models: ModelSpec[], coverage?: CoverageSummary) {
  if (!models.length) return "";
  const modelCoverage = coverage?.modelCoverage ?? [];

  return `<section class="panel">
  <h2>Models</h2>
  ${models
    .map(
      (model) => `<section>
    <div class="feature-header">
      <h3>${html(model.frontmatter.id)} ${html(model.title)}</h3>
      <span class="badge">${html(model.frontmatter.status ?? "draft")}</span>
    </div>
    <p>${html(model.purpose)}</p>
    <h4>Model</h4>
    <ul>${model.modelItems
      .map((item) => {
        const coverageItem = modelCoverage.find(
          (candidate) => candidate.id === item.id,
        );
        return `<li><code>${html(item.id)}</code>: ${html(item.title)} ${coverageBadge(coverageItem?.covered)}</li>`;
      })
      .join("")}</ul>
    ${
      model.rules.length
        ? `<h4>Rules</h4><ul>${model.rules
            .map(
              (rule) =>
                `<li><code>${html(rule.id)}</code>: ${html(rule.text)}</li>`,
            )
            .join("")}</ul>`
        : ""
    }
  </section>`,
    )
    .join("\n")}
</section>`;
}

function renderSpec(
  spec: FeatureSpec,
  coverage?: CoverageSummary,
  screenshots: SpecScreenshot[] = [],
) {
  const screenshotsByLine = groupScreenshotsByLine(screenshots);
  const ruleCoverage = coverage?.ruleCoverage ?? [];
  const scenarioCoverage = coverage?.scenarioCoverage ?? [];
  const ruleScenarioLinks = buildRuleScenarioLinks(
    ruleCoverage,
    scenarioCoverage,
  );

  return `<section class="panel">
  <div class="feature-header">
    <h2>${html(spec.frontmatter.id)} ${html(spec.title)}</h2>
    <span class="badge">${html(spec.frontmatter.status ?? "draft")}</span>
  </div>
  <p>${html(spec.purpose)}</p>
  <h3>Rules</h3>
  <ul>${spec.rules
    .map((rule) => {
      const item = ruleCoverage.find(
        (coverageItem) => coverageItem.id === rule.id,
      );
      return `<li><code>${html(rule.id)}</code>: ${html(rule.text)} ${ruleCoverageBadge(item, ruleScenarioShortIds(rule.id, ruleScenarioLinks))}</li>`;
    })
    .join("")}</ul>
  <h3>Scenarios</h3>
  ${spec.scenarios
    .map((scenario) => {
      const screenshotCount = scenario.steps.reduce(
        (count, step) =>
          count +
          (screenshotsByLine.get(screenshotKey(spec.filePath, step.line))
            ?.length ?? 0),
        0,
      );
      const scenarioRuleIds = ruleIdsForScenario(
        scenario.id,
        spec.rules.map((rule) => rule.id),
        ruleScenarioLinks,
      );
      return `<details class="scenario">
    <summary><code>${html(scenario.id)}</code>: ${html(scenario.title)} ${coverageBadge(scenarioCoverage.find((item) => item.id === scenario.id)?.covered)} <span class="badge">${screenshotCount} screenshot${screenshotCount === 1 ? "" : "s"}</span></summary>
    <div class="scenario-body">${renderScenarioRuleCoverage(scenarioRuleIds)}${scenario.steps.map((step) => renderStep(spec, step, screenshotsByLine)).join("")}</div>
  </details>`;
    })
    .join("\n")}
</section>`;
}

function renderScenarioRuleCoverage(ruleIds: string[]) {
  if (!ruleIds.length) {
    return `<p><strong>Rules covered by this scenario:</strong> <span class="missing">none referenced</span></p>`;
  }

  return `<p><strong>Rules covered by this scenario:</strong> ${ruleIds
    .map((ruleId) => `<code>${html(ruleId)}</code>`)
    .join(" ")}</p>`;
}

function renderStep(
  spec: FeatureSpec,
  step: FeatureStep,
  screenshotsByLine: Map<string, SpecScreenshot[]>,
) {
  const screenshots =
    screenshotsByLine.get(screenshotKey(spec.filePath, step.line)) ?? [];
  const evidenceBadge = screenshots.length
    ? `<span class="badge ok">${screenshots.length} screenshot${screenshots.length === 1 ? "" : "s"}</span>`
    : `<span class="badge missing">missing screenshot</span>`;

  return `<div class="step"><p><strong>${html(step.keyword)}</strong> ${html(step.text)} <span class="badge">line ${step.line}</span> ${evidenceBadge}</p>${renderScreenshots(screenshots)}</div>`;
}

function renderScreenshots(screenshots: SpecScreenshot[]) {
  if (!screenshots.length) return "";
  return `<div class="screenshots">${screenshots
    .map(
      (screenshot) =>
        `<figure class="screenshot"><img src="${html(screenshot.path)}" alt="${html(screenshot.title ?? `Screenshot for ${screenshot.specPath}:${screenshot.line}`)}"><figcaption>${html(screenshot.title ?? `${screenshot.specPath}:${screenshot.line}`)}</figcaption></figure>`,
    )
    .join("")}</div>`;
}

function coverageBadge(covered?: boolean, suffixes: string[] = []) {
  return covered === undefined
    ? ""
    : covered
      ? `<span class="badge ok">covered${suffixes.length ? ` by ${suffixes.map(html).join(" ")}` : ""}</span>`
      : `<span class="badge missing">missing coverage</span>`;
}

function ruleCoverageBadge(
  ruleCoverage: CoverageItem | undefined,
  scenarioIds: string[],
) {
  if (ruleCoverage?.covered && !scenarioIds.length) {
    return coverageBadge(true, ["direct test"]);
  }

  return coverageBadge(ruleCoverage?.covered, scenarioIds);
}

function ruleScenarioShortIds(
  ruleId: string,
  ruleScenarioLinks: RuleScenarioLink[],
) {
  return Array.from(
    new Set(
      ruleScenarioLinks
        .filter((link) => link.ruleId === ruleId)
        .map((link) => shortScenarioId(link.scenarioId)),
    ),
  ).sort();
}

function ruleIdsForScenario(
  scenarioId: string,
  specRuleIds: string[],
  ruleScenarioLinks: RuleScenarioLink[],
) {
  const ruleIds = new Set(
    ruleScenarioLinks
      .filter((link) => link.scenarioId === scenarioId)
      .map((link) => link.ruleId),
  );
  return specRuleIds.filter((ruleId) => ruleIds.has(ruleId));
}

function buildRuleScenarioLinks(
  ruleCoverage: CoverageItem[],
  scenarioCoverage: CoverageItem[],
) {
  const scenarioReferences = scenarioCoverage.flatMap((scenario) =>
    scenario.references.map((reference) => ({
      scenarioId: scenario.id,
      filePath: reference.filePath,
      line: reference.line,
    })),
  );
  const links: RuleScenarioLink[] = [];
  const seen = new Set<string>();

  for (const rule of ruleCoverage) {
    for (const ruleReference of rule.references) {
      const scenarioReference = nearestScenarioReference(
        ruleReference.filePath,
        ruleReference.line,
        scenarioReferences,
      );
      if (!scenarioReference) continue;

      const key = `${rule.id}:${scenarioReference.scenarioId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({ ruleId: rule.id, scenarioId: scenarioReference.scenarioId });
    }
  }

  return links;
}

function nearestScenarioReference(
  filePath: string,
  line: number,
  scenarioReferences: { scenarioId: string; filePath: string; line: number }[],
) {
  const maxLineDistance = 8;
  return scenarioReferences
    .filter(
      (reference) =>
        reference.filePath === filePath &&
        reference.line <= line &&
        line - reference.line <= maxLineDistance,
    )
    .sort((left, right) => right.line - left.line)[0];
}

function shortScenarioId(id: string) {
  return id.match(/-(S\d{3})$/)?.[1] ?? id;
}

function groupScreenshotsByLine(screenshots: SpecScreenshot[]) {
  const grouped = new Map<string, SpecScreenshot[]>();
  for (const screenshot of screenshots) {
    const key = screenshotKey(screenshot.specPath, screenshot.line);
    grouped.set(key, [...(grouped.get(key) ?? []), screenshot]);
  }
  return grouped;
}
