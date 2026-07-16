export type SpecFrontmatter = {
  id: string;
  title: string;
  status?: "draft" | "active" | "deprecated";
  owner?: string;
};

export type ModelReferenceFrontmatter = SpecFrontmatter & {
  model?: string;
  models?: string[] | string;
};

export type SpecExtensionSection = {
  title: string;
  body: string;
  line: number;
};

export type SpecExtensionSections = {
  /** Mermaid overview diagrams that visualize model relationships. */
  modelDiagram?: SpecExtensionSection;
  /** Known unknowns, unresolved choices, or decisions that need a product answer. */
  openQuestions?: SpecExtensionSection;
  /** Assumptions the spec currently relies on until they are confirmed or replaced. */
  assumptions?: SpecExtensionSection;
  /** API endpoints, request/response contracts, auth requirements, and OpenAPI links. */
  apiContract?: SpecExtensionSection;
  /** Role/group capability matrix, permission rules, and access-control notes. */
  permissions?: SpecExtensionSection;
  /** Entity state machines, state transition rules, and lifecycle examples. */
  lifecycle?: SpecExtensionSection;
  /** Mock adapters, seeded data, fixed-time setup, and CI/e2e environment contracts. */
  testEnvironment?: SpecExtensionSection;
};

export type ScenarioTestType = "unit" | "integration" | "playwright" | "manual" | "skip";
export type ScreenshotPolicy = "required" | "optional" | "skip";

export type ScenarioEvidencePolicy = {
  test: ScenarioTestType;
  screenshots: ScreenshotPolicy;
};

export type FeatureFrontmatter = ModelReferenceFrontmatter & {
  test?: ScenarioTestType;
  screenshots?: ScreenshotPolicy;
};

export type DesignFrontmatter = ModelReferenceFrontmatter;

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

export type SpecDocument = ModelSpec | FeatureSpec | StackSpec | DesignSpec;

export type ModelItem = {
  id: string;
  title: string;
  body: string;
  line: number;
};

export type FeatureRule = {
  id: string;
  text: string;
  keyword?: RuleKeyword;
  strength: "required" | "recommended" | "optional" | "unspecified";
  line: number;
};

export type FeatureScenario = {
  id: string;
  title: string;
  line: number;
  evidence: ScenarioEvidencePolicy;
  steps: FeatureStep[];
};

export type FeatureStep = {
  keyword: StepKeyword;
  text: string;
  line: number;
};

export type RuleKeyword = "MUST" | "MUST NOT" | "SHOULD" | "SHOULD NOT" | "MAY" | "OPTIONAL";
export type StepKeyword = "Given" | "When" | "Then" | "And" | "But";

export type ValidationIssue = {
  code: string;
  severity: "error" | "warning";
  message: string;
  filePath?: string;
  line?: number;
};

export type TestReference = {
  id: string;
  filePath: string;
  line: number;
  kind: "model" | "rule" | "scenario";
  source: "title" | "tag" | "covers" | "annotation" | "free-text";
};

export type CoverageItem = {
  id: string;
  title?: string;
  filePath?: string;
  line?: number;
  covered: boolean;
  references: TestReference[];
};

export type CoverageSummary = {
  modelCoverage?: CoverageItem[];
  ruleCoverage: CoverageItem[];
  scenarioCoverage: CoverageItem[];
  orphanModelReferences?: TestReference[];
  orphanRuleReferences: TestReference[];
  orphanScenarioReferences: TestReference[];
};

export type SpecScreenshot = {
  specPath: string;
  line: number;
  changed?: boolean;
  path?: string;
  title?: string;
  testPath?: string;
  comparedWithLine?: number;
};
