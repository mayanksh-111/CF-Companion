import * as vscode from "vscode";
import { ProblemServer, IncomingSubmissionsScrape } from "./server";
import { ProblemStorage} from "./storage";
import {
    ProblemPanel,
    ProblemStatus
} from "./panels/problemPanel";
import { SidebarPanel, SIDEBAR_VIEW_ID } from "./panels/sidebarPanel";
import { DashboardPanel } from "./panels/dashboardPanel";
import {
    initVerdictCache,
    isUncached,
    recordVerdict,
    getResolvedStatus,
    ingestScrapedSubmissions,
} from "./services/verdictCache";
import { fetchUserSubmissions } from "./cfApi";
import { IncomingProblem, LanguageId } from "./types";
import { SubmitJobQueue, buildSubmitJob } from "./cfSubmit";
import { SolutionManager } from "./services/solutionManager";
import { ProblemContextService } from "./services/problemContext";
import { TestCaseParser } from "./services/testCaseParser";
import { TestRunner } from "./services/testRunner";
import { TestWorkflow } from "./services/testWorkflow";
import { TestPanel } from "./panels/testPanel";
import { FALLBACK_COMPILERS, getDefaultSubmitCompiler } from "./services/languageConfig";

const UNCACHED_LOOKUP_COUNT = 500; 
function resolveProblemStatus(problem: IncomingProblem): ProblemStatus {
    const handle = vscode.workspace
        .getConfiguration()
        .get("cfCompanion.handle", "");

    if (!handle) {
        return "Not Attempted";
    }

    return getResolvedStatus(handle, problem.contest_id, problem.problem_code);
}

async function lookupAndCacheVerdict(problem: IncomingProblem): Promise<void> {
    const handle = vscode.workspace
        .getConfiguration()
        .get<string>("cfCompanion.handle", "");

    if (!handle) {
        return;
    }

    if (!isUncached(handle, problem.contest_id, problem.problem_code)) {
        return; // already know this one — no API call needed
    }

    try {
        const submissions = await fetchUserSubmissions(handle, UNCACHED_LOOKUP_COUNT);

        const match = submissions.find((s) => {
            const sameId =
                s.problem.contestId?.toString() === problem.contest_id &&
                s.problem.index === problem.problem_code;
            const sameName =
                problem.problem_name !== undefined &&
                s.problem.name.trim().toLowerCase() === problem.problem_name.trim().toLowerCase();
            return sameId || sameName;
        });

        if (match?.verdict) {
            await recordVerdict(
                handle,
                problem.contest_id,
                problem.problem_code,
                match.verdict,
                problem.problem_name,
            );
        }
    } catch (err) {
        console.error(
            "[CF Companion] Failed to look up verdict for new problem:",
            err
        );
    }
}

function refreshProblemStatus(problem: IncomingProblem): void {
    const status = resolveProblemStatus(problem);

    ProblemPanel.refreshStatus(
        problem.contest_id,
        problem.problem_code,
        status
    );
}

let lastResolvedProblemKey: string | undefined;

export async function activate(
    context: vscode.ExtensionContext
): Promise<void> {
    const statusBar =
        vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );

    context.subscriptions.push(statusBar);

    const storage =
        new ProblemStorage(context);

    await storage.init();
    initVerdictCache(context);

    // ---- CPH-like workflow services ----
    function getSolutionsBaseDir(): vscode.Uri {
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (folder) return folder.uri;
        // No folder open — fall back to extension storage so createSolution never fails.
        return context.globalStorageUri;
    }
    const solutionManager = new SolutionManager();
    const problemContext = new ProblemContextService(storage, solutionManager, getSolutionsBaseDir);
    const testParser = new TestCaseParser(context.globalStorageUri);
    const testRunner = new TestRunner();
    let knownCompilers: string[] = context.globalState.get("cfCompanion.knownCompilers", FALLBACK_COMPILERS);
    const testWorkflow = new TestWorkflow(testParser, testRunner, () => knownCompilers);

    {
        const initialEditor = vscode.window.activeTextEditor;
        if (initialEditor) {
            const resolved = await problemContext.resolve(initialEditor.document);
            if (resolved) {
                lastResolvedProblemKey = `${resolved.problem.contest_id}/${resolved.problem.problem_code}`;
            }
        }
    }

    TestPanel.onRunTests = (_key, testId) => {
        void testWorkflow.run(testId);
    };
    TestPanel.onSaveNewTest = (_key, input, expectedOutput) => {
        void testWorkflow.saveNewTest(input, expectedOutput);
    };
    TestPanel.onUpdateTest = (_key, testId, input, expectedOutput) => {
        void testWorkflow.updateTest(testId, input, expectedOutput);
    };
    TestPanel.onDeleteCustomTest = (_key, testId) => {
        void testWorkflow.deleteCustomTest(testId);
    };
    TestPanel.onSubmit = (_key, compiler) => {
        void vscode.commands.executeCommand("cfCompanion.submitSolution", { compiler });
    };

    async function openSolutionAndTests(
    problem: IncomingProblem,
    language: LanguageId,
    existingUri?: vscode.Uri
): Promise<void> {
    const solutionUri =
        existingUri ??
        (await solutionManager.createSolution(problem, language, getSolutionsBaseDir()));

    await storage.setSolutionPath(problem.contest_id, problem.problem_code, solutionUri.fsPath, language);

    const doc = await vscode.workspace.openTextDocument(solutionUri);
    await vscode.window.showTextDocument(doc, { preview: false });

    await testWorkflow.open(problem, language, solutionUri);
}

    context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
        if (!editor) {
            return;
        }
        const resolved = await problemContext.resolve(editor.document);
        if (!resolved) {
            TestPanel.close();
            testWorkflow.clear();
            lastResolvedProblemKey = undefined;
            return;
        }

        lastResolvedProblemKey = `${resolved.problem.contest_id}/${resolved.problem.problem_code}`;
        ProblemPanel.updateSilently(resolved.problem, context.extensionUri);
        refreshProblemStatus(resolved.problem);
        await testWorkflow.open(resolved.problem, resolved.language, resolved.solutionUri);
    })
);

    const sidebarPanel = new SidebarPanel(context, storage);
    context.subscriptions.push(sidebarPanel);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(SIDEBAR_VIEW_ID, sidebarPanel, {
            webviewOptions: { retainContextWhenHidden: true },
        })
    );
    SidebarPanel.activeProblemKeyProvider = () => {
        const doc = vscode.window.activeTextEditor?.document;
        if (!doc) return undefined;
        return lastResolvedProblemKey;
    };
    TestPanel.configureHost(sidebarPanel);

    const submitQueue = new SubmitJobQueue();
    context.subscriptions.push(submitQueue);

    const server =
        new ProblemServer(submitQueue);

    context.subscriptions.push(server);

    context.subscriptions.push(
        server.onCompilerList((msg) => {
            knownCompilers = msg.compilers;
            void context.globalState.update("cfCompanion.knownCompilers", knownCompilers);
            testWorkflow.refreshCompilers(knownCompilers);
        })
    );

    ProblemPanel.setStatusRefreshHandler(
        async (problem: IncomingProblem) => {
            refreshProblemStatus(problem);
        }
    );

    ProblemPanel.setActionHandler((command, problem, language) => {
        if (command === "createSolution") {
            void openSolutionAndTests(problem, (language as LanguageId) ?? "cpp");
        } else if (command === "runTests") {
            void (async () => {
                const existing = await findExistingSolution(problem);
                if (!existing) {
                    vscode.window.showWarningMessage(
                        "CF Companion: create a solution file for this problem first."
                    );
                    return;
                }
                await openSolutionAndTests(problem, existing.language, existing.uri);
                await testWorkflow.run();
            })();
        } else if (command === "submitSolution") {
            void vscode.commands.executeCommand("cfCompanion.submitSolution");
        }
    });

    ProblemPanel.setFocusHandler((problem) => {
    void (async () => {
        const stored = await storage.getSolutionPath(problem.contest_id, problem.problem_code);
        if (stored) {
            await testWorkflow.open(problem, stored.language, vscode.Uri.file(stored.path));
        }
    })();
});
    async function findExistingSolution(
        problem: IncomingProblem
    ): Promise<{ uri: vscode.Uri; language: LanguageId } | undefined> {
        const safeCode = `${problem.contest_id}${problem.problem_code}`.replace(/[^a-zA-Z0-9_-]/g, "_");
        const baseDir = getSolutionsBaseDir();
        const candidates: Array<{ uri: vscode.Uri; language: LanguageId }> = [
            { uri: vscode.Uri.joinPath(baseDir, `${safeCode}.cpp`), language: "cpp" },
            { uri: vscode.Uri.joinPath(baseDir, `${safeCode}.py`), language: "python" },
            { uri: vscode.Uri.joinPath(baseDir, safeCode, "Solution.java"), language: "java" },
        ];
        for (const c of candidates) {
            try {
                await vscode.workspace.fs.stat(c.uri);
                return { uri: c.uri, language: c.language };
            } catch {
                /* try next */
            }
        }
        return undefined;
    }
    function showProblemWithStatus(
    problem: IncomingProblem,
    extensionUri: vscode.Uri
): void {
    ProblemPanel.show(problem, extensionUri, "Loading");
    refreshProblemStatus(problem);
    server.broadcast({
        type: "problem_loaded",
        contest_id: problem.contest_id,
        problem_code: problem.problem_code,
    });

    void (async () => {
        const stored = await storage.getSolutionPath(problem.contest_id, problem.problem_code);
        if (!stored) return;
        const uri = vscode.Uri.file(stored.path);
        try {
            await vscode.workspace.fs.stat(uri); // still exists on disk
            const doc = await vscode.workspace.openTextDocument(uri);
            await testWorkflow.open(problem, stored.language, uri);
        } catch {
            // solution file was moved/deleted — silently skip, statement still shows
        }
    })();
}
    server.onProblem(async problem => {
        await storage.saveProblem(problem);

        showProblemWithStatus(
            problem,
            context.extensionUri
        );
        await lookupAndCacheVerdict(problem);
        refreshProblemStatus(problem); // pick up whatever lookupAndCacheVerdict just cached, if anything

        vscode.window.setStatusBarMessage(
            `$(check) Loaded ${problem.contest_id}${problem.problem_code}`,
            3000
        );
    });

    server.onProblemError(err => {
        vscode.window.showWarningMessage(
            `CF Companion: failed to extract ${err.url} — ${err.error}`
        );
    });

    server.onSubmissionsScrape(async (msg: IncomingSubmissionsScrape) => {
        const configuredHandle = vscode.workspace
            .getConfiguration()
            .get<string>("cfCompanion.handle", "")
            .trim();

        const scrapedHandle = (msg.handle ?? "").trim();

        if (!configuredHandle) {
            console.warn("[CF Companion] Dropped submissions scrape: no handle configured.");
            return;
        }
        if (!scrapedHandle || scrapedHandle.toLowerCase() !== configuredHandle.toLowerCase()) {
            console.warn(
                `[CF Companion] Dropped submissions scrape: scraped handle "${scrapedHandle}" != configured handle "${configuredHandle}".`
            );
            return;
        }

        await ingestScrapedSubmissions(configuredHandle, msg.rows);

        for (const row of msg.rows) {
            const status = getResolvedStatus(configuredHandle, row.contestId, row.problemCode);
            ProblemPanel.refreshStatus(row.contestId, row.problemCode, status);
        }
    });

    server.onContestMetadata(meta => {
        vscode.window.setStatusBarMessage(
            `$(sync~spin) Fetching ${meta.problem_count} problems from ${meta.name}…`,
            4000
        );
    });

    server.onContestComplete(done => {
        vscode.window.showInformationMessage(
            `CF Companion: contest ${done.contest_id} — ` +
            `${done.successful}/${done.problem_count} problems loaded` +
            `${done.failed ? ` (${done.failed} failed)` : ""}.`
        );
    });

    const startServer = () => {
        const port =
            vscode.workspace
                .getConfiguration()
                .get(
                    "cfCompanion.port",
                    10043
                );

        server.start(port);
    };

    startServer();

    const broadcastConfiguredHandle = () => {
        const handle = vscode.workspace
            .getConfiguration()
            .get<string>("cfCompanion.handle", "")
            .trim();

        server.broadcast({
            type: "configured_handle",
            handle: handle || null,
        });
    };

    const requestSubmissionsRescan = () => {
        server.broadcast({ type: "request_submissions_scrape" });
    };

    server.onClientConnected(() => {
        broadcastConfiguredHandle();
        requestSubmissionsRescan();
    });

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (
                e.affectsConfiguration(
                    "cfCompanion.port"
                )
            ) {
                startServer();
            }

            if (
                e.affectsConfiguration(
                    "cfCompanion.handle"
                )
            ) {
                broadcastConfiguredHandle();
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            "cfCompanion.openDashboard",
            () => {
                DashboardPanel.show(context);
            }
        ),

        vscode.commands.registerCommand(
            "cfCompanion.openProblem",
            async (
                contestId?: string,
                problemCode?: string
            ) => {
                if (!contestId || !problemCode) {
                    return;
                }

                const problem =
                    await storage.loadProblem(
                        contestId,
                        problemCode
                    );

                if (!problem) {
                    vscode.window.showWarningMessage(
                        `Could not find stored problem ${contestId}${problemCode}.`
                    );

                    return;
                }

                showProblemWithStatus(
                    problem,
                    context.extensionUri
                );
            }
        ),

        vscode.commands.registerCommand(
            "cfCompanion.createSolution",
            async (node?: { meta?: { contestId?: string; problemCode?: string } }) => {
                const contestId = node?.meta?.contestId;
                const problemCode = node?.meta?.problemCode;
                const problem =
                    contestId && problemCode
                        ? await storage.loadProblem(contestId, problemCode)
                        : ProblemPanel.getActiveProblem();

                if (!problem) {
                    vscode.window.showWarningMessage(
                        "CF Companion: open a problem first, then run Create Solution."
                    );
                    return;
                }

                const language = await vscode.window.showQuickPick(
                    [
                        { label: "C++", value: "cpp" as LanguageId },
                        { label: "Python", value: "python" as LanguageId },
                        { label: "Java", value: "java" as LanguageId },
                    ],
                    { placeHolder: "Select a language for the solution" }
                );
                if (!language) return;

                await openSolutionAndTests(problem, language.value);
            }
        ),

        vscode.commands.registerCommand(
            "cfCompanion.openSolution",
            async (node?: { meta?: { contestId?: string; problemCode?: string } }) => {
                const contestId = node?.meta?.contestId;
                const problemCode = node?.meta?.problemCode;
                const problem =
                    contestId && problemCode
                        ? await storage.loadProblem(contestId, problemCode)
                        : ProblemPanel.getActiveProblem();

                if (!problem) {
                    vscode.window.showWarningMessage("CF Companion: no problem selected.");
                    return;
                }

                const existing = await findExistingSolution(problem);
                if (!existing) {
                    vscode.window.showWarningMessage(
                        "CF Companion: no solution file exists yet for this problem. Use Create Solution first."
                    );
                    return;
                }

                await openSolutionAndTests(problem, existing.language, existing.uri);
            }
        ),

        vscode.commands.registerCommand("cfCompanion.runTests", async () => {
            const resolved = await problemContext.resolve();
            if (resolved) {
                await testWorkflow.open(resolved.problem, resolved.language, resolved.solutionUri);
                await testWorkflow.run();
                return;
            }

            if (testWorkflow.activeProblem) {
                await testWorkflow.run();
                return;
            }

            vscode.window.showWarningMessage(
                "CF Companion: open a generated solution file (or run Create Solution) before running tests."
            );
        }),

        vscode.commands.registerCommand("cfCompanion.addCustomTest", async () => {
            if (!testWorkflow.activeProblem) {
                vscode.window.showWarningMessage("CF Companion: open a problem's tests first.");
                return;
            }
            TestPanel.show().requestNewDraft();
        }),

        vscode.commands.registerCommand(
            "cfCompanion.refreshContests",
            () => {
                void sidebarPanel.refreshContestsTab();
            }
        ),

        vscode.commands.registerCommand(
            "cfCompanion.setHandle",
            async () => {
                const current =
                    vscode.workspace
                        .getConfiguration()
                        .get<string>(
                            "cfCompanion.handle",
                            ""
                        );

                const handle =
                    await vscode.window.showInputBox({
                        prompt: "Codeforces handle",
                        value: current
                    });

                if (handle) {
                    await sidebarPanel.saveHandle(handle.trim());
                    DashboardPanel.show(context);
                }
            }
        ),

        vscode.commands.registerCommand(
            "cfCompanion.restartServer",
            () => {
                startServer();

                vscode.window.showInformationMessage(
                    "CF Companion listener restarted."
                );
            }
        ),

        vscode.commands.registerCommand(
            "cfCompanion.submitSolution",
            async (args?: { compiler?: string }) => {
                const problem =
                    ProblemPanel.getActiveProblem() ??
                    testWorkflow.activeProblem ??
                    (vscode.window.activeTextEditor
                        ? (await problemContext.resolve(vscode.window.activeTextEditor.document))?.problem
                        : undefined);

                if (!problem) {
                    vscode.window.showErrorMessage(
                        "CF Companion: couldn't determine which problem to submit against. Open the problem's panel, or a generated solution file, before submitting."
                    );
                    return;
                }

                let solutionDoc: vscode.TextDocument;
                const activeEditor = vscode.window.activeTextEditor;
                const activeMatchesProblem =
                    activeEditor && (await problemContext.resolve(activeEditor.document))?.problem.contest_id === problem.contest_id;

                if (activeMatchesProblem && activeEditor) {
                    solutionDoc = activeEditor.document;
                } else {
                    const stored = await storage.getSolutionPath(problem.contest_id, problem.problem_code);
                    if (!stored) {
                        vscode.window.showErrorMessage(
                            "CF Companion: no solution file found for this problem. Create one first."
                        );
                        return;
                    }
                    try {
                        solutionDoc = await vscode.workspace.openTextDocument(vscode.Uri.file(stored.path));
                    } catch {
                        vscode.window.showErrorMessage(
                            "CF Companion: the solution file could not be found on disk. It may have been moved or deleted."
                        );
                        return;
                    }
                }

                if (solutionDoc.isUntitled) {
                    vscode.window.showErrorMessage(
                        "CF Companion: save this file to disk before submitting."
                    );
                    return;
                }

                if (solutionDoc.isDirty) {
                    await solutionDoc.save();
                }

                const language = (await problemContext.resolve(solutionDoc))?.language;
                const config = vscode.workspace.getConfiguration();
                const compiler =
                    args?.compiler ?? (language ? getDefaultSubmitCompiler(language) : "GNU G++17 7.3.0");
                const dryRun = config.get<boolean>("cfCompanion.submitDryRun", false);

                const expectedHandle = config.get<string>("cfCompanion.handle", "").trim();
                if (!expectedHandle) {
                    vscode.window.showErrorMessage(
                        "CF Companion: set your Codeforces handle (cfCompanion.handle) before submitting — it's used to confirm the browser tab is logged into the right account."
                    );
                    return;
                }

                let job;
                try {
                    const fileBytes = await vscode.workspace.fs.readFile(solutionDoc.uri);
                    const fileName = solutionDoc.uri.path.split("/").pop() ?? "solution";
                    job = buildSubmitJob(problem, fileName, Buffer.from(fileBytes), {
                        compiler,
                        dryRun,
                        expectedHandle,
                    });
                } catch (err: any) {
                    vscode.window.showErrorMessage(
                        `CF Companion: could not read the active file — ${err?.message ?? String(err)}`
                    );
                    return;
                }

                try {
                    const result = await vscode.window.withProgress(
                        {
                            location: vscode.ProgressLocation.Notification,
                            title: `Submitting ${problem.contest_id}${problem.problem_code} — waiting for your Codeforces tab…`,
                        },
                        () => submitQueue.enqueue(job)
                    );

                    if (result.ok) {
                        vscode.window.showInformationMessage(`CF Companion: ${result.message}`);
                        
                        if (!dryRun) {
                            ProblemPanel.refreshStatus(
                                problem.contest_id,
                                problem.problem_code,
                                "Judging…"
                            );
                        }
                    } else {
                        vscode.window.showErrorMessage(`CF Companion: ${result.message}`);
                    }
                } catch (err: any) {
                    vscode.window.showErrorMessage(
                        `CF Companion: submit failed — ${err?.message ?? String(err)}`
                    );
                }
            }
        ),

        vscode.commands.registerCommand(
            "cfCompanion.deleteContest",
            async (
                node?: {
                    contestId?: string;
                }
            ) => {
                const contestId =
                    node?.contestId;

                if (!contestId) {
                    return;
                }

                const confirmed =
                    await vscode.window.showWarningMessage(
                        `Delete all stored problems for contest ${contestId}? This can't be undone.`,
                        {
                            modal: true
                        },
                        "Delete"
                    );

                if (confirmed !== "Delete") {
                    return;
                }

                await storage.deleteContest(
                    contestId
                );

                vscode.window.setStatusBarMessage(
                    `$(trash) Deleted contest ${contestId}`,
                    3000
                );
            }
        )
    );
}

export function deactivate(): void {
    // Disposables registered via context.subscriptions
    // are cleaned up automatically.
}