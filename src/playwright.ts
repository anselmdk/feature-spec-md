import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseFeatureSpec } from "./featureSpecs.js";
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
  changed: boolean;
  path?: string;
  title: string;
  testPath: string;
  comparedWithLine?: number;
};

export type PlaywrightSpecEvidenceOptions = {
  specs: string[];
  reportDir?: string;
  screenshotsDirName?: string;
  cwd?: string;
};

export type PlaywrightPageLike = {
  screenshot(options: { fullPage?: boolean; path?: string }): Promise<unknown>;
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

type ScreenState = {
  hash: string;
  line?: number;
};

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
  const screenStateByScenario = new Map<string, ScreenState>();

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
        const stateKey = screenStateKey(testInfo, scenarioId);
        if (!screenStateByScenario.has(stateKey)) {
          const baseline = await capturePageBuffer(page);
          screenStateByScenario.set(stateKey, { hash: screenshotHash(baseline) });
        }

        await body();

        await captureStepEvidence({
          entriesByWorker,
          page,
          reportDir,
          screenshotDir,
          screenshotsDirName,
          screenStateByScenario,
          stateKey,
          step,
          testInfo,
        });
      });
    },
  };
}

export async function loadSpecSteps(patterns: string[], cwd = process.cwd()) {
  const previousCwd = process.cwd();
  const steps: SpecEvidenceStep[] = [];

  try {
    process.chdir(cwd);
    for (const specPath of await expandFilePatterns(patterns)) {
      const source = await readFile(path.resolve(cwd, specPath), "utf8");
      const spec = parseFeatureSpec(source, { filePath: specPath });

      steps.push(
        ...spec.scenarios.flatMap((scenario) =>
          scenario.steps.map((step) => ({
            scenarioId: scenario.id,
            specPath,
            line: step.line,
            keyword: step.keyword,
            text: step.text,
          })),
        ),
      );
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

async function captureStepEvidence(options: {
  entriesByWorker: Map<number, SpecEvidenceScreenshot[]>;
  page: PlaywrightPageLike;
  reportDir: string;
  screenshotDir: string;
  screenshotsDirName: string;
  screenStateByScenario: Map<string, ScreenState>;
  stateKey: string;
  step: SpecEvidenceStep;
  testInfo: PlaywrightTestInfoLike;
}) {
  const currentBuffer = await capturePageBuffer(options.page);
  const currentHash = screenshotHash(currentBuffer);
  const previousState = options.screenStateByScenario.get(options.stateKey);
  const title = `${options.step.scenarioId}:${options.step.line} ${options.step.keyword} ${options.step.text}`;

  if (previousState?.hash === currentHash) {
    await recordEvidence(options, {
      specPath: options.step.specPath,
      line: options.step.line,
      changed: false,
      title: `${title} (unchanged)`,
      testPath: options.testInfo.file,
      comparedWithLine: previousState.line,
    });
    options.screenStateByScenario.set(options.stateKey, {
      hash: currentHash,
      line: options.step.line,
    });
    return;
  }

  await mkdir(options.screenshotDir, { recursive: true });
  const fileName = `${options.step.scenarioId}-line-${options.step.line}-${slug(options.step.text)}.png`;
  const screenshotPath = path.join(options.screenshotDir, fileName);
  const relativePath = `${options.screenshotsDirName}/${fileName}`;
  await writeFile(screenshotPath, currentBuffer);
  await options.testInfo.attach(title, {
    contentType: "image/png",
    path: screenshotPath,
  });
  await recordEvidence(options, {
    specPath: options.step.specPath,
    line: options.step.line,
    changed: true,
    path: relativePath,
    title,
    testPath: options.testInfo.file,
  });
  options.screenStateByScenario.set(options.stateKey, {
    hash: currentHash,
    line: options.step.line,
  });
}

async function recordEvidence(
  options: {
    entriesByWorker: Map<number, SpecEvidenceScreenshot[]>;
    reportDir: string;
    testInfo: PlaywrightTestInfoLike;
  },
  entry: SpecEvidenceScreenshot,
) {
  const entries = options.entriesByWorker.get(options.testInfo.workerIndex) ?? [];
  entries.push(entry);
  options.entriesByWorker.set(options.testInfo.workerIndex, entries);
  await writeWorkerManifest(options.reportDir, options.testInfo.workerIndex, entries);
}

async function capturePageBuffer(page: PlaywrightPageLike) {
  const result = await page.screenshot({ fullPage: true });
  if (Buffer.isBuffer(result)) return result;
  if (result instanceof Uint8Array) return Buffer.from(result);
  throw new Error("Playwright page.screenshot() must return image bytes when no path is supplied.");
}

function screenshotHash(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function screenStateKey(testInfo: PlaywrightTestInfoLike, scenarioId: string) {
  return `${testInfo.workerIndex}:${testInfo.file}:${scenarioId}`;
}

async function writeWorkerManifest(
  reportDir: string,
  workerIndex: number,
  evidence: SpecEvidenceScreenshot[],
) {
  await mkdir(reportDir, { recursive: true });
  await writeFile(
    path.join(reportDir, `screenshots-${workerIndex}.json`),
    JSON.stringify({ evidence }, null, 2),
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
