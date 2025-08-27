import fs from "fs";
import readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const logAction = (action) => {
  const timestamp = new Date().toLocaleString();
  fs.appendFileSync("log.txt", `[${timestamp}] ${action}\n`);
};

const menu = () => {
  console.log("\n--- Task Tracker ---");
  console.log("1. Add Task");
  console.log("2. View Tasks");
  console.log("3. Exit");

  rl.question("Choose an option: ", (answer) => {
    if (answer === "1") {
      rl.question("Enter task: ", (task) => {
        fs.appendFileSync("tasks.txt", task + "\n");
        console.log("Task added!");
        logAction(`Task added: ${task}`);
        menu();
      });
    } else if (answer === "2") {
      const tasks = fs.readFileSync("tasks.txt", "utf-8");
      console.log("\nYour Tasks:");
      console.log(tasks || "No tasks yet.");
      logAction("Viewed tasks");
      menu();
    } else {
      console.log("Goodbye!");
      logAction("Exited app");
      rl.close();
    }
  });
};

menu();
