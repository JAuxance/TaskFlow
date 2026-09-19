import { createWorkspace, getWorkspaceById, getWorkspacesMembers } from "../workspaces.js";
import { apiAssetUrl } from "../api.js";
import { getProjects } from "../projects.js";
import { getTasks, getTaskById, TASK_COLORS } from "../task.js";

const roles = { owner: "Owner", admin: "Admin", member: "Member", guest: "Guest" };

export async function renderDashboard(user, navigation) {
    const { content, workspaces, workspacesError } = navigation;
    const current = () => content.isConnected && navigation.isCurrent();
    user = navigation.user;
    content.innerHTML = `
        <header class="page-heading page-heading-row">
            <div class="header-actions"><button id="new-workspace-button" type="button" class="btn-primary">+ New workspace</button></div>
        </header>
        <section class="page-section" aria-labelledby="workspaces-heading">
            <div class="overview-toolbar">
                <div class="section-heading"><h2 id="workspaces-heading">All workspaces</h2><span class="count-badge">${workspacesError ? "—" : workspaces.length}</span><span class="overview-total"><span id="overview-task-count">—</span> tasks</span></div>
                <div class="overview-filter"><label for="overview-status-filter">Status</label><select id="overview-status-filter"><option value="active">All unfinished</option><option value="all">All tasks</option><option value="todo">To do</option><option value="in_progress">In progress</option><option value="review">In review</option><option value="done">Done</option></select></div>
            </div>
            <p id="workspace-list-message" class="form-message" role="alert" hidden></p>
            <div class="overview-feedback"><p id="overview-message" class="form-message" role="status" hidden></p><button id="retry-overview-button" class="btn-secondary" type="button" hidden>Retry</button></div>
            <div id="overview-tasks" aria-busy="true"><div id="workspace-cards" class="workspace-grid workspace-binders"></div></div>
        </section>
        <dialog id="create-workspace-dialog" class="app-dialog" aria-labelledby="create-workspace-title">
            <div class="dialog-header"><h2 id="create-workspace-title">New workspace</h2><button type="button" class="dialog-close" aria-label="Close">×</button></div>
            <form id="create-workspace-form" class="dialog-body">
                <p class="secondary-text">Create a space for your team and its projects.</p>
                <div class="field">
                    <label for="workspace-name-input">Workspace name</label>
                    <input id="workspace-name-input" name="name" type="text" placeholder="e.g. Design studio" maxlength="50" required autofocus>
                </div>
                <p id="workspace-message" class="form-message" role="alert" hidden></p>
                <div class="dialog-actions"><button type="button" class="btn-secondary" id="cancel-workspace-button">Cancel</button><button type="submit" class="btn-primary">Create workspace</button></div>
            </form>
        </dialog>`;

    const dialog = content.querySelector("#create-workspace-dialog");
    content.querySelector("#new-workspace-button").addEventListener("click", () => dialog.showModal());
    const closeDialog = () => { if (!dialog.querySelector('[aria-busy="true"]')) dialog.close(); };
    dialog.querySelector(".dialog-close").addEventListener("click", closeDialog);
    content.querySelector("#cancel-workspace-button").addEventListener("click", closeDialog);
    dialog.addEventListener("cancel", event => {
        if (dialog.querySelector('[aria-busy="true"]')) event.preventDefault();
    });
    const message = content.querySelector("#workspace-message");
    const form = content.querySelector("#create-workspace-form");
    const submit = form.querySelector('button[type="submit"]');
    form.addEventListener("submit", event => {
        event.preventDefault();
        if (submit.disabled) return;
        const name = form.elements.name.value.trim();
        if (!name) return setMessage(message, "Enter a workspace name.");
        withBusy(submit, async () => {
            setMessage(message);
            const result = await createWorkspace(name);
            if (!current()) return;
            if (result.ok) await navigation.renderApp(user);
            else setMessage(message, result.data.error);
        });
    });

    const list = content.querySelector("#workspace-cards");
    const listMessage = content.querySelector("#workspace-list-message");
    if (workspacesError) {
        setMessage(listMessage, workspacesError);
    } else if (!workspaces.length) {
        list.innerHTML = '<div class="empty-state empty-state-panel"><h3>Your next project starts here</h3><p>Create a workspace to bring your team and tasks together.</p><button type="button" class="btn-secondary">Create a workspace</button></div>';
        list.querySelector("button").addEventListener("click", () => dialog.showModal());
    }
    const workspaceViews = new Map();
    for (const workspace of workspaces) {
        const binder = document.createElement("article");
        binder.className = "workspace-binder";
        binder.dataset.workspaceId = workspace.id;
        binder.setAttribute("aria-labelledby", `workspace-title-${workspace.id}`);
        const row = document.createElement("button");
        row.type = "button";
        row.className = "workspace-card workspace-row";
        const color = ["gray", "blue", "green", "yellow", "orange", "red", "purple"].includes(workspace.color) ? workspace.color : "gray";
        binder.dataset.color = color;
        row.innerHTML = `<span class="workspace-card-heading"><span class="workspace-icon workspace-icon-large" data-color="${color}" aria-hidden="true"></span><span class="item-name" id="workspace-title-${workspace.id}">${escapeHTML(workspace.name)}</span></span>
            <span class="workspace-card-footer"><span class="item-detail role-badge"></span><span class="card-link">Open workspace <img class="icon icon-chevron" src="./assets/icons/chevron.svg" width="16" height="16" alt="" aria-hidden="true"></span></span>`;
        const icon = row.querySelector(".workspace-icon");
        if (workspace.icon_type === "emoji" && workspace.icon_value) icon.textContent = workspace.icon_value;
        else {
            const image = document.createElement("img");
            image.alt = "";
            image.onerror = () => { image.onerror = null; image.src = "./assets/icons/folder.svg"; };
            image.src = workspace.icon_type === "image" && apiAssetUrl(workspace.icon_value) || "./assets/icons/folder.svg";
            icon.appendChild(image);
        }
        row.addEventListener("click", () => withBusy(row, async () => {
            setMessage(listMessage);
            const result = await getWorkspaceById(workspace.id);
            if (!current()) return;
            if (result.ok) await navigation.renderWorkspace(result.data);
            else setMessage(listMessage, result.data.error);
        }));
        binder.appendChild(row);
        const body = document.createElement("div");
        body.className = "binder-content";
        body.innerHTML = '<div class="binder-tasks-heading"><h3>Tasks</h3><span class="count-badge binder-task-count">—</span></div><div class="binder-projects"></div>';
        binder.appendChild(body);
        list.appendChild(binder);
        workspaceViews.set(String(workspace.id), {
            projects: body.querySelector(".binder-projects"), count: body.querySelector(".binder-task-count")
        });
        const roleLabel = row.querySelector(".item-detail");
        if (Number(workspace.owner_id) === Number(user.id)) roleLabel.textContent = "Owner";
        else {
            // Workspace summaries do not include the current member's role.
            // Resolve it from the existing membership endpoint, never invent it.
            roleLabel.textContent = "…";
            getWorkspacesMembers(workspace.id).then(result => {
                if (!row.isConnected || !current()) return;
                const member = result.ok && result.data.find(item => Number(item.user_id) === Number(user.id));
                roleLabel.textContent = member ? roles[member.role] || member.role : "—";
                if (!result.ok) roleLabel.title = "Role unavailable";
            });
        }
    }

    const taskList = content.querySelector("#overview-tasks");
    const taskCount = content.querySelector("#overview-task-count");
    const taskMessage = content.querySelector("#overview-message");
    const statusFilter = content.querySelector("#overview-status-filter");
    const retryButton = content.querySelector("#retry-overview-button");
    const priorities = { urgent: "Urgent", high: "High", medium: "Medium", low: "Low" };
    const statuses = { todo: "To do", in_progress: "In progress", review: "In review", done: "Done" };
    let overviewTasks = [];
    let overviewProjects = [];
    const failedWorkspaces = new Set();
    const failedProjects = new Set();
    let incomplete = false;
    let loading = true;
    let overviewVersion = 0;

    function emptyMessage() {
        if (statusFilter.value === "active") return "No unfinished tasks in this project.";
        if (statusFilter.value === "all") return "No tasks in this project yet.";
        return `No tasks with status “${statuses[statusFilter.value]}”.`;
    }

    function displayTasks() {
        const matching = overviewTasks.filter(({ task }) => statusFilter.value === "all"
            || (statusFilter.value === "active" ? task.status !== "done" : task.status === statusFilter.value));
        taskList.setAttribute("aria-busy", String(loading));
        taskCount.textContent = loading ? "—" : `${matching.length}${incomplete ? "+" : ""}`;
        for (const workspace of workspaces) {
            const view = workspaceViews.get(String(workspace.id));
            const projects = overviewProjects.filter(entry => String(entry.workspace.id) === String(workspace.id));
            const count = matching.filter(entry => String(entry.workspace.id) === String(workspace.id)).length;
            const unavailable = failedWorkspaces.has(String(workspace.id));
            const partial = projects.some(({ project }) => failedProjects.has(String(project.id)));
            view.count.textContent = loading || unavailable ? "—" : `${count}${partial ? "+" : ""}`;
            view.projects.replaceChildren();
            if (loading || unavailable || !projects.length) {
                const message = document.createElement("p");
                message.className = "binder-message";
                message.setAttribute("role", "status");
                message.textContent = loading ? "Loading projects and tasks…" : unavailable
                    ? "Projects could not be loaded. Retry to see this workspace's tasks." : "No projects in this workspace yet.";
                view.projects.appendChild(message);
                continue;
            }
            for (const { project } of projects) {
                const tasks = matching.filter(entry => String(entry.workspace.id) === String(workspace.id)
                    && String(entry.project.id) === String(project.id));
                const unavailable = failedProjects.has(String(project.id));
                const section = document.createElement("section");
                section.className = "binder-project";
                section.dataset.projectId = project.id;
                const headingId = `binder-project-${workspace.id}-${project.id}`;
                section.setAttribute("aria-labelledby", headingId);
                section.innerHTML = `<div class="binder-project-heading"><img class="icon icon-folder" src="./assets/icons/folder.svg" width="16" height="16" alt=""><h4 id="${headingId}">${escapeHTML(project.name)}</h4><span class="binder-project-count">${unavailable ? "—" : tasks.length}</span></div>`;
                if (unavailable || !tasks.length) {
                    const message = document.createElement("p");
                    message.className = "binder-project-message";
                    message.textContent = unavailable ? "Tasks could not be loaded. Retry to load this project." : emptyMessage();
                    section.appendChild(message);
                } else {
                    const rows = document.createElement("div");
                    rows.className = "overview-task-list";
                    rows.setAttribute("role", "list");
                    for (const entry of tasks) rows.appendChild(taskRow(entry, headingId));
                    section.appendChild(rows);
                }
                view.projects.appendChild(section);
            }
        }
    }

    function taskRow({ task, project, workspace }, headingId) {
        const item = document.createElement("div");
        item.setAttribute("role", "listitem");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "overview-task-row";
        button.dataset.taskId = task.id;
        button.dataset.color = Object.hasOwn(TASK_COLORS, task.color) ? task.color : "gray";
        button.setAttribute("aria-describedby", `workspace-title-${workspace.id} ${headingId}`);
        const due = task.due_date ? new Date(task.due_date) : null;
        const dueLabel = due && !Number.isNaN(due.getTime())
            ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(due) : "";
        button.innerHTML = `
            <span class="overview-task-main"><span class="overview-task-title">${escapeHTML(task.title)}</span><img class="icon icon-chevron" src="./assets/icons/chevron.svg" width="16" height="16" alt="" aria-hidden="true"></span>
            <span class="overview-task-meta"><span class="task-status" data-status="${task.status}">${statuses[task.status]}</span><span class="overview-priority">${escapeHTML(priorities[task.priority] || task.priority)} priority</span>${dueLabel ? `<time class="overview-due" datetime="${escapeHTML(task.due_date)}">Due ${escapeHTML(dueLabel)}</time>` : '<span class="overview-due">No due date</span>'}</span>`;
        button.addEventListener("click", () => withBusy(button, async () => {
            const result = await getTaskById(task.id);
            if (!current()) return;
            if (result.ok) await navigation.renderTask(result.data, project, workspace);
            else setMessage(taskMessage, result.data.error);
        }));
        item.appendChild(button);
        return item;
    }

    async function loadOverview() {
        const version = ++overviewVersion;
        const isLatest = () => current() && version === overviewVersion;
        loading = true;
        incomplete = Boolean(workspacesError);
        overviewTasks = [];
        overviewProjects = [];
        failedWorkspaces.clear();
        failedProjects.clear();
        retryButton.hidden = true;
        setMessage(taskMessage);
        displayTasks();
        const projects = [];
        // Limit simultaneous requests while using the existing paginated endpoints.
        for (let start = 0; start < workspaces.length; start += 4) {
            const results = await Promise.all(workspaces.slice(start, start + 4).map(async workspace => ({
                workspace, result: await getProjects(workspace.id)
            })));
            if (!isLatest()) return;
            for (const { workspace, result } of results) {
                if (!result.ok) { incomplete = true; failedWorkspaces.add(String(workspace.id)); continue; }
                for (const project of result.data) projects.push({ workspace, project });
            }
        }
        overviewProjects = projects;
        for (let start = 0; start < projects.length; start += 4) {
            const results = await Promise.all(projects.slice(start, start + 4).map(async entry => ({
                ...entry, result: await getTasks(entry.project.id)
            })));
            if (!isLatest()) return;
            for (const { workspace, project, result } of results) {
                if (!result.ok) { incomplete = true; failedProjects.add(String(project.id)); continue; }
                for (const task of result.data) {
                    if (Object.hasOwn(statuses, task.status)) overviewTasks.push({ task, project, workspace });
                }
            }
        }
        if (!isLatest()) return;
        // Soonest deadlines first; undated tasks keep a stable alphabetical order.
        overviewTasks.sort((a, b) => {
            const aDue = Date.parse(a.task.due_date);
            const bDue = Date.parse(b.task.due_date);
            return (Number.isNaN(aDue) ? Infinity : aDue) - (Number.isNaN(bDue) ? Infinity : bDue)
                || a.task.title.localeCompare(b.task.title);
        });
        loading = false;
        retryButton.hidden = !incomplete;
        if (incomplete) setMessage(taskMessage, "Some projects or tasks could not be loaded. The list and count may be incomplete.");
        displayTasks();
    }
    statusFilter.addEventListener("change", displayTasks);
    retryButton.addEventListener("click", () => workspacesError ? navigation.renderApp(user) : loadOverview());
    loadOverview();
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
