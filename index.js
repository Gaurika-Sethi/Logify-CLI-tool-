#!/usr/bin/env node
// index.js — TTM CLI (ESM)
// Logs in same textual format as your PowerShell version.

import { config as loadEnv } from "dotenv";
loadEnv();
console.log("✅ OPENAI_API_KEY loaded:", !!process.env.OPENAI_API_KEY);
import { Command } from "commander";
import chalk from "chalk";
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import readline from "readline";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();


const program = new Command();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------- OpenAI setup ----------
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ---------- session dir resolution ----------
function resolveSessionsDir() {
  const cand1 = path.join(process.cwd(), "sessions");
  const cand2 = path.join("C:", "projects", "TTM", "sessions");
  const cand3 = path.join(os.homedir(), ".ttm", "sessions");

  if (fs.existsSync(cand1)) return cand1;
  if (fs.existsSync(cand2)) return cand2;

  fs.mkdirSync(cand3, { recursive: true });
  return cand3;
}

// helper: today's date
function getToday() {
  return new Date().toISOString().split("T")[0];
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

// Helper to mask sensitive outputs (like API keys, tokens etc.)
function redactSecrets(content) {
  if (!content) return "";
  // Replace common secret patterns with [REDACTED]
  return content
    .replace(/(api[_-]?key\s*[:=]\s*)\S+/gi, "$1[REDACTED]")
    .replace(/(token\s*[:=]\s*)\S+/gi, "$1[REDACTED]")
    .replace(/(password\s*[:=]\s*)\S+/gi, "$1[REDACTED]");
}

function parseSessionLog(content) {
  const entries = [];
  const lines = content.split("\n");
  let current = null;

  for (const line of lines) {
    if (line.startsWith("=== [") && line.includes("COMMAND:")) {
      const time = line.match(/\[(.*?)\]/)?.[1] || "";
      const cmd = line.replace(/^.*COMMAND:\s*/, "").trim();
      current = { time, cmd, output: [] };
    } else if (line.startsWith("=== END ===")) {
      if (current) {
        entries.push(current);
        current = null;
      }
    } else if (current) {
      current.output.push(line);
    }
  }

  return entries;
}


// ---------- masking ----------
function maskSensitive(text) {
  if (!text) return text;
  return text
    .replace(/(token|key|password|pwd|secret)\s*=\s*([^\s]+)/gi, "$1=***")
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/g, "*****@*****")
    .replace(/\b[a-f0-9]{32,}\b/gi, "***")
    .replace(/\b[A-Za-z0-9+/=]{20,}\b/g, "***");
}

// ---------- START ----------
program
  .command("start")
  .description("Start tracked REPL; logs appended to daily session file")
  .action(() => {
    const st = readState();
    if (st.activeSession) {
      console.log(chalk.red("A session is already active:"), st.activeSession);
      process.exit(1);
    }

    const date = todayDate();
    const logFile = sessionFileForDate(date);

    fs.appendFileSync(logFile, `=== TTM session started at ${nowTime()} ===\n\n`);

    writeState({ activeSession: { pid: process.pid, logFile } });

    console.log(chalk.green(`TTM started — logging to ${logFile}`));

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

      // masked command in file
      fs.appendFileSync(logFile, `=== [${nowTime()}] COMMAND: ${maskSensitive(cmd)}\n`);

      const child = spawn(cmd, { shell: true });

      child.stdout.on("data", (d) => {
        const s = d.toString();
        process.stdout.write(s);                 // raw output in terminal
        fs.appendFileSync(logFile, maskSensitive(s)); // masked in file
      });

      child.stderr.on("data", (d) => {
        const s = d.toString();
        process.stderr.write(s);                 // raw in terminal
        fs.appendFileSync(logFile, maskSensitive(s)); // masked in file
      });

      child.on("close", () => {
        fs.appendFileSync(logFile, `=== END ===\n\n`);
        rl.prompt();
      });
    });

    function gracefulExit() {
      try {
        fs.appendFileSync(logFile, `=== TTM session ended at ${nowTime()} ===\n`);
      } catch {}
      clearState();
      process.exit(0);
    }
    process.on("SIGINT", gracefulExit);
    process.on("SIGTERM", gracefulExit);
  });

// ---------- STOP ----------
program
  .command("stop")
  .description("Stop the currently recording session")
  .action(() => {
    const st = readState();
    if (!st.activeSession) {
      console.log(chalk.yellow("No active session found."));
      process.exit(1);
    }
    try {
      process.kill(st.activeSession.pid);
      console.log(chalk.green(`Stopped PID ${st.activeSession.pid}`));
    } catch (e) {
      console.log(chalk.red(`Failed to stop: ${e.message}`));
    }
    clearState();
  });

// ---------- HISTORY ----------
program
  .command("history")
  .description("List session files")
  .action(() => {
    const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.startsWith("session-")).sort().reverse();
    if (files.length === 0) {
      console.log(chalk.gray("No sessions yet."));
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
  .option("-d, --date <date>", "date yyyy-mm-dd", todayDate())
  .action((opts) => {
    const file = sessionFileForDate(opts.date);
    if (!fs.existsSync(file)) {
      console.log(chalk.yellow("No log for date", opts.date));
      return;
    }
    console.log(fs.readFileSync(file, "utf8"));
  });

// ---------- INPUTS ----------
program
  .command("inputs")
  .description("Show only commands (inputs) for a session")
  .option("-d, --date <date>", "date yyyy-mm-dd", todayDate())
  .action((opts) => {
    const file = sessionFileForDate(opts.date);
    if (!fs.existsSync(file)) {
      console.log(chalk.yellow(`No log for ${opts.date}`));
      return;
    }
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines
      .filter(l => l.includes("COMMAND:"))
      .forEach(l => console.log(l.split("COMMAND:")[1].trim()));
  });

// ---------- SEARCH ----------
program
  .command("search <pattern>")
  .description("Search session file for commands matching pattern")
  .option("-d, --date <date>", "date yyyy-mm-dd", todayDate())
  .action((pattern, opts) => {
    const file = sessionFileForDate(opts.date);
    if (!fs.existsSync(file)) {
      console.log(chalk.yellow(`No log for ${opts.date}`));
      return;
    }
    const entries = fs.readFileSync(file, "utf8").split("=== END ===");
    entries.forEach(entry => {
      const cmdMatch = entry.match(/COMMAND:\s+(.+)/);
      if (cmdMatch) {
        const cmd = cmdMatch[1].trim();
        if (cmd.includes(pattern)) console.log(cmd);
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
      console.log(chalk.yellow("No sessions found."));
      return;
    }
    files.forEach(file => {
      const entries = fs.readFileSync(path.join(SESSIONS_DIR, file), "utf8").split("=== END ===");
      entries.forEach(entry => {
        const cmdMatch = entry.match(/COMMAND:\s+(.+)/);
        if (cmdMatch) {
          const cmd = cmdMatch[1].trim();
          if (cmd.includes(pattern)) console.log(cmd);
        }
      });
    });
  });

// ---------- EXPORT (single date) ----------
program
  .command("export")
  .description("Export a specific session log to Markdown")
  .option("-d, --date <date>", "Date in YYYY-MM-DD")
  .action((options) => {
    const date = options.date;
    if (!date) {
      console.log("Please provide a date with -d YYYY-MM-DD");
      return;
    }

    const sessionFile = path.join(SESSIONS_DIR, `session-${date}.log`);
    if (!fs.existsSync(sessionFile)) {
      console.log(`No log file for ${date}`);
      return;
    }

    const raw = fs.readFileSync(sessionFile, "utf8");
    const redacted = redactSecrets(raw);

    const mdContent = `# Session Log - ${date}\n\n\`\`\`\n${redacted.trim()}\n\`\`\`\n`;
    const exportFile = path.join(SESSIONS_DIR, `session-${date}.md`);
    fs.writeFileSync(exportFile, mdContent, "utf8");

    console.log(`Exported ${exportFile}`);
  });


// ---------- EXPORT ALL ----------
program
  .command("export-all")
  .description("Export all session logs to individual Markdown files")
  .action(() => {
    const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith(".log"));

    if (files.length === 0) {
      console.log("No session logs to export.");
      return;
    }

    for (const f of files) {
      const dateMatch = f.match(/session-(\d{4}-\d{2}-\d{2})\.log$/);
      if (!dateMatch) continue;

      const date = dateMatch[1];
      const sessionFile = path.join(SESSIONS_DIR, f);
      const raw = fs.readFileSync(sessionFile, "utf8");
      const redacted = redactSecrets(raw);

      // Wrap log content nicely in Markdown
      const mdContent = `# Session Log - ${date}\n\n\`\`\`\n${redacted.trim()}\n\`\`\`\n`;

      const exportFile = path.join(SESSIONS_DIR, `session-${date}.md`);
      fs.writeFileSync(exportFile, mdContent, "utf8");

      console.log(`Exported session log for ${date} → ${exportFile}`);
    }
  });

// ---------- REPLAY ----------
program
  .command("replay <sessionFile>")
  .option("--fast", "Replay instantly with no delays")
  .description("Replay a past session log")
  .action((sessionFile, options) => {
    const filePath = path.join(SESSIONS_DIR, sessionFile);
    if (!fs.existsSync(filePath)) {
      console.error(`Session file not found: ${filePath}`);
      return;
    }

    const raw = fs.readFileSync(filePath, "utf8");
    const entries = parseSessionLog(raw);

    if (entries.length === 0) {
      console.log("No commands found in session log.");
      return;
    }

    const speed = options.fast ? Infinity : parseFloat(options.speed) || 1;

    (async () => {
      for (const e of entries) {
        console.log(`\n[${e.time}] $ ${e.cmd}`);
        for (const line of e.output) {
          if (line.trim()) console.log(line);
        }

        // Delay before next command
        if (speed !== Infinity) {
          await new Promise(r => setTimeout(r, 1500 / speed)); // 1.5s base delay
        }
      }
      console.log("\nReplay finished.");
    })();
  });

// ---------- SUMMARIZE (AI) ----------  
program
  .command("summarize")
  .description("Generate AI summary for a session log")
  .option("-d, --date <date>", "Date in YYYY-MM-DD")
  .action(async (opts) => {
    const date = opts.date || new Date().toISOString().split("T")[0];
    const sessionFile = path.join(SESSIONS_DIR, `session-${date}.log`);

    if (!fs.existsSync(sessionFile)) {
      console.log(`No log file for ${date}`);
      return;
    }

    const content = fs.readFileSync(sessionFile, "utf8");

    console.log("Generating AI summary... (this may take a few seconds)");

    try {
      const response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are an assistant that summarizes terminal sessions clearly and concisely for a developer journal.",
          },
          {
            role: "user",
            content: `Summarize this terminal log in 5-6 sentences:\n\n${content}`,
          },
        ],
      });

      const summary = response.choices[0].message.content;
      console.log("\nSummary:\n", summary);

      // Save summary
      const summaryFile = path.join(SESSIONS_DIR, `summary-${date}.txt`);
      fs.writeFileSync(summaryFile, summary, "utf8");
      console.log(`\nSaved summary to ${summaryFile}`);
    } catch (err) {
      console.error("Error generating summary:", err.message);
    }
  });



program.parse(process.argv);
