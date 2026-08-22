import * as vscode from "vscode";
import { LanguageId } from "../types";

export interface LanguageConfig {
  id: LanguageId;
  label: string;
  extension: string;
  compileCmd?: (ctx: LangPathCtx) => { cmd: string; args: string[] };
  runCmd: (ctx: LangPathCtx) => { cmd: string; args: string[] };
}

export interface LangPathCtx {
  file: string;
  dir: string;
  binaryBase: string;
}

const DEFAULT_SNIPPETS: Record<
  LanguageId,
  { fileName: string; content: string }
> = {
  cpp: {
    fileName: "solution.cpp",
    content: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(nullptr);

    

    return 0;
}
`,
  },
  python: {
    fileName: "solution.py",
    content: `import sys
input = sys.stdin.readline


def main():
    pass


if __name__ == "__main__":
    main()
`,
  },
  java: {
    fileName: "Solution.java",
    content: `import java.util.*;
import java.io.*;

public class Solution {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));


    }
}
`,
  },
};

export function getSolutionTemplate(lang: LanguageId): {
  fileName: string;
  content: string;
} {
  return DEFAULT_SNIPPETS[lang];
}

function toolPath(setting: string, fallback: string): string {
  return (
    vscode.workspace.getConfiguration().get<string>(setting, fallback) ||
    fallback
  );
}

export function getLanguageConfig(lang: LanguageId): LanguageConfig {
  switch (lang) {
    case "cpp": {
      const compiler = toolPath("cfCompanion.cppPath", "g++");
      const flags = vscode.workspace
        .getConfiguration()
        .get<string>("cfCompanion.cppFlags", "-O2 -std=c++17");
      return {
        id: "cpp",
        label: "C++",
        extension: ".cpp",
        compileCmd: (ctx) => ({
          cmd: compiler,
          args: [
            ctx.file,
            "-o",
            ctx.binaryBase,
            ...flags.split(" ").filter(Boolean),
          ],
        }),
        runCmd: (ctx) => ({ cmd: ctx.binaryBase, args: [] }),
      };
    }
    case "python": {
      const interpreter = toolPath("cfCompanion.pythonPath", "python3");
      return {
        id: "python",
        label: "Python",
        extension: ".py",
        runCmd: (ctx) => ({ cmd: interpreter, args: [ctx.file] }),
      };
    }
    case "java": {
      const javac = toolPath("cfCompanion.javacPath", "javac");
      const java = toolPath("cfCompanion.javaPath", "java");
      return {
        id: "java",
        label: "Java",
        extension: ".java",
        compileCmd: (ctx) => ({ cmd: javac, args: [ctx.file, "-d", ctx.dir] }),
        runCmd: (ctx) => ({ cmd: java, args: ["-cp", ctx.dir, "Solution"] }),
      };
    }
  }
}

export const FALLBACK_COMPILERS: string[] = [
  "GNU G++17 7.3.0",
  "GNU G++20 13.2 (64 bit, winlibs)",
  "Python 3.13.2",
  "PyPy 3.10 (7.3.15, 64bit)",
  "Java 21 64bit",
];

const DEFAULT_SUBMIT_COMPILERS: Record<LanguageId, string> = {
  cpp: "GNU G++17 7.3.0",
  python: "PyPy 3.10 (7.3.15, 64bit)",
  java: "Java 21 64bit",
};

export function getDefaultSubmitCompiler(lang: LanguageId): string {
  return toolPath(
    `cfCompanion.submitCompiler.${lang}`,
    DEFAULT_SUBMIT_COMPILERS[lang],
  );
}

export function getConfiguredTimeoutMs(): number {
  return vscode.workspace
    .getConfiguration()
    .get<number>("cfCompanion.testTimeoutMs", 3000);
}

export function detectLanguageFromExtension(
  filePath: string,
): LanguageId | undefined {
  if (
    filePath.endsWith(".cpp") ||
    filePath.endsWith(".cc") ||
    filePath.endsWith(".cxx")
  )
    return "cpp";
  if (filePath.endsWith(".py")) return "python";
  if (filePath.endsWith(".java")) return "java";
  return undefined;
}
