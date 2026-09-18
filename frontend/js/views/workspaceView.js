import {
    addWorkspaceMember,
    updateWorkspaceMemberRole,
    deleteWorkspaceMember,
    updateWorkspace,
    deleteWorkspace,
} from "../workspaces.js";
import { getProjects, createProject, getProjectById } from "../projects.js";

const roleLabels = {
    owner: "Owner",
    admin: "Admin",
    member: "Member",
    guest: "Guest",
};

export async function renderWorkspace(workspace, navigation) {

    const { content, user, members, membersError, role, isOwner } = navigation;
    const current = () => content.isConnected && navigation.isCurrent();
    const canManage = isOwner || role === "owner" || role === "admin";
    const allowedRoles = isOwner
        ? ["member", "guest", "admin", "owner"]
        : role === "owner" ? ["member", "guest", "admin"] : ["member", "guest"];
    const roleOptions = allowedRoles
        .map(value => `<option value="${value}">${roleLabels[value]}</option>`)
        .join("");

    content.innerHTML = `
        <header class="page-heading"><h1>${escapeHTML(workspace.name)}</h1></header>

        <form id="workspace-settings-form" class="inline-form workspace-settings">
            <div class="field field-wide">
                <label for="workspace-name">Workspace name</label>
                <input id="workspace-name" name="name" type="text" maxlength="50"
                    value="${escapeHTML(workspace.name)}" required ${canManage ? "" : "readonly"}>
            </div>
            ${canManage ? '<button id="save-workspace-button" type="submit" class="btn-primary">Save</button>' : ""}
            ${isOwner ? '<button id="delete-workspace-button" type="button" class="btn-danger form-actions-end">Delete workspace</button>' : ""}
        </form>
        <p id="workspace-message" class="form-message" role="status" hidden></p>

        <section class="page-section" aria-labelledby="projects-heading">
            <div class="section-heading"><h2 id="projects-heading">Projects</h2></div>
            ${canManage ? `
                <form id="create-project-form" class="inline-form">
                    <div class="field field-wide">
                        <label for="project-name-input">Project name</label>
                        <input id="project-name-input" name="name" type="text"
                            placeholder="Enter a project name" maxlength="50" required>
                    </div>
                    <button type="submit" class="btn-primary">Create</button>
                </form>
            ` : ""}
            <p id="project-message" class="form-message" role="status" hidden></p>
            <div id="projects-list" class="item-list" aria-busy="true">
                <p class="empty-state" role="status">Loading projects…</p>
            </div>
        </section>

        <section class="page-section" aria-labelledby="members-heading">
            <div class="section-heading"><h2 id="members-heading">Members</h2></div>
            ${canManage ? `
                <p class="section-description">Add an existing TaskFlow user to this workspace.</p>
                <form id="add-member-form" class="inline-form">
                    <div class="field field-wide">
                        <label for="member-email">Email</label>
                        <input id="member-email" name="email" type="email"
                            placeholder="name@example.com" autocomplete="email" maxlength="255" required>
                    </div>
                    <div class="field field-role">
                        <label for="member-role">Role</label>
                        <select id="member-role" name="role">${roleOptions}</select>
                    </div>
                    <button type="submit" class="btn-primary">Add</button>
                </form>
            ` : ""}
            <p id="member-message" class="form-message" role="status" hidden></p>
            <div id="members-list" class="table-scroll"></div>
        </section>
    `;

    const workspaceMessage = content.querySelector("#workspace-message");
    const projectMessage = content.querySelector("#project-message");
    const memberMessage = content.querySelector("#member-message");
    const settingsForm = content.querySelector("#workspace-settings-form");

    settingsForm.addEventListener("submit", async event => {
        event.preventDefault();
        if (!canManage) return;
        const name = content.querySelector("#workspace-name").value.trim();
        if (!name) {
            setMessage(workspaceMessage, "Enter a workspace name.");
            return;
        }
        await withBusy(content.querySelector("#save-workspace-button"), async () => {
            setMessage(workspaceMessage, "");
            const result = await updateWorkspace(workspace.id, { name });
            if (!current()) return;
            if (result.ok) {
                await navigation.renderWorkspace(result.data);
            } else {
                setMessage(workspaceMessage, result.data?.error || "Could not save the workspace.");
            }
        });
    });

    content.querySelector("#delete-workspace-button")?.addEventListener("click", async event => {
        const confirmation = window.prompt(
            `To permanently delete this workspace and its projects and tasks, type its name exactly: ${workspace.name}`
        );
        if (confirmation === null) return;
        if (confirmation !== workspace.name) {
            setMessage(workspaceMessage, "The name does not match. Workspace deletion cancelled.");
            return;
        }
        await withBusy(event.currentTarget, async () => {
            setMessage(workspaceMessage, "");
            const result = await deleteWorkspace(workspace.id);
            if (!current()) return;
            if (result.ok) {
                await navigation.renderApp(user);
            } else {
                setMessage(workspaceMessage, result.data?.error || "Could not delete the workspace.");
            }
        });
    });

    content.querySelector("#create-project-form")?.addEventListener("submit", async event => {
        event.preventDefault();
        const name = content.querySelector("#project-name-input").value.trim();
        if (!name) {
            setMessage(projectMessage, "Enter a project name.");
            return;
        }
        await withBusy(event.currentTarget.querySelector("button[type=submit]"), async () => {
            setMessage(projectMessage, "");
            const result = await createProject(workspace.id, name);
            if (!current()) return;
            if (result.ok) {
                await navigation.renderWorkspace(workspace);
            } else {
                setMessage(projectMessage, result.data?.error || "Could not create the project.");
            }
        });
    });

    content.querySelector("#add-member-form")?.addEventListener("submit", async event => {
        event.preventDefault();
        const email = content.querySelector("#member-email").value.trim();
        const newRole = content.querySelector("#member-role").value;
        await withBusy(event.currentTarget.querySelector("button[type=submit]"), async () => {
            setMessage(memberMessage, "");
            const result = await addWorkspaceMember(workspace.id, email, newRole);
            if (!current()) return;
            if (result.ok) {
                await navigation.renderWorkspace(workspace);
            } else {
                setMessage(memberMessage, result.data?.error || "Could not add this member.");
            }
        });
    });

    const membersList = content.querySelector("#members-list");
    if (!Array.isArray(members)) {
        setMessage(memberMessage, membersError || "Could not load workspace members.");
    } else if (members.length === 0) {
        membersList.innerHTML = '<p class="empty-state">No members in this workspace.</p>';
    } else {
        membersList.innerHTML = `
            <table class="member-table">
                <thead><tr>
                    <th scope="col">Name</th><th scope="col">Email</th>
                    <th scope="col">Role</th><th scope="col">Actions</th>
                </tr></thead>
                <tbody></tbody>
            </table>
        `;
        const body = membersList.querySelector("tbody");
        for (const member of members) {
            const primaryOwner = String(member.user_id) === String(workspace.owner_id);
            const canManageMember = canManage && !primaryOwner
                && (isOwner || member.role !== "owner")
                && (role !== "admin" || ["member", "guest"].includes(member.role));
            const ownMembership = String(member.user_id) === String(user.id);
            const memberName = `${member.user_name}${ownMembership ? " (you)" : ""}`;
            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${escapeHTML(memberName)}</td>
                <td class="member-email">${escapeHTML(member.user_email)}</td>
                <td>${canManageMember ? `
                    <select class="member-role-select" aria-label="Role for ${escapeHTML(member.user_name)}">
                        ${roleOptions}
                    </select>
                ` : escapeHTML(roleLabels[member.role] || member.role)}</td>
                <td>${canManageMember ? `
                    <button type="button" class="btn-quiet btn-danger-quiet delete-member-button"
                        aria-label="Remove ${escapeHTML(member.user_name)} from workspace">Remove</button>
                ` : '<span aria-label="No available actions">—</span>'}</td>
            `;
            body.appendChild(row);
            if (!canManageMember) continue;

            const roleSelect = row.querySelector(".member-role-select");
            const removeButton = row.querySelector(".delete-member-button");
            roleSelect.value = member.role;
            roleSelect.addEventListener("change", async () => {
                const previousRole = member.role;
                const newRole = roleSelect.value;
                roleSelect.disabled = true;
                removeButton.disabled = true;
                setMessage(memberMessage, "");
                try {
                    const result = await updateWorkspaceMemberRole(workspace.id, member.user_id, newRole);
                    if (!current()) return;
                    if (result.ok) {
                        member.role = newRole;
                        setMessage(memberMessage, `Role updated for ${member.user_name}.`, "success");
                    } else {
                        roleSelect.value = previousRole;
                        setMessage(memberMessage, result.data?.error || "Could not update this member's role.");
                    }
                } finally {
                    roleSelect.disabled = false;
                    removeButton.disabled = false;
                }
            });

            removeButton.addEventListener("click", async () => {
                if (!window.confirm(`Remove ${member.user_name} from this workspace?`)) return;
                await withBusy(removeButton, async () => {
                    roleSelect.disabled = true;
                    setMessage(memberMessage, "");
                    try {
                        const result = await deleteWorkspaceMember(workspace.id, member.user_id);
                        if (!current()) return;
                        if (result.ok) {
                            await navigation.renderWorkspace(workspace);
                        } else {
                            setMessage(memberMessage, result.data?.error || "Could not remove this member.");
                        }
                    } finally {
                        roleSelect.disabled = false;
                    }
                });
            });
        }
    }

    const projectsResult = await getProjects(workspace.id);
    if (!current()) return;
    const projectsList = content.querySelector("#projects-list");
    projectsList.setAttribute("aria-busy", "false");
    projectsList.replaceChildren();
    if (!projectsResult.ok) {
        setMessage(projectMessage, projectsResult.data?.error || "Could not load projects.");
        return;
    }
    if (projectsResult.data.length === 0) {
        projectsList.innerHTML = '<p class="empty-state">No projects yet.</p>';
        return;
    }
    for (const project of projectsResult.data) {
        const projectButton = document.createElement("button");
        projectButton.type = "button";
        projectButton.className = "item-row";
        projectButton.innerHTML = `<img class="icon icon-folder" src="./assets/icons/folder.svg" width="20" height="20" alt="" aria-hidden="true"><span class="item-name">${escapeHTML(project.name)}</span><img class="icon icon-chevron" src="./assets/icons/chevron.svg" width="16" height="16" alt="" aria-hidden="true">`;
        projectButton.addEventListener("click", async () => {
            await withBusy(projectButton, async () => {
                setMessage(projectMessage, "");
                const result = await getProjectById(project.id);
                if (!current()) return;
                if (result.ok) {
                    await navigation.renderProject(result.data, workspace);
                } else {
                    setMessage(projectMessage, result.data?.error || "Could not open this project.");
                }
            });
        });
        projectsList.appendChild(projectButton);
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
