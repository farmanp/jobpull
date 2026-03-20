export type ParsedResumeProfile = {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  linkedinUrl: string | null;
  portfolioUrl: string | null;
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function extractPrintableRuns(text: string): string[] {
  const matches = text.match(/[ -~]{4,}/g) ?? [];
  return matches.map((part) => normalizeWhitespace(part)).filter((part) => part.length >= 4);
}

export function extractResumeText(bytes: Uint8Array): string {
  const decoded = new TextDecoder("latin1", { fatal: false }).decode(bytes);
  const runs = extractPrintableRuns(decoded);
  const lines = decoded
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter((line) => line.length >= 4 && /[A-Za-z]/.test(line));

  const unique = new Set<string>();
  for (const value of [...lines, ...runs]) {
    const trimmed = value.trim();
    if (trimmed.length < 4) {
      continue;
    }
    unique.add(trimmed);
    if (unique.size >= 200) {
      break;
    }
  }

  return Array.from(unique).join("\n");
}

export function parseResumeProfile(text: string): ParsedResumeProfile {
  const lines = text
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);

  const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const phoneMatch = text.match(/(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/);
  const linkedinMatch = text.match(/https?:\/\/(?:www\.)?linkedin\.com\/[^\s)]+/i);
  const portfolioMatch = text.match(/https?:\/\/[^\s)]+/i);

  const fullName = lines.find((line) => {
    if (!line || line.length > 64) {
      return false;
    }
    if (/^%?pdf/i.test(line)) {
      return false;
    }
    if (line.includes("@") || line.includes("http")) {
      return false;
    }
    return /[A-Za-z]/.test(line) && line.split(" ").length <= 5;
  }) ?? null;

  const location = lines.find((line) => /remote|[A-Za-z]+,\s?[A-Z]{2}/i.test(line)) ?? null;

  return {
    fullName,
    email: emailMatch?.[0] ?? null,
    phone: phoneMatch?.[0] ?? null,
    location,
    linkedinUrl: linkedinMatch?.[0] ?? null,
    portfolioUrl: portfolioMatch?.[0] ?? null
  };
}
