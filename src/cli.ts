#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  checkFeatureSpecs,
  renderHtmlReport,
  writeTextFile,
  type ValidationIssue,
} from "./index.js";

const defaultSpecPattern = "specs/**/*.feature.md";
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
  if (command === "init") return runInit(options);

  printHelp();
  process.exit(
    command === "help" || command === "--help" || command === "-h" ? 0 : 1,
  );
}

async function runCheck(options: CliOptions) {
  const result = await checkFeatureSpecs({
    specs: optionList(options.specs, defaultSpecPattern),
    tests:
      options.tests === "" ? [] : optionList(options.tests, defaultTestPattern),
    requireRuleCoverage: options["require-rule-coverage"] === "true",
    requireScenarioCoverage: options["require-scenario-coverage"] !== "false",
  });

  printIssues([...result.validationIssues, ...result.coverageIssues]);
  if (!result.ok) process.exit(1);

  const scenarioCount = result.specs.reduce(
    (sum, spec) => sum + spec.scenarios.length,
    0,
  );
  const ruleCount = result.specs.reduce(
    (sum, spec) => sum + spec.rules.length,
    0,
  );
  console.log(
    `Feature spec check passed: ${result.specs.length} spec(s), ${ruleCount} rule(s), ${scenarioCount} scenario(s).`,
  );
}

async function runReport(options: CliOptions) {
  const result = await checkFeatureSpecs({
    specs: optionList(options.specs, defaultSpecPattern),
    tests:
      options.tests === "" ? [] : optionList(options.tests, defaultTestPattern),
    requireRuleCoverage: options["require-rule-coverage"] === "true",
    requireScenarioCoverage: false,
  });

  const out = options.out ?? "test-results/feature-spec-report/index.html";
  await writeTextFile(
    out,
    renderHtmlReport(result.specs, {
      coverage: result.coverage,
      validationIssues: [...result.validationIssues, ...result.coverageIssues],
    }),
  );
  console.log(`Feature spec report written to ${out}`);
}

async function runInit(options: CliOptions) {
  const dir = options.dir ?? "specs";
  const target = path.join(dir, "account-access.feature.md");
  await mkdir(dir, { recursive: true });
  await writeFile(target, exampleSpec, "utf8");
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
  feature-spec-md init [--dir specs]
  feature-spec-md check [--specs "specs/**/*.feature.md"] [--tests "tests/**/*.spec.ts"]
  feature-spec-md report [--specs "specs/**/*.feature.md"] [--tests "tests/**/*.spec.ts"] [--out test-results/feature-spec-report/index.html]

Options:
  --require-rule-coverage       Fail when rules have no matching test references.
  --require-scenario-coverage   Defaults to true for check. Use --require-scenario-coverage=false to disable.
  --tests ""                   Disable test coverage lookup.
`);
}

const exampleSpec = `---
id: ACCOUNT
title: Account access
status: draft
---

# Account access

## Purpose

People can access their own account after proving their identity.

## Rules

- ACCOUNT-R001: A person MUST prove control of a registered email address before accessing an account.
- ACCOUNT-R002: The system MUST NOT reveal whether an unknown email address belongs to an account.
- ACCOUNT-R003: A signed-in person SHOULD be returned to the page they originally requested.

## Scenarios

### ACCOUNT-S001: Registered person signs in

Given a registered person is on the sign-in page  
When they request and open a valid sign-in link  
Then they are signed in  
And they are returned to the page they originally requested

### ACCOUNT-S002: Unknown email receives a neutral response

Given a person enters an email address that is not registered  
When they request a sign-in link  
Then the response says to check their email  
And the response does not reveal whether the email address is registered
`;
