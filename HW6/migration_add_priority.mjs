import fs from "fs";

const data = fs.readFileSync("todos.json", "utf-8");
const todos = JSON.parse(data);

for (const todo of todos) {
  if (!todo.priority) {
    todo.priority = "normal";
  }
}

fs.writeFileSync("todos.json", JSON.stringify(todos, null, 2));
