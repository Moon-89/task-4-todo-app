import React, { useEffect, useRef, useState } from "react";

const API_URL = (import.meta.env.VITE_MOCKAPI_URL || "").replace(/\/+$/, "");
const filters = ["all", "active", "completed"];

async function request(path = "", options = {}) {
  if (!API_URL) {
    throw new Error("Set VITE_MOCKAPI_URL in your .env file.");
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`MockAPI error: ${response.status}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

function formatTask(task) {
  if (!task || task.id === undefined || typeof task.title !== "string") {
    throw new Error("Each task needs an id and a title.");
  }

  return {
    ...task,
    id: String(task.id),
    completed: task.completed === true || task.completed === "true",
  };
}

function App() {
  const [tasks, setTasks] = useState([]);
  const [filter, setFilter] = useState("all");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingTask, setEditingTask] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const dialog = useRef(null);

  const activeCount = tasks.filter((task) => !task.completed).length;
  const doneCount = tasks.length - activeCount;
  const progress = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;
  const counts = { all: tasks.length, active: activeCount, completed: doneCount };

  const visibleTasks = tasks
    .filter((task) => {
      if (filter === "active") return !task.completed;
      if (filter === "completed") return task.completed;
      return true;
    })
    .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));

  useEffect(() => {
    loadTasks();
  }, []);

  useEffect(() => {
    if (editingTask) dialog.current?.showModal();
  }, [editingTask]);

  async function loadTasks() {
    setLoading(true);
    setError("");

    try {
      const result = await request();
      if (!Array.isArray(result)) throw new Error("MockAPI should return a task list.");
      setTasks(result.map(formatTask));
    } catch (err) {
      setError(err.message || "Couldn't load your tasks.");
    } finally {
      setLoading(false);
    }
  }

  async function addTask(event) {
    event.preventDefault();
    const newTitle = title.trim();
    if (!newTitle) return;

    setSaving(true);
    setError("");
    try {
      const task = formatTask(await request("", {
        method: "POST",
        body: JSON.stringify({ title: newTitle, completed: false }),
      }));
      setTasks((current) => [task, ...current]);
      setTitle("");
      setFilter("all");
    } catch (err) {
      setError(err.message || "Couldn't add that task.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleTask(task) {
    const updatedTask = { ...task, completed: !task.completed };
    setSaving(true);
    setError("");

    try {
      await request(`/${encodeURIComponent(task.id)}`, {
        method: "PUT",
        body: JSON.stringify(updatedTask),
      });
      setTasks((current) =>
        current.map((item) => item.id === task.id ? updatedTask : item)
      );
    } catch (err) {
      setError(err.message || "Couldn't update that task.");
    } finally {
      setSaving(false);
    }
  }

  function editTask(task) {
    setEditingTask(task);
    setEditTitle(task.title);
    setError("");
  }

  async function saveTask(event) {
    event.preventDefault();
    if (!editingTask || !editTitle.trim()) return;

    const updatedTask = { ...editingTask, title: editTitle.trim() };
    setSaving(true);
    setError("");

    try {
      await request(`/${encodeURIComponent(editingTask.id)}`, {
        method: "PUT",
        body: JSON.stringify(updatedTask),
      });
      setTasks((current) =>
        current.map((task) => task.id === updatedTask.id ? updatedTask : task)
      );
      setEditingTask(null);
      dialog.current?.close();
    } catch (err) {
      setError(err.message || "Couldn't save that task.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTask(task) {
    if (!window.confirm(`Delete "${task.title}"?`)) return;

    setSaving(true);
    setError("");
    try {
      await request(`/${encodeURIComponent(task.id)}`, { method: "DELETE" });
      setTasks((current) => current.filter((item) => item.id !== task.id));
    } catch (err) {
      setError(err.message || "Couldn't delete that task.");
    } finally {
      setSaving(false);
    }
  }

  const today = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());

  return (
    <div className="app-shell">
      <div className="workspace">
        <header className="topbar">
          <div>
            <h1>My Tasks</h1>
          </div>
          <div className="topbar-right">
            <span className="today-date">{today}</span>
            <button className="icon-button" onClick={loadTasks} disabled={loading} type="button" aria-label="Refresh tasks">
              ↻
            </button>
          </div>
        </header>

        <main className="main-content">
          <section className="summary-row">
            <div className="progress-card">
              <div className="progress-heading">
                <span>Progress</span>
                <strong>{progress}%</strong>
              </div>
              <div className="progress-track" role="progressbar" aria-valuenow={progress} aria-valuemin="0" aria-valuemax="100">
                <span style={{ width: `${progress}%` }} />
              </div>
              <p>{doneCount} of {tasks.length} {tasks.length === 1 ? "task" : "tasks"} done</p>
            </div>
          </section>

          <section className="task-panel" aria-label="Task list">
            <form className="add-task-form" onSubmit={addTask}>
              <span className="add-symbol">+</span>
              <label className="sr-only" htmlFor="new-task">Add a task</label>
              <input
                id="new-task"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="What would you like to get done?"
                maxLength={160}
                disabled={!API_URL || loading}
                required
              />
              <button className="primary-button" type="submit" disabled={!API_URL || loading || saving}>
                {saving ? "Saving..." : "Add task"} →
              </button>
            </form>

            {error && !editingTask && <p className="form-error" role="alert">{error}</p>}

            <div className="list-toolbar">
              <div className="filter-tabs">
                {filters.map((name) => (
                  <button
                    key={name}
                    className={`filter-tab${filter === name ? " is-selected" : ""}`}
                    onClick={() => setFilter(name)}
                    type="button"
                  >
                    {name === "active" ? "To do" : name[0].toUpperCase() + name.slice(1)}
                    <span>{counts[name]}</span>
                  </button>
                ))}
              </div>
              <span className="list-date">{new Date().toLocaleDateString()}</span>
            </div>

            {loading ? (
              <div className="message-state"><span className="spinner" /><p>Getting your tasks...</p></div>
            ) : visibleTasks.length ? (
              <div className="task-list">
                {visibleTasks.map((task) => (
                  <article className={`task-item${task.completed ? " is-complete" : ""}`} key={task.id}>
                    <button
                      className={`task-check${task.completed ? " is-complete" : ""}`}
                      onClick={() => toggleTask(task)}
                      type="button"
                      disabled={saving}
                      aria-label={task.completed ? "Mark as not completed" : "Mark as completed"}
                      aria-pressed={task.completed}
                    >
                      {task.completed ? "✓" : ""}
                    </button>
                    <span className="task-title">{task.title}</span>
                    <div className="task-actions">
                      <button className="task-action" onClick={() => editTask(task)} type="button" disabled={saving} aria-label={`Edit ${task.title}`}>
                        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                          <path d="m12.2 4.1 3.7 3.7M4.3 15.7l3.1-.6 8.8-8.8a1.7 1.7 0 0 0-2.4-2.4L5 12.7l-.7 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                      <button className="task-action delete-action" onClick={() => deleteTask(task)} type="button" disabled={saving} aria-label={`Delete ${task.title}`}>
                        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                          <path d="M4.5 6h11m-9.8 0 .6 9.2c.1.8.7 1.3 1.5 1.3h3.4c.8 0 1.4-.5 1.5-1.3l.6-9.2M8 6V4.5c0-.6.4-1 1-1h2c.6 0 1 .4 1 1V6m-3 2.5v5m3-5v5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="message-state empty-state">
                <span className="empty-icon">✦</span>
                <h3>{error ? "Couldn't load your tasks" : "Nothing to see here"}</h3>
                <p>{error ? "Check your API URL and try again." : "Add a task above to get started."}</p>
                {error && <button className="secondary-button" onClick={loadTasks} type="button">Try again</button>}
              </div>
            )}
          </section>

          <p className="footer-note">Make progress, not pressure.</p>
        </main>
      </div>

      <dialog ref={dialog} className="app-dialog" onClose={() => setEditingTask(null)}>
        <form className="dialog-content" onSubmit={saveTask}>
          <button className="dialog-close" onClick={() => dialog.current?.close()} type="button" aria-label="Close">×</button>
          <p className="eyebrow">A QUICK CHANGE</p>
          <h2>Edit task</h2>
          <label className="field-label" htmlFor="edit-task">Task name</label>
          <input
            className="dialog-input"
            id="edit-task"
            value={editTitle}
            onChange={(event) => setEditTitle(event.target.value)}
            maxLength={160}
            required
          />
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="dialog-actions">
            <button className="secondary-button" onClick={() => dialog.current?.close()} type="button">Cancel</button>
            <button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving..." : "Save changes"}</button>
          </div>
        </form>
      </dialog>
    </div>
  );
}

export default App;
