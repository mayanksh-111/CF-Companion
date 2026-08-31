# CF Companion

A simple tool for competitive programming that brings **VS Code** and **Chrome** together.

Solve Codeforces problems without constantly switching between your browser and editor. CF Companion pulls problems directly from Codeforces into VS Code, runs your code against sample and custom tests, submits solutions, and keeps track of your progress.

> **VS Code:** `0.1.2` · **Chrome Helper:** `1.0`
> **Requires VS Code 1.85.0 or later**

## Download

### VS Code Extension

Download the `.vsix` file from the release assets and install it directly in VS Code.

### Chrome Helper

Download the Chrome extension and load it into Chrome. The helper connects Codeforces with the VS Code extension and handles problem parsing, submissions, and verdict updates.

---

## Features

### Problem Parsing

Open any problem on Codeforces and send it directly to VS Code. The problem statement, sample tests, tags, time limit, and memory limit are imported automatically, and a solution file is created for you.

### Run Tests

Compile and run your solution against all sample and custom test cases with a single click.

Results are shown as each test finishes, including:

* Pass/fail status
* Execution time
* Standard output
* Standard error

Currently supports **C++, Python, and Java**.

### Custom Tests

Create your own test cases alongside the official samples. You can add, edit, duplicate, and delete tests directly from the Tests panel.

### Submit from VS Code

Submit your solution to Codeforces without leaving VS Code. Select the compiler, submit the active solution, and let the Chrome helper handle the Codeforces submission page.

### Verdict Tracking

Keep track of your submissions directly in VS Code. The Chrome helper watches the Codeforces submissions page and sends verdict updates back to CF Companion, including pending and judging states.

### Problem Library

Problems you open are saved and organized by contest in the sidebar, making it easy to return to previously solved or attempted problems.

### Analytics Dashboard

Track your Codeforces progress from a single dashboard:

* Rating graph with contest history
* GitHub-style submission heatmap
* Verdict distribution and acceptance rate
* Problems solved by tag
* Problems solved by difficulty
* Contest history
* Recent submissions

---

## Getting Started

### 1. Install the VS Code Extension

Install the CF Companion `.vsix` file from the latest GitHub release.

In VS Code, open:

**Extensions → `...` → Install from VSIX...**

and select the downloaded `.vsix` file.

### 2. Set Your Codeforces Handle

Open the Command Palette and run:

```text
CF Companion: Set Codeforces Handle
```

You can also configure it through VS Code settings.

### 3. Install the Chrome Helper

Download the **CF Companion Helper** from the release assets.

In Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the Chrome extension folder

Keep a Codeforces tab open and make sure you're logged in.

### 4. Open a Problem

Go to any Codeforces problem and use the Chrome helper to send it to VS Code.

The problem will appear in CF Companion with its statement and sample tests.

### 5. Solve, Test, and Submit

Write your solution in VS Code and use:

* **Run Tests** to test your code
* **Submit Solution** to submit it to Codeforces
* The submission status will automatically update when the verdict is available

---

## Commands

Most commands are also available through the CF Companion sidebar, dashboard, and editor toolbar.

| Command                                 | Default Keybinding | Description                  |
| --------------------------------------- | ------------------ | ---------------------------- |
| **CF Companion: Open Dashboard**        | `Ctrl+Alt+D`       | Open the analytics dashboard |
| **CF Companion: Open Problem**          | `Ctrl+O P`         | Open a saved problem         |
| **CF Companion: Refresh Problem List**  | `Ctrl+Alt+R`       | Refresh the problem tree     |
| **CF Companion: Set Codeforces Handle** | `Ctrl+Alt+H`       | Set your Codeforces handle   |
| **CF Companion: Restart Listener**      | `Ctrl+Alt+L`       | Restart the local listener   |
| **CF Companion: Delete Contest**        | —                  | Delete a saved contest       |
| **Codeforces: Submit Solution**         | `Ctrl+Enter`       | Submit the active solution   |
| **CF Companion: Create Solution**       | `Ctrl+Alt+N`       | Create a solution file       |
| **CF Companion: Open Solution**         | `Ctrl+O S`         | Open an existing solution    |
| **CF Companion: Run Tests**             | `Ctrl+'`           | Run the active solution      |
| **CF Companion: Add Custom Test**       | `Ctrl+Alt+A`       | Add a custom test            |

All keybindings can be changed from **File → Preferences → Keyboard Shortcuts** in VS Code.

---

## Configuration

| Setting                                      | Default          | Description                                  |
| -------------------------------------------- | ---------------- | -------------------------------------------- |
| `cfCompanion.handle`                         | `""`             | Your Codeforces handle                       |
| `cfCompanion.port`                           | `10043`          | Local port used by the Chrome helper         |
| `cfCompanion.submitCompiler.cpp/python/java` | —                | Default compiler for each language           |
| `cfCompanion.submitDryRun`                   | `false`          | Fill the submit form without clicking Submit |
| `cfCompanion.cppPath`                        | `g++`            | C++ compiler path                            |
| `cfCompanion.cppFlags`                       | `-O2 -std=c++17` | C++ compiler flags                           |
| `cfCompanion.pythonPath`                     | `python3`        | Python interpreter path                      |
| `cfCompanion.javacPath`                      | `javac`          | Java compiler path                           |
| `cfCompanion.javaPath`                       | `java`           | Java runtime path                            |
| `cfCompanion.testTimeoutMs`                  | `3000`           | Per-test timeout in milliseconds             |

---

## Requirements

* **VS Code 1.85.0 or later**
* A compiler/interpreter for the languages you want to use:

  * `g++` for C++
  * `python3` for Python
  * `javac` and `java` for Java
* **Chrome**
* **CF Companion Helper** browser extension
* An open, logged-in **Codeforces** tab

---

## How the Chrome Helper Works

CF Companion uses a small browser companion to interact with Codeforces pages.

The Chrome helper:

* Reads problem statements and sample tests from Codeforces
* Sends problem data to VS Code through a local WebSocket/HTTP connection
* Watches the submissions page for verdict updates
* Handles submission jobs sent from VS Code
* Fills and submits the Codeforces submission form
* Supports dry-run submissions when enabled

The communication stays local between the browser helper and CF Companion.

### Which Codeforces page should be open?

**For problem parsing**

Open the Codeforces problem you want to import.

**For verdict tracking**

Keep a Codeforces submissions page open, such as your submissions page or a contest submissions page.

**For submitting**

Keep any normal Codeforces page open and logged in. The helper can navigate to the submission page when a submission is requested.

---

## Privacy

CF Companion communicates with:

* `codeforces.com`
* A local server running on your machine
* The CF Companion Chrome helper

No data is sent to any external service.

---

## Contributing

Found a bug or have an idea for a feature?

Open an issue or submit a pull request. Contributions are welcome.

## License

MIT License. See [LICENSE](./LICENSE) for details.
