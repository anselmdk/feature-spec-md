/**
 * Shared TypeScript types for parsed spec documents, validation issues,
 * coverage summaries, test references, and screenshot evidence.
 */
/** Shared frontmatter fields supported by all spec documents. */
export type SpecFrontmatter = {
  id: string;
  title: string;
  status?: "draft" | "active" | "deprecated";
  owner?: string;
};

/** Frontmatter fields supported by documents that may reference models. */
export type ModelReferenceFrontmatter = SpecFrontmatter & {
  model?: string;
  models?: string[] | string;
};

export type ScenarioTestType = "unit" | "integration" | "playwright" | "manual" | "skip";
export type ScreenshotPolicy = "required" | "optional" | "skip";

export type ScenarioEvidencePolicy = {
  test: ScenarioTestType;
  screenshots: ScreenshotPolicy;
};

/** Frontmatter fields supported by `*.feature.md` files. */
export type FeatureFrontmatter = ModelReferenceFrontmatter & {
  test?: ScenarioTestType;
  screenshots?: ScreenshotPolicy;
};

/** Frontmatter fields supported by `*.design.md` files. */
export type DesignFrontmatter = ModelReferenceFrontmatter;

/** Parsed contents of one `*.model.md` file. */
export type ModelSpec = {
  kind: "model";
  filePath: string;
  frontmatter: SpecFrontmatter;
  title: string;
  purpose: string;
  modelItems: ModelItem[];
  rules: FeatureRule[];
  source: string;
};

/** Parsed contents of one `*.feature.md` file. */
export type FeatureSpec = {
  kind?: "feature";
  filePath: string;
  frontmatter: FeatureFrontmatter;
  title: string;
  purpose: string;
  rules: FeatureRule[];
  scenarios: FeatureScenario[];
  source: string;
};

/** Parsed contents of one `*.stack.md` file. */
export type StackSpec = {
  kind: "stack";
  filePath: string;
  frontmatter: SpecFrontmatter;
  title: string;
  purpose: string;
  stack: string;
  context: string;
  rationale: string;
  consequences: string;
  rules: FeatureRule[];
  source: string;
};

/** Parsed contents of one `*.design.md` file. */
export type DesignSpec = {
  kind: "design";
  filePath: string;
  frontmatter: DesignFrontmatter;
  title: string;
  purpose: string;
  design: string;
  principles: string;
  layout: string;
  interaction: string;
  visualStyle: string;
  rules: FeatureRule[];
  source: string;
};

/** Any parsed spec document. */
export type SpecDocument = ModelSpec | FeatureSpec | StackSpec | DesignSpec;

/** A model concept declared in the `## Model` section. */
export type ModelItem = {
  id: string;
  title: string;
  body: string;
  line: number;
};

/** A rule declared in the `## Rules` section. */
export type FeatureRule = {
  id: string;
  text: string;
  keyword?: RuleKeyword;
  strength: "required" | "recommended" | "optional" | "unspecified";
  line: number;
};

/** A concrete example declared in the `## Scenarios` section. */
export type FeatureScenario = {
  id: string;
  title: string;
  line: number;
  evidence: ScenarioEvidencePolicy;
  steps: FeatureStep[];
};

/** A single Given / When / Then style step inside a scenario. */
export type FeatureStep = {
  keyword: StepKeyword;
  text: string;
  line: number;
};

export type RuleKeyword =
  | "MUST"
  | "MUST NOT"
  | "SHOULD"
  | "SHOULD NOT"
  | "MAY"
  | "OPTIONAL";

export type StepKeyword = "Given" | "When" | "Then" | "And" | "But";

/** Validation problem found in a spec, test reference, or report input. */
export type ValidationIssue = {
  code: string;
  severity: "error" | "warning";
  message: string;
  filePath?: string;
  line?: number;
};

/** A model item, rule, or scenario ID found in executable tests. */
export type TestReference = {
  id: string;
  filePath: string;
  line: number;
  kind: "model" | "rule" | "scenario";
  source: "title" | "tag" | "covers" | "annotation" | "free-text";
};

/** Coverage state for one expected model item, rule, or scenario. */
export type CoverageItem = {
  id: string;
  title?: string;
  filePath?: string;
  line?: number;
  covered: boolean;
  references: TestReference[];
};

/** Complete test coverage mapping for a set of spec documents. */
export type CoverageSummary = {
  modelCoverage?: CoverageItem[];
  ruleCoverage: CoverageItem[];
  scenarioCoverage: CoverageItem[];
  orphanModelReferences?: TestReference[];
  orphanRuleReferences: TestReference[];
  orphanScenarioReferences: TestReference[];
};

/** Screenshot evidence associated with an exact spec line. */
export type SpecScreenshot = {
  specPath: string;
  line: number;
  path: string;
  title?: string;
  testPath?: string;
};
