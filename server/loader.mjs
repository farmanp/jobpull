import * as ts from "typescript";
import { extname } from "node:path";
import { readFile } from "node:fs/promises";

const EXTENSIONS = [".ts", ".tsx", ".js", ".mjs", ".cjs"];
const INDEX_SUFFIXES = ["/index.ts", "/index.tsx", "/index.js", "/index.mjs", "/index.cjs"];

function isRelativeOrAbsolute(specifier) {
  return specifier.startsWith("./") || specifier.startsWith("../") || specifier.startsWith("/");
}

export async function resolve(specifier, context, defaultResolve) {
  try {
    return await defaultResolve(specifier, context, defaultResolve);
  } catch (error) {
    if (!isRelativeOrAbsolute(specifier) || extname(specifier)) {
      throw error;
    }

    for (const extension of EXTENSIONS) {
      try {
        return await defaultResolve(`${specifier}${extension}`, context, defaultResolve);
      } catch {
        // keep trying
      }
    }

    for (const suffix of INDEX_SUFFIXES) {
      try {
        return await defaultResolve(`${specifier}${suffix}`, context, defaultResolve);
      } catch {
        // keep trying
      }
    }

    throw error;
  }
}

export async function load(url, context, defaultLoad) {
  if (url.endsWith(".ts") || url.endsWith(".tsx")) {
    const source = await readFile(new URL(url), "utf8");
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.Preserve,
        esModuleInterop: true,
        importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Preserve,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        allowImportingTsExtensions: true
      },
      fileName: url
    });

    return {
      format: "module",
      source: transpiled.outputText,
      shortCircuit: true
    };
  }

  return defaultLoad(url, context, defaultLoad);
}
