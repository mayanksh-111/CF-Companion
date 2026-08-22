export function outputsMatch(expected: string, actual: string): boolean {
  return normalize(expected) === normalize(actual);
}

function normalize(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n+$/g, "");
}