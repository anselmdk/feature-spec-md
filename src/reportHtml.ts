import { html } from "./html.js";
import {
  insertReportMetadata,
  type ReportMetadataItem,
} from "./reportMetadata.js";
import { indentTemplateBlock, reportPageDefaults } from "./reportTemplates/shared.js";

export type HtmlPageOptions = {
  title: string;
  body: string;
  styles?: string;
  scripts?: string;
  maxWidth?: string;
  metadata?: ReportMetadataItem[];
};

export function renderHtmlPage({
  title,
  body,
  styles = "",
  scripts = "",
  maxWidth,
  metadata = [],
}: HtmlPageOptions) {
  const defaults = reportPageDefaults(maxWidth, styles);
  const page = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${html(title)}</title>
  <style>
    body {
      font-family: system-ui, sans-serif;
      max-width: ${defaults.maxWidth};
      margin: 0 auto;
      padding: 40px 24px;
      color: #1f2328;
      line-height: 1.5;
    }
${indentTemplateBlock(defaults.styleText, 4)}
  </style>
</head>
<body>
${indentTemplateBlock(body, 2)}
${scripts ? indentTemplateBlock(scripts, 2) : ""}
</body>
</html>
`;

  return insertReportMetadata(page, metadata);
}
