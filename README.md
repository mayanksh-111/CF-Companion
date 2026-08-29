# CF Companion

Solve Codeforces problems without leaving VS Code. CF Companion pairs with a browser companion script to pull problems straight from the CF website into your editor, run your solution against sample tests, submit with one keystroke, and track your progress with a full analytics dashboard.

Version 0.1.2 · Requires VS Code 1.85.0 or later

## Features

**One-click problem parsing**
Browse to a problem on Codeforces and send it straight to VS Code. CF Companion listens on a local WebSocket/HTTP port and creates a ready-to-code solution file for you, sample tests included.

**Run tests instantly**
Compile and run your solution against every sample (and custom) test case with a click. Results stream in per-test as they finish, with pass/fail, timing, and full stdout/stderr. Supports C++, Python, and Java out of the box.

**Custom test cases**
Add your own test cases alongside the official samples. Edit, duplicate, or delete them right from the Tests panel.

**Submit from the editor**
Submit your open solution directly to Codeforces, with compiler selection, and account verification handled for you via a lightweight browser companion.

**Analytics dashboard**
Open the dashboard for a full breakdown of your CF journey:
- Rating graph with contest-by-contest history
- Submission heatmap (GitHub-style, last 365 days)
- Verdict distribution and acceptance rate
- Problems solved by tag and by difficulty
- Full contest and recent-submission history

**Problem library**
Every problem you open is saved and organized by contest in the sidebar tree, so you can jump back into old problems anytime.

## Getting Started

1. Install **CF Companion** and open it in VS Code.
2. Set your Codeforces handle from the command palette or sidebar (`CF Companion: Set Codeforces Handle`).
3. Download the CF Companion Helper browser extension from its repo and load it into Chrome, either unpacked (via `chrome://extensions` → Developer mode → Load unpacked) or packed (drag the `.crx` onto `chrome://extensions`). Keep a Codeforces tab open.
4. Browse to any problem and parse it — it lands in VS Code ready to solve.
5. Code your solution, then use the Run Tests and Submit buttons (or your own keybindings) to test and submit.

## Commands

Most commands are also available as buttons in the sidebar, dashboard, and editor toolbar. The keybindings below are just the defaults — all of them can be changed from **File > Preferences > Keyboard Shortcuts** in VS Code.

| Command | Default Keybinding | Description |
|---|---|---|
| CF Companion: Open Dashboard | `Ctrl+Alt+D` | Open the analytics dashboard |
| CF Companion: Open Problem | `Ctrl+O P` | Open a saved problem's statement |
| CF Companion: Refresh Problem List | `Ctrl+Alt+R` | Reload the sidebar problem tree |
| CF Companion: Set Codeforces Handle | `Ctrl+Alt+H` | Configure your CF handle |
| CF Companion: Restart Listener | `Ctrl+Alt+L` | Restart the local parsing server |
| CF Companion: Delete Contest | — | Remove a saved contest from your library (no default keybinding, destructive action) |
| Codeforces: Submit Solution | `Ctrl+Enter` | Submit the active solution to Codeforces |
| CF Companion: Create Solution | `Ctrl+Alt+N` | Create a solution file for a problem |
| CF Companion: Open Solution | `Ctrl+O S` | Jump to a problem's existing solution file |
| CF Companion: Run Tests | `Ctrl+'` | Run the active solution against its tests |
| CF Companion: Add Custom Test | `Ctrl+Alt+A` | Add a custom test case |

## Configuration

| Setting | Default | Description |
|---|---|---|
| `cfCompanion.handle` | `""` | Your Codeforces handle |
| `cfCompanion.port` | `10043` | Local port for incoming problem data |
| `cfCompanion.submitCompiler.cpp/python/java` | — | Default submit-page compiler per language |
| `cfCompanion.submitDryRun` | `false` | Fill the submit form but don't click Submit |
| `cfCompanion.cppPath` / `cppFlags` | `g++` / `-O2 -std=c++17` | C++ compiler and flags |
| `cfCompanion.pythonPath` | `python3` | Python interpreter path |
| `cfCompanion.javacPath` / `javaPath` | `javac` / `java` | Java toolchain paths |
| `cfCompanion.testTimeoutMs` | `3000` | Per-test timeout in milliseconds |

## Requirements

- VS Code `1.85.0` or later
- A compiler/interpreter on your PATH for whichever languages you use (`g++`, `python3`, `javac`/`java`)
- The CF Companion Helper browser extension (Chrome), loaded from its repo, with an open, logged-in Codeforces tab, for problem parsing and submission

## Chrome Helper Extension

CF Companion cannot read a Codeforces page or drive a real submit form by itself — that part is handled by a companion browser extension ("CF Companion Helper") that runs alongside this VS Code extension.

What it does:
- Scrapes the problem statement and sample tests from the page you're viewing and sends them to VS Code over a local WebSocket/HTTP connection (`cfCompanion.port`, default `10043`)
- Watches your submissions page and reports verdicts back so status updates (including pending/judging) show up without any polling
- Picks up pending submit jobs queued from VS Code, fills in the submit form on codeforces.com, and clicks Submit (or stops short of clicking, in dry-run mode)

Keep in mind which Codeforces page needs to be open for each feature:
- **Live verdict/status updates** — a submissions page (e.g. `.../my` or a contest's submissions page) must be open for the helper to scrape it.
- **Submitting a solution** — a normal Codeforces page (any page, logged in) must be open beforehand so the helper can navigate it to the submit form and fill it in.

Download it from its repository. Depending on what's provided there, either:
- **Unpacked**: open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the downloaded folder, or
- **Packed** (`.crx`): drag the `.crx` file onto the `chrome://extensions` page to install it.

Keep a Codeforces tab open while you work, and make sure the extension is enabled — CF Companion in VS Code will do nothing without it.

## Privacy

CF Companion only talks to `codeforces.com`'s public API and a local server on your machine used to communicate with your browser. No data is sent anywhere else.

## Contributing & Issues

Found a bug or have a feature request? Open an issue or PR on GitHub — contributions are welcome!

## License

MIT — see [LICENSE](./LICENSE) for details.
