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

function readCookies(cookieHeader = "") {
  const cookies = {};

  for (const part of cookieHeader.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");

    if (name) {
      cookies[name] = decodeURIComponent(valueParts.join("="));
    }
  }

  return cookies;
}

function currentUser(c) {
  return readCookies(c.req.header("cookie")).user || null;
}

function currentUserFromRequest(request) {
  return readCookies(request.headers.cookie).user || null;
}

function canSeeTodo(todo, user) {
  return !todo.user || todo.user === user;
}

function visibleTodos(todos, user) {
  return todos.filter((todo) => canSeeTodo(todo, user));
}

function findVisibleTodo(todos, id, user) {
  return todos.find((todo) => todo.id === id && canSeeTodo(todo, user));
}

function priorityOptions(selectedPriority) {
  let html = "";

  for (const priority of priorities) {
    const selected = priority === selectedPriority ? "selected" : "";
    html += `<option value="${priority}" ${selected}>${priority}</option>`;
  }

  return html;
}

function renderLogin(user) {
  if (user) {
    return `
      <p>Logged in as ${escapeHtml(user)}</p>
      <form method="POST" action="/logout">
        <button>Logout</button>
      </form>
    `;
  }

  return `
    <form method="POST" action="/login">
      <input name="user" placeholder="Username">
      <button>Login</button>
    </form>
  `;
}

function renderTodoItems(todos) {
  let html = "";

  for (const todo of todos) {
    const owner = todo.user ? ` - owner: ${escapeHtml(todo.user)}` : " - public";

    html += `
      <li>
        <a href="/todo/${todo.id}">${escapeHtml(todo.title)}</a>
        - ${todo.done ? "done" : "not done"}
        - priority: ${escapeHtml(todo.priority)}
        ${owner}
        <a href="/todo/${todo.id}/toggle">Change status</a>
        <a href="/todo/${todo.id}/delete">Delete</a>
      </li>
    `;
  }

  return html;
}

function renderTodoDetail(todo) {
  const owner = todo.user ? escapeHtml(todo.user) : "public";

  return `
    <h1>${escapeHtml(todo.title)}</h1>
    <p>Status: ${todo.done ? "done" : "not done"}</p>
    <p>Priority: ${escapeHtml(todo.priority)}</p>
    <p>Owner: ${owner}</p>

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

        if (message.type === "todo-hidden" && todoDetail && todoDetail.dataset.todoId === String(message.id)) {
          todoDetail.innerHTML = "<h1>Todo is not available</h1><p>This todo is deleted or belongs to another user.</p><a href='/'>Back</a>";
        }
      });
    </script>
  `;
}

function publishTodoHidden(id, broadcast) {
  broadcast({
    type: "todo-hidden",
    id: id,
  });
}

export function createApp(options = {}) {
  const todosFile = options.todosFile ?? defaultTodosFile;
  const broadcastTodos = options.broadcastTodos ?? (() => {});
  const broadcastTodoChanged = options.broadcastTodoChanged ?? (() => {});
  const broadcastTodoHidden = options.broadcastTodoHidden ?? (() => {});
  const app = new Hono();

  app.get("/", (c) => {
    const user = currentUser(c);
    const todos = visibleTodos(loadTodos(todosFile), user);
    const html = `
      <h1>Todo App</h1>
      ${renderLogin(user)}

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

  app.post("/login", async (c) => {
    const form = await c.req.formData();
    const user = String(form.get("user") || "").trim();

    if (!user) {
      return c.redirect("/");
    }

    c.header("Set-Cookie", `user=${encodeURIComponent(user)}; Path=/; HttpOnly; SameSite=Lax`);
    return c.redirect("/");
  });

  app.post("/logout", (c) => {
    c.header("Set-Cookie", "user=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax");
    return c.redirect("/");
  });

  app.post("/add", async (c) => {
    const user = currentUser(c);
    const form = await c.req.formData();
    const todos = loadTodos(todosFile);
    const title = form.get("title");
    const priority = priorities.includes(form.get("priority")) ? form.get("priority") : "normal";
    const newTodo = {
      id: Date.now(),
      title: title,
      done: false,
      priority: priority,
    };

    if (user) {
      newTodo.user = user;
    }

    todos.push(newTodo);
    saveTodos(todosFile, todos);
    broadcastTodos();

    return c.redirect("/");
  });

  app.get("/todo/:id", (c) => {
    const user = currentUser(c);
    const id = Number(c.req.param("id"));
    const todos = loadTodos(todosFile);
    const todo = findVisibleTodo(todos, id, user);

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
    const user = currentUser(c);
    const id = Number(c.req.param("id"));
    const todos = loadTodos(todosFile);
    const todo = findVisibleTodo(todos, id, user);

    if (!todo) {
      return c.html("<h1>Todo does not exist</h1><a href='/'>Back</a>", 404);
    }

    todo.done = !todo.done;
    saveTodos(todosFile, todos);
    broadcastTodoChanged(todo);
    broadcastTodos();

    return c.redirect(`/todo/${id}`);
  });

  app.get("/todo/:id/delete", (c) => {
    const user = currentUser(c);
    const id = Number(c.req.param("id"));
    const todos = loadTodos(todosFile);
    const todo = findVisibleTodo(todos, id, user);

    if (!todo) {
      return c.html("<h1>Todo does not exist</h1><a href='/'>Back</a>", 404);
    }

    const newTodos = todos.filter((item) => item.id !== id);
    saveTodos(todosFile, newTodos);
    broadcastTodos();
    broadcastTodoHidden(id);

    return c.redirect("/");
  });

  app.post("/todo/:id/edit", async (c) => {
    const user = currentUser(c);
    const id = Number(c.req.param("id"));
    const form = await c.req.formData();
    const todos = loadTodos(todosFile);
    const todo = findVisibleTodo(todos, id, user);

    if (!todo) {
      return c.html("<h1>Todo does not exist</h1><a href='/'>Back</a>", 404);
    }

    todo.title = form.get("title");
    todo.priority = priorities.includes(form.get("priority")) ? form.get("priority") : "normal";
    saveTodos(todosFile, todos);
    broadcastTodoChanged(todo);
    broadcastTodos();

    return c.redirect(`/todo/${id}`);
  });

  app.notFound((c) => {
    return c.html("<h1>404</h1>", 404);
  });

  return app;
}

export const app = createApp();

if (import.meta.url === `file://${process.argv[1]}`) {
  const clients = new Map();

  function send(socket, message) {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  const server = serve({
    fetch: createApp({
      broadcastTodos() {
        const todos = loadTodos(defaultTodosFile);

        for (const [client, user] of clients) {
          send(client, {
            type: "todos",
            html: renderTodoItems(visibleTodos(todos, user)),
          });
        }
      },
      broadcastTodoChanged(todo) {
        for (const [client, user] of clients) {
          if (canSeeTodo(todo, user)) {
            send(client, {
              type: "todo-detail",
              id: todo.id,
              html: renderTodoDetail(todo),
            });
          } else {
            publishTodoHidden(todo.id, (message) => send(client, message));
          }
        }
      },
      broadcastTodoHidden(id) {
        for (const client of clients.keys()) {
          publishTodoHidden(id, (message) => send(client, message));
        }
      },
    }).fetch,
    port: 3000,
  });

  const wss = new WebSocketServer({ server });

  wss.on("connection", (socket, request) => {
    clients.set(socket, currentUserFromRequest(request));
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
