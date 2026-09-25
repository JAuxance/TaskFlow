import { escapeHTML, setMessage, withBusy } from "../ui.js";
import { updateTask, deleteTask, TASK_COLORS } from "../task.js";

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
    const state = { ...task, color: Object.hasOwn(TASK_COLORS, task.color) ? task.color : "gray" };

    content.innerHTML = `
        <div class="page-heading page-heading-row">
            <div class="heading-copy">
                <h1 class="task-heading-title">${escapeHTML(task.title)}</h1>
                <p class="secondary-text">${escapeHTML(project.name)}</p>
            </div>
            <div class="header-actions">
                <button id="back-task-button" type="button" class="btn-secondary">← Back to project</button>
                ${canEdit ? '<button id="save-task-button" type="submit" form="task-form" class="btn-primary">Save changes</button>' : ""}
            </div>
        </div>
        <form id="task-form" class="task-form" data-color="${state.color}">
            <div class="task-editor-main">
                <div class="field">
                    <label for="task-title">Title</label>
                    <input id="task-title" name="title" type="text" value="${escapeHTML(task.title)}" maxlength="100" required${disabled}>
                </div>
                <div class="field task-description-field">
                    <label for="task-description">Description</label>
                    <textarea id="task-description" name="description" rows="10" placeholder="Add details about this task…"${disabled}>${escapeHTML(task.description || "")}</textarea>
                </div>
                ${canEdit ? '<p class="secondary-text autosave-hint">Use Save changes to save the title, description and planning.</p>' : ""}
                <p id="task-message" class="form-message" role="status" hidden></p>
            </div>
            <div class="task-properties">
                <h2>Task properties</h2>
                <div class="task-property-group">
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
                    <div class="field task-color-field">
                        <label for="task-color">Color</label>
                        <div class="color-control" data-color="${state.color}">
                            <span class="color-swatch" aria-hidden="true"></span>
                            <select id="task-color" name="color" aria-describedby="task-autosave-hint"${disabled}>
                                ${Object.entries(TASK_COLORS).map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}
                            </select>
                        </div>
                    </div>
                    <p id="task-autosave-hint" class="secondary-text autosave-hint">${canEdit ? "Status, priority and color are saved automatically." : "You have read-only access to this task."}</p>
                    <p id="autosave-message" class="form-message" role="status" hidden></p>
                </div>
                <div class="task-property-group">
                    <h3>Planning</h3>
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
                ${canEdit ? '<div class="task-danger-zone"><button id="delete-task-button" type="button" class="btn-danger">Delete task</button></div>' : ""}
            </div>
        </form>
    `;

    const form = content.querySelector("#task-form");
    const titleInput = content.querySelector("#task-title");
    const descriptionInput = content.querySelector("#task-description");
    const dueDateInput = content.querySelector("#task-due-date");
    const assigneeSelect = content.querySelector("#task-assignee");
    const statusSelect = content.querySelector("#task-status");
    const prioritySelect = content.querySelector("#task-priority");
    const colorSelect = content.querySelector("#task-color");
    const message = content.querySelector("#task-message");
    const autosaveMessage = content.querySelector("#autosave-message");
    const saveButton = content.querySelector("#save-task-button");
    const deleteButton = content.querySelector("#delete-task-button");
    statusSelect.value = task.status;
    prioritySelect.value = task.priority;
    colorSelect.value = state.color;
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
    // independent status, priority, color and form saves from overwriting each other.
    let mutationQueue = Promise.resolve();
    let navigatingBack = false;
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

    for (const [field, select] of [["status", statusSelect], ["priority", prioritySelect], ["color", colorSelect]]) {
        select.addEventListener("change", async () => {
            if (!canEdit || navigatingBack || select.disabled || deleteButton?.disabled) return;
            const value = select.value;
            if (field === "color") {
                select.closest(".color-control").dataset.color = value;
                form.dataset.color = value;
            }
            setMessage(autosaveMessage, "Saving…", "info");
            await withBusy(select, () => queueMutation(async () => {
                const result = await updateTask(task.id, { [field]: value });
                if (!current()) return;
                if (result.ok) {
                    state[field] = value;
                    setMessage(autosaveMessage, `${field[0].toUpperCase() + field.slice(1)} saved.`, "success");
                } else {
                    select.value = state[field];
                    if (field === "color") {
                        select.closest(".color-control").dataset.color = state.color;
                        form.dataset.color = state.color;
                    }
                    setMessage(autosaveMessage, result.data?.error || `Unable to save ${field}. Please try again.`);
                }
            }));
        });
    }

    form.addEventListener("submit", async event => {
        event.preventDefault();
        if (!canEdit || navigatingBack || saveButton.disabled || deleteButton.disabled) return;
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
            content.querySelector(".task-heading-title").textContent = title;
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
        if (navigatingBack || deleteButton.disabled || saveButton.disabled) return;
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

    const backButton = content.querySelector("#back-task-button");
    backButton.addEventListener("click", async () => {
        if (navigatingBack) return;
        navigatingBack = true;
        // Finish pending saves before loading the board, keeping the queue closed.
        content.inert = true;
        try {
            await withBusy(backButton, async () => {
                await mutationQueue;
                if (current()) await navigation.renderProject(project, workspace);
            });
        } finally {
            content.inert = false;
            navigatingBack = false;
        }
    });
}
