import * as http from "http";
import { WebSocketServer, WebSocket } from "ws";
import * as vscode from "vscode";
import {
  IncomingCompilerList,
  IncomingContestComplete,
  IncomingContestMetadata,
  IncomingMessage,
  IncomingProblem,
  IncomingProblemError,
  SubmitPollResponse,
  SubmitResult,
} from "./types";
import { SubmitJobQueue } from "./cfSubmit";

export interface ScrapedSubmissionRow {
  contestId: string;
  problemCode: string;
  verdict: string;
  problemName?: string;
  submissionTimeMs?: number;
}

export interface IncomingSubmissionsScrape {
  type: "submissions_scrape";
  handle: string;
  rows: ScrapedSubmissionRow[];
  timestamp: number;
}

type IncomingMessageOrScrape = IncomingMessage | IncomingSubmissionsScrape;

export class ProblemServer implements vscode.Disposable {
  private httpServer: http.Server | undefined;
  private wss: WebSocketServer | undefined;

  private readonly _onProblem = new vscode.EventEmitter<IncomingProblem>();
  readonly onProblem = this._onProblem.event;

  private readonly _onContestMetadata = new vscode.EventEmitter<IncomingContestMetadata>();
  readonly onContestMetadata = this._onContestMetadata.event;

  private readonly _onContestComplete = new vscode.EventEmitter<IncomingContestComplete>();
  readonly onContestComplete = this._onContestComplete.event;

  private readonly _onProblemError = new vscode.EventEmitter<IncomingProblemError>();
  readonly onProblemError = this._onProblemError.event;

  private readonly _onCompilerList = new vscode.EventEmitter<IncomingCompilerList>();
  readonly onCompilerList = this._onCompilerList.event;

  private readonly _onSubmissionsScrape = new vscode.EventEmitter<IncomingSubmissionsScrape>();
  readonly onSubmissionsScrape = this._onSubmissionsScrape.event;

  private readonly _onClientConnected = new vscode.EventEmitter<void>();
  readonly onClientConnected = this._onClientConnected.event;

  private readonly output: vscode.OutputChannel;

  constructor(private readonly submitQueue?: SubmitJobQueue) {
    this.output = vscode.window.createOutputChannel("CF Companion");
  }

  start(port: number): void {
    this.stop();
    this.httpServer = http.createServer((req, res) => {
      this.output.appendLine(`Incoming HTTP ${req.method} ${req.url} from ${req.socket.remoteAddress}`);

      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if(req.method === "OPTIONS"){
        res.writeHead(204);
        res.end();
        return;
      }

      const url = new URL(req.url ?? "/", "http://localhost");

      if(url.pathname === "/submit-poll" && req.method === "GET"){
        const job = this.submitQueue?.takeNextJob();
        const body: SubmitPollResponse = job ? { job } : { job: null };

        res.writeHead(200, {"Content-Type": "application/json"});
        res.end(JSON.stringify(body));
        return;
      }

      if(url.pathname === "/submit-result" && req.method === "POST"){
        let resultBody = "";
        req.on("data", (chunk) => { resultBody += chunk; });
        req.on("end", () => {
          try{
            const result: SubmitResult = JSON.parse(resultBody);
            const delivered = this.submitQueue?.reportResult(result) ?? false;
            res.writeHead(200, { "Content-Type": "application/json"});
            res.end(JSON.stringify({ status: "received", delivered}));
          } 
          catch(err){
            this.output.appendLine(`Failed to parse /submit-result body: ${err}`);
            res.writeHead(400, { "Content-Type": "application/json"});

            res.end(JSON.stringify({ error: "Invalid JSON"}));
          }
        });

        return;
      }

      if(req.method === "GET"){
        res.writeHead(200, { "Content-Type": "application/json"});
        res.end(JSON.stringify({
          status: "ok",
          listening: true,
          protocols: ["websocket", "http-post"],
        }));

        return;
      }

      if(req.method !== "POST"){
        res.writeHead(405);
        res.end();
        return;
      }

      let body = "";

      req.on("data", (chunk) => { body += chunk; });

      req.on("end", () => {
        if(body.length === 0){
          this.output.appendLine("HTTP POST arrived with an empty body — ignoring.");
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Empty body" }));
          return;
        }

        this.handlePayload(body, "http");
        res.writeHead(200,{ "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "received"}));
      });
    });

    // WebSocket server shares the same HTTP server and port.
    this.wss = new WebSocketServer({ server: this.httpServer });

    this.wss.on("connection", (socket: WebSocket, req) => {
      this.output.appendLine(`WebSocket client connected from ${req.socket.remoteAddress}`);
      this._onClientConnected.fire();
      socket.on("message", (raw) => { this.handlePayload(raw.toString("utf8"), "ws"); });
      socket.on("close", () => {
        this.output.appendLine("WebSocket client disconnected");
      });

      socket.on("error", (err) => {
        this.output.appendLine(`WebSocket error: ${err.message}`);
      });
    });

    this.httpServer.on("error", (err: NodeJS.ErrnoException) => {
      if(err.code === "EADDRINUSE"){
        vscode.window.showErrorMessage(`CF Companion: port ${port} is already in use. Change "cfCompanion.port" in settings or free the port.`);
      } 
      else{
        vscode.window.showErrorMessage(`CF Companion server error: ${err.message}`);
      }

      this.output.appendLine(`Server error on port ${port}: ${err.message}`);
    });

    // Bind to all interfaces so WSL, containers, etc. can connect.
    this.httpServer.listen(port, "0.0.0.0", () => {
      this.output.appendLine(`Listening for WebSocket + HTTP on port ${port}`);
    });
  }

  private handlePayload(raw: string, via: "ws" | "http"): void {
    this.output.appendLine(`[${via}] payload received: ${raw.length} bytes`);

    if(raw.length > 0){
      this.output.appendLine(`[${via}] preview: ${raw.slice(0, 200)}${raw.length > 200 ? "…" : ""}`);
    }

    let data: IncomingMessageOrScrape;

    try{
      data = JSON.parse(raw);
    } 
    catch(err){
      this.output.appendLine(`Failed to parse incoming payload: ${err}`);
      return;
    }

    switch(data.type){
      case "problem":
        this.output.appendLine(`Received problem ${data.contest_id}${data.problem_code}: ${data.problem_name}`);
        this._onProblem.fire(data);
        break;

      case "problem_error":
        this.output.appendLine(`Problem extraction failed for ${data.url}: ${data.error}`);
        this._onProblemError.fire(data);
        break;

      case "contest_metadata":
        this.output.appendLine(`Contest metadata: ${data.contest_id} — ${data.name} (${data.problem_count} problems)`);
        this._onContestMetadata.fire(data);
        break;

      case "contest_complete":
        this.output.appendLine(`Contest complete: ${data.contest_id} — ${data.successful}/${data.problem_count} succeeded`);
        this._onContestComplete.fire(data);
        break;

      case "compiler_list":
        this.output.appendLine(`Compiler list received: ${data.compilers.length} options`);
        this._onCompilerList.fire(data);
        break;

      case "submissions_scrape":
        this.output.appendLine(`Submissions scrape received: ${data.rows.length} row(s) for handle ${data.handle}`);
        this._onSubmissionsScrape.fire(data);
        break;

      default:
        this.output.appendLine(`Unrecognized message type: '${(data as any).type}'`);
    }
  }

  broadcast(message: Record<string, unknown>): void {
    if (!this.wss) return;

    const raw = JSON.stringify(message);
    for(const client of this.wss.clients){
      if(client.readyState === WebSocket.OPEN){
        client.send(raw);
      }
    }
  }

  stop(): void {
    if(this.wss){
      this.wss.close();
      this.wss = undefined;
    }

    if(this.httpServer){
      this.httpServer.close();
      this.httpServer = undefined;
    }
  }

  dispose(): void {
    this.stop();
    this.output.dispose();
    this._onProblem.dispose();
    this._onContestMetadata.dispose();
    this._onContestComplete.dispose();
    this._onProblemError.dispose();
    this._onCompilerList.dispose();
    this._onSubmissionsScrape.dispose();
    this._onClientConnected.dispose();
  }
}