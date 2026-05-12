import test from "ava";
import fs from "fs";
import os from "os";
import path from "path";
import { createApp } from "./TodoServer.mjs";

function createTestApp() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hw8-todos-"));
  const todosFile = path.join(directory, "todos.json");
  const messages = [];

  fs.writeFileSync(
    todosFile,
    JSON.stringify(
      [
        { id: 1, title: "First todo", done: false, priority: "normal" },
        { id: 2, title: "Second todo", done: true, priority: "high" },
      ],
      null,
      2,
    ),
  );

  const app = createApp({
    todosFile: todosFile,
    broadcast(message) {
      messages.push(message);
    },
  });

  return { app, todosFile, messages };
}

test("homepage shows todo list with priorities", async (t) => {
  const { app } = createTestApp();

  const response = await app.request("/");
  const html = await response.text();

  t.is(response.status, 200);
  t.true(html.includes("First todo"));
  t.true(html.includes("priority: normal"));
  t.true(html.includes("Second todo"));
  t.true(html.includes("priority: high"));
});

test("todo detail shows one todo and websocket script", async (t) => {
  const { app } = createTestApp();

  const response = await app.request("/todo/1");
  const html = await response.text();

  t.is(response.status, 200);
  t.true(html.includes("First todo"));
  t.true(html.includes("Status: not done"));
  t.true(html.includes('id="todo-detail"'));
  t.true(html.includes("new WebSocket"));
});

test("editing todo saves data and broadcasts detail plus list", async (t) => {
  const { app, todosFile, messages } = createTestApp();
  const form = new URLSearchParams();
  form.set("title", "Renamed todo");
  form.set("priority", "low");

  const response = await app.request("/todo/1/edit", {
    method: "POST",
    body: form,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  const todos = JSON.parse(fs.readFileSync(todosFile, "utf-8"));

  t.is(response.status, 302);
  t.is(response.headers.get("location"), "/todo/1");
  t.is(todos[0].title, "Renamed todo");
  t.is(todos[0].priority, "low");
  t.deepEqual(
    messages.map((message) => message.type),
    ["todo-detail", "todos"],
  );
  t.is(messages[0].id, 1);
  t.true(messages[0].html.includes("Renamed todo"));
});

test("toggling todo broadcasts detail plus list", async (t) => {
  const { app, todosFile, messages } = createTestApp();

  const response = await app.request("/todo/1/toggle");
  const todos = JSON.parse(fs.readFileSync(todosFile, "utf-8"));

  t.is(response.status, 302);
  t.true(todos[0].done);
  t.deepEqual(
    messages.map((message) => message.type),
    ["todo-detail", "todos"],
  );
});

test("deleting todo broadcasts list and deletion message", async (t) => {
  const { app, todosFile, messages } = createTestApp();

  const response = await app.request("/todo/1/delete");
  const todos = JSON.parse(fs.readFileSync(todosFile, "utf-8"));

  t.is(response.status, 302);
  t.false(todos.some((todo) => todo.id === 1));
  t.deepEqual(
    messages.map((message) => message.type),
    ["todos", "todo-deleted"],
  );
  t.is(messages[1].id, 1);
});

test("missing todo returns 404", async (t) => {
  const { app } = createTestApp();

  const response = await app.request("/todo/999");
  const html = await response.text();

  t.is(response.status, 404);
  t.true(html.includes("Todo does not exist"));
});
