#!/usr/bin/env node
// index.js — Logify CLI (ESM)
// Logs terminal commands and outputs, summarizes sessions with AI.

import { config as loadEnv } from "dotenv";
loadEnv();

import { Command } from "commander";
import chalk from "chalk";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import readline from "readline";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config({ DOTENV_KEY: undefined, quiet: true });


// ---------- Setup ----------
const program = new Command();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------- OpenAI setup ----------
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ---------- session dir resolution ----------
function resolveSessionsDir() {
  const projectDir = process.cwd();
  const localDir = path.join(projectDir, "sessions");
  fs.mkdirSync(localDir, { recursive: true });
  return localDir;
}

// ---------- helpers ----------
function todayDate() {
  return new Date().toISOString().slice(0, 10);
}
function nowTime() {
  const d = new Date();
  return d.toTimeString().split(" ")[0];
}
function sessionFileForDate(dateStr) {
  return path.join(SESSIONS_DIR, `session-${dateStr}.log`);
}

// ---------- state handling ----------
const SESSIONS_DIR = resolveSessionsDir();
fs.mkdirSync(SESSIONS_DIR, { recursive: true });
const STATE_FILE = path.join(path.dirname(SESSIONS_DIR), "logify-state.json");

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}
function writeState(obj) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(obj, null, 2));
}
function clearState() {
  try {
    fs.unlinkSync(STATE_FILE);
  } catch {}
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

function redactSecrets(content) {
  if (!content) return "";
  return content
    .replace(/(api[_-]?key\s*[:=]\s*)\S+/gi, "$1[REDACTED]")
    .replace(/(token\s*[:=]\s*)\S+/gi, "$1[REDACTED]")
    .replace(/(password\s*[:=]\s*)\S+/gi, "$1[REDACTED]");
}

// ---------- session parsing ----------
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

// ---------- START ----------
program
  .command("start")
  .description("Start a tracked REPL; logs appended to daily session file")
  .action(() => {
    const st = readState();
    if (st.activeSession) {
      console.log(chalk.red("A session is already active:"), st.activeSession);
      process.exit(1);
    }

    const date = todayDate();
    const logFile = sessionFileForDate(date);
    fs.appendFileSync(logFile, `=== Logify session started at ${nowTime()} ===\n\n`);
    writeState({ activeSession: { pid: process.pid, logFile } });

    console.log(chalk.green(`Logify started — logging to ${logFile}`));

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: "lgy> ",
    });
    rl.prompt();

    rl.on("line", (line) => {
      const cmd = line.trim();
      if (!cmd) {
        rl.prompt();
        return;
      }

      if (cmd.toLowerCase() === "exit") {
        fs.appendFileSync(logFile, `=== Logify session ended at ${nowTime()} ===\n`);
        clearState();
        rl.close();
        return;
      }

      fs.appendFileSync(logFile, `=== [${nowTime()}] COMMAND: ${maskSensitive(cmd)}\n`);

      const child = spawn(cmd, { shell: true });

      child.stdout.on("data", (d) => {
        const s = d.toString();
        process.stdout.write(s);
        fs.appendFileSync(logFile, maskSensitive(s));
      });

      child.stderr.on("data", (d) => {
        const s = d.toString();
        process.stderr.write(s);
        fs.appendFileSync(logFile, maskSensitive(s));
      });

      child.on("close", () => {
        fs.appendFileSync(logFile, `=== END ===\n\n`);
        rl.prompt();
      });
    });

    function gracefulExit() {
      try {
        fs.appendFileSync(logFile, `=== Logify session ended at ${nowTime()} ===\n`);
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
      .forEach(l => {
        const time = l.match(/\[(.*?)\]/)?.[1] || "??:??:??";
        const cmd = l.split("COMMAND:")[1].trim();
        console.log(chalk.cyan(`[${time}]`), cmd);
      });
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

    let found = false;
    entries.forEach(entry => {
      const time = entry.match(/\[(.*?)\]/)?.[1] || "??:??:??";
      const cmdMatch = entry.match(/COMMAND:\s+([\s\S]*?)(?:OUTPUT:|$)/);
      const outputMatch = entry.match(/OUTPUT:\s+([\s\S]*)/);

      if (cmdMatch) {
        const cmd = cmdMatch[1].trim();
        if (cmd.toLowerCase().includes(pattern.toLowerCase())) {
          found = true;
          console.log(chalk.cyan(`\n[${time}]`));
          console.log(`> ${cmd}`);
          if (outputMatch) {
            console.log(chalk.gray(outputMatch[1].trim()));
          }
        }
      }
    });

    if (!found) {
      console.log(chalk.yellow(`No matching commands for "${pattern}" in ${opts.date}`));
    }
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
          if (cmd.toLowerCase().includes(pattern.toLowerCase())) {
            console.log(chalk.magenta(`[${file}]`), cmd);
          }
        }
      });
    });
  });

// ---------- EXPORT SINGLE SESSION ----------

program
  .command("export")
  .description("Export a single session log to Markdown format")
  .option("-d, --date <date>", "date yyyy-mm-dd", todayDate())
  .action((opts) => {
    const file = sessionFileForDate(opts.date);
    if (!fs.existsSync(file)) {
      console.log(chalk.yellow(`No log file found for ${opts.date}`));
      return;
    }

    const content = fs.readFileSync(file, "utf8");
    const entries = content.split("=== END ===");

    let md = `# Logify Session — ${opts.date}\n\n`;
    entries.forEach((entry) => {
      const time = entry.match(/\[(.*?)\]/)?.[1];
      const cmd = entry.match(/COMMAND:\s+(.+)/)?.[1];

      if (cmd) {
        md += `## [${time || "??:??:??"}]\n`;
        md += `**Command:** \`${cmd.trim()}\`\n\n`;

        const outputPart = entry
          .split("\n")
          .filter((line) => !line.includes("COMMAND:") && !line.includes("==="))
          .join("\n")
          .trim();

        if (outputPart) {
          md += `**Output:**\n\`\`\`\n${outputPart}\n\`\`\`\n\n`;
        }
      }
    });

    const exportDir = path.join(process.cwd(), "exports");
    if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });

    const exportPath = path.join(exportDir, `session-${opts.date}.md`);
    fs.writeFileSync(exportPath, md);
    console.log(chalk.green(`Exported session ${opts.date} to ${exportPath}`));
  });


// ---------- EXPORT ALL SESSIONS ----------
program
  .command("export-all")
  .description("Export all session logs to Markdown format")
  .action(() => {
    const sessionsDir = SESSIONS_DIR;
    if (!fs.existsSync(sessionsDir)) {
      console.log(chalk.yellow("No sessions found."));
      return;
    }

    const exportDir = path.join(process.cwd(), "exports");
    if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });

    const files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith(".log"));
    if (files.length === 0) {
      console.log(chalk.yellow("No session log files to export."));
      return;
    }

    files.forEach((file) => {
      const date = file.match(/session-(\d{4}-\d{2}-\d{2})/)?.[1];
      if (!date) return;

      const content = fs.readFileSync(path.join(sessionsDir, file), "utf8");
      const entries = content.split("=== END ===");

      let md = `# Logify Session — ${date}\n\n`;
      entries.forEach((entry) => {
        const time = entry.match(/\[(.*?)\]/)?.[1];
        const cmd = entry.match(/COMMAND:\s+(.+)/)?.[1];

        if (cmd) {
          md += `## [${time || "??:??:??"}]\n`;
          md += `**Command:** \`${cmd.trim()}\`\n\n`;

          const outputPart = entry
            .split("\n")
            .filter((line) => !line.includes("COMMAND:") && !line.includes("==="))
            .join("\n")
            .trim();

          if (outputPart) {
            md += `**Output:**\n\`\`\`\n${outputPart}\n\`\`\`\n\n`;
          }
        }
      });

      const exportPath = path.join(exportDir, `session-${date}.md`);
      fs.writeFileSync(exportPath, md);
      console.log(chalk.green(`Exported ${file} → ${exportPath}`));
    });

    console.log(chalk.cyan("\n All sessions exported successfully to ./exports/"));
  });

// ---------- REPLAY SESSION ----------

program
  .command("replay <file>")
  .description("Replay a past session log command-by-command (optionally fast)")
  .option("--fast", "Replay instantly without delays", false)
  .action(async (file, opts) => {
    const sessionPath = path.isAbsolute(file)
      ? file
      : path.join(SESSIONS_DIR, file);

    if (!fs.existsSync(sessionPath)) {
      console.log(chalk.red(`❌ Session file not found: ${sessionPath}`));
      return;
    }

    const content = fs.readFileSync(sessionPath, "utf8");
    const entries = content.split("=== END ===");

    console.log(chalk.cyan(`\n🎬 Replaying session: ${path.basename(sessionPath)}`));
    console.log(chalk.gray(`Mode: ${opts.fast ? "Fast ⚡" : "Normal ⏳"}`));
    console.log(chalk.gray("-------------------------------------------\n"));

    for (const entry of entries) {
      const cmdMatch = entry.match(/COMMAND:\s+(.+)/);
      if (!cmdMatch) continue;

      const cmd = cmdMatch[1].trim();
      const time = entry.match(/\[(.*?)\]/)?.[1] || "??:??:??";

      // Extract output between command and next END
      const output = entry
        .split("\n")
        .filter(
          (line) =>
            !line.includes("COMMAND:") &&
            !line.includes("===") &&
            line.trim() !== ""
        )
        .join("\n")
        .trim();

      console.log(chalk.yellow(`[${time}] $ ${cmd}`));

      if (output) {
        // Highlight errors or failures in red automatically
        const highlighted = output
          .split("\n")
          .map((line) =>
            /error|failed/i.test(line)
              ? chalk.red(line)
              : chalk.gray(line)
          )
          .join("\n");
        console.log(highlighted);
      }

      console.log(chalk.gray("-------------------------------------------\n"));

      if (!opts.fast) {
        await new Promise((r) => setTimeout(r, 1000 + Math.random() * 1000));
      }
    }

    console.log(chalk.green("✅ Replay completed!\n"));
  });





// ---------- SUMMARIZE (AI) ----------
program
  .command("summarize")
  .description("Generate AI summary for a session log")
  .option("-d, --date <date>", "Date in YYYY-MM-DD")
  .action(async (opts) => {
    const date = opts.date || todayDate();
    const sessionFile = sessionFileForDate(date);

    if (!fs.existsSync(sessionFile)) {
      console.log(chalk.yellow(`No log file for ${date}`));
      return;
    }

    const content = fs.readFileSync(sessionFile, "utf8");
    console.log(chalk.blue("Generating AI summary... (this may take a few seconds)"));

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

      const summaryFile = path.join(SESSIONS_DIR, `summary-${date}.txt`);
      fs.writeFileSync(summaryFile, summary, "utf8");
      console.log(`\nSaved summary to ${summaryFile}`);
    } catch (err) {
      console.error(chalk.red("Error generating summary:"), err.message);
    }
  });

program.parse(process.argv);

