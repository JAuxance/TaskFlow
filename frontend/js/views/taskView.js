import { updateTask, deleteTask } from "../task.js";

const pad = value => String(value).padStart(2, "0");
const hasOffset = value => /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value || "");

function localDateValue(value) {
    if (!value) return "";
    if (!hasOffset(value)) return value.replace(" ", "T").replace(/(\.\d{3})\d+$/, "$1");
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function changedDueDate(value, original) {
    if (!value) return null;
    if (!hasOffset(original)) return value;
    // Keep timezone-aware values timezone-aware without treating local input as UTC.
    const offset = -new Date(value).getTimezoneOffset();
    return `${value}${offset >= 0 ? "+" : "-"}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
}

export async function renderTask(task, project, workspace, navigation) {

    const { content, members, role, membersError } = navigation;
    const current = () => content.isConnected && (!navigation.isCurrent || navigation.isCurrent());
    const canEdit = ["owner", "admin", "member"].includes(role);
    const disabled = canEdit ? "" : " disabled";
    const state = { ...task };

    content.innerHTML = `
        <div class="page-actions">
            <button id="back-task-button" type="button" class="btn-secondary">← Back to project</button>
            ${canEdit ? '<button id="delete-task-button" type="button" class="btn-danger">Delete task</button>' : ""}
        </div>
        <div class="page-heading"><h1>Task details</h1></div>
        <form id="task-form" class="task-form">
            <div class="field">
                <label for="task-title">Title</label>
                <input id="task-title" name="title" type="text" value="${escapeHTML(task.title)}" maxlength="100" required${disabled}>
            </div>
            <div class="field task-description-field">
                <label for="task-description">Description</label>
                <textarea id="task-description" name="description" rows="6"${disabled}>${escapeHTML(task.description || "")}</textarea>
            </div>
            <div class="task-properties">
                <div class="field-grid">
                    <div class="field">
                        <label for="task-status">Status</label>
                        <select id="task-status" name="status" aria-describedby="task-autosave-hint"${disabled}>
                            <option value="todo">Todo</option>
                            <option value="in_progress">In Progress</option>
                            <option value="review">Review</option>
                            <option value="done">Done</option>
                        </select>
                    </div>
                    <div class="field">
                        <label for="task-priority">Priority</label>
                        <select id="task-priority" name="priority" aria-describedby="task-autosave-hint"${disabled}>
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="urgent">Urgent</option>
                        </select>
                    </div>
                </div>
                <p id="task-autosave-hint" class="secondary-text autosave-hint">${canEdit ? "Status and priority changes are saved automatically." : "You have read-only access to this task."}</p>
                <p id="autosave-message" class="form-message" role="status" hidden></p>
                <div class="field-grid">
                    <div class="field">
                        <label for="task-due-date">Due date</label>
                        <input id="task-due-date" name="due_date" type="datetime-local" step="any"${disabled}>
                    </div>
                    <div class="field">
                        <label for="task-assignee">Assignee</label>
                        <select id="task-assignee" name="assignee_id"${!canEdit || members === null ? " disabled" : ""}>
                            <option value="">Unassigned</option>
                        </select>
                    </div>
                </div>
                <p id="assignee-message" class="form-message" role="status" hidden></p>
            </div>
            ${canEdit ? '<button id="save-task-button" type="submit" class="btn-primary">Save</button>' : ""}
            <p id="task-message" class="form-message" role="status" hidden></p>
        </form>
    `;

    const form = content.querySelector("#task-form");
    const titleInput = content.querySelector("#task-title");
    const descriptionInput = content.querySelector("#task-description");
    const dueDateInput = content.querySelector("#task-due-date");
    const assigneeSelect = content.querySelector("#task-assignee");
    const statusSelect = content.querySelector("#task-status");
    const prioritySelect = content.querySelector("#task-priority");
    const message = content.querySelector("#task-message");
    const autosaveMessage = content.querySelector("#autosave-message");
    const saveButton = content.querySelector("#save-task-button");
    const deleteButton = content.querySelector("#delete-task-button");
    statusSelect.value = task.status;
    prioritySelect.value = task.priority;
    dueDateInput.value = localDateValue(task.due_date);
    // Compare the browser's normalized value so an untouched timestamp is never rewritten.
    let savedDueInput = dueDateInput.value;

    for (const member of members || []) {
        const option = document.createElement("option");
        option.value = String(member.user_id);
        option.textContent = member.user_name;
        assigneeSelect.appendChild(option);
    }
    if (task.assignee_id != null) {
        if (!(members || []).some(member => String(member.user_id) === String(task.assignee_id))) {
            const option = document.createElement("option");
            option.value = String(task.assignee_id);
            option.textContent = "Current assignee (unavailable)";
            assigneeSelect.appendChild(option);
        }
        assigneeSelect.value = String(task.assignee_id);
    }
    let savedAssigneeInput = assigneeSelect.value;
    if (membersError) setMessage(content.querySelector("#assignee-message"), "Workspace members could not be loaded. The current assignee will be kept.");

    // PATCH currently reads and writes a full database row. Serial requests prevent
    // independent status, priority and form saves from overwriting each other.
    let mutationQueue = Promise.resolve();
    function queueMutation(action) {
        const pending = mutationQueue.then(action);
        mutationQueue = pending.catch(() => {});
        return pending;
    }

    let editRevision = 0;
    for (const control of [titleInput, descriptionInput, dueDateInput, assigneeSelect]) {
        control.addEventListener("input", () => { editRevision += 1; });
        control.addEventListener("change", () => { editRevision += 1; });
    }

    for (const [field, select] of [["status", statusSelect], ["priority", prioritySelect]]) {
        select.addEventListener("change", async () => {
            if (!canEdit || select.disabled || deleteButton?.disabled) return;
            const value = select.value;
            setMessage(autosaveMessage, "Saving…", "info");
            await withBusy(select, () => queueMutation(async () => {
                const result = await updateTask(task.id, { [field]: value });
                if (!current()) return;
                if (result.ok) {
                    state[field] = value;
                    setMessage(autosaveMessage, `${field === "status" ? "Status" : "Priority"} saved.`, "success");
                } else {
                    select.value = state[field];
                    setMessage(autosaveMessage, result.data?.error || `Unable to save ${field}. Please try again.`);
                }
            }));
        });
    }

    form.addEventListener("submit", async event => {
        event.preventDefault();
        if (!canEdit || saveButton.disabled || deleteButton.disabled) return;
        const title = titleInput.value.trim();
        if (!title) {
            setMessage(message, "Enter a task title.");
            titleInput.focus();
            return;
        }
        const revision = editRevision;
        const submittedDueInput = dueDateInput.value;
        const submittedAssignee = assigneeSelect.value;
        const data = { title, description: descriptionInput.value };
        if (members !== null && submittedAssignee !== savedAssigneeInput) {
            data.assignee_id = submittedAssignee ? Number(submittedAssignee) : null;
        }
        if (submittedDueInput !== savedDueInput) data.due_date = changedDueDate(submittedDueInput, state.due_date);
        setMessage(message, "");
        await withBusy(saveButton, () => queueMutation(async () => {
            const result = await updateTask(task.id, data);
            if (!current()) return;
            if (!result.ok) {
                setMessage(message, result.data?.error || "Unable to save the task.");
                return;
            }
            Object.assign(state, data);
            savedDueInput = submittedDueInput;
            savedAssigneeInput = submittedAssignee;
            if (editRevision === revision) {
                setMessage(message, "Task saved.", "success");
            } else {
                setMessage(message, "Saved. Your latest edits are still unsaved.", "success");
            }
        }));
    });

    deleteButton?.addEventListener("click", async () => {
        if (deleteButton.disabled || saveButton.disabled) return;
        if (!window.confirm("Delete this task? This cannot be undone.")) return;
        await withBusy(deleteButton, () => queueMutation(async () => {
            const result = await deleteTask(task.id);
            if (!current()) return;
            if (result.ok) {
                await navigation.renderProject(project, workspace);
            } else {
                setMessage(message, result.data?.error || "Unable to delete the task.");
            }
        }));
    });

    content.querySelector("#back-task-button").addEventListener("click", () => navigation.renderProject(project, workspace));
}

function escapeHTML(value = "") {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[character]));
}


function setMessage(element, text = "", type = "error") {
    if (!element) return;
    element.textContent = text;
    element.hidden = !text;
    element.dataset.type = type;
    element.setAttribute("role", type === "error" ? "alert" : "status");
}

async function withBusy(control, action) {
    const wasDisabled = control.disabled;
    control.disabled = true;
    control.setAttribute("aria-busy", "true");
    try {
        return await action();
    } finally {
        control.disabled = wasDisabled;
        control.removeAttribute("aria-busy");
    }
}
