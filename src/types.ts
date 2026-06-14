/** Parsed contents of one `*.feature.md` file. */
export type FeatureSpec = {
  filePath: string;
  frontmatter: FeatureFrontmatter;
  title: string;
  purpose: string;
  rules: FeatureRule[];
  scenarios: FeatureScenario[];
  source: string;
};

/** Frontmatter fields supported by the feature spec format. */
export type FeatureFrontmatter = {
  id: string;
  title: string;
  status?: "draft" | "active" | "deprecated";
  owner?: string;
};

/** A business rule declared in the `## Rules` section. */
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

/** A rule or scenario ID found in executable tests. */
export type TestReference = {
  id: string;
  filePath: string;
  line: number;
  kind: "scenario" | "rule";
  source: "title" | "tag" | "covers" | "annotation" | "free-text";
};

/** Coverage state for one expected rule or scenario. */
export type CoverageItem = {
  id: string;
  title?: string;
  filePath?: string;
  line?: number;
  covered: boolean;
  references: TestReference[];
};

/** Complete test coverage mapping for a set of feature specs. */
export type CoverageSummary = {
  scenarioCoverage: CoverageItem[];
  ruleCoverage: CoverageItem[];
  orphanScenarioReferences: TestReference[];
  orphanRuleReferences: TestReference[];
};

/** Screenshot evidence associated with an exact spec line. */
export type SpecScreenshot = {
  specPath: string;
  line: number;
  path: string;
  title?: string;
  testPath?: string;
};
