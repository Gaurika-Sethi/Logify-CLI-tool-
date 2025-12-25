# Logify (CLI tool)

![npm downloads](https://img.shields.io/npm/dt/logify-cli-tool)

![License: MIT](https://img.shields.io/badge/License-MIT-green.svg) 

![Built with OpenAI](https://img.shields.io/badge/AI-OpenAI-darkviolet) 

![Status](https://img.shields.io/badge/Status-Fully%20Developed-brightgreen) 



Logify is a minimal yet smart CLI tool that tracks your terminal sessions — recording every command you run, its output, and the timestamp.  
It’s your personal *developer diary*, built right inside the terminal.  
Perfect for journaling your coding days, debugging your workflow, or showing your progress to mentors and teammates.

## Features

- **Session Logging:** Automatically records all commands & outputs during your terminal session.
- **Session Replay:** Replays past sessions with delays to visualize command history.
- **Search & Filter:** Find specific commands or patterns across all sessions.
- **Export to Markdown:** Convert your logs into clean `.md` files for sharing or documentation.
- **AI Summary:** Generate concise summaries of what happened in each session using OpenAI’s API.
- **Cross-platform Ready:** Works on Windows, macOS, and Linux terminals.

## Built With

- [![Visual Studio Code](https://img.shields.io/badge/VS%20Code-007ACC?style=for-the-badge&logo=visualstudiocode&logoColor=white)](https://code.visualstudio.com/)  
- [![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)  
- [![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)  
- [![OpenAI](https://img.shields.io/badge/OpenAI-412991?style=for-the-badge&logo=openai&logoColor=white)](https://openai.com/)  
- [![CLI](https://img.shields.io/badge/Command%20Line%20Interface-Terminal-black?style=for-the-badge&logo=gnu-bash&logoColor=white)](https://en.wikipedia.org/wiki/Command-line_interface) 

---

## Installation

Follow these steps to set up the extension locally:

1. **Clone the repository**
   ```bash
   git clone https://github.com/Gaurika-Sethi/Logify-CLI-tool-.git
   cd Code-Reviewer-Bot-VS-Code-Extension-
   ```

2. **Install dependencies**
   ```bash 
   npm install commander chalk dotenv openai
   ```

   ```bash 
   npm install -g logify-cli-tool
   ```

3. **Add your OpenAI API key to a .env file in the root**
   ```bash
   OPENAI_API_KEY=your_api_key_here
   ```

4. **Link the CLI globally**
   ```bash
   npm link
   ```

## Usage 
1. **Start a new session**
   ```bash
   lgy start
   ```
Tracks all commands you run in real-time and saves them to a daily log file.

2. **Stop the session**
   ```bash
   lgy stop
   ```
Ends the session and closes logging.

3. **View history**
   ```bash
   lgy history
   ``` 
Lists all stored session log files and shows file    modification dates

4. **View specific date file**
   ```bash
   lgy show -d 2025-10-06
   ```

5. **View inputs of specific date file**
   ```bash
   lgy inputs -d 2025-10-06
   ```
Shows only the commands (inputs) from a session log

6. **View a particular cmd**

   ```bash
   lgy search "git" -d 2025-10-06
   ```
Searches a session log for commands matching a pattern

Date option available. (default:today)

7. **View a particular cmd from all files**

   ```bash
   lgy search-all "npm install"
   ```
Searches all session logs for commands matching a pattern

8. **Exports session log in .md format**

   ```bash
   lgy export -d 2025-10-06
   ```
Exports a single session log to Markdown format

9. **Exports session logs in .md format**

   ```bash
   lgy export-all
   ```
Exports all session logs to Markdown format

9. **Replay session logs**

   ```bash
   lgy replay session-2025-10-06.log
   lgy replay session-2025-10-06.log --fast
   ```
Replays a past session log command-by-command 
Optionally with --fast (no delays)


10. **Summarize session**

   ```bash
   lgy summarize -d 2025-10-06
   ```
Uses OpenAI (gpt-4o-mini) to generate a concise summary of a session
Saves the summary to summary-YYYY-MM-DD.txt

## Requirements

- Visual Studio Code  
- Node.js (v18+)  
- OpenAI API Key (stored securely in `.env`)  
- Internet connection for AI summaries  

---

## Tech Stack & Learnings

- Node.js & JavaScript (CLI-based development)  
- OpenAI API integration for intelligent summaries  
- File system handling (reading/writing logs, exports)  
- Prompt design for clear and structured AI responses  

---

## Future Ideas
 
- Integration with Notion, Slack, or GitHub for daily summaries    
- Local summary generation using open models (offline mode)  

---

## Known Issues

- Occasional lag during summary generation (network-dependent)  
- Summaries may vary in tone depending on command density  
- No built-in auto-sync yet for cloud storage  

---

## 💬 FAQ

**Q: Do I need internet for summaries?**  
A: Yes. The summaries use OpenAI’s API, so an internet connection is required.  

**Q: Can I use another AI model provider?**  
A: Absolutely! The architecture allows swapping in HuggingFace or local models with minimal changes.  

**Q: Does it support exporting sessions in multiple formats?**  
A: Yes — Markdown export is supported, and HTML export is planned for future versions.  


## Contact

- LinkedIn: [Gaurika Sethi](https://www.linkedin.com/in/gaurika-sethi-53043b321)  
- Medium: [@pixelsnsyntax](https://medium.com/@pixelsnsyntax)  
- Twitter: [@pixelsnsyntax](https://twitter.com/pixelsnsyntax)  

Project Link: [Logify CLI tool](https://github.com/Gaurika-Sethi/Logify-CLI-tool-)

## License

This project is licensed under the **MIT License**  see the [LICENSE](LICENSE) file for full details.  
You can also view the [CHANGELOG.md](CHANGELOG.md) for version updates and release notes.
