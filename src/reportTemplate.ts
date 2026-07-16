import { html } from "./html.js";
import { renderHtmlPage } from "./reportHtml.js";
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
  TestReference,
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
  githubBaseUrl?: string;
  githubRef?: string;
  repositoryUrl?: string;
};

type RuleScenarioLink = {
  ruleId: string;
  scenarioId: string;
};

type SourceLinkOptions = {
  githubBaseUrl?: string;
  githubRef?: string;
};

type ReportDocument = ModelSpec | FeatureSpec | StackSpec | DesignSpec;
type ExtensionKind = "modelDiagram" | "openQuestions" | "assumptions" | "apiContract" | "permissions" | "lifecycle" | "testEnvironment";

type ReportExtensionSection = {
  kind: ExtensionKind;
  title: string;
  body: string;
  line: number;
  document: ReportDocument;
};

const extensionDefinitions: Array<{ kind: ExtensionKind; title: string }> = [
  { kind: "modelDiagram", title: "Model Diagram" },
  { kind: "openQuestions", title: "Open Questions" },
  { kind: "assumptions", title: "Assumptions" },
  { kind: "apiContract", title: "API Contract" },
  { kind: "permissions", title: "Permissions" },
  { kind: "lifecycle", title: "Lifecycle" },
  { kind: "testEnvironment", title: "Test Environment" },
];

export function renderHtmlReport(specs: FeatureSpec[], options: ReportOptions = {}) {
  const title = options.title ?? "Feature Spec Report";
  const evidence = options.screenshots ?? [];
  const sourceLinks: SourceLinkOptions = {
    githubBaseUrl: options.githubBaseUrl,
    githubRef: options.githubRef,
  };

  return renderHtmlPage({
    title,
    styles: featureReportStyles(),
    scripts: featureReportScripts(),
    body: featureReportBody({ specs, options, evidence, sourceLinks, title }),
  });
}

function featureReportBody({
  specs,
  options,
  evidence,
  sourceLinks,
  title,
}: {
  specs: FeatureSpec[];
  options: ReportOptions;
  evidence: SpecScreenshot[];
  sourceLinks: SourceLinkOptions;
  title: string;
}) {
  const documents = allReportDocuments(specs, options);
  return `
<h1>${renderReportTitle(title, options.repositoryUrl)}</h1>
<p>Generated ${html(formatGeneratedAt(options.generatedAt))}.</p>
${renderOpenQuestionsAndAssumptions(documents, sourceLinks)}
${renderIssues(options.validationIssues ?? [])}
${renderModels(options.models ?? [], options.coverage, sourceLinks)}
${specs.map((spec) => renderSpec(spec, options.coverage, evidence, sourceLinks)).join("\n")}
`;
}

function featureReportStyles() {
  return `.panel{border:1px solid #d0d7de;border-radius:8px;padding:20px;margin:18px 0}
.ok{color:#1a7f37}.missing,.error{color:#cf222e}.warning{color:#9a6700}.muted{color:#57606a}
.badge{border:1px solid #d0d7de;border-radius:999px;padding:2px 8px;font-size:12px;white-space:nowrap}
.feature-header{display:flex;gap:12px;align-items:center;justify-content:space-between}
.scenario{border:1px solid #d0d7de;border-radius:8px;margin:12px 0;background:#fff}
.scenario summary{cursor:pointer;padding:14px 16px;font-weight:600}
.scenario-body{padding:0 16px 16px}
.model-item{border:1px solid #d0d7de;border-radius:8px;margin:12px 0;background:#fff}
.model-item summary{cursor:pointer;padding:14px 16px;font-weight:600}
.model-item-body{padding:0 16px 16px}.model-item-body p{margin:8px 0}
.table-wrap{overflow-x:auto;margin:12px 0}table{border-collapse:collapse;width:100%;font-size:14px}
th,td{border:1px solid #d0d7de;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f6f8fa}
h1 a{color:#0969da;text-decoration:underline;text-underline-offset:3px}h1 a:hover{text-decoration-thickness:2px}
.step{border-left:3px solid #d0d7de;margin:12px 0;padding:2px 0 2px 12px}.step p{margin:8px 0}
.screenshots{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin:10px 0 14px}
.screenshot{border:1px solid #d0d7de;border-radius:8px;overflow:hidden;background:#f6f8fa}
.screenshot img{display:block;width:100%;height:auto}.screenshot figcaption{font-size:12px;padding:8px;color:#57606a}
.coverage-refs{display:inline-flex;gap:2px;margin-left:4px}.coverage-ref{color:inherit;text-decoration:underline;text-underline-offset:2px}
.line-link{color:inherit;text-decoration:underline;text-underline-offset:2px}
.flag-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:12px}
.flag-card{border:1px solid #d0d7de;border-left:4px solid #d0d7de;border-radius:8px;padding:14px;background:#fff}
.flag-card h3{font-size:16px;margin:0 0 8px}.flag-card p{margin:8px 0}
.flag-item-link{color:inherit;text-decoration:underline;text-decoration-color:#8c959f;text-underline-offset:2px}
.flag-card.openQuestions{border-left-color:#9a6700}.flag-card.assumptions{border-left-color:#57606a}
.extension-section{border:1px solid #d0d7de;border-radius:8px;padding:14px;margin:12px 0;background:#fff}
.extension-section h4{margin:0 0 8px}.extension-section p{margin:8px 0}
.mermaid-wrap{overflow-x:auto;margin:12px 0;padding:12px;border:1px solid #d0d7de;border-radius:8px;background:#fff}
.mermaid{min-width:max-content;text-align:center}.mermaid svg{display:block;max-width:none;height:auto;margin:0 auto}
.mermaid-error{color:#cf222e;text-align:left;white-space:pre-wrap}
@media(max-width:720px){.flag-grid{grid-template-columns:1fr}}`;
}

function featureReportScripts() {
  const openTag = "<" + "script>";
  const closeTag = "<" + "/script>";
  const mermaidOpenTag = "<" + "script src=\"https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js\" crossorigin=\"anonymous\">";
  return `${openTag}
document.addEventListener("toggle", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLDetailsElement)) return;
  if (!target.open || target.dataset.hasImages !== "true") return;
  const topBefore = target.getBoundingClientRect().top;
  document
    .querySelectorAll('details.scenario[data-has-images="true"][open]')
    .forEach((details) => {
      if (details !== target) details.removeAttribute("open");
    });
  requestAnimationFrame(() => {
    const topAfter = target.getBoundingClientRect().top;
    window.scrollBy(0, topAfter - topBefore);
  });
}, true);
${closeTag}
${mermaidOpenTag}${closeTag}
${openTag}
document.addEventListener("DOMContentLoaded", async () => {
  const diagrams = document.querySelectorAll(".mermaid");
  if (!diagrams.length) return;
  if (!window.mermaid) {
    diagrams.forEach((diagram) => diagram.classList.add("mermaid-error"));
    return;
  }
  try {
    window.mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "default" });
    await window.mermaid.run({ nodes: diagrams });
  } catch (error) {
    diagrams.forEach((diagram) => diagram.classList.add("mermaid-error"));
    console.error("Unable to render Mermaid diagram", error);
  }
});
${closeTag}`;
}

function renderReportTitle(title: string, repositoryUrl: string | undefined) {
  if (!repositoryUrl) return html(title);
  const prefix = "Feature Spec Report for ";
  const attributes = `href="${html(repositoryUrl)}" target="_blank" rel="noopener noreferrer"`;
  if (title.startsWith(prefix) && title.length > prefix.length) {
    return `${html(prefix)}<a ${attributes}>${html(title.slice(prefix.length))}</a>`;
  }
  return `<a ${attributes}>${html(title)}</a>`;
}

function formatGeneratedAt(value: string | undefined) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return value ?? "";
  const day = date.getDate();
  const month = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][date.getMonth()];
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}${ordinalSuffix(day)} ${month} ${date.getFullYear()} at ${hours}:${minutes}`;
}

function ordinalSuffix(day: number) {
  if (day >= 11 && day <= 13) return "th";
  if (day % 10 === 1) return "st";
  if (day % 10 === 2) return "nd";
  if (day % 10 === 3) return "rd";
  return "th";
}

function renderOpenQuestionsAndAssumptions(documents: ReportDocument[], sourceLinks: SourceLinkOptions) {
  const sections = documents.flatMap((document) => extensionSections(document)).filter((section) => section.kind === "openQuestions" || section.kind === "assumptions");
  if (!sections.length) return "";
  const openQuestionCount = sections.filter((section) => section.kind === "openQuestions").length;
  const assumptionCount = sections.filter((section) => section.kind === "assumptions").length;
  return `<section class="panel">
  <div class="feature-header">
    <h2>Open questions and assumptions</h2>
    <span class="badge warning">${html(`${openQuestionCount} open question section(s) · ${assumptionCount} assumption section(s)`)}</span>
  </div>
  <p class="muted">Informational only: these sections are highlighted for review, but they do not fail validation, coverage, or the build. Review and either answer, promote to rules/scenarios, or remove when no longer relevant.</p>
  <div class="flag-grid">${sections.map((section) => renderFlaggedSection(section, sourceLinks)).join("")}</div>
</section>`;
}

function renderFlaggedSection(section: ReportExtensionSection, sourceLinks: SourceLinkOptions) {
  return `<article class="flag-card ${html(section.kind)}">
  <h3>${html(section.title)} <span class="badge">${html(documentLabel(section.document))}</span> ${renderLineBadge(section.document.filePath, section.line, sourceLinks)}</h3>
  ${renderFlaggedSectionBody(section, sourceLinks)}
</article>`;
}

function renderFlaggedSectionBody(section: ReportExtensionSection, sourceLinks: SourceLinkOptions) {
  const items = flaggedSectionItems(section);
  if (!items.length) return renderMarkdownBlock(section.body);
  return `<ul>${items
    .map((item) => {
      const content = renderInlineMarkdown(item.text);
      return `<li><a class="flag-item-link" href="#${html(flaggedItemAnchor(section, item))}">${content}</a></li>`;
    })
    .join("")}</ul>`;
}

function flaggedSectionItems(section: ReportExtensionSection) {
  const lines = section.document.source.split(/\r?\n/);
  const items: Array<{ text: string; line: number }> = [];
  for (let index = section.line; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index])) break;
    const match = lines[index].match(/^\s*[-*]\s+(.+)$/);
    if (match) items.push({ text: match[1].trim(), line: index + 1 });
  }
  return items;
}

function flaggedItemAnchor(section: ReportExtensionSection, item: { text: string; line: number }) {
  const stableId = item.text.match(/^([A-Z][A-Z0-9-]*-(?:Q|A)\d{3}):/)?.[1];
  return (stableId ?? `${section.document.frontmatter.id}-${section.kind}-${item.line}`).toLowerCase();
}

function renderIssues(issues: ValidationIssue[]) {
  if (!issues.length) return "";
  return `<section class="panel"><h2>Validation</h2><ul>${issues
    .map((issue) => `<li class="${issue.severity}"><code>${html(`${issue.filePath ?? ""}${issue.line ? `:${issue.line}` : ""}`)}</code> ${html(issue.message)}</li>`)
    .join("")}</ul></section>`;
}

function renderModels(models: ModelSpec[], coverage?: CoverageSummary, sourceLinks: SourceLinkOptions = {}) {
  if (!models.length) return "";
  const modelCoverage = coverage?.modelCoverage ?? [];
  const ruleCoverage = coverage?.ruleCoverage ?? [];
  const scenarioCoverage = coverage?.scenarioCoverage ?? [];
  const ruleScenarioLinks = buildRuleScenarioLinks(ruleCoverage, scenarioCoverage);
  return `<section class="panel">
  <h2>Models</h2>
  ${models.map((model) => renderModel(model, modelCoverage, ruleCoverage, ruleScenarioLinks, sourceLinks)).join("\n")}
</section>`;
}

function renderModel(model: ModelSpec, modelCoverage: CoverageItem[], ruleCoverage: CoverageItem[], ruleScenarioLinks: RuleScenarioLink[], sourceLinks: SourceLinkOptions) {
  return `<section>
  <div class="feature-header">
    <h3>${html(model.frontmatter.id)} ${html(model.title)}</h3>
    <span class="badge">${html(model.frontmatter.status ?? "draft")}</span>
  </div>
  <p>${html(model.purpose)}</p>
  <h4>Model</h4>
  ${model.modelItems
    .map((item) => {
      const coverageItem = modelCoverage.find((candidate) => candidate.id === item.id);
      return `<details class="model-item">
    <summary><code>${html(item.id)}</code>: ${html(item.title)} ${coverageBadge(coverageItem?.covered, [], coverageItem, sourceLinks)}</summary>
    <div class="model-item-body">${renderModelItemBody(item.body)}</div>
  </details>`;
    })
    .join("")}
  ${renderModelRules(model, ruleCoverage, ruleScenarioLinks, sourceLinks)}
  ${renderDocumentExtensionSections(model, sourceLinks)}
</section>`;
}

function renderModelRules(model: ModelSpec, ruleCoverage: CoverageItem[], ruleScenarioLinks: RuleScenarioLink[], sourceLinks: SourceLinkOptions) {
  if (!model.rules.length) return "";
  return `<h4>Rules</h4><ul>${model.rules
    .map((rule) => {
      const item = ruleCoverage.find((coverageItem) => coverageItem.id === rule.id);
      return `<li><code>${html(rule.id)}</code>: ${html(rule.text)} ${ruleCoverageBadge(item, ruleScenarioIds(rule.id, ruleScenarioLinks), sourceLinks)}</li>`;
    })
    .join("")}</ul>`;
}

function renderSpec(spec: FeatureSpec, coverage?: CoverageSummary, evidence: SpecScreenshot[] = [], sourceLinks: SourceLinkOptions = {}) {
  const evidenceByLine = groupEvidenceByLine(evidence);
  const ruleCoverage = coverage?.ruleCoverage ?? [];
  const scenarioCoverage = coverage?.scenarioCoverage ?? [];
  const ruleScenarioLinks = buildRuleScenarioLinks(ruleCoverage, scenarioCoverage);
  return `<section class="panel">
  <div class="feature-header">
    <h2>${html(spec.title)}</h2>
    <span class="badge">${html(spec.frontmatter.status ?? "draft")}</span>
  </div>
  <p>${html(spec.purpose)}</p>
  <h3>Rules</h3>
  <ul>${spec.rules.map((rule) => renderFeatureRule(rule.id, rule.text, ruleCoverage, ruleScenarioLinks, sourceLinks)).join("")}</ul>
  <h3>Scenarios</h3>
  ${spec.scenarios.map((scenario) => renderScenario(spec, scenario, scenarioCoverage, ruleScenarioLinks, evidenceByLine, sourceLinks)).join("\n")}
  ${renderDocumentExtensionSections(spec, sourceLinks)}
</section>`;
}

function renderFeatureRule(id: string, text: string, ruleCoverage: CoverageItem[], ruleScenarioLinks: RuleScenarioLink[], sourceLinks: SourceLinkOptions) {
  const item = ruleCoverage.find((coverageItem) => coverageItem.id === id);
  return `<li><code>${html(id)}</code>: ${html(text)} ${ruleCoverageBadge(item, ruleScenarioIds(id, ruleScenarioLinks), sourceLinks)}</li>`;
}

function renderScenario(spec: FeatureSpec, scenario: FeatureSpec["scenarios"][number], scenarioCoverage: CoverageItem[], ruleScenarioLinks: RuleScenarioLink[], evidenceByLine: Map<string, SpecScreenshot[]>, sourceLinks: SourceLinkOptions) {
  const scenarioEvidence = scenario.steps.flatMap((step) => evidenceByLine.get(screenshotKey(spec.filePath, step.line)) ?? []);
  const changedCount = scenarioEvidence.filter((entry) => entry.changed && entry.path).length;
  const unchangedCount = scenarioEvidence.filter((entry) => !entry.changed).length;
  const scenarioRuleIds = ruleIdsForScenario(scenario.id, spec.rules.map((rule) => rule.id), ruleScenarioLinks);
  const scenarioCoverageItem = scenarioCoverage.find((item) => item.id === scenario.id);
  return `<details class="scenario" data-has-images="${changedCount > 0 ? "true" : "false"}">
  <summary><code>${html(scenario.id)}</code>: ${html(scenario.title)} ${coverageBadge(scenarioCoverageItem?.covered, [], scenarioCoverageItem, sourceLinks)} ${renderEvidenceSummary(changedCount, unchangedCount)}</summary>
  <div class="scenario-body">${renderScenarioRuleCoverage(scenarioRuleIds)}${scenario.steps.map((step) => renderStep(spec, step, evidenceByLine, sourceLinks)).join("")}</div>
</details>`;
}

function renderEvidenceSummary(changedCount: number, unchangedCount: number) {
  if (changedCount === 0 && unchangedCount === 0) {
    return `<span class="badge muted">no visual evidence recorded</span>`;
  }
  const changedLabel = `${changedCount} visual change${changedCount === 1 ? "" : "s"}`;
  const unchangedLabel = `${unchangedCount} unchanged screen${unchangedCount === 1 ? "" : "s"}`;
  return `<span class="badge">${html([changedLabel, unchangedLabel].join(" · "))}</span>`;
}

function renderScenarioRuleCoverage(ruleIds: string[]) {
  if (!ruleIds.length) return `<p><strong>Rules covered by this scenario:</strong> <span class="muted">none referenced</span></p>`;
  return `<p><strong>Rules covered by this scenario:</strong> ${ruleIds.map((ruleId) => `<code>${html(ruleId)}</code>`).join(" ")}</p>`;
}

function renderDocumentExtensionSections(document: ReportDocument, sourceLinks: SourceLinkOptions) {
  const sections = extensionSections(document);
  if (!sections.length) return "";
  return `<h3>Spec context</h3>${sections.map((section) => renderDocumentExtensionSection(section, sourceLinks)).join("")}`;
}

function renderDocumentExtensionSection(section: ReportExtensionSection, sourceLinks: SourceLinkOptions) {
  const coverageNote = section.kind === "apiContract" || section.kind === "permissions"
    ? `<p class="muted">Coverage recommendation: enforceable API and permission behavior should also be captured as rules and scenarios so tests can reference stable IDs.</p>`
    : "";
  return `<section class="extension-section">
  <h4>${html(section.title)} ${renderLineBadge(section.document.filePath, section.line, sourceLinks)}</h4>
  ${section.kind === "openQuestions" || section.kind === "assumptions" ? renderDetailedFlaggedSectionBody(section) : renderMarkdownBlock(section.body)}
  ${coverageNote}
</section>`;
}

function renderDetailedFlaggedSectionBody(section: ReportExtensionSection) {
  const items = flaggedSectionItems(section);
  if (!items.length) return renderMarkdownBlock(section.body);
  return `<ul>${items
    .map((item) => `<li id="${html(flaggedItemAnchor(section, item))}">${renderInlineMarkdown(item.text)}</li>`)
    .join("")}</ul>`;
}

function renderModelItemBody(body: string) {
  return renderMarkdownBlock(body);
}

function renderMarkdownBlock(body: string) {
  const lines = body.split("\n");
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(`<p>${renderInlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!list.length) return;
    blocks.push(`<ul>${list.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</ul>`);
    list = [];
  };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const fenceMatch = line.match(/^\s*```([A-Za-z0-9_-]*)\s*$/);
    if (fenceMatch) {
      flushParagraph();
      flushList();
      const language = fenceMatch[1].toLowerCase();
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      blocks.push(renderCodeBlock(language, code.join("\n")));
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    const listMatch = line.match(/^\s*[-*]\s+(.+)$/);
    if (listMatch) {
      flushParagraph();
      list.push(listMatch[1].trim());
      continue;
    }
    if (isTableStart(lines, i)) {
      flushParagraph();
      flushList();
      const tableLines = [line];
      i += 2;
      while (i < lines.length && isPipeTableRow(lines[i])) {
        tableLines.push(lines[i]);
        i += 1;
      }
      i -= 1;
      blocks.push(renderTable(tableLines));
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();
  return blocks.join("");
}

function renderCodeBlock(language: string, source: string) {
  if (language === "mermaid") {
    return `<div class="mermaid-wrap"><pre class="mermaid">${html(source)}</pre></div>`;
  }
  const languageClass = language ? ` class="language-${html(language)}"` : "";
  return `<pre><code${languageClass}>${html(source)}</code></pre>`;
}

function renderInlineMarkdown(source: string) {
  return source
    .split(/(`[^`]+`)/g)
    .map((part) => part.startsWith("`") && part.endsWith("`") ? `<code>${html(part.slice(1, -1))}</code>` : html(part))
    .join("");
}

function isTableStart(lines: string[], index: number) {
  return isPipeTableRow(lines[index]) && index + 1 < lines.length && isTableSeparator(lines[index + 1]);
}

function isPipeTableRow(line: string) {
  return line.trim().startsWith("|") && line.trim().endsWith("|");
}

function isTableSeparator(line: string) {
  return isPipeTableRow(line) && splitTableRow(line).every((cell) => /^:?-{3,}:?$/.test(cell));
}

function splitTableRow(line: string) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function renderTable(lines: string[]) {
  const headers = splitTableRow(lines[0]);
  const rows = lines.slice(1).map(splitTableRow);
  return `<div class="table-wrap"><table><thead><tr>${headers.map((header) => `<th>${renderInlineMarkdown(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${renderInlineMarkdown(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function renderStep(spec: FeatureSpec, step: FeatureStep, evidenceByLine: Map<string, SpecScreenshot[]>, sourceLinks: SourceLinkOptions) {
  const evidence = evidenceByLine.get(screenshotKey(spec.filePath, step.line)) ?? [];
  const screenshots = evidence.filter((entry) => entry.changed && entry.path);
  const unchanged = evidence.filter((entry) => !entry.changed);
  const evidenceBadge = screenshots.length
    ? `<span class="badge ok">screen changed · screenshot captured</span>`
    : unchanged.length
      ? `<span class="badge muted">same screen${renderComparedWith(unchanged[0])}</span>`
      : `<span class="badge muted" title="missing screenshot evidence is informational">no screenshot captured</span>`;
  return `<div class="step"><p><strong>${html(step.keyword)}</strong> ${html(step.text)} ${renderLineBadge(spec.filePath, step.line, sourceLinks)} ${evidenceBadge}</p>${renderScreenshots(screenshots)}</div>`;
}

function renderComparedWith(entry: SpecScreenshot) {
  return entry.comparedWithLine ? ` as line ${html(String(entry.comparedWithLine))}` : " as previous screen";
}

function renderLineBadge(filePath: string, line: number, sourceLinks: SourceLinkOptions) {
  const label = `line ${line}`;
  const url = sourceLineUrl(filePath, line, sourceLinks);
  if (!url) return `<span class="badge">${html(label)}</span>`;
  return `<a class="badge line-link" href="${html(url)}" title="${html(`${filePath}:${line}`)}" target="_blank" rel="noopener noreferrer">${html(label)}</a>`;
}

function renderScreenshots(screenshots: SpecScreenshot[]) {
  if (!screenshots.length) return "";
  return `<div class="screenshots">${screenshots.map((screenshot) => `<figure class="screenshot"><img src="${html(screenshot.path ?? "")}" alt="${html(screenshot.title ?? `Screenshot for ${screenshot.specPath}:${screenshot.line}`)}"><figcaption>${html(screenshot.title ?? `${screenshot.specPath}:${screenshot.line}`)}</figcaption></figure>`).join("")}</div>`;
}

function coverageBadge(covered?: boolean, suffixes: string[] = [], item?: CoverageItem, sourceLinks: SourceLinkOptions = {}) {
  return covered === undefined ? "" : covered ? `<span class="badge ok">covered${suffixes.length ? ` by ${suffixes.map(html).join(" ")}` : ""}${renderCoverageReferenceMarkers(item, sourceLinks)}</span>` : `<span class="badge missing">missing coverage</span>`;
}

function ruleCoverageBadge(ruleCoverage: CoverageItem | undefined, scenarioIds: string[], sourceLinks: SourceLinkOptions) {
  if (ruleCoverage?.covered && !scenarioIds.length) return coverageBadge(true, ["direct test"], ruleCoverage, sourceLinks);
  return coverageBadge(ruleCoverage?.covered, scenarioIds, ruleCoverage, sourceLinks);
}

function renderCoverageReferenceMarkers(item: CoverageItem | undefined, sourceLinks: SourceLinkOptions) {
  const references = uniqueCoverageReferences(item);
  if (!references.length) return "";
  return ` <span class="coverage-refs">${references.map((reference, index) => renderCoverageReferenceMarker(reference, index + 1, sourceLinks)).join(",")}</span>`;
}

function renderCoverageReferenceMarker(reference: TestReference, index: number, sourceLinks: SourceLinkOptions) {
  const label = coverageReferenceLabel(reference);
  const url = coverageReferenceUrl(reference, sourceLinks);
  if (!url) return `<span class="coverage-ref" title="${html(label)}">${index}</span>`;
  return `<a class="coverage-ref" href="${html(url)}" title="${html(label)}" target="_blank" rel="noopener noreferrer">${index}</a>`;
}

function uniqueCoverageReferences(item: CoverageItem | undefined) {
  if (!item) return [];
  const seen = new Set<string>();
  const references: TestReference[] = [];
  for (const reference of item.references) {
    const key = coverageReferenceLabel(reference);
    if (seen.has(key)) continue;
    seen.add(key);
    references.push(reference);
  }
  return references;
}

function coverageReferenceLabel(reference: TestReference) {
  const line = reference.line ? `:${reference.line}` : "";
  return `${reference.filePath}${line}`;
}

function coverageReferenceUrl(reference: TestReference, sourceLinks: SourceLinkOptions) {
  return sourceLineUrl(reference.filePath, reference.line, sourceLinks);
}

function sourceLineUrl(filePath: string, line: number, sourceLinks: SourceLinkOptions) {
  if (!sourceLinks.githubBaseUrl || !sourceLinks.githubRef) return undefined;
  const baseUrl = sourceLinks.githubBaseUrl.replace(/\/$/, "");
  const ref = encodeURIComponent(sourceLinks.githubRef);
  const encodedFilePath = filePath.split("/").map((segment) => encodeURIComponent(segment)).join("/");
  return `${baseUrl}/blob/${ref}/${encodedFilePath}#L${line}`;
}

function allReportDocuments(specs: FeatureSpec[], options: ReportOptions): ReportDocument[] {
  return [
    ...(options.models ?? []),
    ...(options.stacks ?? []),
    ...(options.designs ?? []),
    ...specs,
  ];
}

function documentLabel(document: ReportDocument) {
  return `${document.frontmatter.id} ${document.title}`;
}

function extensionSections(document: ReportDocument): ReportExtensionSection[] {
  const lines = document.source.split(/\r?\n/);
  return extensionDefinitions.flatMap((definition) => {
    const section = extensionSection(lines, definition.title);
    return section ? [{ ...section, kind: definition.kind, document }] : [];
  });
}

function extensionSection(lines: string[], title: string) {
  const headingPattern = /^##\s+(.+?)\s*$/;
  const start = lines.findIndex((line) => headingPattern.exec(line)?.[1].toLowerCase() === title.toLowerCase());
  if (start === -1) return undefined;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (headingPattern.test(lines[index])) {
      end = index;
      break;
    }
  }
  const body = trimSectionLines(lines.slice(start + 1, end)).join("\n");
  if (!body.trim()) return undefined;
  return { title, body, line: start + 1 };
}

function trimSectionLines(lines: string[]) {
  let start = 0;
  let end = lines.length;
  while (start < end && !lines[start].trim()) start += 1;
  while (end > start && !lines[end - 1].trim()) end -= 1;
  return lines.slice(start, end);
}

function ruleScenarioIds(ruleId: string, ruleScenarioLinks: RuleScenarioLink[]) {
  return Array.from(new Set(ruleScenarioLinks.filter((link) => link.ruleId === ruleId).map((link) => link.scenarioId))).sort();
}

function ruleIdsForScenario(scenarioId: string, specRuleIds: string[], ruleScenarioLinks: RuleScenarioLink[]) {
  const ruleIds = new Set(ruleScenarioLinks.filter((link) => link.scenarioId === scenarioId).map((link) => link.ruleId));
  return specRuleIds.filter((ruleId) => ruleIds.has(ruleId));
}

function buildRuleScenarioLinks(ruleCoverage: CoverageItem[], scenarioCoverage: CoverageItem[]) {
  const scenarioReferences = scenarioCoverage.flatMap((scenario) =>
    scenario.references.map((reference) => ({ scenarioId: scenario.id, filePath: reference.filePath, line: reference.line })),
  );
  const links: RuleScenarioLink[] = [];
  const seen = new Set<string>();
  for (const rule of ruleCoverage) {
    for (const ruleReference of rule.references) {
      const scenarioReference = nearestScenarioReference(ruleReference.filePath, ruleReference.line, scenarioReferences);
      if (!scenarioReference) continue;
      const key = `${rule.id}:${scenarioReference.scenarioId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({ ruleId: rule.id, scenarioId: scenarioReference.scenarioId });
    }
  }
  return links;
}

function nearestScenarioReference(filePath: string, line: number, scenarioReferences: { scenarioId: string; filePath: string; line: number }[]) {
  const maxLineDistance = 8;
  return scenarioReferences
    .filter((reference) => reference.filePath === filePath && reference.line <= line && line - reference.line <= maxLineDistance)
    .sort((left, right) => right.line - left.line)[0];
}

function groupEvidenceByLine(evidence: SpecScreenshot[]) {
  const grouped = new Map<string, SpecScreenshot[]>();
  for (const entry of evidence) {
    const key = screenshotKey(entry.specPath, entry.line);
    grouped.set(key, [...(grouped.get(key) ?? []), entry]);
  }
  return grouped;
}
