import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { insertReportMetadata, type ReportMetadataItem } from "./reportMetadata.js";
import { renderHtmlReport } from "./reportTemplate.js";
import type {
  CoverageSummary,
  FeatureSpec,
  ModelSpec,
  SpecScreenshot,
  ValidationIssue,
} from "./types.js";

export type MockReportVariant = "current" | "previous";

export type MockReportData = {
  title: string;
  models: ModelSpec[];
  features: FeatureSpec[];
  coverage: CoverageSummary;
  screenshots: SpecScreenshot[];
  validationIssues: ValidationIssue[];
  metadata: ReportMetadataItem[];
};

export type WriteMockReportsOptions = {
  outDir?: string;
  generatedAt?: string;
};

const defaultGeneratedAt = "2026-01-15T12:30:00.000Z";

export function createMockReportData(
  variant: MockReportVariant = "current",
): MockReportData {
  const isCurrent = variant === "current";
  const model = supportDeskModel(isCurrent);
  const features = [ticketInboxFeature(isCurrent), ticketReplyFeature(isCurrent)];
  const scenarioCoverage = features.flatMap((feature) =>
    feature.scenarios.map((scenario) => ({
      id: scenario.id,
      title: scenario.title,
      filePath: feature.filePath,
      line: scenario.line,
      covered: scenario.id !== "SUPPORT-REPLY-S002",
      references:
        scenario.id === "SUPPORT-REPLY-S002"
          ? []
          : [testReference(scenario.id, "scenario", "tests/support-desk.spec.ts", 12)],
    })),
  );

  return {
    title: "Feature Spec Report for mock-support-desk",
    models: [model],
    features,
    coverage: {
      modelCoverage: model.modelItems.map((item) => ({
        id: item.id,
        title: item.title,
        filePath: model.filePath,
        line: item.line,
        covered: true,
        references: [testReference(item.id, "model", "tests/support-desk.spec.ts", 4)],
      })),
      ruleCoverage: [...model.rules, ...features.flatMap((feature) => feature.rules)].map(
        (rule) => ({
          id: rule.id,
          title: rule.text,
          filePath: rule.id.startsWith("SUPPORT-M")
            ? model.filePath
            : features.find((feature) =>
                feature.rules.some((candidate) => candidate.id === rule.id),
              )?.filePath,
          line: rule.line,
          covered: rule.id !== "SUPPORT-REPLY-R002",
          references:
            rule.id === "SUPPORT-REPLY-R002"
              ? []
              : [testReference(rule.id, "rule", "tests/support-desk.spec.ts", 8)],
        }),
      ),
      scenarioCoverage,
      orphanModelReferences: [],
      orphanRuleReferences: [
        testReference("SUPPORT-INBOX-R999", "rule", "tests/legacy.spec.ts", 3),
      ],
      orphanScenarioReferences: [],
    },
    screenshots: isCurrent
      ? [
          screenshot("specs/ticket-inbox.feature.md", 33, "screenshots/SUPPORT-INBOX-S001-line-33-current.svg", "Inbox with priority badges"),
          screenshot("specs/ticket-reply.feature.md", 31, "screenshots/SUPPORT-REPLY-S001-line-31-current.svg", "Reply composer with suggested answer"),
        ]
      : [
          screenshot("specs/ticket-inbox.feature.md", 33, "screenshots/SUPPORT-INBOX-S001-line-33-previous.svg", "Inbox before priority badges"),
        ],
    validationIssues: isCurrent
      ? [
          {
            code: "missing-rule-coverage",
            severity: "warning",
            message: "SUPPORT-REPLY-R002 is intentionally uncovered in the mock data so the warning state is visible.",
            filePath: "specs/ticket-reply.feature.md",
            line: 18,
          },
        ]
      : [],
    metadata: [
      {
        label: "Branch",
        value: isCurrent ? "feature/mock-report-ui" : "main",
        url: "https://github.com/anselmdk/feature-spec-md/tree/main",
      },
      {
        label: "Build",
        value: isCurrent ? "128" : "127",
        url: "https://github.com/anselmdk/feature-spec-md/actions/runs/128",
      },
      {
        label: "Commit",
        value: isCurrent ? "abc1234" : "def5678",
        url: "https://github.com/anselmdk/feature-spec-md/commit/abc1234",
      },
      {
        label: "Pull request",
        value: "#42",
        url: "https://github.com/anselmdk/feature-spec-md/pull/42",
      },
    ],
  };
}

export function renderMockFeatureSpecReport(
  variant: MockReportVariant = "current",
  generatedAt = defaultGeneratedAt,
) {
  const data = createMockReportData(variant);
  return insertReportMetadata(
    renderHtmlReport(data.features, {
      title: data.title,
      models: data.models,
      coverage: data.coverage,
      screenshots: data.screenshots,
      validationIssues: data.validationIssues,
      generatedAt,
      githubBaseUrl: "https://github.com/anselmdk/feature-spec-md",
      githubRef: variant === "current" ? "abc1234" : "def5678",
      repositoryUrl: "https://github.com/anselmdk/feature-spec-md",
    }),
    data.metadata,
  );
}

export function renderMockDiffReport(generatedAt = defaultGeneratedAt) {
  const previous = createMockReportData("previous");
  const current = createMockReportData("current");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Feature spec PR diff mock</title>
    <style>
      body{font-family:system-ui,sans-serif;max-width:1180px;margin:0 auto;padding:40px 24px;color:#1f2328}
      .panel{border:1px solid #d0d7de;border-radius:8px;padding:20px;margin:18px 0}
      .badge{border:1px solid #d0d7de;border-radius:999px;padding:2px 8px;font-size:12px;white-space:nowrap}
      .added{color:#1a7f37}.removed{color:#cf222e}.changed{color:#9a6700}.muted{color:#57606a}
      table{border-collapse:collapse;width:100%;font-size:14px}th,td{border:1px solid #d0d7de;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f6f8fa}
      .diff{width:100%;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px}.diff td{padding:2px 8px}.line-no{width:1%;color:#57606a;background:#f6f8fa;text-align:right;user-select:none}.diff-added td{background:#dafbe1}.diff-removed td{background:#ffebe9}.diff-context td{background:#fff}
      .image-pair{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}.image-card{border:1px solid #d0d7de;border-radius:8px;background:#f6f8fa;overflow:hidden}.image-card h4{margin:0;padding:8px 10px;background:#fff;border-bottom:1px solid #d0d7de}.image-card img{display:block;width:100%;height:auto}
      a{color:#0969da}
    </style>
  </head>
  <body>
    <h1>Feature spec PR diff for PR #42</h1>
    <p>Generated ${escapeHtml(formatGeneratedAt(generatedAt))}.</p>
    <section class="panel">
      <h2>Compared builds</h2>
      <p>Main: <a href="../previous-feature-spec-report/">build ${escapeHtml(previous.metadata.find((item) => item.label === "Build")?.value ?? "127")}</a></p>
      <p>PR: <a href="../feature-spec-report/">build ${escapeHtml(current.metadata.find((item) => item.label === "Build")?.value ?? "128")}</a></p>
      <p><span class="badge">2 spec changes</span> <span class="badge">2 screenshot changes</span></p>
    </section>
    <section class="panel">
      <h2>Spec changes</h2>
      <details open>
        <summary><strong>specs/ticket-inbox.feature.md</strong> <span class="badge changed">changed</span></summary>
        <table class="diff"><tbody>
          <tr class="diff-context"><td class="line-no">16</td><td class="line-no">16</td><td>  - SUPPORT-INBOX-R001: The inbox MUST show open tickets first.</td></tr>
          <tr class="diff-added"><td class="line-no"></td><td class="line-no">17</td><td>+ - SUPPORT-INBOX-R002: The inbox SHOULD highlight high priority tickets.</td></tr>
          <tr class="diff-context"><td class="line-no">27</td><td class="line-no">28</td><td>### SUPPORT-INBOX-S001: Agent reviews the queue</td></tr>
          <tr class="diff-removed"><td class="line-no">31</td><td class="line-no"></td><td>- Then open tickets are listed by age</td></tr>
          <tr class="diff-added"><td class="line-no"></td><td class="line-no">32</td><td>+ Then open tickets are listed by age with priority badges</td></tr>
        </tbody></table>
      </details>
      <details open>
        <summary><strong>specs/ticket-reply.feature.md</strong> <span class="badge added">added</span></summary>
        <table class="diff"><tbody>
          <tr class="diff-added"><td class="line-no"></td><td class="line-no">27</td><td>+ ### SUPPORT-REPLY-S002: Agent sends a saved reply</td></tr>
          <tr class="diff-added"><td class="line-no"></td><td class="line-no">29</td><td>+ Given an agent has selected a ticket</td></tr>
          <tr class="diff-added"><td class="line-no"></td><td class="line-no">30</td><td>+ When they choose a saved reply</td></tr>
          <tr class="diff-added"><td class="line-no"></td><td class="line-no">31</td><td>+ Then the composer is filled with reusable text</td></tr>
        </tbody></table>
      </details>
    </section>
    <section class="panel">
      <h2>Screenshots</h2>
      <section>
        <h3>specs/ticket-inbox.feature.md</h3>
        <details open>
          <summary><code>screenshots/SUPPORT-INBOX-S001-line-33.svg</code> <span class="badge changed">changed</span></summary>
          <div class="image-pair">
            <div class="image-card"><h4>Before</h4><img src="previous/screenshots/SUPPORT-INBOX-S001-line-33-previous.svg" alt="Before inbox"></div>
            <div class="image-card"><h4>After</h4><img src="current/screenshots/SUPPORT-INBOX-S001-line-33-current.svg" alt="After inbox"></div>
          </div>
        </details>
      </section>
      <section>
        <h3>specs/ticket-reply.feature.md</h3>
        <details open>
          <summary><code>screenshots/SUPPORT-REPLY-S001-line-31.svg</code> <span class="badge added">added</span></summary>
          <div class="image-pair">
            <div class="image-card"><h4>After</h4><img src="current/screenshots/SUPPORT-REPLY-S001-line-31-current.svg" alt="Reply composer"></div>
          </div>
        </details>
      </section>
    </section>
    <section class="panel">
      <h2>Other assets</h2>
      <p class="muted">No other asset changes.</p>
    </section>
  </body>
</html>`;
}

export async function writeMockReports(options: WriteMockReportsOptions = {}) {
  const outDir = options.outDir ?? "test-results/mock-reports";
  const generatedAt = options.generatedAt ?? defaultGeneratedAt;
  const featureDir = path.join(outDir, "feature-spec-report");
  const previousFeatureDir = path.join(outDir, "previous-feature-spec-report");
  const diffDir = path.join(outDir, "diff-report");

  await writeTextFile(
    path.join(featureDir, "index.html"),
    renderMockFeatureSpecReport("current", generatedAt),
  );
  await writeTextFile(
    path.join(previousFeatureDir, "index.html"),
    renderMockFeatureSpecReport("previous", generatedAt),
  );
  await writeTextFile(path.join(diffDir, "index.html"), renderMockDiffReport(generatedAt));

  await writeMockScreenshots(featureDir, "current");
  await writeMockScreenshots(previousFeatureDir, "previous");
  await writeMockScreenshots(path.join(diffDir, "current"), "current");
  await writeMockScreenshots(path.join(diffDir, "previous"), "previous");

  return {
    featureReportPath: path.join(featureDir, "index.html"),
    previousFeatureReportPath: path.join(previousFeatureDir, "index.html"),
    diffReportPath: path.join(diffDir, "index.html"),
  };
}

function supportDeskModel(isCurrent: boolean): ModelSpec {
  return {
    kind: "model",
    filePath: "specs/support-desk.model.md",
    frontmatter: { id: "SUPPORT", title: "Support desk", status: "active" },
    title: "Support desk",
    purpose: "Define the shared vocabulary for a small customer support workflow.",
    modelItems: [
      { id: "SUPPORT-M001", title: "Ticket", body: "A customer request that needs a response from an agent.", line: 14 },
      { id: "SUPPORT-M002", title: "Agent", body: "A team member who reviews tickets and sends replies.", line: 18 },
      { id: "SUPPORT-M003", title: "Priority", body: isCurrent ? "A visible urgency label used to sort the queue." : "An internal urgency label.", line: 22 },
    ],
    rules: [
      { id: "SUPPORT-M-R001", text: "Tickets MUST keep a stable public reference.", keyword: "MUST", strength: "required", line: 28 },
    ],
    source: "",
  };
}

function ticketInboxFeature(isCurrent: boolean): FeatureSpec {
  return {
    kind: "feature",
    filePath: "specs/ticket-inbox.feature.md",
    frontmatter: {
      id: "SUPPORT-INBOX",
      title: "Ticket inbox",
      status: "active",
      model: "SUPPORT",
      test: "playwright",
      screenshots: "required",
    },
    title: "Ticket inbox",
    purpose: "Let agents find the next ticket to work on without losing context.",
    rules: [
      { id: "SUPPORT-INBOX-R001", text: "The inbox MUST show open tickets first.", keyword: "MUST", strength: "required", line: 16 },
      ...(isCurrent
        ? [{ id: "SUPPORT-INBOX-R002", text: "The inbox SHOULD highlight high priority tickets.", keyword: "SHOULD" as const, strength: "recommended" as const, line: 17 }]
        : []),
    ],
    scenarios: [
      {
        id: "SUPPORT-INBOX-S001",
        title: "Agent reviews the queue",
        line: 28,
        evidence: { test: "playwright", screenshots: "required" },
        steps: [
          { keyword: "Given", text: "an agent has open tickets", line: 30 },
          { keyword: "When", text: "they open the inbox", line: 31 },
          { keyword: "Then", text: isCurrent ? "open tickets are listed by age with priority badges" : "open tickets are listed by age", line: 32 },
        ],
      },
    ],
    source: "",
  };
}

function ticketReplyFeature(isCurrent: boolean): FeatureSpec {
  return {
    kind: "feature",
    filePath: "specs/ticket-reply.feature.md",
    frontmatter: {
      id: "SUPPORT-REPLY",
      title: "Ticket replies",
      status: isCurrent ? "active" : "draft",
      model: "SUPPORT",
      test: "playwright",
      screenshots: "optional",
    },
    title: "Ticket replies",
    purpose: "Help agents answer a customer without leaving the ticket.",
    rules: [
      { id: "SUPPORT-REPLY-R001", text: "The reply composer MUST preserve unsent text.", keyword: "MUST", strength: "required", line: 16 },
      { id: "SUPPORT-REPLY-R002", text: "Saved replies SHOULD be reusable across tickets.", keyword: "SHOULD", strength: "recommended", line: 18 },
    ],
    scenarios: [
      {
        id: "SUPPORT-REPLY-S001",
        title: "Agent drafts a reply",
        line: 24,
        evidence: { test: "playwright", screenshots: "optional" },
        steps: [
          { keyword: "Given", text: "an agent has selected a ticket", line: 26 },
          { keyword: "When", text: "they write a reply", line: 27 },
          { keyword: "Then", text: "the draft remains visible", line: 28 },
        ],
      },
      ...(isCurrent
        ? [
            {
              id: "SUPPORT-REPLY-S002",
              title: "Agent sends a saved reply",
              line: 32,
              evidence: { test: "playwright" as const, screenshots: "optional" as const },
              steps: [
                { keyword: "Given" as const, text: "an agent has selected a ticket", line: 34 },
                { keyword: "When" as const, text: "they choose a saved reply", line: 35 },
                { keyword: "Then" as const, text: "the composer is filled with reusable text", line: 36 },
              ],
            },
          ]
        : []),
    ],
    source: "",
  };
}

function testReference(
  id: string,
  kind: "model" | "rule" | "scenario",
  filePath: string,
  line: number,
) {
  return { id, kind, filePath, line, source: "free-text" as const };
}

function screenshot(specPath: string, line: number, filePath: string, title: string): SpecScreenshot {
  return { specPath, line, path: filePath, title, testPath: "tests/support-desk.spec.ts" };
}

async function writeMockScreenshots(root: string, variant: MockReportVariant) {
  const data = createMockReportData(variant);
  for (const item of data.screenshots) {
    await writeTextFile(path.join(root, item.path), mockScreenshotSvg(item.title ?? item.path, variant));
  }
}

function mockScreenshotSvg(title: string, variant: MockReportVariant) {
  const accent = variant === "current" ? "#ddf4ff" : "#fff8c5";
  const border = variant === "current" ? "#54aeff" : "#d4a72c";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540" role="img" aria-label="${escapeHtml(title)}">
  <rect width="960" height="540" fill="#f6f8fa"/>
  <rect x="72" y="64" width="816" height="412" rx="24" fill="white" stroke="#d0d7de"/>
  <rect x="112" y="112" width="736" height="72" rx="14" fill="${accent}" stroke="${border}"/>
  <text x="144" y="158" font-family="system-ui, sans-serif" font-size="28" font-weight="700" fill="#1f2328">${escapeHtml(title)}</text>
  <rect x="112" y="224" width="520" height="44" rx="10" fill="#f6f8fa"/>
  <rect x="112" y="292" width="660" height="44" rx="10" fill="#f6f8fa"/>
  <rect x="112" y="360" width="420" height="44" rx="10" fill="#f6f8fa"/>
  <circle cx="812" cy="384" r="34" fill="${accent}" stroke="${border}"/>
</svg>`;
}

async function writeTextFile(filePath: string, content: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

function formatGeneratedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function argValue(name: string) {
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function isDirectRun() {
  return process.argv[1] === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  const paths = await writeMockReports({ outDir: argValue("--out") });
  console.log(`Mock feature spec report written to ${paths.featureReportPath}`);
  console.log(`Mock previous feature spec report written to ${paths.previousFeatureReportPath}`);
  console.log(`Mock diff report written to ${paths.diffReportPath}`);
}
