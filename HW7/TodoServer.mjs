import { serve } from "@hono/node-server";
import { Hono } from "hono";
import fs from "fs";
import { WebSocketServer } from "ws";

const defaultTodosFile = new URL("./todos.json", import.meta.url);
const priorities = ["normal", "low", "high"];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function loadTodos(todosFile) {
  const data = fs.readFileSync(todosFile, "utf-8");
  return JSON.parse(data);
}

function saveTodos(todosFile, todos) {
  fs.writeFileSync(todosFile, JSON.stringify(todos, null, 2));
}

function priorityOptions(selectedPriority) {
  let html = "";

  for (const priority of priorities) {
    const selected = priority === selectedPriority ? "selected" : "";
    html += `<option value="${priority}" ${selected}>${priority}</option>`;
  }

  return html;
}

function renderTodoItems(todos) {
  let html = "";

  for (const todo of todos) {
    html += `
      <li>
        <a href="/todo/${todo.id}">${escapeHtml(todo.title)}</a>
        - ${todo.done ? "done" : "not done"}
        - priority: ${escapeHtml(todo.priority)}
        <a href="/todo/${todo.id}/toggle">Change status</a>
        <a href="/todo/${todo.id}/delete">Delete</a>
      </li>
    `;
  }

  return html;
}

function renderTodoDetail(todo) {
  return `
    <h1>${escapeHtml(todo.title)}</h1>
    <p>Status: ${todo.done ? "done" : "not done"}</p>
    <p>Priority: ${escapeHtml(todo.priority)}</p>

    <a href="/todo/${todo.id}/toggle">Change status</a>
    <a href="/todo/${todo.id}/delete">Delete</a>
    <a href="/">Back</a>

    <form method="POST" action="/todo/${todo.id}/edit">
      <input name="title" value="${escapeHtml(todo.title)}">
      <select name="priority">
        ${priorityOptions(todo.priority)}
      </select>
      <button>Save</button>
    </form>
  `;
}

function websocketScript() {
  return `
    <script>
      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(protocol + "//" + location.host);

      socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        const todoList = document.querySelector("#todo-list");
        const todoDetail = document.querySelector("#todo-detail");

        if (message.type === "todos" && todoList) {
          todoList.innerHTML = message.html;
        }

        if (message.type === "todo-detail" && todoDetail && todoDetail.dataset.todoId === String(message.id)) {
          todoDetail.innerHTML = message.html;
        }

        if (message.type === "todo-deleted" && todoDetail && todoDetail.dataset.todoId === String(message.id)) {
          todoDetail.innerHTML = "<h1>Todo was deleted</h1><p>This todo no longer exists.</p><a href='/'>Back</a>";
        }
      });
    </script>
  `;
}

function publishTodos(todosFile, broadcast) {
  const todos = loadTodos(todosFile);
  broadcast({
    type: "todos",
    html: renderTodoItems(todos),
  });
}

function publishTodoDetail(todo, broadcast) {
  broadcast({
    type: "todo-detail",
    id: todo.id,
    html: renderTodoDetail(todo),
  });
}

function publishTodoDeleted(id, broadcast) {
  broadcast({
    type: "todo-deleted",
    id: id,
  });
}

export function createApp(options = {}) {
  const todosFile = options.todosFile ?? defaultTodosFile;
  const broadcast = options.broadcast ?? (() => {});
  const app = new Hono();

  app.get("/", (c) => {
    const todos = loadTodos(todosFile);
    const html = `
      <h1>Todo App</h1>

      <form method="POST" action="/add">
        <input name="title" placeholder="New todo">
        <select name="priority">
          <option value="normal">normal</option>
          <option value="low">low</option>
          <option value="high">high</option>
        </select>
        <button>Add</button>
      </form>

      <ul id="todo-list">${renderTodoItems(todos)}</ul>
      ${websocketScript()}
    `;

    return c.html(html);
  });

  app.post("/add", async (c) => {
    const form = await c.req.formData();
    const todos = loadTodos(todosFile);
    const title = form.get("title");
    const priority = priorities.includes(form.get("priority")) ? form.get("priority") : "normal";

    todos.push({
      id: Date.now(),
      title: title,
      done: false,
      priority: priority,
    });

    saveTodos(todosFile, todos);
    publishTodos(todosFile, broadcast);

    return c.redirect("/");
  });

  app.get("/todo/:id", (c) => {
    const id = Number(c.req.param("id"));
    const todos = loadTodos(todosFile);
    const todo = todos.find((item) => item.id === id);

    if (!todo) {
      return c.html("<h1>Todo does not exist</h1><a href='/'>Back</a>", 404);
    }

    const html = `
      <div id="todo-detail" data-todo-id="${todo.id}">
        ${renderTodoDetail(todo)}
      </div>
      ${websocketScript()}
    `;

    return c.html(html);
  });

  app.get("/todo/:id/toggle", (c) => {
    const id = Number(c.req.param("id"));
    const todos = loadTodos(todosFile);
    const todo = todos.find((item) => item.id === id);

    if (!todo) {
      return c.html("<h1>Todo does not exist</h1><a href='/'>Back</a>", 404);
    }

    todo.done = !todo.done;
    saveTodos(todosFile, todos);
    publishTodoDetail(todo, broadcast);
    publishTodos(todosFile, broadcast);

    return c.redirect(`/todo/${id}`);
  });

  app.get("/todo/:id/delete", (c) => {
    const id = Number(c.req.param("id"));
    const todos = loadTodos(todosFile);
    const todoExists = todos.some((item) => item.id === id);

    if (!todoExists) {
      return c.html("<h1>Todo does not exist</h1><a href='/'>Back</a>", 404);
    }

    const newTodos = todos.filter((item) => item.id !== id);
    saveTodos(todosFile, newTodos);
    publishTodos(todosFile, broadcast);
    publishTodoDeleted(id, broadcast);

    return c.redirect("/");
  });

  app.post("/todo/:id/edit", async (c) => {
    const id = Number(c.req.param("id"));
    const form = await c.req.formData();
    const todos = loadTodos(todosFile);
    const todo = todos.find((item) => item.id === id);

    if (!todo) {
      return c.html("<h1>Todo does not exist</h1><a href='/'>Back</a>", 404);
    }

    todo.title = form.get("title");
    todo.priority = priorities.includes(form.get("priority")) ? form.get("priority") : "normal";
    saveTodos(todosFile, todos);
    publishTodoDetail(todo, broadcast);
    publishTodos(todosFile, broadcast);

    return c.redirect(`/todo/${id}`);
  });

  app.notFound((c) => {
    return c.html("<h1>404</h1>", 404);
  });

  return app;
}

export const app = createApp();

if (import.meta.url === `file://${process.argv[1]}`) {
  const clients = new Set();
  const server = serve({
    fetch: createApp({
      broadcast(message) {
        const data = JSON.stringify(message);

        for (const client of clients) {
          if (client.readyState === client.OPEN) {
            client.send(data);
          }
        }
      },
    }).fetch,
    port: 3000,
  });

  const wss = new WebSocketServer({ server });

  wss.on("connection", (socket) => {
    clients.add(socket);
    socket.on("close", () => {
      clients.delete(socket);
    });
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error("Port 3000 is already in use. Stop the other server or use a different port.");
    } else {
      console.error("Server error:", err.message);
    }
  });

  console.log("Server is running on http://localhost:3000");
}
