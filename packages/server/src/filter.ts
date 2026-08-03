import { readFileSync } from "node:fs";

export interface Ruleset {
  version: string;
  patterns: RegExp[];
}

function compile(word: string): RegExp {
  return new RegExp("\\b" + [...word].map((c) => `${c}+`).join("") + "\\b", "gi");
}

export function loadRuleset(path: string): Ruleset {
  const lines = readFileSync(path, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const [header, ...words] = lines;
  const version = header?.match(/^#\s*version:\s*(\S+)$/i)?.[1];
  if (version === undefined) throw new Error(`${path}: missing "# version: N" header`);
  return { version, patterns: words.map(compile) };
}

export function filterChat(rs: Ruleset, text: string): string {
  return rs.patterns.reduce((acc, p) => acc.replace(p, "blah"), text);
}

export function hitsFilter(rs: Ruleset, word: string): boolean {
  return rs.patterns.some((p) => {
    p.lastIndex = 0;
    return p.test(word);
  });
}
