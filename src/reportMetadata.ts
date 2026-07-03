/**
 * Helpers for adding build/source metadata to generated HTML reports.
 */
import { html } from "./html.js";

export type ReportMetadataItem = {
  label: string;
  value: string;
  url?: string;
};

/** Insert report metadata directly below the first report title. */
export function insertReportMetadata(
  reportHtml: string,
  metadata: ReportMetadataItem[] = [],
) {
  const visibleMetadata = metadata.filter(
    (item) => item.label.trim() && item.value.trim(),
  );
  if (!visibleMetadata.length) return reportHtml;

  const block = renderReportMetadata(visibleMetadata);
  if (reportHtml.includes(block)) return reportHtml;

  return reportHtml.replace(/(<h1[\s\S]*?<\/h1>)/, `$1\n    ${block}`);
}

export function renderReportMetadata(metadata: ReportMetadataItem[]) {
  const visibleMetadata = metadata.filter(
    (item) => item.label.trim() && item.value.trim(),
  );
  if (!visibleMetadata.length) return "";

  return `<p>${visibleMetadata.map(renderReportMetadataItem).join(" · ")}</p>`;
}

function renderReportMetadataItem(item: ReportMetadataItem) {
  const label = `<strong>${html(item.label)}:</strong>`;
  const value = item.url
    ? `<a href="${html(item.url)}" target="_blank" rel="noopener noreferrer">${html(item.value)}</a>`
    : html(item.value);
  return `${label} ${value}`;
}
