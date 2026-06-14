import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expandFilePatterns } from "./filePatterns.js";
import type { StepKeyword } from "./types.js";

export type SpecEvidenceStep = {
  scenarioId: string;
  specPath: string;
  line: number;
  keyword: StepKeyword;
  text: string;
};

export type SpecEvidenceScreenshot = {
  specPath: string;
  line: number;
  path: string;
  title: string;
  testPath: string;
};

export type PlaywrightSpecEvidenceOptions = {
  specs: string[];
  reportDir?: string;
  screenshotsDirName?: string;
  cwd?: string;
};

export type PlaywrightPageLike = {
  screenshot(options: { fullPage?: boolean; path: string }): Promise<unknown>;
};

export type PlaywrightTestInfoLike = {
  attach(
    name: string,
    options: { contentType: string; path: string },
  ): Promise<unknown>;
  file: string;
  workerIndex: number;
};

export type PlaywrightTestLike = {
  step<T>(title: string, body: () => Promise<T>): Promise<T>;
};

/** Create a Playwright helper that captures screenshot evidence for spec step lines. */
export function createPlaywrightSpecEvidence(
  test: PlaywrightTestLike,
  options: PlaywrightSpecEvidenceOptions,
) {
  const cwd = options.cwd ?? process.cwd();
  const reportDir = path.resolve(
    cwd,
    options.reportDir ?? "test-results/spec-report",
  );
  const screenshotsDirName = options.screenshotsDirName ?? "screenshots";
  const screenshotDir = path.join(reportDir, screenshotsDirName);
  const stepsPromise = loadSpecSteps(options.specs, cwd);
  const entriesByWorker = new Map<number, SpecEvidenceScreenshot[]>();

  return {
    async specStep(
      page: PlaywrightPageLike,
      testInfo: PlaywrightTestInfoLike,
      scenarioId: string,
      stepText: string,
      body: () => Promise<void>,
    ) {
      const step = await findSpecStep(stepsPromise, scenarioId, stepText);
      await test.step(`${step.keyword} ${step.text}`, async () => {
        await body();
        await captureStepScreenshot({
          entriesByWorker,
          page,
          reportDir,
          screenshotDir,
          screenshotsDirName,
          step,
          testInfo,
        });
      });
    },
  };
}

/** Parse spec files and return all scenario step lines addressable by Playwright tests. */
export async function loadSpecSteps(patterns: string[], cwd = process.cwd()) {
  const previousCwd = process.cwd();
  const steps: SpecEvidenceStep[] = [];

  try {
    process.chdir(cwd);
    for (const specPath of await expandFilePatterns(patterns)) {
      const source = await readFile(path.resolve(cwd, specPath), "utf8");
      let scenarioId = "";

      for (const [index, line] of source
        .replace(/\r\n/g, "\n")
        .split("\n")
        .entries()) {
        const scenario = line.match(
          /^###\s+([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-S\d{3}):/,
        );
        if (scenario) {
          scenarioId = scenario[1];
          continue;
        }

        const step = line.trim().match(/^(Given|When|Then|And|But)\s+(.+)$/);
        if (scenarioId && step) {
          steps.push({
            scenarioId,
            specPath,
            line: index + 1,
            keyword: step[1] as StepKeyword,
            text: step[2].trim(),
          });
        }
      }
    }
  } finally {
    process.chdir(previousCwd);
  }

  return steps;
}

async function findSpecStep(
  stepsPromise: Promise<SpecEvidenceStep[]>,
  scenarioId: string,
  stepText: string,
) {
  const steps = await stepsPromise;
  const normalizedStepText = stepText.replace(
    /^(Given|When|Then|And|But)\s+/,
    "",
  );
  const step = steps.find(
    (candidate) =>
      candidate.scenarioId === scenarioId &&
      candidate.text === normalizedStepText,
  );
  if (!step) {
    throw new Error(`No spec step found for ${scenarioId}: ${stepText}`);
  }
  return step;
}

async function captureStepScreenshot(options: {
  entriesByWorker: Map<number, SpecEvidenceScreenshot[]>;
  page: PlaywrightPageLike;
  reportDir: string;
  screenshotDir: string;
  screenshotsDirName: string;
  step: SpecEvidenceStep;
  testInfo: PlaywrightTestInfoLike;
}) {
  await mkdir(options.screenshotDir, { recursive: true });
  const fileName = `${options.step.scenarioId}-line-${options.step.line}-${slug(options.step.text)}.png`;
  const screenshotPath = path.join(options.screenshotDir, fileName);
  const relativePath = `${options.screenshotsDirName}/${fileName}`;
  const title = `${options.step.scenarioId}:${options.step.line} ${options.step.keyword} ${options.step.text}`;

  await options.page.screenshot({ fullPage: true, path: screenshotPath });
  await options.testInfo.attach(title, {
    contentType: "image/png",
    path: screenshotPath,
  });

  const entries =
    options.entriesByWorker.get(options.testInfo.workerIndex) ?? [];
  entries.push({
    specPath: options.step.specPath,
    line: options.step.line,
    path: relativePath,
    title,
    testPath: options.testInfo.file,
  });
  options.entriesByWorker.set(options.testInfo.workerIndex, entries);
  await writeWorkerManifest(
    options.reportDir,
    options.testInfo.workerIndex,
    entries,
  );
}

async function writeWorkerManifest(
  reportDir: string,
  workerIndex: number,
  screenshots: SpecEvidenceScreenshot[],
) {
  await mkdir(reportDir, { recursive: true });
  await writeFile(
    path.join(reportDir, `screenshots-${workerIndex}.json`),
    JSON.stringify({ screenshots }, null, 2),
    "utf8",
  );
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
}
