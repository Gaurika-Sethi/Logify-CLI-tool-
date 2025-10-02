#!/usr/bin/env node
// index.js — TTM CLI with masking support

import { Command } from "commander";
import chalk from "chalk";
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import readline from "readline";

const program = new Command();

// ---------- SESSION DIR RESOLUTION ----------
function resolveSessionsDir() {
  const cand1 = path.join(process.cwd(), "sessions");
  const cand2 = path.join("C:", "projects", "TTM", "sessions"); // explicit fallback for your setup
  const cand3 = path.join(os.homedir(), ".ttm", "sessions");

  if (fs.existsSync(cand1)) return cand1;
  if (fs.existsSync(cand2)) return cand2;

  fs.mkdirSync(cand3, { recursive: true });
  return cand3;
}

const SESSIONS_DIR = resolveSessionsDir();
fs.mkdirSync(SESSIONS_DIR, { recursive: true });

const STATE_FILE = path.join(path.dirname(SESSIONS_DIR), "ttm-state.json");

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch { return {}; }
}
function writeState(obj) { fs.writeFileSync(STATE_FILE, JSON.stringify(obj, null, 2)); }
function clearState() { try { fs.unlinkSync(STATE_FILE); } catch {} }

function todayDate() { return new Date().toISOString().slice(0,10); }
function nowTime() {
  const d = new Date();
  return d.toTimeString().split(" ")[0];
}
function sessionFileForDate(dateStr) {
  return path.join(SESSIONS_DIR, `session-${dateStr}.log`);
}

// ---------- MASKING ----------
function maskSensitive(text) {
  if (!text) return text;
  return text
    .replace(/(token|key|password|pwd)\s*=\s*([^\s]+)/gi, "$1=******")
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/g, "*****@*****")
    .replace(/\b[a-f0-9]{32,}\b/gi, "********")
    .replace(/\b[A-Za-z0-9+/=]{20,}\b/g, "********");
}

// ---------- START ----------
program
  .command("start")
  .description("Start tracked REPL; logs appended to daily session file")
  .action(() => {
    const st = readState();
    if (st.activeSession) {
      console.log(chalk.red("A session appears to be active already:"), st.activeSession);
      process.exit(1);
    }

    const date = todayDate();
    const logFile = sessionFileForDate(date);
    fs.appendFileSync(logFile, `\n=== TTM session started at ${nowTime()} ===\n`);
    writeState({ activeSession: { pid: process.pid, logFile } });

    console.log(chalk.green(`✅ TTM started — logging to ${logFile}`));
    console.log(chalk.gray(`Tip: open another shell and run "ttm stop" to stop this session.`));

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "ttm> " });
    rl.prompt();

    rl.on("line", (line) => {
      const cmd = line.trim();
      if (!cmd) { rl.prompt(); return; }
      if (cmd.toLowerCase() === "exit") {
        fs.appendFileSync(logFile, `=== TTM session ended at ${nowTime()} ===\n`);
        clearState();
        rl.close();
        return;
      }

      fs.appendFileSync(logFile, `\n=== [${nowTime()}] COMMAND: ${maskSensitive(cmd)} ===\n`);
      const child = spawn(cmd, { shell: true });

      child.stdout.on("data", (d) => {
        const s = d.toString();
        process.stdout.write(s);                     // raw in terminal
        fs.appendFileSync(logFile, maskSensitive(s)); // masked in file
      });

      child.stderr.on("data", (d) => {
        const s = d.toString();
        process.stderr.write(s);                      // raw in terminal
        fs.appendFileSync(logFile, "ERROR:\n" + maskSensitive(s));
      });

      child.on("close", () => {
        fs.appendFileSync(logFile, `=== END ===\n`);
        rl.prompt();
      });
    });

    function gracefulExit() {
      try { fs.appendFileSync(logFile, `=== TTM session ended at ${nowTime()} ===\n`); } catch {}
      clearState();
      process.exit(0);
    }
    process.on("SIGINT", gracefulExit);
    process.on("SIGTERM", gracefulExit);
  });

// ---------- STOP ----------
program
  .command("stop")
  .description("Stop the currently recording session (if any)")
  .action(() => {
    const st = readState();
    if (!st.activeSession) {
      console.log(chalk.yellow("No active session found."));
      process.exit(1);
    }
    const pid = st.activeSession.pid;
    try {
      process.kill(pid);
      console.log(chalk.green(`Sent termination to PID ${pid}.`));
    } catch (e) {
      console.log(chalk.red(`Failed to stop PID ${pid}: ${e.message}`));
    }
    clearState();
  });

// ---------- HISTORY ----------
program
  .command("history")
  .description("List session files (most recent first)")
  .action(() => {
    const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.startsWith("session-")).sort().reverse();
    if (files.length === 0) {
      console.log(chalk.gray("No sessions yet. Run `ttm start`."));
      return;
    }
    for (const f of files) {
      const full = path.join(SESSIONS_DIR, f);
      const stat = fs.statSync(full);
      console.log(chalk.cyan(f), chalk.gray(stat.mtime.toLocaleString()));
    }
  });

// ---------- SHOW ----------
program
  .command("show")
  .description("Show session log for a date (default: today)")
  .option("-d, --date <date>", "date in yyyy-mm-dd", todayDate())
  .option("-n, --last <n>", "show last N entries", parseInt)
  .action((opts) => {
    const file = sessionFileForDate(opts.date);
    if (!fs.existsSync(file)) {
      console.log(chalk.yellow("No log for date", opts.date));
      return;
    }
    const text = fs.readFileSync(file, "utf8");
    if (opts.last && opts.last > 0) {
      const entries = text.split("=== END ===").map(s => s.trim()).filter(Boolean);
      const last = entries.slice(-opts.last);
      console.log(last.join("\n\n=== END ===\n\n"));
    } else {
      console.log(text);
    }
  });

// ---------- EXPORT ----------
program
  .command("export")
  .description("Export session logs to Markdown")
  .option("-d, --date <date>", "Date (YYYY-MM-DD)", new Date().toISOString().slice(0, 10))
  .action((options) => {
    const date = options.date;
    const sessionFile = path.join(__dirname, "sessions", `session-${date}.log`);
    const exportFile = path.join(__dirname, `export-${date}.md`);

    if (!fs.existsSync(sessionFile)) {
      console.log(chalk.yellow(`⚠️ No log file for ${date}`));
      return;
    }

    let content = fs.readFileSync(sessionFile, "utf-8");

    // Extra safety: redact secrets again before exporting
    content = content
      .replace(/(--password\s+)\S+/gi, "$1***")
      .replace(/(--key\s+)\S+/gi, "$1***")
      .replace(/(SECRET\s*=\s*)\S+/gi, "$1***")
      .replace(/(TOKEN\s*=\s*)\S+/gi, "$1***");

    const md = `# Terminal Session (${date})

\`\`\`
${content.trim()}
\`\`\`
`;

    fs.writeFileSync(exportFile, md);
    console.log(chalk.green(`✅ Exported to ${exportFile}`));
  });


// ---------- INPUTS ----------
program
  .command("inputs")
  .description("Show only commands (inputs) for a session")
  .option("-d, --date <date>", "date in yyyy-mm-dd", todayDate())
  .action((opts) => {
    const file = sessionFileForDate(opts.date);
    if (!fs.existsSync(file)) {
      console.log(chalk.yellow(`⚠️ No log file for ${opts.date}`));
      return;
    }
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines
      .filter(l => l.includes("COMMAND:"))
      .forEach(l => console.log(l.split("COMMAND:")[1].replace(/===/g, "").trim()));
  });

// ---------- SEARCH ----------
program
  .command("search <pattern>")
  .description("Search session file for commands matching pattern")
  .option("-d, --date <date>", "date in yyyy-mm-dd", todayDate())
  .action((pattern, opts) => {
    const file = sessionFileForDate(opts.date);
    if (!fs.existsSync(file)) {
      console.log(chalk.yellow(`⚠️ No log file for ${opts.date}`));
      return;
    }
    const entries = fs.readFileSync(file, "utf8").split("=== END ===");
    entries.forEach(entry => {
      const cmdMatch = entry.match(/COMMAND:\s+(.+)/);
      if (cmdMatch) {
        const cmd = cmdMatch[1].trim();
        if (cmd.includes(pattern)) {
          if (entry.includes("ERROR:")) {
            console.log(`${cmd} [ERROR]`);
          } else {
            console.log(cmd);
          }
        }
      }
    });
  });

// ---------- SEARCH-ALL ----------
program
  .command("search-all <pattern>")
  .description("Search all session files for commands matching pattern")
  .action((pattern) => {
    const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.startsWith("session-"));
    if (files.length === 0) {
      console.log(chalk.yellow("⚠️ No sessions found."));
      return;
    }
    files.forEach(file => {
      const content = fs.readFileSync(path.join(SESSIONS_DIR, file), "utf8");
      const entries = content.split("=== END ===");
      entries.forEach(entry => {
        const cmdMatch = entry.match(/COMMAND:\s+(.+)/);
        if (cmdMatch) {
          const cmd = cmdMatch[1].trim();
          if (cmd.includes(pattern)) {
            if (entry.includes("ERROR:")) {
              console.log(`${cmd} [ERROR]`);
            } else {
              console.log(cmd);
            }
          }
        }
      });
    });
  });

program.parse(process.argv);
