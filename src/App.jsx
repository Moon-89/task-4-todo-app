import React, { useEffect, useRef, useState } from "react";

const ENDPOINT_STORAGE_KEY = "daylight.mockapi.endpoint";
const DEFAULT_ENDPOINT = "https://6b03eeb49e7cafb37dbfa9aa.mockapi.io/api/v1/todos";

function normalizeEndpoint(value) {
  const parsed = new URL(value.trim());
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Use a valid HTTP or HTTPS MockAPI resource URL.");
  }
  return parsed.href.replace(/\/+$/, "");
}

async function request(endpoint, path = "", options = {}) {
  if (!endpoint) throw new Error("Connect a MockAPI resource URL in settings first.");
  const response = await fetch(`${endpoint}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`MockAPI returned ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ""}`);
  }
  if (response.status === 204) return null;
  const responseText = await response.text();
  return responseText ? JSON.parse(responseText) : null;
}

function normalizeTasks(result) {
  if (!Array.isArray(result)) throw new Error("The resource response should be a JSON array of tasks.");
  return result.map((task) => {
    if (!task || task.id === undefined || typeof task.title !== "string") {
      throw new Error("Each task needs an id and a title field.");
    }
    return { ...task, id: String(task.id), completed: Boolean(task.completed) };
  });
}

function taskTimestamp(task) {
  const value = task.createdAt || task.created_at || task.updatedAt || "";
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function ActionIcon({ type }) {
  if (type === "edit") {
    return <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m12.2 4.1 3.7 3.7M4.3 15.7l3.1-.6 8.8-8.8a1.7 1.7 0 0 0-2.4-2.4L5 12.7l-.7 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  }
  return <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4.5 6h11m-9.8 0 .6 9.2c.1.8.7 1.3 1.5 1.3h3.4c.8 0 1.4-.5 1.5-1.3l.6-9.2M8 6V4.5c0-.6.4-1 1-1h2c.6 0 1 .4 1 1V6m-3 2.5v5m3-5v5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

function TaskRow({ task, busy, onToggle, onEdit, onDelete }) {
  const timestamp = taskTimestamp(task);
  return (
    <article className={`task-item${task.completed ? " is-complete" : ""}`}>
      <button
        className={`task-check${task.completed ? " is-complete" : ""}`}
        type="button"
        disabled={busy}
        onClick={() => onToggle(task)}
        aria-label={`${task.completed ? "Mark as not completed" : "Mark as completed"}: ${task.title}`}
        aria-pressed={String(Boolean(task.completed))}
      >
        {task.completed && <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m3.5 8 3 3 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
      </button>
      <span className="task-title">{task.title}</span>
      {timestamp > 0 && (
        <time className="task-meta" dateTime={new Date(timestamp).toISOString()}>
          {new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(timestamp)}
        </time>
      )}
      <div className="task-actions">
        <button className="task-action edit-action" type="button" disabled={busy} onClick={() => onEdit(task)} aria-label={`Edit task: ${task.title}`}>
          <ActionIcon type="edit" />
        </button>
        <button className="task-action delete-action" type="button" disabled={busy} onClick={() => onDelete(task)} aria-label={`Delete task: ${task.title}`}>
          <ActionIcon type="delete" />
        </button>
      </div>
    </article>
  );
}

function App() {
  const [endpoint, setEndpoint] = useState(
    () => localStorage.getItem(ENDPOINT_STORAGE_KEY) || DEFAULT_ENDPOINT
  );
  const [tasks, setTasks] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [newTask, setNewTask] = useState("");
  const [adding, setAdding] = useState(false);
  const [busyTaskIds, setBusyTaskIds] = useState([]);
  const [toast, setToast] = useState("");
  const [apiUrl, setApiUrl] = useState(endpoint);
  const [settingsError, setSettingsError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const settingsDialog = useRef(null);
  const editDialog = useRef(null);
  const newTaskInput = useRef(null);
  const toastTimeout = useRef(null);

  const activeTasks = tasks.filter((task) => !task.completed);
  const completedTasks = tasks.filter((task) => task.completed);
  const sortedTasks = [...tasks].sort((a, b) => taskTimestamp(b) - taskTimestamp(a));
  const visibleActive = filter === "completed" ? [] : sortedTasks.filter((task) => !task.completed);
  const visibleCompleted = filter === "active" ? [] : sortedTasks.filter((task) => task.completed);
  const total = tasks.length;
  const percentage = total ? Math.round((completedTasks.length / total) * 100) : 0;
  const today = new Date();
  const todayLabel = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(today);
  const listDate = new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric", year: "numeric" }).format(today);

  useEffect(() => {
    void loadTasks(endpoint);
  }, []);

  useEffect(() => () => window.clearTimeout(toastTimeout.current), []);

  useEffect(() => {
    if (editingTask && editDialog.current && !editDialog.current.open) {
      editDialog.current.showModal();
    }
  }, [editingTask]);

  async function loadTasks(resourceUrl) {
    setLoadError("");
    if (!resourceUrl) {
      setConnected(false);
      setTasks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = normalizeTasks(await request(resourceUrl));
      setTasks(result);
      setConnected(true);
    } catch (error) {
      setConnected(false);
      setLoadError(error.message || "Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  function showToast(message) {
    window.clearTimeout(toastTimeout.current);
    setToast(message);
    toastTimeout.current = window.setTimeout(() => setToast(""), 2800);
  }

  function openSettings() {
    setApiUrl(endpoint);
    setSettingsError("");
    settingsDialog.current?.showModal();
  }

  function closeDialog(dialogRef) {
    dialogRef.current?.close();
  }

  function setTaskBusy(id, isBusy) {
    setBusyTaskIds((current) => isBusy
      ? [...new Set([...current, id])]
      : current.filter((taskId) => taskId !== id));
  }

  async function handleAddTask(event) {
    event.preventDefault();
    const title = newTask.trim();
    if (!title) {
      newTaskInput.current?.focus();
      return;
    }
    setAdding(true);
    try {
      const created = await request(endpoint, "", {
        method: "POST",
        body: JSON.stringify({ title, completed: false }),
      });
      if (!created || created.id === undefined || typeof created.title !== "string") {
        throw new Error("MockAPI did not return the created task. Check the resource configuration.");
      }
      setTasks((current) => [{ ...created, id: String(created.id), completed: Boolean(created.completed) }, ...current]);
      setNewTask("");
      setFilter("all");
      showToast("Task added to your list.");
    } catch (error) {
      showToast(error.message || "Could not add that task.");
    } finally {
      setAdding(false);
    }
  }

  function startEditing(task) {
    setEditingTask(task);
    setEditTitle(task.title);
    setEditError("");
  }

  async function handleEditTask(event) {
    event.preventDefault();
    const title = editTitle.trim();
    if (!title) return;
    if (!editingTask) {
      closeDialog(editDialog);
      return;
    }
    setSavingEdit(true);
    setEditError("");
    try {
      const result = await request(endpoint, `/${encodeURIComponent(editingTask.id)}`, {
        method: "PUT",
        body: JSON.stringify({ ...editingTask, title }),
      });
      if (result && (result.id === undefined || typeof result.title !== "string")) {
        throw new Error("MockAPI returned an invalid task after saving.");
      }
      setTasks((current) => current.map((task) => task.id === editingTask.id ? { ...task, ...(result || {}), title } : task));
      closeDialog(editDialog);
      setEditingTask(null);
      showToast("Task updated.");
    } catch (error) {
      setEditError(error.message || "Could not save your changes.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleToggle(task) {
    setTaskBusy(task.id, true);
    const completed = !task.completed;
    try {
      await request(endpoint, `/${encodeURIComponent(task.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ completed }),
      });
      setTasks((current) => current.map((item) => item.id === task.id ? { ...item, completed } : item));
    } catch (error) {
      showToast(error.message || "Could not update that task.");
    } finally {
      setTaskBusy(task.id, false);
    }
  }

  async function handleDelete(task) {
    if (!window.confirm(`Delete “${task.title}”? This can’t be undone.`)) return;
    setTaskBusy(task.id, true);
    try {
      await request(endpoint, `/${encodeURIComponent(task.id)}`, { method: "DELETE" });
      setTasks((current) => current.filter((item) => item.id !== task.id));
      showToast("Task deleted.");
    } catch (error) {
      showToast(error.message || "Could not delete that task.");
    } finally {
      setTaskBusy(task.id, false);
    }
  }

  async function handleConnect(event) {
    event.preventDefault();
    let resourceUrl;
    try {
      resourceUrl = normalizeEndpoint(apiUrl);
    } catch {
      setSettingsError("Enter a valid HTTP or HTTPS resource URL.");
      return;
    }
    setConnecting(true);
    setSettingsError("");
    try {
      const result = normalizeTasks(await request(resourceUrl));
      localStorage.setItem(ENDPOINT_STORAGE_KEY, resourceUrl);
      setEndpoint(resourceUrl);
      setTasks(result);
      setConnected(true);
      setLoadError("");
      closeDialog(settingsDialog);
      showToast("MockAPI connected.");
    } catch (error) {
      setSettingsError(error.message || "Could not connect to MockAPI.");
    } finally {
      setConnecting(false);
    }
  }

  function handleDialogBackdrop(event, dialogRef) {
    if (event.target === dialogRef.current) closeDialog(dialogRef);
  }

  const emptyTitle = total
    ? filter === "active" ? "All caught up!" : "Nothing completed just yet"
    : endpoint ? "A fresh start" : "Connect your MockAPI";
  const emptyCopy = total
    ? filter === "active"
      ? "You’ve finished everything on your list. Enjoy the breathing room."
      : "Finish a task and it’ll find a home here."
    : endpoint
      ? "Your list is clear. Add a task and make today count."
      : "Add your MockAPI todos resource URL in settings to load and sync your tasks.";

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <a className="brand" href="#" aria-label="Daylight home">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none"><path d="M16 4.5v4M16 23.5v4M27.5 16h-4M8.5 16h-4M24.13 7.87l-2.83 2.83M10.7 21.3l-2.83 2.83m16.26 0-2.83-2.83M10.7 10.7 7.87 7.87" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/><circle cx="16" cy="16" r="6.25" fill="currentColor"/></svg>
          </span>
          <span>daylight</span>
        </a>
        <nav className="side-nav">
          <button className="side-nav-item is-active" type="button" aria-current="page">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.6"/></svg>
            <span>Overview</span>
          </button>
          <button className="side-nav-item" type="button" onClick={() => setFilter("active")}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>
            <span>My tasks</span>
            <span className="nav-count">{activeTasks.length}</span>
          </button>
          <button className="side-nav-item" type="button" onClick={() => setFilter("completed")}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6"/><path d="m8.2 12.2 2.4 2.4 5.2-5.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
            <span>Completed</span>
            <span className="nav-count">{completedTasks.length}</span>
          </button>
        </nav>
        <div className="sidebar-footer">
          <button className="side-nav-item" type="button" onClick={openSettings}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 15.25a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Z" stroke="currentColor" strokeWidth="1.7"/><path d="M19 13.2v-2.4l-2-.5-.6-1.4.9-1.8-1.7-1.7-1.8.9-1.4-.6-.5-2h-2.4l-.5 2-1.4.6-1.8-.9-1.7 1.7.9 1.8-.6 1.4-2 .5v2.4l2 .5.6 1.4-.9 1.8 1.7 1.7 1.8-.9 1.4.6.5 2h2.4l.5-2 1.4-.6 1.8.9 1.7-1.7-.9-1.8.6-1.4 2-.5Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round"/></svg>
            <span>Settings</span>
          </button>
          <div className="profile-card">
            <span className="profile-avatar">TA</span>
            <span className="profile-copy"><strong>My workspace</strong><small>Personal</small></span>
          </div>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div>
            <p className="topbar-kicker">Workspace</p>
            <h2>Today</h2>
          </div>
          <div className="topbar-right">
            <span className={`connection-status${connected ? " is-connected" : ""}`}>
              <span className="status-dot"></span>
              <span>{connected ? "Synced" : "Offline"}</span>
            </span>
            <button className="icon-button" type="button" aria-label="Configure MockAPI" title="Configure MockAPI" onClick={openSettings}>
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 15.25a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5Z" stroke="currentColor" strokeWidth="1.7"/><path d="M19 13.2v-2.4l-2-.5-.6-1.4.9-1.8-1.7-1.7-1.8.9-1.4-.6-.5-2h-2.4l-.5 2-1.4.6-1.8-.9-1.7 1.7.9 1.8-.6 1.4-2 .5v2.4l2 .5.6 1.4-.9 1.8 1.7 1.7 1.8-.9 1.4.6.5 2h2.4l.5-2 1.4-.6 1.8.9 1.7-1.7-.9-1.8.6-1.4 2-.5Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round"/></svg>
            </button>
          </div>
        </header>

      <main className="main-content">
        <section className="welcome-row" aria-labelledby="page-title">
          <div>
            <p className="eyebrow">{todayLabel}</p>
            <h1 id="page-title">Make today <span>feel lighter.</span></h1>
            <p className="welcome-copy">A little progress adds up. What would you like to get done?</p>
          </div>
          <div className="progress-card" aria-live="polite">
            <div className="progress-copy"><span className="progress-label">Daily progress</span><span className="progress-value">{percentage}%</span></div>
            <div className="progress-track" role="progressbar" aria-label="Daily progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={percentage}><span style={{ width: `${percentage}%` }}></span></div>
            <span className="progress-caption">{total ? `${completedTasks.length} of ${total} ${total === 1 ? "task" : "tasks"} complete` : "Let’s get started"}</span>
          </div>
        </section>

        <section className="task-panel" aria-label="Your tasks">
          <form className="add-task-form" onSubmit={handleAddTask}>
            <span className="add-icon" aria-hidden="true">+</span>
            <label className="sr-only" htmlFor="new-task">Add a task</label>
            <input ref={newTaskInput} id="new-task" name="title" type="text" maxLength="160" placeholder="Add a task..." autoComplete="off" required value={newTask} onChange={(event) => setNewTask(event.target.value)} />
            <button className="add-task-button" type="submit" disabled={adding || !connected}>Add task <span aria-hidden="true">↗</span></button>
          </form>

          <div className="list-toolbar">
            <div className="filter-tabs" role="tablist" aria-label="Filter tasks">
              {[["all", "All", tasks.length], ["active", "To do", activeTasks.length], ["completed", "Completed", completedTasks.length]].map(([value, label, count]) => (
                <button key={value} className={`filter-tab${filter === value ? " is-selected" : ""}`} type="button" role="tab" aria-selected={filter === value} onClick={() => setFilter(value)}>{label} <span>{count}</span></button>
              ))}
            </div>
            <span className="list-date">{listDate}</span>
          </div>

          <div aria-live="polite" aria-busy={loading}>
            {loading ? (
              <div className="loading-state"><span className="spinner" aria-hidden="true"></span><span>Getting your tasks...</span></div>
            ) : loadError ? (
              <div className="error-state">
                <span className="error-icon" aria-hidden="true">!</span>
                <h2>We couldn’t load your tasks</h2>
                <p>{loadError}</p>
                <button className="secondary-button" type="button" onClick={() => void loadTasks(endpoint)}>Try again</button>
                <button className="text-button" type="button" onClick={openSettings}>Check API settings</button>
              </div>
            ) : (
              <>
                {(visibleActive.length + visibleCompleted.length) > 0 && (
                  <div className="task-groups">
                    {visibleActive.length > 0 && (
                      <section className="task-group" aria-labelledby="active-heading">
                        <h2 className="group-heading" id="active-heading"><span className="heading-dot active-dot"></span>To do <span>{activeTasks.length}</span></h2>
                        <div className="task-list">{visibleActive.map((task) => <TaskRow key={task.id} task={task} busy={busyTaskIds.includes(task.id)} onToggle={handleToggle} onEdit={startEditing} onDelete={handleDelete} />)}</div>
                      </section>
                    )}
                    {visibleCompleted.length > 0 && (
                      <section className="task-group completed-group" aria-labelledby="completed-heading">
                        <h2 className="group-heading" id="completed-heading"><span className="heading-dot completed-dot"></span>Completed <span>{completedTasks.length}</span></h2>
                        <div className="task-list">{visibleCompleted.map((task) => <TaskRow key={task.id} task={task} busy={busyTaskIds.includes(task.id)} onToggle={handleToggle} onEdit={startEditing} onDelete={handleDelete} />)}</div>
                      </section>
                    )}
                  </div>
                )}
                {visibleActive.length + visibleCompleted.length === 0 && (
                  <div className="empty-state">
                    <span className="empty-illustration" aria-hidden="true"><svg viewBox="0 0 80 80" fill="none"><rect x="17" y="13" width="46" height="55" rx="8" fill="#F0EEFF" stroke="#D8D3FF" strokeWidth="2"/><path d="M29 30h22M29 41h22M29 52h13" stroke="#8C83E8" strokeWidth="3" strokeLinecap="round"/><path d="m52 13 1.5-5" stroke="#F0B75E" strokeWidth="3" strokeLinecap="round"/></svg></span>
                    <h2>{emptyTitle}</h2>
                    <p>{emptyCopy}</p>
                    <button className="text-button" type="button" onClick={() => endpoint ? newTaskInput.current?.focus() : openSettings()}>
                      {endpoint ? "Add your first task" : "Set up MockAPI"} <span aria-hidden="true">→</span>
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
        <p className="footer-note"><span aria-hidden="true">✦</span> One thing at a time. You’ve got this.</p>
      </main>
      </div>

      <dialog ref={settingsDialog} className="app-dialog" aria-labelledby="settings-title" onClick={(event) => handleDialogBackdrop(event, settingsDialog)}>
        <form className="dialog-content" onSubmit={handleConnect}>
          <button className="dialog-close" type="button" onClick={() => closeDialog(settingsDialog)} aria-label="Close settings">×</button>
          <span className="dialog-icon" aria-hidden="true">↗</span>
          <p className="eyebrow">One quick setup</p>
          <h2 id="settings-title">Connect your MockAPI</h2>
          <p className="dialog-description">Paste the resource URL for your <code>todos</code> endpoint. It should look like <code>https://…mockapi.io/api/v1/todos</code>.</p>
          <label className="field-label" htmlFor="api-url">MockAPI resource URL</label>
          <input className="dialog-input" id="api-url" name="apiUrl" type="url" placeholder="https://your-project.mockapi.io/api/v1/todos" autoComplete="url" required value={apiUrl} onChange={(event) => setApiUrl(event.target.value)} />
          <p className="field-hint">Your URL is saved in this browser only. Tasks need <code>title</code> and <code>completed</code> fields.</p>
          {settingsError && <p className="form-error" role="alert">{settingsError}</p>}
          <div className="dialog-actions">
            <button className="secondary-button" type="button" onClick={() => closeDialog(settingsDialog)}>Cancel</button>
            <button className="primary-button" type="submit" disabled={connecting}>{connecting ? "Connecting..." : "Connect"}</button>
          </div>
        </form>
      </dialog>

      <dialog ref={editDialog} className="app-dialog" aria-labelledby="edit-title" onClose={() => setEditingTask(null)} onClick={(event) => handleDialogBackdrop(event, editDialog)}>
        <form className="dialog-content" onSubmit={handleEditTask}>
          <button className="dialog-close" type="button" onClick={() => closeDialog(editDialog)} aria-label="Close edit task">×</button>
          <span className="dialog-icon edit-dialog-icon" aria-hidden="true">✎</span>
          <p className="eyebrow">Make it yours</p>
          <h2 id="edit-title">Edit task</h2>
          <label className="field-label" htmlFor="edit-task-title">Task name</label>
          <input className="dialog-input" id="edit-task-title" name="title" type="text" maxLength="160" required value={editTitle} onChange={(event) => setEditTitle(event.target.value)} />
          {editError && <p className="form-error" role="alert">{editError}</p>}
          <div className="dialog-actions">
            <button className="secondary-button" type="button" onClick={() => closeDialog(editDialog)}>Cancel</button>
            <button className="primary-button" type="submit" disabled={savingEdit}>{savingEdit ? "Saving..." : "Save changes"}</button>
          </div>
        </form>
      </dialog>

      <div className={`toast${toast ? " is-visible" : ""}`} role="status" aria-live="polite">{toast}</div>
    </div>
  );
}

export default App;
