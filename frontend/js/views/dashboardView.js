import { createWorkspace, getWorkspaceById, getWorkspacesMembers } from "../workspaces.js";

const roles = { owner: "Owner", admin: "Admin", member: "Member", guest: "Guest" };

export async function renderDashboard(user, navigation) {
    const { content, workspaces, workspacesError } = navigation;
    const current = () => content.isConnected && navigation.isCurrent();
    user = navigation.user;
    content.innerHTML = `
        <header class="page-heading">
            <h1>Your workspaces</h1>
            <div class="email-copy">
                <span id="user-email" class="secondary-text">${escapeHTML(user.email)}</span>
                <button id="copy-email-button" type="button" class="btn-quiet">Copy email</button>
            </div>
        </header>
        <form id="create-workspace-form" class="inline-form">
            <div class="field field-wide">
                <label for="workspace-name-input">Workspace name</label>
                <input id="workspace-name-input" name="name" type="text" placeholder="Enter a workspace name" maxlength="50" required>
            </div>
            <button type="submit" class="btn-primary">Create</button>
        </form>
        <p id="workspace-message" class="form-message" role="alert" hidden></p>
        <div class="workspace-listing">
            <div class="list-heading"><span>Name</span><span>Your role</span></div>
            <div id="workspace-cards" class="item-list"></div>
        </div>`;

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

    const copy = content.querySelector("#copy-email-button");
    copy.addEventListener("click", () => withBusy(copy, async () => {
        try {
            await navigator.clipboard.writeText(user.email);
            if (!current()) return;
            copy.textContent = "Copied!";
            window.setTimeout(() => { if (copy.isConnected) copy.textContent = "Copy email"; }, 1500);
        } catch {
            setMessage(message, "Could not copy the email. You can select and copy it manually.");
        }
    }));

    const list = content.querySelector("#workspace-cards");
    if (workspacesError) {
        setMessage(message, workspacesError);
        content.querySelector(".workspace-listing").hidden = true;
    } else if (!workspaces.length) {
        list.innerHTML = '<p class="empty-state">No workspaces yet. Create one to get started.</p>';
    }
    for (const workspace of workspaces) {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "item-row workspace-row";
        row.innerHTML = `<img class="icon icon-folder" src="./assets/icons/folder.svg" width="20" height="20" alt="" aria-hidden="true"><span class="item-name">${escapeHTML(workspace.name)}</span>
            <span class="item-detail"></span><img class="icon icon-chevron" src="./assets/icons/chevron.svg" width="16" height="16" alt="" aria-hidden="true">`;
        row.addEventListener("click", () => withBusy(row, async () => {
            setMessage(message);
            const result = await getWorkspaceById(workspace.id);
            if (!current()) return;
            if (result.ok) await navigation.renderWorkspace(result.data);
            else setMessage(message, result.data.error);
        }));
        list.appendChild(row);
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
