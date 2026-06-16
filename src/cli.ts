#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  collectSpecScreenshots,
  renderHtmlReport,
  writeTextFile,
  type ValidationIssue,
} from "./index.js";
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

  if (options["fail-on-missing"] === "true" && report.missingScenarios > 0) {
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
  await writeTextFile(
    out,
    renderHtmlReport(result.features, {
      models: result.models,
      stacks: result.stacks,
      designs: result.designs,
      coverage: result.coverage,
      screenshots,
      validationIssues: [...result.validationIssues, ...result.coverageIssues],
    }),
  );
  console.log(`Feature spec report written to ${out}`);
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

function printHelp() {
  console.log(`feature-spec-md

Usage:
  feature-spec-md init [--kind feature|model|stack|design] [--dir specs]
  feature-spec-md check [--specs "specs/**/*.model.md,specs/**/*.feature.md,specs/**/*.stack.md,specs/**/*.design.md"] [--tests "tests/**/*.spec.ts"]
  feature-spec-md coverage [--specs "specs/**/*.feature.md"] [--tests "tests/**/*.spec.ts"] [--fail-on-missing]
  feature-spec-md report [--specs "specs/**/*.model.md,specs/**/*.feature.md,specs/**/*.stack.md,specs/**/*.design.md"] [--tests "tests/**/*.spec.ts"] [--screenshots "test-results/spec-report/screenshots.json"] [--out test-results/feature-spec-report/index.html]

Options:
  --require-rule-coverage       Fail when rules have no matching test references.
  --require-scenario-coverage   Defaults to true for check. Use --require-scenario-coverage=false to disable.
  --fail-on-missing             Exit with status 1 when coverage finds missing scenario tests.
  --screenshots                 Screenshot manifest JSON glob for report evidence.
  --tests ""                   Disable test coverage lookup.
`);
}

function fileNameForKind(kind: string) {
  if (kind === "model") return "example.model.md";
  if (kind === "stack") return "example.stack.md";
  if (kind === "design") return "example.design.md";
  return "account-access.feature.md";
}

function exampleForKind(kind: string) {
  if (kind === "model") return exampleModel;
  if (kind === "stack") return exampleStack;
  if (kind === "design") return exampleDesign;
  return exampleFeature;
}

const exampleModel = `---
id: ACCOUNT
title: Account model
status: draft
---

# Account model

## Purpose

Define the shared account concepts used by account access features.

## Model

### ACCOUNT-M001: Account

An account represents one registered person.
`;

const exampleFeature = `---
id: ACCOUNT-ACCESS
title: Account access
status: draft
model: ACCOUNT
---

# Account access

## Purpose

People can access their own account after proving their identity.

## Rules

- ACCOUNT-ACCESS-R001: A person MUST prove control of a registered email address before accessing an account.
- ACCOUNT-ACCESS-R002: The system MUST NOT reveal whether an unknown email address belongs to an account.

## Scenarios

### ACCOUNT-ACCESS-S001: Registered person signs in

Given a registered person is on the sign-in page
When they request and open a valid sign-in link
Then they are signed in
`;

const exampleStack = `---
id: ACCOUNT-STACK
title: Account stack
status: draft
---

# Account stack

## Purpose

Define the initial technical stack for the account access demo.

## Context

The demo is a small browser-based application with automated tests.

## Stack

| Area | Choice |
|---|---|
| Frontend | React |
| Language | TypeScript |
| Testing | Playwright |

## Rationale

React, TypeScript, and Playwright fit the interaction-heavy UI and scenario-based testing style.

## Consequences

The stack is optimized for a browser UI and static deployment.
`;

const exampleDesign = `---
id: ACCOUNT-DESIGN
title: Account design
status: draft
model: ACCOUNT
---

# Account design

## Purpose

Define the initial interaction and visual design direction for account access.

## Design

The account access flow should feel simple, calm, and direct.

## Principles

- Keep the sign-in flow short.
- Avoid revealing whether an email address exists.
- Make recovery states easy to understand.

## Layout

The sign-in page uses one primary form and one primary action.

## Interaction

Validation messages appear near the field they describe.

## Visual style

Use a clean, low-distraction visual style.
`;
