export function reportPageDefaults(maxWidth: string | undefined, styleText: string | undefined) {
  return {
    maxWidth: maxWidth ?? "1180px",
    styleText: styleText ?? "",
  };
}

export function indentTemplateBlock(value: string, spaces: number) {
  const prefix = " ".repeat(spaces);
  return value
    .trim()
    .split("\n")
    .map((line) => (line ? prefix + line : line))
    .join("\n");
}
