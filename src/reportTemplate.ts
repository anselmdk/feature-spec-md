import { html } from "./html.js";
import { renderHtmlPage } from "./reportHtml.js";
import { screenshotKey } from "./screenshots.js";
import type {
  CoverageItem,
  CoverageSummary,
  DesignSpec,
  FeatureRule,
  FeatureSpec,
  FeatureStep,
  ModelSpec,
  ReportLayer,
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
  layers?: ReportLayer[];
  layersDefaultOpen?: boolean;
  documentsDefaultOpen?: boolean;
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
type ExtensionKind =
  | "modelDiagram"
  | "openQuestions"
  | "assumptions"
  | "apiContract"
  | "permissions"
  | "lifecycle"
  | "testEnvironment";

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

export function renderHtmlReport(
  specs: FeatureSpec[],
  options: ReportOptions = {},
) {
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
  if (options.layers?.length) {
    return `
<h1>${renderReportTitle(title, options.repositoryUrl)}</h1>
<p>Generated ${html(formatGeneratedAt(options.generatedAt))}.</p>
${renderIssues(options.validationIssues ?? [])}
${renderLayeredDocuments(documents, options, evidence, sourceLinks)}
`;
  }
  return `
<h1>${renderReportTitle(title, options.repositoryUrl)}</h1>
<p>Generated ${html(formatGeneratedAt(options.generatedAt))}.</p>
${renderOpenQuestionsAndAssumptions(documents, sourceLinks)}
${renderJourneyOverview(specs, options.coverage, sourceLinks)}
${renderIssues(options.validationIssues ?? [])}
${renderModels(options.models ?? [], options.coverage, sourceLinks)}
${renderStacks(options.stacks ?? [], options.coverage, sourceLinks)}
${renderDesigns(options.designs ?? [], options.coverage, sourceLinks)}
${specs.map((spec) => renderSpec(spec, options.coverage, evidence, sourceLinks)).join("\n")}
`;
}

function renderJourneyOverview(
  specs: FeatureSpec[],
  coverage: CoverageSummary | undefined,
  sourceLinks: SourceLinkOptions,
) {
  const journeys = specs.flatMap((spec) =>
    spec.scenarios
      .filter((scenario) => scenario.journey)
      .map((scenario) => ({ spec, scenario })),
  );
  if (!journeys.length) return "";
  return `<details class="panel report-section" open>
  <summary class="report-section-summary"><h2>End-to-end journeys</h2><span class="badge">${journeys.length}</span></summary>
  <div class="report-section-body"><ul>${journeys
    .map(({ scenario }) => {
      const item = coverage?.scenarioCoverage.find(
        (candidate) => candidate.id === scenario.id,
      );
      const metadata = scenario.journey!;
      const systems = metadata.systems.length
        ? ` <span class="muted">${html(metadata.systems.join(" → "))}</span>`
        : "";
      return `<li><a href="#${html(scenario.id.toLowerCase())}"><code>${html(scenario.id)}</code>: ${html(scenario.title)}</a> <span class="badge">${html(metadata.path)}</span>${metadata.critical ? ' <span class="badge">critical</span>' : ""}${systems} ${coverageBadge(item?.covered, [], item, sourceLinks)}</li>`;
    })
    .join("")}</ul></div>
</details>`;
}

function featureReportStyles() {
  return `.panel{border:1px solid var(--border);border-radius:8px;margin:18px 0;overflow:hidden;background:var(--surface)}
.report-layers{margin-top:18px}.report-layers>.details-section-header{margin-bottom:8px}.layer-section{border:1px solid var(--border);border-radius:10px;margin:12px 0;background:var(--surface);overflow:hidden;scroll-margin-top:16px}
.layer-summary{cursor:pointer;display:flex;gap:12px;align-items:center;padding:18px 20px;list-style:none}.layer-summary::-webkit-details-marker{display:none}.layer-summary::before{content:"▶";color:var(--muted);font-size:12px;transition:transform .15s ease}.layer-section[open]>.layer-summary::before{transform:rotate(90deg)}
.layer-summary-copy{flex:1}.layer-summary h2{font-size:1.35em;margin:0}.layer-summary p{color:var(--muted);margin:3px 0 0}.layer-badges{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.layer-body{padding:0 18px 18px}.layer-body>.details-section-header{margin:0 0 10px}.document-section{margin:12px 0;scroll-margin-top:16px}.document-kind{color:var(--muted)}
.report-section-summary{cursor:pointer;display:flex;gap:12px;align-items:center;padding:20px;list-style:none}.report-section-summary::-webkit-details-marker{display:none}
.report-section-summary::before{content:"▶";color:var(--muted);font-size:12px;transition:transform .15s ease}.report-section[open]>.report-section-summary::before{transform:rotate(90deg)}
.report-section-summary h2{font-size:1.5em;margin:0;flex:1}.report-section-body{padding:0 20px 20px}
.ok{color:var(--success)}.missing,.error{color:var(--danger)}.warning{color:var(--warning)}.muted{color:var(--muted)}
.badge{border:1px solid var(--border);border-radius:999px;padding:2px 8px;font-size:12px;white-space:nowrap}
.feature-header{display:flex;gap:12px;align-items:center;justify-content:space-between}
.details-section-header{display:flex;gap:12px;align-items:center;justify-content:space-between}
.details-section-header h2,.details-section-header h3{margin-bottom:0}
.details-toggle-button{appearance:none;border:1px solid var(--border);border-radius:6px;background:var(--surface-muted);color:var(--fg);cursor:pointer;font:inherit;font-size:13px;font-weight:600;padding:5px 12px;white-space:nowrap}
.details-toggle-button:hover{background:var(--surface-hover)}.details-toggle-button:focus-visible{outline:2px solid var(--link);outline-offset:2px}
.report-navigator{position:fixed;z-index:19;right:12px;top:12px;width:min(320px,calc(100vw - 24px));border:1px solid var(--border);border-radius:10px;background:var(--surface);box-shadow:0 8px 24px rgba(31,35,40,.16)}
.navigator-trigger{appearance:none;display:flex;align-items:center;width:100%;border:0;border-radius:10px;background:transparent;color:var(--fg);cursor:pointer;font:inherit;padding:9px 12px;text-align:left}.navigator-trigger:hover{background:var(--surface-hover)}.navigator-trigger:focus-visible,.navigator-link:focus-visible,.navigator-scenarios:focus-visible{outline:2px solid var(--link);outline-offset:-2px}
.navigator-current{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:650}
.navigator-menu{display:none;border-top:1px solid var(--border);padding:10px}.report-navigator[data-open="true"] .navigator-menu{display:block}
.navigator-links{max-height:calc(100vh - 100px);overflow:auto;padding:2px}.navigator-layer{margin:6px 0 2px}.navigator-row{display:flex;align-items:center;gap:4px}.navigator-link{appearance:none;display:flex;align-items:center;gap:7px;width:100%;min-width:0;border:0;border-radius:5px;background:transparent;color:var(--fg);cursor:pointer;font:inherit;font-size:13px;padding:6px 8px;text-align:left}.navigator-link:hover,.navigator-scenarios:hover{background:var(--surface-hover)}.navigator-link[aria-current="location"]{background:var(--surface-muted);box-shadow:inset 3px 0 var(--link);font-weight:650}.navigator-toggle-state{flex:0 0 auto;width:13px;color:var(--muted);font-size:10px;text-align:center}.navigator-link[aria-pressed="true"]>.navigator-toggle-state::before{content:"●"}.navigator-link[aria-pressed="false"]>.navigator-toggle-state::before{content:"○"}.navigator-link-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.navigator-document{padding-left:22px;color:var(--muted)}.navigator-document[aria-current="location"]{color:var(--fg)}.navigator-scenarios{appearance:none;flex:0 0 auto;border:1px solid var(--border);border-radius:999px;background:transparent;color:var(--muted);cursor:pointer;font:inherit;font-size:11px;padding:3px 7px}.navigator-scenarios[aria-pressed="true"]{background:var(--surface-muted);color:var(--fg)}
.feature-policy{display:flex;gap:8px;flex-wrap:wrap;margin:-4px 0 12px}.feature-policy .badge{display:inline-flex;gap:5px;align-items:center}
.scenario{border:1px solid var(--border);border-radius:8px;margin:12px 0;background:var(--surface)}
.scenario summary{cursor:pointer;padding:14px 16px;font-weight:600}
.scenario-body{padding:0 16px 16px}
.scenario-body.compact-steps .step{margin:4px 0}.scenario-body.compact-steps .step p{margin:2px 0}
.model-item{border:1px solid var(--border);border-radius:8px;margin:12px 0;background:var(--surface)}
.model-item summary{cursor:pointer;padding:14px 16px;font-weight:600}
.model-item-body{padding:0 16px 16px}.model-item-body p{margin:8px 0}
.model-entry{padding:0 0 12px}.model-entry h4{font-size:14px;margin:14px 0 8px}
.table-wrap{overflow-x:auto;margin:12px 0}table{border-collapse:collapse;width:100%;font-size:14px}
th,td{border:1px solid var(--border);padding:6px 8px;text-align:left;vertical-align:top}th{background:var(--surface-muted)}
h1 a{color:var(--link);text-decoration:underline;text-underline-offset:3px}h1 a:hover{text-decoration-thickness:2px}
.step{border-left:3px solid var(--border);margin:12px 0;padding:2px 0 2px 12px}.step p{margin:8px 0}
.screenshots{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin:10px 0 14px}
.screenshot{border:1px solid var(--border);border-radius:8px;overflow:hidden;background:var(--surface-muted)}
.screenshot img{display:block;width:100%;height:auto}.screenshot figcaption{font-size:12px;padding:8px;color:var(--muted)}
.coverage-refs{display:inline-flex;gap:2px;margin-left:4px}.coverage-ref{color:inherit;text-decoration:underline;text-underline-offset:2px}
.line-link{color:inherit;text-decoration:underline;text-underline-offset:2px}
.flag-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:12px}
.flag-card{border:1px solid var(--border);border-left:4px solid var(--border);border-radius:8px;padding:14px;background:var(--surface)}
.flag-card h3{font-size:16px;margin:0 0 8px}.flag-card p{margin:8px 0}
.flag-item-link{color:inherit;text-decoration:underline;text-decoration-color:var(--muted);text-underline-offset:2px}
.flag-card.openQuestions{border-left-color:var(--warning)}.flag-card.assumptions{border-left-color:var(--muted)}
.extension-section{border:1px solid var(--border);border-radius:8px;padding:14px;margin:12px 0;background:var(--surface)}
.extension-section h4{margin:0 0 8px}.extension-section p{margin:8px 0}
.mermaid-wrap{overflow-x:auto;margin:12px 0;padding:12px;border:1px solid var(--border);border-radius:8px;background:var(--surface)}
.mermaid{min-width:max-content;text-align:center}.mermaid svg{display:block;max-width:none;height:auto;margin:0 auto}
.mermaid-error{color:var(--danger);text-align:left;white-space:pre-wrap}
@media(min-width:1600px){.report-navigator{width:260px}.report-navigator .navigator-menu{display:block}}
@media(max-width:720px){.flag-grid{grid-template-columns:1fr}.layer-summary{align-items:flex-start;flex-wrap:wrap}.layer-badges{justify-content:flex-start;width:100%}}`;
}

function featureReportScripts() {
  const openTag = "<" + "script>";
  const closeTag = "<" + "/script>";
  const mermaidOpenTag =
    "<" +
    'script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js" crossorigin="anonymous">';
  return `${openTag}
const bulkToggledDetails = new WeakSet();

function updateDetailsToggleButton(button) {
  const section = button.closest("[data-details-section]");
  if (!section) return;
  const targets = Array.from(section.querySelectorAll(button.dataset.detailsSelector));
  const allOpen = targets.length > 0 && targets.every((details) => details.open);
  button.textContent = allOpen ? button.dataset.hideLabel : button.dataset.showLabel;
  button.setAttribute("aria-expanded", String(allOpen));
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-details-toggle]");
  if (!(button instanceof HTMLButtonElement)) return;
  const section = button.closest("[data-details-section]");
  if (!section) return;
  const targets = Array.from(section.querySelectorAll(button.dataset.detailsSelector));
  const shouldOpen = !targets.every((details) => details.open);
  targets.forEach((details) => {
    if (details.open !== shouldOpen) {
      bulkToggledDetails.add(details);
      details.open = shouldOpen;
    }
  });
  updateDetailsToggleButton(button);
});

document.addEventListener("toggle", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLDetailsElement)) return;
  const section = target.closest("[data-details-section]");
  const button = section?.querySelector("[data-details-toggle]");
  if (button instanceof HTMLButtonElement) requestAnimationFrame(() => updateDetailsToggleButton(button));
  if (bulkToggledDetails.has(target)) {
    bulkToggledDetails.delete(target);
    return;
  }
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

function revealHashTarget() {
  const id = decodeURIComponent(window.location.hash.slice(1));
  if (!id) return;
  const target = document.getElementById(id);
  if (!target) return;
  let ancestor = target instanceof HTMLDetailsElement ? target : target.closest("details");
  while (ancestor) {
    ancestor.open = true;
    ancestor = ancestor.parentElement?.closest("details");
  }
}
window.addEventListener("hashchange", revealHashTarget);
document.addEventListener("DOMContentLoaded", revealHashTarget);

function initializeReportNavigator() {
  const navigator = document.querySelector("[data-report-navigator]");
  if (!(navigator instanceof HTMLElement)) return;
  const trigger = navigator.querySelector("[data-navigator-trigger]");
  const currentLabel = navigator.querySelector("[data-navigator-current]");
  const entries = Array.from(navigator.querySelectorAll("[data-navigator-target]"));
  const scenarioButtons = Array.from(navigator.querySelectorAll("[data-navigator-scenarios-target]"));
  const targets = entries
    .map((entry) => document.getElementById(entry.dataset.navigatorTarget))
    .filter((target) => target instanceof HTMLDetailsElement);
  let frame = 0;
  let lockedTarget = null;

  function setMenuOpen(open) {
    navigator.dataset.open = String(open);
    trigger?.setAttribute("aria-expanded", String(open));
  }

  function updateActiveSection() {
    frame = 0;
    const visible = targets.filter((target) => target.getClientRects().length > 0);
    if (!visible.length) return;
    let active = lockedTarget && visible.includes(lockedTarget) ? lockedTarget : visible[0];
    if (!lockedTarget || !visible.includes(lockedTarget)) {
      const threshold = 120;
      for (const target of visible) {
        if (target.getBoundingClientRect().top <= threshold) active = target;
        else break;
      }
    }
    entries.forEach((entry) => {
      if (entry.dataset.navigatorTarget === active.id) entry.setAttribute("aria-current", "location");
      else entry.removeAttribute("aria-current");
    });
    const activeEntry = entries.find((entry) => entry.dataset.navigatorTarget === active.id);
    if (currentLabel) currentLabel.textContent = activeEntry?.textContent?.trim() || active.id;
    entries.forEach((entry) => {
      const target = document.getElementById(entry.dataset.navigatorTarget);
      if (target instanceof HTMLDetailsElement) entry.setAttribute("aria-pressed", String(target.open));
    });
    scenarioButtons.forEach((button) => {
      const documentSection = document.getElementById(button.dataset.navigatorScenariosTarget);
      const scenarios = Array.from(documentSection?.querySelectorAll("details.scenario") ?? []);
      button.setAttribute("aria-pressed", String(scenarios.length > 0 && scenarios.every((scenario) => scenario.open)));
    });
  }

  function requestActiveUpdate() {
    if (frame) return;
    frame = requestAnimationFrame(updateActiveSection);
  }

  function toggleAndJumpTo(index) {
    const target = targets[index];
    if (!target) return;
    lockedTarget = target;
    let ancestor = target.parentElement?.closest("details");
    while (ancestor) {
      ancestor.open = true;
      ancestor = ancestor.parentElement?.closest("details");
    }
    target.open = !target.open;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", "#" + target.id);
    if (window.innerWidth < 1600) setMenuOpen(false);
    requestActiveUpdate();
  }

  trigger?.addEventListener("click", () => setMenuOpen(navigator.dataset.open !== "true"));
  entries.forEach((entry, index) => entry.addEventListener("click", (event) => {
    event.preventDefault();
    toggleAndJumpTo(index);
  }));
  scenarioButtons.forEach((button) => button.addEventListener("click", () => {
    const documentSection = document.getElementById(button.dataset.navigatorScenariosTarget);
    if (!(documentSection instanceof HTMLDetailsElement)) return;
    let ancestor = documentSection.parentElement?.closest("details");
    while (ancestor) {
      ancestor.open = true;
      ancestor = ancestor.parentElement?.closest("details");
    }
    documentSection.open = true;
    const scenarios = Array.from(documentSection.querySelectorAll("details.scenario"));
    const shouldOpen = !scenarios.every((scenario) => scenario.open);
    scenarios.forEach((scenario) => {
      bulkToggledDetails.add(scenario);
      scenario.open = shouldOpen;
    });
    requestActiveUpdate();
  }));
  window.addEventListener("scroll", requestActiveUpdate, { passive: true });
  window.addEventListener("resize", requestActiveUpdate);
  window.addEventListener("wheel", () => { lockedTarget = null; requestActiveUpdate(); }, { passive: true });
  window.addEventListener("touchmove", () => { lockedTarget = null; requestActiveUpdate(); }, { passive: true });
  document.addEventListener("pointerdown", (event) => {
    if (!navigator.contains(event.target)) lockedTarget = null;
  });
  document.addEventListener("keydown", (event) => {
    if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key)) lockedTarget = null;
  });
  document.addEventListener("toggle", requestActiveUpdate, true);
  updateActiveSection();
}
document.addEventListener("DOMContentLoaded", initializeReportNavigator);
${closeTag}
${mermaidOpenTag}${closeTag}
${openTag}
async function renderMermaidDiagrams() {
  const diagrams = document.querySelectorAll(".mermaid");
  if (!diagrams.length) return;
  if (!window.mermaid) {
    diagrams.forEach((diagram) => diagram.classList.add("mermaid-error"));
    return;
  }
  try {
    diagrams.forEach((diagram) => {
      diagram.dataset.mermaidSource ||= diagram.textContent || "";
      diagram.textContent = diagram.dataset.mermaidSource;
      diagram.removeAttribute("data-processed");
    });
    window.mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: document.documentElement.dataset.theme === "dark" ? "dark" : "default" });
    await window.mermaid.run({ nodes: diagrams });
  } catch (error) {
    diagrams.forEach((diagram) => diagram.classList.add("mermaid-error"));
    console.error("Unable to render Mermaid diagram", error);
  }
}
document.addEventListener("DOMContentLoaded", renderMermaidDiagrams);
document.addEventListener("feature-spec-theme-change", renderMermaidDiagrams);
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
  const month = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ][date.getMonth()];
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

function renderLayeredDocuments(
  documents: ReportDocument[],
  options: ReportOptions,
  evidence: SpecScreenshot[],
  sourceLinks: SourceLinkOptions,
) {
  const configured = options.layers ?? [];
  const configuredIds = new Set(configured.map((layer) => layer.id));
  const layers = configured.map((layer) => ({
    ...layer,
    documents: documents.filter(
      (document) => document.frontmatter.layer === layer.id,
    ),
  }));
  const otherDocuments = documents.filter(
    (document) =>
      !document.frontmatter.layer ||
      !configuredIds.has(document.frontmatter.layer),
  );
  if (otherDocuments.length) {
    layers.push({
      id: "other",
      title: "Other",
      description: "Documents without a configured report layer",
      documents: otherDocuments,
    });
  }

  return `${renderReportNavigator(layers)}
<section class="report-layers" data-details-section>
  <div class="details-section-header"><h2>Specification layers</h2></div>
  ${layers
    .map((layer) =>
      renderLayer(
        layer,
        options,
        evidence,
        sourceLinks,
        options.layersDefaultOpen ?? true,
        options.documentsDefaultOpen ?? false,
      ),
    )
    .join("\n")}
</section>`;
}

function renderReportNavigator(
  layers: Array<ReportLayer & { documents: ReportDocument[] }>,
) {
  const entries = layers
    .map(
      (layer) => `<div class="navigator-layer">
    <div class="navigator-row">${renderNavigatorLink(`layer-${layer.id}`, layer.title, "navigator-layer-link")}</div>
    ${layer.documents
      .map(
        (document) =>
          `<div class="navigator-row">${renderNavigatorLink(
            document.frontmatter.id.toLowerCase(),
            document.title,
            "navigator-document",
          )}${renderNavigatorScenarioButton(document)}</div>`,
      )
      .join("")}
  </div>`,
    )
    .join("");
  const firstTitle = layers[0]?.title ?? "Specification layers";
  return `<nav class="report-navigator" data-report-navigator data-open="false" aria-label="Report navigation">
  <button class="navigator-trigger" type="button" data-navigator-trigger aria-expanded="false">
    <span class="navigator-current" data-navigator-current>${html(firstTitle)}</span>
  </button>
  <div class="navigator-menu">
    <div class="navigator-links">${entries}</div>
  </div>
</nav>`;
}

function renderNavigatorLink(id: string, title: string, className: string) {
  return `<button class="navigator-link ${className}" type="button" data-navigator-target="${html(id)}" aria-pressed="false"><span class="navigator-toggle-state" aria-hidden="true"></span><span class="navigator-link-label">${html(title)}</span></button>`;
}

function renderNavigatorScenarioButton(document: ReportDocument) {
  if (document.kind !== "feature" && document.kind !== undefined) return "";
  if (!document.scenarios.length) return "";
  const id = document.frontmatter.id.toLowerCase();
  return `<button class="navigator-scenarios" type="button" data-navigator-scenarios-target="${html(id)}" aria-label="Toggle scenarios for ${html(document.title)}" aria-pressed="false">Scenarios</button>`;
}

function renderLayer(
  layer: ReportLayer & { documents: ReportDocument[] },
  options: ReportOptions,
  evidence: SpecScreenshot[],
  sourceLinks: SourceLinkOptions,
  open: boolean,
  documentsOpen: boolean,
) {
  const metrics = layerMetrics(layer.documents, options);
  const description = layer.description
    ? `<p>${html(layer.description)}</p>`
    : "";
  return `<details id="layer-${html(layer.id)}" class="layer-section" data-details-section${openAttribute(open)}>
  <summary class="layer-summary">
    <div class="layer-summary-copy"><h2>${html(layer.title)}</h2>${description}</div>
    <span class="layer-badges"><span class="badge">${layer.documents.length} document${layer.documents.length === 1 ? "" : "s"}</span>${metrics.coverageTotal ? `<span class="badge ${metrics.coverageMissing ? "warning" : "ok"}">${metrics.coverageTotal - metrics.coverageMissing}/${metrics.coverageTotal} covered</span>` : ""}${metrics.issues ? `<span class="badge ${metrics.errors ? "error" : "warning"}">${metrics.issues} issue${metrics.issues === 1 ? "" : "s"}</span>` : ""}${metrics.flags ? `<span class="badge muted">${metrics.flags} open item${metrics.flags === 1 ? "" : "s"}</span>` : ""}</span>
  </summary>
  <div class="layer-body">
    <div class="details-section-header">${renderDetailsToggleButton(".layer-body > details.document-section", "documents")}</div>
    ${layer.documents.map((document) => renderLayerDocument(document, options, evidence, sourceLinks, documentsOpen)).join("\n")}
  </div>
</details>`;
}

function renderLayerDocument(
  document: ReportDocument,
  options: ReportOptions,
  evidence: SpecScreenshot[],
  sourceLinks: SourceLinkOptions,
  open: boolean,
) {
  if (document.kind === "model")
    return renderModelDocument(document, options.coverage, sourceLinks, open);
  if (document.kind === "stack")
    return renderContextDocument(
      document,
      "Stack",
      [
        ["Stack", document.stack],
        ["Context", document.context],
        ["Rationale", document.rationale],
        ["Consequences", document.consequences],
      ],
      options.coverage,
      sourceLinks,
      open,
      true,
    );
  if (document.kind === "design")
    return renderContextDocument(
      document,
      "Design",
      [
        ["Design", document.design],
        ["Principles", document.principles],
        ["Layout", document.layout],
        ["Interaction", document.interaction],
        ["Visual style", document.visualStyle],
      ],
      options.coverage,
      sourceLinks,
      open,
      true,
    );
  return renderSpec(
    document,
    options.coverage,
    evidence,
    sourceLinks,
    open,
    true,
  );
}

function renderModelDocument(
  model: ModelSpec,
  coverage: CoverageSummary | undefined,
  sourceLinks: SourceLinkOptions,
  open: boolean,
) {
  const ruleCoverage = coverage?.ruleCoverage ?? [];
  const scenarioCoverage = coverage?.scenarioCoverage ?? [];
  return `<details id="${html(model.frontmatter.id.toLowerCase())}" class="panel report-section document-section" data-details-section${openAttribute(open)}>
  <summary class="report-section-summary"><h2>${html(model.title)}</h2><span class="badge document-kind">Model</span><span class="badge">${html(model.frontmatter.status ?? "draft")}</span></summary>
  <div class="report-section-body">
    <div class="details-section-header">${renderDetailsToggleButton("details.model-item", "model items")}</div>
    ${renderModel(model, coverage?.modelCoverage ?? [], ruleCoverage, buildRuleScenarioLinks(ruleCoverage, scenarioCoverage), sourceLinks)}
  </div>
</details>`;
}

function layerMetrics(documents: ReportDocument[], options: ReportOptions) {
  const filePaths = new Set(documents.map((document) => document.filePath));
  const ids = new Set(
    documents.flatMap((document) => [
      ...(document.kind === "model"
        ? document.modelItems.map((item) => item.id)
        : []),
      ...document.rules.map((rule) => rule.id),
      ...(document.kind === "feature" || document.kind === undefined
        ? document.scenarios.map((scenario) => scenario.id)
        : []),
    ]),
  );
  const coverageItems = [
    ...(options.coverage?.modelCoverage ?? []),
    ...(options.coverage?.ruleCoverage ?? []),
    ...(options.coverage?.scenarioCoverage ?? []),
  ].filter((item) => ids.has(item.id));
  const issues = (options.validationIssues ?? []).filter(
    (issue) => !issue.filePath || filePaths.has(issue.filePath),
  );
  const flags = documents.reduce(
    (sum, document) =>
      sum +
      (document.source.match(/^## (?:Open Questions|Assumptions)$/gim)
        ?.length ?? 0),
    0,
  );
  return {
    coverageTotal: coverageItems.length,
    coverageMissing: coverageItems.filter((item) => !item.covered).length,
    issues: issues.length,
    errors: issues.filter((issue) => issue.severity === "error").length,
    flags,
  };
}

function openAttribute(open: boolean) {
  return open ? " open" : "";
}

function documentDetailsAttributes(id: string, open: boolean, nested: boolean) {
  return nested
    ? ` id="${html(id.toLowerCase())}" class="panel report-section document-section"${openAttribute(open)}`
    : ` class="panel report-section"${openAttribute(open)}`;
}

function renderOpenQuestionsAndAssumptions(
  documents: ReportDocument[],
  sourceLinks: SourceLinkOptions,
) {
  const sections = documents
    .flatMap((document) => extensionSections(document))
    .filter(
      (section) =>
        section.kind === "openQuestions" || section.kind === "assumptions",
    );
  if (!sections.length) return "";
  const openQuestionCount = sections.filter(
    (section) => section.kind === "openQuestions",
  ).length;
  const assumptionCount = sections.filter(
    (section) => section.kind === "assumptions",
  ).length;
  return `<details class="panel report-section" open>
  <summary class="report-section-summary">
    <h2>Open questions and assumptions</h2>
    <span class="badge warning">${html(`${openQuestionCount} open question section(s) · ${assumptionCount} assumption section(s)`)}</span>
  </summary>
  <div class="report-section-body">
  <p class="muted">Informational only: these sections are highlighted for review, but they do not fail validation, coverage, or the build. Review and either answer, promote to rules/scenarios, or remove when no longer relevant.</p>
  <div class="flag-grid">${sections.map((section) => renderFlaggedSection(section, sourceLinks)).join("")}</div>
  </div>
</details>`;
}

function renderFlaggedSection(
  section: ReportExtensionSection,
  sourceLinks: SourceLinkOptions,
) {
  return `<article class="flag-card ${html(section.kind)}">
  <h3>${html(section.title)} <span class="badge">${html(documentLabel(section.document))}</span> ${renderLineBadge(section.document.filePath, section.line, sourceLinks)}</h3>
  ${renderFlaggedSectionBody(section, sourceLinks)}
</article>`;
}

function renderFlaggedSectionBody(
  section: ReportExtensionSection,
  sourceLinks: SourceLinkOptions,
) {
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

function flaggedItemAnchor(
  section: ReportExtensionSection,
  item: { text: string; line: number },
) {
  const stableId = item.text.match(/^([A-Z][A-Z0-9-]*-(?:Q|A)\d{3}):/)?.[1];
  return (
    stableId ??
    `${section.document.frontmatter.id}-${section.kind}-${item.line}`
  ).toLowerCase();
}

function renderIssues(issues: ValidationIssue[]) {
  if (!issues.length) return "";
  return `<details class="panel report-section" open><summary class="report-section-summary"><h2>Validation</h2></summary><div class="report-section-body"><ul>${issues
    .map(
      (issue) =>
        `<li class="${issue.severity}"><code>${html(`${issue.filePath ?? ""}${issue.line ? `:${issue.line}` : ""}`)}</code> ${html(issue.message)}</li>`,
    )
    .join("")}</ul></div></details>`;
}

function renderModels(
  models: ModelSpec[],
  coverage?: CoverageSummary,
  sourceLinks: SourceLinkOptions = {},
) {
  if (!models.length) return "";
  const modelCoverage = coverage?.modelCoverage ?? [];
  const ruleCoverage = coverage?.ruleCoverage ?? [];
  const scenarioCoverage = coverage?.scenarioCoverage ?? [];
  const ruleScenarioLinks = buildRuleScenarioLinks(
    ruleCoverage,
    scenarioCoverage,
  );
  return `<details class="panel report-section" data-details-section open>
  <summary class="report-section-summary"><h2>Models</h2></summary>
  <div class="report-section-body">
  <div class="details-section-header">${renderDetailsToggleButton("details.model-item", "models")}</div>
  ${models.map((model) => renderModel(model, modelCoverage, ruleCoverage, ruleScenarioLinks, sourceLinks)).join("\n")}
  </div>
</details>`;
}

function renderDetailsToggleButton(selector: string, itemLabel: string) {
  return `<button class="details-toggle-button" type="button" data-details-toggle data-details-selector="${html(selector)}" data-show-label="Show all ${html(itemLabel)}" data-hide-label="Hide all ${html(itemLabel)}" aria-expanded="false">Show all ${html(itemLabel)}</button>`;
}

function renderModel(
  model: ModelSpec,
  modelCoverage: CoverageItem[],
  ruleCoverage: CoverageItem[],
  ruleScenarioLinks: RuleScenarioLink[],
  sourceLinks: SourceLinkOptions,
) {
  return `<section>
  <div class="feature-header">
    <h3>${html(model.frontmatter.id)} ${html(model.title)}</h3>
    <span class="badge">${html(model.frontmatter.status ?? "draft")}</span>
  </div>
  <p>${html(model.purpose)}</p>
  ${model.modelItems
    .map((item) => {
      const coverageItem = modelCoverage.find(
        (candidate) => candidate.id === item.id,
      );
      return `<details class="model-item">
    <summary><code>${html(item.id)}</code>: ${html(item.title)} ${coverageBadge(coverageItem?.covered, [], coverageItem, sourceLinks)}</summary>
    <div class="model-item-body">${renderModelItemBody(item.body)}</div>
  </details>`;
    })
    .join("\n")}
  ${renderModelRules(model, ruleCoverage, ruleScenarioLinks, sourceLinks)}
  ${renderDocumentExtensionSections(model, sourceLinks)}
</section>`;
}

function renderModelRules(
  model: ModelSpec,
  ruleCoverage: CoverageItem[],
  ruleScenarioLinks: RuleScenarioLink[],
  sourceLinks: SourceLinkOptions,
) {
  if (!model.rules.length) return "";
  return `<h4>Rules</h4><ul>${model.rules
    .map((rule) => {
      const item = ruleCoverage.find(
        (coverageItem) => coverageItem.id === rule.id,
      );
      return `<li><code>${html(rule.id)}</code>: ${html(rule.text)} ${ruleCoverageBadge(item, ruleScenarioIds(rule.id, ruleScenarioLinks), sourceLinks)}</li>`;
    })
    .join("")}</ul>`;
}

function renderStacks(
  stacks: StackSpec[],
  coverage?: CoverageSummary,
  sourceLinks: SourceLinkOptions = {},
) {
  return stacks
    .map((stack) =>
      renderContextDocument(
        stack,
        "Stack",
        [
          ["Stack", stack.stack],
          ["Context", stack.context],
          ["Rationale", stack.rationale],
          ["Consequences", stack.consequences],
        ],
        coverage,
        sourceLinks,
      ),
    )
    .join("\n");
}

function renderDesigns(
  designs: DesignSpec[],
  coverage?: CoverageSummary,
  sourceLinks: SourceLinkOptions = {},
) {
  return designs
    .map((design) =>
      renderContextDocument(
        design,
        "Design",
        [
          ["Design", design.design],
          ["Principles", design.principles],
          ["Layout", design.layout],
          ["Interaction", design.interaction],
          ["Visual style", design.visualStyle],
        ],
        coverage,
        sourceLinks,
      ),
    )
    .join("\n");
}

function renderContextDocument(
  document: StackSpec | DesignSpec,
  kindLabel: string,
  sections: Array<[string, string]>,
  coverage: CoverageSummary | undefined,
  sourceLinks: SourceLinkOptions,
  open = true,
  nested = false,
) {
  const ruleCoverage = coverage?.ruleCoverage ?? [];
  const ruleScenarioLinks = buildRuleScenarioLinks(
    ruleCoverage,
    coverage?.scenarioCoverage ?? [],
  );
  return `<details${documentDetailsAttributes(document.frontmatter.id, open, nested)}>
  <summary class="report-section-summary">
    <h2>${html(document.title)}</h2>
    <span class="badge">${html(kindLabel)}</span>
    <span class="badge">${html(document.frontmatter.status ?? "draft")}</span>
  </summary>
  <div class="report-section-body">
    <p>${html(document.purpose)}</p>
    ${sections
      .filter(([, body]) => body)
      .map(
        ([title, body]) =>
          `<section><h3>${html(title)}</h3>${renderMarkdownBlock(body, 1)}</section>`,
      )
      .join("")}
    ${renderContextRules(document.rules, ruleCoverage, ruleScenarioLinks, sourceLinks)}
    ${renderDocumentExtensionSections(document, sourceLinks)}
  </div>
</details>`;
}

function renderContextRules(
  rules: FeatureRule[],
  ruleCoverage: CoverageItem[],
  ruleScenarioLinks: RuleScenarioLink[],
  sourceLinks: SourceLinkOptions,
) {
  if (!rules.length) return "";
  return `<h3>Rules</h3><ul>${rules
    .map((rule) => {
      const item = ruleCoverage.find(
        (coverageItem) => coverageItem.id === rule.id,
      );
      return `<li><code>${html(rule.id)}</code>: ${html(rule.text)} ${ruleCoverageBadge(item, ruleScenarioIds(rule.id, ruleScenarioLinks), sourceLinks)}</li>`;
    })
    .join("")}</ul>`;
}

function renderSpec(
  spec: FeatureSpec,
  coverage?: CoverageSummary,
  evidence: SpecScreenshot[] = [],
  sourceLinks: SourceLinkOptions = {},
  open = true,
  nested = false,
) {
  const evidenceByLine = groupEvidenceByLine(evidence);
  const ruleCoverage = coverage?.ruleCoverage ?? [];
  const scenarioCoverage = coverage?.scenarioCoverage ?? [];
  const ruleScenarioLinks = buildRuleScenarioLinks(
    ruleCoverage,
    scenarioCoverage,
  );
  return `<details${documentDetailsAttributes(spec.frontmatter.id, open, nested)}>
  <summary class="report-section-summary">
    <h2>${html(spec.title)}</h2>
    <span class="badge">${html(spec.frontmatter.status ?? "draft")}</span>
  </summary>
  <div class="report-section-body">
  ${renderFeaturePolicy(spec)}
  <p>${html(spec.purpose)}</p>
  <h3>Rules</h3>
  <ul>${spec.rules.map((rule) => renderFeatureRule(rule.id, rule.text, ruleCoverage, ruleScenarioLinks, sourceLinks)).join("")}</ul>
  <section data-details-section>
    <div class="details-section-header">
      <h3>Scenarios</h3>
      ${renderDetailsToggleButton("details.scenario", "scenarios")}
    </div>
    ${spec.scenarios.map((scenario) => renderScenario(spec, scenario, scenarioCoverage, ruleScenarioLinks, evidenceByLine, sourceLinks)).join("\n")}
  </section>
  ${renderDocumentExtensionSections(spec, sourceLinks)}
  </div>
</details>`;
}

function renderFeaturePolicy(spec: FeatureSpec) {
  const items = [
    spec.frontmatter.test ? ["test", spec.frontmatter.test] : undefined,
    spec.frontmatter.screenshots
      ? ["screenshots", spec.frontmatter.screenshots]
      : undefined,
    spec.frontmatter.journey
      ? ["journey", spec.frontmatter.journey]
      : undefined,
    spec.frontmatter.path ? ["path", spec.frontmatter.path] : undefined,
    spec.frontmatter.critical !== undefined
      ? ["critical", String(spec.frontmatter.critical)]
      : undefined,
  ].filter((item): item is [string, string] => Boolean(item));
  if (!items.length) return "";
  return `<div class="feature-policy">${items
    .map(
      ([label, value]) =>
        `<span class="badge"><span class="muted">${html(label)}</span> <code>${html(value)}</code></span>`,
    )
    .join("")}</div>`;
}

function renderFeatureRule(
  id: string,
  text: string,
  ruleCoverage: CoverageItem[],
  ruleScenarioLinks: RuleScenarioLink[],
  sourceLinks: SourceLinkOptions,
) {
  const item = ruleCoverage.find((coverageItem) => coverageItem.id === id);
  return `<li><code>${html(id)}</code>: ${html(text)} ${ruleCoverageBadge(item, ruleScenarioIds(id, ruleScenarioLinks), sourceLinks)}</li>`;
}

function renderScenario(
  spec: FeatureSpec,
  scenario: FeatureSpec["scenarios"][number],
  scenarioCoverage: CoverageItem[],
  ruleScenarioLinks: RuleScenarioLink[],
  evidenceByLine: Map<string, SpecScreenshot[]>,
  sourceLinks: SourceLinkOptions,
) {
  const scenarioEvidence = scenario.steps.flatMap(
    (step) => evidenceByLine.get(screenshotKey(spec.filePath, step.line)) ?? [],
  );
  const changedCount = scenarioEvidence.filter(
    (entry) => entry.changed && entry.path,
  ).length;
  const scenarioRuleIds = ruleIdsForScenario(
    scenario.id,
    spec.rules.map((rule) => rule.id),
    ruleScenarioLinks,
  );
  const scenarioCoverageItem = scenarioCoverage.find(
    (item) => item.id === scenario.id,
  );
  return `<details id="${html(scenario.id.toLowerCase())}" class="scenario" data-has-images="${changedCount > 0 ? "true" : "false"}">
  <summary><code>${html(scenario.id)}</code>: ${html(scenario.title)} ${coverageBadge(scenarioCoverageItem?.covered, [], scenarioCoverageItem, sourceLinks)}</summary>
  <div class="scenario-body${changedCount === 0 ? " compact-steps" : ""}">${renderJourneyMetadata(scenario)}${renderScenarioRuleCoverage(scenarioRuleIds)}${scenario.steps.map((step) => renderStep(spec, step, evidenceByLine, sourceLinks, scenario.evidence.screenshots)).join("")}</div>
</details>`;
}

function renderJourneyMetadata(scenario: FeatureSpec["scenarios"][number]) {
  if (!scenario.journey) return "";
  const items = [
    ["journey", scenario.journey.scope],
    ["path", scenario.journey.path],
    scenario.journey.critical ? ["critical", "true"] : undefined,
    scenario.journey.systems.length
      ? ["systems", scenario.journey.systems.join(", ")]
      : undefined,
  ].filter((item): item is [string, string] => Boolean(item));
  return `<div class="feature-policy">${items.map(([label, value]) => `<span class="badge"><span class="muted">${html(label)}</span> <code>${html(value)}</code></span>`).join("")}</div>`;
}

function renderScenarioRuleCoverage(ruleIds: string[]) {
  if (!ruleIds.length)
    return `<p><strong>Rules covered by this scenario:</strong> <span class="muted">none referenced</span></p>`;
  return `<p><strong>Rules covered by this scenario:</strong> ${ruleIds.map((ruleId) => `<code>${html(ruleId)}</code>`).join(" ")}</p>`;
}

function renderDocumentExtensionSections(
  document: ReportDocument,
  sourceLinks: SourceLinkOptions,
) {
  const sections = extensionSections(document);
  if (!sections.length) return "";
  return `<h3>Spec context</h3>${sections.map((section) => renderDocumentExtensionSection(section, sourceLinks)).join("")}`;
}

function renderDocumentExtensionSection(
  section: ReportExtensionSection,
  sourceLinks: SourceLinkOptions,
) {
  const coverageNote =
    section.kind === "apiContract" || section.kind === "permissions"
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
    .map(
      (item) =>
        `<li id="${html(flaggedItemAnchor(section, item))}">${renderInlineMarkdown(item.text)}</li>`,
    )
    .join("")}</ul>`;
}

function renderModelItemBody(body: string) {
  return renderMarkdownBlock(body);
}

function renderMarkdownBlock(body: string, headingOffset = 0) {
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
    blocks.push(
      `<ul>${list.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</ul>`,
    );
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
    const headingMatch = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = Math.min(6, headingMatch[1].length + headingOffset);
      blocks.push(
        `<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`,
      );
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
    .map((part) =>
      part.startsWith("`") && part.endsWith("`")
        ? `<code>${html(part.slice(1, -1))}</code>`
        : html(part),
    )
    .join("");
}

function isTableStart(lines: string[], index: number) {
  return (
    isPipeTableRow(lines[index]) &&
    index + 1 < lines.length &&
    isTableSeparator(lines[index + 1])
  );
}

function isPipeTableRow(line: string) {
  return line.trim().startsWith("|") && line.trim().endsWith("|");
}

function isTableSeparator(line: string) {
  return (
    isPipeTableRow(line) &&
    splitTableRow(line).every((cell) => /^:?-{3,}:?$/.test(cell))
  );
}

function splitTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderTable(lines: string[]) {
  const headers = splitTableRow(lines[0]);
  const rows = lines.slice(1).map(splitTableRow);
  return `<div class="table-wrap"><table><thead><tr>${headers.map((header) => `<th>${renderInlineMarkdown(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${renderInlineMarkdown(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function renderStep(
  spec: FeatureSpec,
  step: FeatureStep,
  evidenceByLine: Map<string, SpecScreenshot[]>,
  sourceLinks: SourceLinkOptions,
  screenshotPolicy: string,
) {
  const evidence =
    evidenceByLine.get(screenshotKey(spec.filePath, step.line)) ?? [];
  const screenshots = evidence.filter((entry) => entry.changed && entry.path);
  const unchanged = evidence.filter((entry) => !entry.changed);
  const evidenceBadge =
    screenshotPolicy === "skip"
      ? ""
      : screenshots.length
        ? `<span class="badge ok">screen changed · screenshot captured</span>`
        : unchanged.length
          ? `<span class="badge muted">same screen${renderComparedWith(unchanged[0])}</span>`
          : `<span class="badge muted" title="missing screenshot evidence is informational">no screenshot captured</span>`;
  return `<div class="step"><p><strong>${html(step.keyword)}</strong> ${html(step.text)} ${renderLineBadge(spec.filePath, step.line, sourceLinks)} ${evidenceBadge}</p>${renderScreenshots(screenshots)}</div>`;
}

function renderComparedWith(entry: SpecScreenshot) {
  return entry.comparedWithLine
    ? ` as line ${html(String(entry.comparedWithLine))}`
    : " as previous screen";
}

function renderLineBadge(
  filePath: string,
  line: number,
  sourceLinks: SourceLinkOptions,
) {
  const label = `line ${line}`;
  const url = sourceLineUrl(filePath, line, sourceLinks);
  if (!url) return `<span class="badge">${html(label)}</span>`;
  return `<a class="badge line-link" href="${html(url)}" title="${html(`${filePath}:${line}`)}" target="_blank" rel="noopener noreferrer">${html(label)}</a>`;
}

function renderScreenshots(screenshots: SpecScreenshot[]) {
  if (!screenshots.length) return "";
  return `<div class="screenshots">${screenshots.map((screenshot) => `<figure class="screenshot"><img src="${html(screenshot.path ?? "")}" alt="${html(screenshot.title ?? `Screenshot for ${screenshot.specPath}:${screenshot.line}`)}" data-lightbox tabindex="0"><figcaption>${html(screenshot.title ?? `${screenshot.specPath}:${screenshot.line}`)}</figcaption></figure>`).join("")}</div>`;
}

function coverageBadge(
  covered?: boolean,
  suffixes: string[] = [],
  item?: CoverageItem,
  sourceLinks: SourceLinkOptions = {},
) {
  return covered === undefined
    ? ""
    : covered
      ? `<span class="badge ok">covered${suffixes.length ? ` by ${suffixes.map(html).join(" ")}` : ""}${renderCoverageReferenceMarkers(item, sourceLinks)}</span>`
      : `<span class="badge missing">missing coverage</span>`;
}

function ruleCoverageBadge(
  ruleCoverage: CoverageItem | undefined,
  scenarioIds: string[],
  sourceLinks: SourceLinkOptions,
) {
  if (ruleCoverage?.covered && !scenarioIds.length)
    return coverageBadge(true, ["direct test"], ruleCoverage, sourceLinks);
  return coverageBadge(
    ruleCoverage?.covered,
    scenarioIds,
    ruleCoverage,
    sourceLinks,
  );
}

function renderCoverageReferenceMarkers(
  item: CoverageItem | undefined,
  sourceLinks: SourceLinkOptions,
) {
  const references = uniqueCoverageReferences(item);
  if (!references.length) return "";
  return ` <span class="coverage-refs">${references.map((reference, index) => renderCoverageReferenceMarker(reference, index + 1, sourceLinks)).join(",")}</span>`;
}

function renderCoverageReferenceMarker(
  reference: TestReference,
  index: number,
  sourceLinks: SourceLinkOptions,
) {
  const label = coverageReferenceLabel(reference);
  const url = coverageReferenceUrl(reference, sourceLinks);
  if (!url)
    return `<span class="coverage-ref" title="${html(label)}">${index}</span>`;
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

function coverageReferenceUrl(
  reference: TestReference,
  sourceLinks: SourceLinkOptions,
) {
  return sourceLineUrl(reference.filePath, reference.line, sourceLinks);
}

function sourceLineUrl(
  filePath: string,
  line: number,
  sourceLinks: SourceLinkOptions,
) {
  if (!sourceLinks.githubBaseUrl || !sourceLinks.githubRef) return undefined;
  const baseUrl = sourceLinks.githubBaseUrl.replace(/\/$/, "");
  const ref = encodeURIComponent(sourceLinks.githubRef);
  const encodedFilePath = filePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${baseUrl}/blob/${ref}/${encodedFilePath}#L${line}`;
}

function allReportDocuments(
  specs: FeatureSpec[],
  options: ReportOptions,
): ReportDocument[] {
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
  const start = lines.findIndex(
    (line) =>
      headingPattern.exec(line)?.[1].toLowerCase() === title.toLowerCase(),
  );
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

function ruleScenarioIds(
  ruleId: string,
  ruleScenarioLinks: RuleScenarioLink[],
) {
  return Array.from(
    new Set(
      ruleScenarioLinks
        .filter((link) => link.ruleId === ruleId)
        .map((link) => link.scenarioId),
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

function groupEvidenceByLine(evidence: SpecScreenshot[]) {
  const grouped = new Map<string, SpecScreenshot[]>();
  for (const entry of evidence) {
    const key = screenshotKey(entry.specPath, entry.line);
    grouped.set(key, [...(grouped.get(key) ?? []), entry]);
  }
  return grouped;
}
