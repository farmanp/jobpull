const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: "\""
};

function decodeCodePoint(entity: string, codePoint: number): string {
  if (Number.isNaN(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
    return entity;
  }

  return String.fromCodePoint(codePoint);
}

function decodeHtmlEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, rawValue: string) => {
    const value = rawValue.toLowerCase();
    if (value in NAMED_ENTITIES) {
      return NAMED_ENTITIES[value];
    }

    if (value.startsWith("#x")) {
      const codePoint = Number.parseInt(value.slice(2), 16);
      return decodeCodePoint(entity, codePoint);
    }

    if (value.startsWith("#")) {
      const codePoint = Number.parseInt(value.slice(1), 10);
      return decodeCodePoint(entity, codePoint);
    }

    return entity;
  });
}

function stripHtml(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/(p|div|section|article|li|ul|ol|h[1-6]|tr)\s*>/gi, "\n")
    .replace(/<\s*li\b[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ");
}

function normalizeWhitespace(input: string): string {
  return input
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v]+\n/g, "\n")
    .replace(/\n[ \t\f\v]+/g, "\n")
    .replace(/[ \t\f\v]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeDescriptionText(input?: string): string {
  if (!input) {
    return "";
  }

  return normalizeWhitespace(decodeHtmlEntities(stripHtml(input)));
}
