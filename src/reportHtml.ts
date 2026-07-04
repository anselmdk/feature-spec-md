import { html } from "./html.js";

export type HtmlPageOptions = {
  title: string;
  body: string;
  styles?: string;
  scripts?: string;
  maxWidth?: string;
};

export function renderHtmlPage({
  title,
  body,
  styles = "",
  scripts = "",
  maxWidth = "1180px",
}: HtmlPageOptions) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${html(title)}</title>
  <style>
    body {
      font-family: system-ui, sans-serif;
      max-width: ${maxWidth};
      margin: 0 auto;
      padding: 40px 24px;
      color: #1f2328;
      line-height: 1.5;
    }
${indent(styles, 4)}
  </style>
</head>
<body>
${indent(body, 2)}
${scripts ? indent(scripts, 2) : ""}
</body>
</html>
`;
}

function indent(value: string, spaces: number) {
  const prefix = " ".repeat(spaces);
  return value
    .trim()
    .split("\n")
    .map((line) => (line ? `${prefix}${line}` : line))
    .join("\n");
}
