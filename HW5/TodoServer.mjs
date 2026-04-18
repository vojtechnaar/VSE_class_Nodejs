import http from "http";
import fs from "fs";

function loadTodos() {
  const data = fs.readFileSync("todos.json", "utf-8");
  return JSON.parse(data);
}

function saveTodos(todos) {
  fs.writeFileSync("todos.json", JSON.stringify(todos, null, 2));
}

function sendPage(res, html) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

function redirect(res, url) {
  res.writeHead(302, { Location: url });
  res.end();
}

function readForm(req, callback) {
  let body = "";

  req.on("data", (chunk) => {
    body += chunk;
  });

  req.on("end", () => {
    callback(new URLSearchParams(body));
  });
}

function showHomepage(res) {
  const todos = loadTodos();
  let html = "<h1>Todo App</h1>";

  html += `
    <form method="POST" action="/add">
      <input name="title" placeholder="New todo">
      <button>Add</button>
    </form>
  `;

  html += "<ul>";
  for (const todo of todos) {
    html += `<li><a href="/todo/${todo.id}">${todo.title}</a> - ${todo.done ? "done" : "not done"}</li>`;
  }
  html += "</ul>";

  sendPage(res, html);
}

function showTodoDetail(res, id) {
  const todos = loadTodos();
  const todo = todos.find((todo) => todo.id === id);

  if (!todo) {
    sendPage(res, "<h1>Todo does not exist</h1><a href='/'>Back</a>");
    return;
  }

  const html = `
    <h1>${todo.title}</h1>
    <p>Status: ${todo.done ? "done" : "not done"}</p>

    <a href="/todo/${todo.id}/toggle">Change status</a>
    <a href="/todo/${todo.id}/delete">Delete</a>
    <a href="/">Back</a>

    <form method="POST" action="/todo/${todo.id}/edit">
      <input name="title" value="${todo.title}">
      <button>Save</button>
    </form>
  `;

  sendPage(res, html);
}

const server = http.createServer((req, res) => {
  const parts = req.url.split("/");
  const id = Number(parts[2]);

  if (req.method === "GET" && req.url === "/") {
    showHomepage(res);
  } else if (req.method === "POST" && req.url === "/add") {
    readForm(req, (form) => {
      const todos = loadTodos();
      const title = form.get("title");
      todos.push({ id: Date.now(), title: title, done: false });
      saveTodos(todos);
      redirect(res, "/");
    });
  } else if (req.method === "GET" && parts[1] === "todo" && parts.length === 3) {
    showTodoDetail(res, id);
  } else if (req.method === "GET" && parts[1] === "todo" && parts[3] === "toggle") {
    const todos = loadTodos();
    const todo = todos.find((todo) => todo.id === id);
    todo.done = !todo.done;
    saveTodos(todos);
    redirect(res, `/todo/${id}`);
  } else if (req.method === "GET" && parts[1] === "todo" && parts[3] === "delete") {
    const todos = loadTodos();
    const newTodos = todos.filter((todo) => todo.id !== id);
    saveTodos(newTodos);
    redirect(res, "/");
  } else if (req.method === "POST" && parts[1] === "todo" && parts[3] === "edit") {
    readForm(req, (form) => {
      const todos = loadTodos();
      const todo = todos.find((todo) => todo.id === id);
      todo.title = form.get("title");
      saveTodos(todos);
      redirect(res, `/todo/${id}`);
    });
  } else {
    sendPage(res, "<h1>404</h1>");
  }
});

server.listen(3000, () => {
  console.log("Server is running on http://localhost:3000");
});
