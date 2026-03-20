import { dirname, join } from "node:path";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

export interface ResumeStorage {
  save(params: {
    userId: string;
    resumeId: string;
    filename: string;
    data: Uint8Array;
  }): Promise<{ storageKey: string }>;
  read(storageKey: string): Promise<Uint8Array | null>;
  delete(storageKey: string): Promise<void>;
}

function sanitizePathSegment(value: string): string {
  const cleaned = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "_");
  return cleaned.length > 0 ? cleaned.slice(0, 120) : "item";
}

export function createResumeStorage(baseDir: string): ResumeStorage {
  const rootDir = join(baseDir, "resumes");

  function resolveStoragePath(storageKey: string): string {
    return join(rootDir, storageKey);
  }

  return {
    async save({ userId, resumeId, filename, data }): Promise<{ storageKey: string }> {
      const safeUserId = sanitizePathSegment(userId);
      const safeResumeId = sanitizePathSegment(resumeId);
      const safeFilename = sanitizePathSegment(filename.replace(/\.pdf$/i, "")) || "resume";
      const storageKey = join(safeUserId, `${safeResumeId}-${safeFilename}.pdf`);
      const filePath = resolveStoragePath(storageKey);

      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, data);

      return { storageKey };
    },

    async read(storageKey: string): Promise<Uint8Array | null> {
      const filePath = resolveStoragePath(storageKey);
      try {
        return readFileSync(filePath);
      } catch {
        return null;
      }
    },

    async delete(storageKey: string): Promise<void> {
      const filePath = resolveStoragePath(storageKey);
      try {
        rmSync(filePath, { force: true });
      } catch {
        // Ignore missing files so deletes stay idempotent.
      }
    }
  };
}
