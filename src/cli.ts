#!/usr/bin/env node
/**
 * Command-line interface for initializing, validating, reporting on, and
 * measuring test coverage for Feature Spec Markdown documents.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  collectSpecScreenshots,
  renderHtmlReport,
  validateScenarioScreenshots,
  writeTextFile,
  type ValidationIssue,
} from "./index.js";
import { publishGithubActionDiffReport } from "./githubActionDiffReport.js";
import { publishGithubActionReport } from "./githubActionReport.js";
import { checkSpecDocuments } from "./specDocuments.js";
import {
  buildSpecImplementationReport,
  formatSpecImplementationReport,
} from "./testImplementationReport.js";

const defaultSpecPattern =
  "specs/**/*.model.md,specs/**/*.feature.md,specs/**/*.stack.md,specs/**/*.design.md";
const defaultTestPattern = "tests/**/*.spec.ts";

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

async function main() {
  const [command = "help", ...args] = process.argv.slice(2);
  const options = parseArgs(args);

  if (command === "check") return runCheck(options);
  if (command === "report") return runReport(options);
  if (command === "coverage") return runCoverage(options);
  if (command === "github-report") return publishGithubActionReport(options);
  if (command === "github-diff-report") return publishGithubActionDiffReport(options);
  if (command === "init") return runInit(options);

  printHelp();
  process.exit(
    command === "help" || command === "--help" || command === "-h" ? 0 : 1,
  );
}

async function runCheck(options: CliOptions) {
  const result = await checkSpecDocuments({
    specs: optionList(options.specs, defaultSpecPattern),
    tests:
      options.tests === "" ? [] : optionList(options.tests, defaultTestPattern),
    requireModelCoverage: options["require-model-coverage"] === "true",
    requireRuleCoverage: options["require-rule-coverage"] === "true",
    requireScenarioCoverage: options["require-scenario-coverage"] !== "false",
  });

  printIssues([...result.validationIssues, ...result.coverageIssues]);
  if (!result.ok) process.exit(1);

  const modelItemCount = result.models.reduce(
    (sum, spec) => sum + spec.modelItems.length,
    0,
  );
  const ruleCount = result.documents.reduce(
    (sum, spec) => sum + spec.rules.length,
    0,
  );
  const scenarioCount = result.features.reduce(
    (sum, spec) => sum + spec.scenarios.length,
    0,
  );
  console.log(
    `Spec check passed: ${result.models.length} model(s), ${result.features.length} feature(s), ${result.stacks.length} stack(s), ${result.designs.length} design(s), ${modelItemCount} model item(s), ${ruleCount} rule(s), ${scenarioCount} scenario(s).`,
  );
}

async function runCoverage(options: CliOptions) {
  const result = await checkSpecDocuments({
    specs: optionList(options.specs, defaultSpecPattern),
    tests:
      options.tests === "" ? [] : optionList(options.tests, defaultTestPattern),
    requireModelCoverage: false,
    requireRuleCoverage: false,
    requireScenarioCoverage: false,
  });

  printIssues(result.coverageIssues);

  if (!result.coverage) {
    console.log("Spec test implementation report");
    console.log("");
    console.log(
      "No tests were scanned. Pass --tests or omit --tests to use the default tests/**/*.spec.ts pattern.",
    );
    return;
  }

  const report = buildSpecImplementationReport(
    result.features,
    result.coverage,
    result.models,
  );
  console.log(formatSpecImplementationReport(report));

  if (options["fail-on-missing"] === "true" && hasMissingCoverage(report)) {
    process.exit(1);
  }
}

async function runReport(options: CliOptions) {
  const result = await checkSpecDocuments({
    specs: optionList(options.specs, defaultSpecPattern),
    tests:
      options.tests === "" ? [] : optionList(options.tests, defaultTestPattern),
    requireRuleCoverage: options["require-rule-coverage"] === "true",
    requireScenarioCoverage: false,
  });

  const out = options.out ?? "test-results/feature-spec-report/index.html";
  const screenshots = options.screenshots
    ? await collectSpecScreenshots(optionList(options.screenshots, ""))
    : [];
  const enforceEvidence =
    options["enforce-evidence"] === "true" ||
    options["require-declared-evidence"] === "true" ||
    options["require-screenshots"] === "true";
  const screenshotIssues = enforceEvidence
    ? validateScenarioScreenshots(result.features, screenshots)
    : [];
  const validationIssues = [
    ...result.validationIssues,
    ...result.coverageIssues,
    ...screenshotIssues,
  ];

  await writeTextFile(
    out,
    renderHtmlReport(result.features, {
      title: await reportTitle(),
      models: result.models,
      stacks: result.stacks,
      designs: result.designs,
      coverage: result.coverage,
      screenshots,
      validationIssues,
      ...githubSourceLinkOptions(),
    }),
  );
  console.log(`Feature spec report written to ${out}`);

  printIssues(screenshotIssues);
  if (screenshotIssues.length) process.exit(1);
}

async function runInit(options: CliOptions) {
  const dir = options.dir ?? "specs";
  const kind = options.kind ?? "feature";
  const target = path.join(dir, fileNameForKind(kind));
  await mkdir(dir, { recursive: true });
  await writeFile(target, exampleForKind(kind), "utf8");
  console.log(`Created ${target}`);
}

type CliOptions = Record<string, string | undefined>;

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) continue;
    const [key, inlineValue] = arg.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      options[key] = inlineValue;
      continue;
    }
    const next = args[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      options[key] = next;
      index += 1;
      continue;
    }
    options[key] = "true";
  }
  return options;
}

function optionList(value: string | undefined, fallback: string) {
  return (value ?? fallback)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function printIssues(issues: ValidationIssue[]) {
  for (const issue of issues) {
    const location = issue.filePath
      ? `${issue.filePath}${issue.line ? `:${issue.line}` : ""}`
      : "";
    console.error(
      `${issue.severity.toUpperCase()} ${issue.code}${location ? ` ${location}` : ""}: ${issue.message}`,
    );
  }
}

function hasMissingCoverage(report: ReturnType<typeof buildSpecImplementationReport>) {
  return (
    report.missingScenarios > 0 ||
    report.missingRules > 0 ||
    report.missingModelItems > 0
  );
}

async function reportTitle() {
  const packageName = await readPackageName();
  return packageName
    ? `Feature Spec Report for ${packageName}`
    : "Feature Spec Report";
}

async function readPackageName() {
  try {
    const raw = await readFile("package.json", "utf8");
    const parsed = JSON.parse(raw) as { name?: unknown };
    return typeof parsed.name === "string" && parsed.name.trim()
      ? parsed.name.trim()
      : undefined;
  } catch {
    return undefined;
  }
}

function githubSourceLinkOptions() {
  const repository = process.env.GITHUB_REPOSITORY;
  const githubRef = githubRefFromEnv();
  if (!repository || !githubRef) return {};

  const githubBaseUrl = `${process.env.GITHUB_SERVER_URL ?? "https://github.com"}/${repository}`;
  return {
    githubBaseUrl,
    githubRef,
    repositoryUrl: githubBaseUrl,
  };
}

function githubRefFromEnv() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  if (process.env.GITHUB_HEAD_REF) return process.env.GITHUB_HEAD_REF;
  if (process.env.GITHUB_REF_NAME) return process.env.GITHUB_REF_NAME;
  const ref = process.env.GITHUB_REF;
  return ref?.replace(/^refs\/(heads|tags)\//, "");
}

function printHelp() {
  console.log(`feature-spec-md

Usage:
  feature-spec-md init [--kind feature|model|stack|design] [--dir specs]
  feature-spec-md check [--specs "specs/**/*.model.md,specs/**/*.feature.md,specs/**/*.stack.md,specs/**/*.design.md"] [--tests "tests/**/*.spec.ts"]
  feature-spec-md coverage [--specs "specs/**/*.model.md,specs/**/*.feature.md,specs/**/*.stack.md,specs/**/*.design.md"] [--tests "tests/**/*.spec.ts"] [--fail-on-missing]
  feature-spec-md report [--specs "specs/**/*.model.md,specs/**/*.feature.md,specs/**/*.stack.md,specs/**/*.design.md"] [--tests "tests/**/*.spec.ts"] [--screenshots "test-results/spec-report/screenshots.json"] [--enforce-evidence] [--out test-results/feature-spec-report/index.html]
  feature-spec-md github-report [--report-dir test-results/spec-report] [--publish artifact|ftp]
  feature-spec-md github-diff-report --publish ftp --pr-number 123

Options:
  --require-model-coverage      Fail when model items have no matching test references.
  --require-rule-coverage       Fail when rules have no matching test references.
  --require-scenario-coverage   Defaults to true for check. Use --require-scenario-coverage=false to disable.
  --enforce-evidence            For report, fail when declared screenshot evidence is missing.
  --require-declared-evidence   Alias for --enforce-evidence.
  --require-screenshots         Deprecated alias for --enforce-evidence.
  --fail-on-missing             Exit with status 1 when coverage finds missing model items, rules, or scenarios.
  --screenshots                 Screenshot manifest JSON glob for report evidence.
  --tests ""                   Disable test coverage lookup.

GitHub report publishing:
  --publish artifact            Write summary and outputs for GitHub artifact upload.
  --publish ftp                 Upload report files and an index.html to FTP; no GitHub artifact is needed.
  --ftp-host                    FTP host, or FEATURE_SPEC_FTP_HOST.
  --ftp-user                    FTP user, or FEATURE_SPEC_FTP_USER.
  --ftp-password                FTP password, or FEATURE_SPEC_FTP_PASSWORD.
  --ftp-remote-dir              FTP remote directory, or FEATURE_SPEC_FTP_REMOTE_DIR.
  --report-base-url             Public report base URL, or FEATURE_SPEC_REPORT_BASE_URL.
  --build-number                Build number, or FEATURE_SPEC_BUILD_NUMBER/GITHUB_RUN_NUMBER.
  --pr-number                   Pull request number, or FEATURE_SPEC_PR_NUMBER.
`);
}

function fileNameForKind(kind: string) {
  if (kind === "model") return "example.model.md";
  if (kind === "stack") return "example.stack.md";
  if (kind === "design") return "example.design.md";
  return "example.feature.md";
}

function exampleForKind(kind: string) {
  if (kind === "model") {
    return `---
id: EXAMPLE
title: Example domain model
status: draft
---

# Example domain model

## Purpose

Define the shared domain vocabulary for the feature set.

## Model

### EXAMPLE-M001: Example entity

An entity that participates in the feature behavior.

## Rules

- EXAMPLE-R001: The example entity MUST have a stable identifier.
`;
  }
  if (kind === "stack") {
    return `---
id: EXAMPLE-STACK
title: Example stack
status: draft
---

# Example stack

## Purpose

Document the technical stack choices that shape the implementation.

## Stack

| Area | Choice |
| --- | --- |
| Frontend | React |
| Testing | Playwright |
`;
  }
  if (kind === "design") {
    return `---
id: EXAMPLE-DESIGN
title: Example design
status: draft
model: EXAMPLE
---

# Example design

## Purpose

Describe the user experience and visual direction for the feature.

## Design

The interface should make the primary task clear and keep feedback visible.
`;
  }
  return `---
id: EXAMPLE-FEATURE
title: Example feature
status: draft
model: EXAMPLE
---

# Example feature

## Purpose

Describe the user-facing behavior this feature provides.

## Rules

- EXAMPLE-FEATURE-R001: The feature MUST provide a clear success state.

## Scenarios

### EXAMPLE-FEATURE-S001: User completes the happy path

Given the user is on the feature screen
When they complete the primary action
Then they see the success state
`;
}
