import { escapeHTML, setMessage, withBusy } from "../ui.js";
import { updateProject, deleteProject } from "../projects.js";
import { getTasks, createTask, getTaskById, TASK_COLORS } from "../task.js";

const STATUSES = [
    ["todo", "Todo"],
    ["in_progress", "In Progress"],
    ["review", "Review"],
    ["done", "Done"]
];

const PRIORITIES = { low: "Low", medium: "Medium", high: "High", urgent: "Urgent" };

function dueDateLabel(value) {
    if (!value) return "";
    // A timestamp without an offset is a local calendar date, not UTC.
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(date);
}

export async function renderProject(project, workspace, navigation) {

    const { content, members, role } = navigation;
    const current = () => content.isConnected && (!navigation.isCurrent || navigation.isCurrent());
    const canEditProject = ["owner", "admin"].includes(role);
    const canEditTasks = ["owner", "admin", "member"].includes(role);
    const memberNames = new Map((members || []).map(member => [String(member.user_id), member.user_name]));

    content.innerHTML = `
        <div class="page-heading page-heading-row">
            <div class="heading-copy">
                <h1>${escapeHTML(project.name)}</h1>
                ${project.description ? `<p class="secondary-text">${escapeHTML(project.description)}</p>` : ""}
            </div>
            <div class="header-actions">
                ${canEditProject ? '<button id="project-settings-button" type="button" class="btn-secondary">Project settings</button>' : ""}
                ${canEditTasks ? '<button id="new-task-button" type="button" class="btn-primary">New task</button>' : ""}
            </div>
        </div>
        <p id="tasks-message" class="form-message" role="status" hidden></p>
        <div class="kanban-board" aria-label="Project task board">
            ${STATUSES.map(([value, label]) => `
                <section class="kanban-column" data-status="${value}" aria-labelledby="heading-${value}">
                    <h2 id="heading-${value}" class="kanban-heading">${label}<span class="kanban-count" aria-label="Loading tasks">—</span></h2>
                    <div class="task-cards"><p class="empty-state">Loading tasks…</p></div>
                </section>
            `).join("")}
        </div>
        ${canEditTasks ? `
            <dialog id="create-task-dialog" class="app-dialog" aria-labelledby="create-task-heading">
                <div class="dialog-header">
                    <h2 id="create-task-heading">New task</h2>
                    <button type="button" class="dialog-close" data-close-dialog aria-label="Close new task">×</button>
                </div>
                <form id="create-task-form" class="dialog-body">
                    <div class="field">
                        <label for="task-title-input">Task title</label>
                        <input id="task-title-input" name="title" type="text" placeholder="Enter a task title" maxlength="100" required autofocus>
                    </div>
                    <div class="field task-color-field">
                        <label for="new-task-color">Color</label>
                        <div class="color-control" data-color="gray">
                            <span class="color-swatch" aria-hidden="true"></span>
                            <select id="new-task-color" name="color">
                                ${Object.entries(TASK_COLORS).map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}
                            </select>
                        </div>
                    </div>
                    <p id="create-task-message" class="form-message" role="status" hidden></p>
                    <div class="dialog-actions">
                        <button type="button" class="btn-secondary" data-close-dialog>Cancel</button>
                        <button type="submit" class="btn-primary">Create task</button>
                    </div>
                </form>
            </dialog>
        ` : ""}
        ${canEditProject ? `
            <dialog id="project-settings-dialog" class="app-dialog" aria-labelledby="project-settings-heading">
                <div class="dialog-header">
                    <h2 id="project-settings-heading">Project settings</h2>
                    <button type="button" class="dialog-close" data-close-dialog aria-label="Close project settings">×</button>
                </div>
                <form id="project-settings-form" class="dialog-body">
                    <div class="field">
                        <label for="project-name">Project name</label>
                        <input id="project-name" name="name" type="text" value="${escapeHTML(project.name)}" maxlength="50" required autofocus>
                    </div>
                    <div class="field">
                        <label for="project-description">Description</label>
                        <textarea id="project-description" name="description" rows="3">${escapeHTML(project.description || "")}</textarea>
                    </div>
                    <p id="project-message" class="form-message" role="status" hidden></p>
                    <div class="dialog-actions">
                        <button type="button" class="btn-secondary" data-close-dialog>Cancel</button>
                        <button id="save-project-button" type="submit" class="btn-primary">Save changes</button>
                    </div>
                    <div class="danger-zone">
                        <div>
                            <h3>Delete project</h3>
                            <p class="secondary-text">Permanently delete this project and all its tasks.</p>
                        </div>
                        <button id="delete-project-button" type="button" class="btn-danger">Delete project</button>
                    </div>
                </form>
            </dialog>
        ` : ""}
    `;

    const tasksMessage = content.querySelector("#tasks-message");
    let loadVersion = 0;

    for (const [buttonId, dialogId] of [["new-task-button", "create-task-dialog"], ["project-settings-button", "project-settings-dialog"]]) {
        const dialog = content.querySelector(`#${dialogId}`);
        if (!dialog) continue;
        content.querySelector(`#${buttonId}`).addEventListener("click", () => dialog.showModal());
        for (const button of dialog.querySelectorAll("[data-close-dialog]")) {
            button.addEventListener("click", () => {
                if (!dialog.querySelector('[aria-busy="true"]')) dialog.close();
            });
        }
        dialog.addEventListener("cancel", event => {
            if (dialog.querySelector('[aria-busy="true"]')) event.preventDefault();
        });
    }

    async function loadTasks() {
        const version = ++loadVersion;
        const result = await getTasks(project.id);
        if (!current() || version !== loadVersion) return;
        if (!result.ok) {
            setMessage(tasksMessage, result.data?.error || "Unable to load tasks. Please open this project again.");
            content.querySelectorAll(".task-cards").forEach(column => {
                if (!column.querySelector(".task-card")) column.innerHTML = '<p class="empty-state">Tasks unavailable</p>';
            });
            return;
        }
        setMessage(tasksMessage, "");
        for (const [status] of STATUSES) {
            const column = content.querySelector(`[data-status="${status}"] .task-cards`);
            const tasks = result.data.filter(task => task.status === status);
            const count = content.querySelector(`[data-status="${status}"] .kanban-count`);
            count.textContent = String(tasks.length);
            count.setAttribute("aria-label", `${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}`);
            column.replaceChildren();
            if (!tasks.length) {
                column.innerHTML = '<p class="empty-state">No tasks yet.</p>';
                continue;
            }
            for (const task of tasks) {
                const card = document.createElement("button");
                card.type = "button";
                card.className = "task-card";
                card.dataset.color = Object.hasOwn(TASK_COLORS, task.color) ? task.color : "gray";
                const assignee = task.assignee_id == null
                    ? "Unassigned"
                    : memberNames.get(String(task.assignee_id)) || "Member unavailable";
                const dueLabel = dueDateLabel(task.due_date);
                card.innerHTML = `
                    <span class="task-card-title">${escapeHTML(task.title)}</span>
                    <span class="task-priority" data-priority="${escapeHTML(task.priority)}">${escapeHTML(PRIORITIES[task.priority] || task.priority)} priority</span>
                    <span class="task-meta">
                        <span class="task-assignee">${escapeHTML(assignee)}</span>
                        ${dueLabel ? `<time datetime="${escapeHTML(task.due_date)}" title="${escapeHTML(task.due_date)}">${escapeHTML(dueLabel)}</time>` : ""}
                    </span>
                `;
                card.addEventListener("click", () => withBusy(card, async () => {
                    const detail = await getTaskById(task.id);
                    if (!current()) return;
                    if (detail.ok) {
                        await navigation.renderTask(detail.data, project, workspace);
                    } else {
                        setMessage(tasksMessage, detail.data?.error || "Unable to open this task.");
                    }
                }));
                column.appendChild(card);
            }
        }
    }

    const createForm = content.querySelector("#create-task-form");
    const colorSelect = content.querySelector("#new-task-color");
    colorSelect?.addEventListener("change", () => {
        colorSelect.closest(".color-control").dataset.color = colorSelect.value;
    });
    createForm?.addEventListener("submit", async event => {
        event.preventDefault();
        const input = createForm.querySelector("input");
        const button = createForm.querySelector('button[type="submit"]');
        const message = content.querySelector("#create-task-message");
        if (button.disabled) return;
        const enteredTitle = input.value;
        const title = enteredTitle.trim();
        const color = colorSelect.value;
        if (!title) {
            setMessage(message, "Enter a task title.");
            input.focus();
            return;
        }
        setMessage(message, "");
        await withBusy(button, async () => {
            const result = await createTask(project.id, title, color);
            if (!current()) return;
            if (!result.ok) {
                setMessage(message, result.data?.error || "Unable to create the task.");
                return;
            }
            if (input.value === enteredTitle) input.value = "";
            content.querySelector("#create-task-dialog").close();
            await loadTasks();
        });
    });

    const projectForm = content.querySelector("#project-settings-form");
    projectForm?.addEventListener("submit", async event => {
        event.preventDefault();
        const button = content.querySelector("#save-project-button");
        const deleteButton = content.querySelector("#delete-project-button");
        const name = content.querySelector("#project-name").value.trim();
        const description = content.querySelector("#project-description").value;
        const message = content.querySelector("#project-message");
        if (button.disabled || deleteButton.disabled) return;
        if (!name) {
            setMessage(message, "Enter a project name.");
            return;
        }
        await withBusy(button, async () => {
            const result = await updateProject(project.id, { name, description });
            if (!current()) return;
            if (result.ok) {
                await navigation.renderProject(result.data, workspace);
            } else {
                setMessage(message, result.data?.error || "Unable to save the project.");
            }
        });
    });

    content.querySelector("#delete-project-button")?.addEventListener("click", async event => {
        const button = event.currentTarget;
        if (button.disabled || content.querySelector("#save-project-button").disabled) return;
        if (!window.confirm("Delete this project and all its tasks? This cannot be undone.")) return;
        await withBusy(button, async () => {
            const result = await deleteProject(project.id);
            if (!current()) return;
            if (result.ok) {
                await navigation.renderWorkspace(workspace);
            } else {
                setMessage(content.querySelector("#project-message"), result.data?.error || "Unable to delete the project.");
            }
        });
    });

    await loadTasks();
}
