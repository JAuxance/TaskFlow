import {
    addWorkspaceMember,
    updateWorkspaceMemberRole,
    deleteWorkspaceMember,
    updateWorkspace,
    deleteWorkspace,
    updateWorkspaceEmoji,
    uploadWorkspaceIcon,
    transferWorkspaceOwner,
} from "../workspaces.js";
import { getProjects, createProject, getProjectById } from "../projects.js";
import { getTasks, getTaskById, TASK_COLORS } from "../task.js";
import { apiAssetUrl } from "../api.js";

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
    const colors = ["gray", "blue", "green", "yellow", "orange", "red", "purple"];
    const color = colors.includes(workspace.color) ? workspace.color : "gray";
    const imageUrl = workspace.icon_type === "image" ? apiAssetUrl(workspace.icon_value) : "";
    const icon = workspace.icon_type === "emoji" && workspace.icon_value
        ? `<span class="workspace-icon workspace-icon-large" data-color="${color}" aria-hidden="true">${escapeHTML(workspace.icon_value)}</span>`
        : `<img class="workspace-icon workspace-icon-large" data-color="${color}" src="${escapeHTML(imageUrl || "./assets/icons/folder.svg")}" width="48" height="48" alt="">`;

    const tabs = canManage ? ["projects", "members", "settings"] : ["projects", "members"];
    let activeTab = tabs.includes(navigation.initialTab) ? navigation.initialTab : "projects";

    content.innerHTML = `
        <header class="page-heading page-heading-row">
            <div class="workspace-title-row">
                ${icon}
                <div class="heading-copy">
                    <h1>${escapeHTML(workspace.name)}</h1>
                </div>
                <span class="role-badge">${escapeHTML(roleLabels[role] || role || "Role unavailable")}</span>
            </div>
            ${canManage ? `
                <div class="header-actions">
                    <button id="open-create-project-button" type="button" class="btn-primary">New project</button>
                    <button id="open-add-member-button" type="button" class="btn-primary" hidden>Add member</button>
                </div>
            ` : ""}
        </header>

        <div class="page-tabs" role="tablist" aria-label="Workspace sections">
            <button id="tab-projects" class="page-tab" type="button" role="tab" aria-controls="panel-projects">Overview</button>
            <button id="tab-members" class="page-tab" type="button" role="tab" aria-controls="panel-members">Members <span class="tab-count">${Array.isArray(members) ? members.length : "—"}</span></button>
            ${canManage ? '<button id="tab-settings" class="page-tab" type="button" role="tab" aria-controls="panel-settings">Settings</button>' : ""}
        </div>

        <section id="panel-projects" class="tab-panel" role="tabpanel" aria-labelledby="tab-projects" tabindex="0" data-color="${color}">
            <div class="workspace-summary" aria-label="Workspace totals">
                <div class="workspace-stat"><span>Projects</span><strong id="workspace-project-count">—</strong></div>
                <div class="workspace-stat"><span>Open tasks</span><strong id="workspace-open-count">—</strong></div>
                <div class="workspace-stat"><span>Overdue</span><strong id="workspace-overdue-count">—</strong></div>
            </div>
            <div class="workspace-overview">
                <section class="workspace-projects" aria-labelledby="workspace-projects-heading">
                    <div class="section-heading"><h2 id="workspace-projects-heading">Projects</h2></div>
                    <p id="project-message" class="form-message" role="status" hidden></p>
                    <div id="projects-list" class="workspace-project-list" aria-busy="true">
                        <p class="empty-state" role="status">Loading projects…</p>
                    </div>
                </section>
                <section class="workspace-focus" aria-labelledby="workspace-focus-heading">
                    <div class="section-heading"><div><h2 id="workspace-focus-heading">Tasks to focus on</h2><p class="section-description">Upcoming work across this workspace.</p></div></div>
                    <div class="field workspace-task-filter-field">
                        <label for="workspace-task-filter">Show tasks</label>
                        <select id="workspace-task-filter">
                            <option value="active">All unfinished</option>
                            <option value="overdue">Overdue</option>
                            <option value="in_progress">In progress</option>
                            <option value="review">In review</option>
                            <option value="todo">To do</option>
                        </select>
                    </div>
                    <p id="workspace-task-message" class="form-message" role="status" hidden></p>
                    <button id="retry-workspace-tasks" class="btn-secondary" type="button" hidden>Retry loading tasks</button>
                    <div id="workspace-focus-list" class="workspace-focus-list" role="list" aria-busy="true"><p class="empty-state" role="status">Loading tasks…</p></div>
                    <button id="show-more-workspace-tasks" class="btn-secondary" type="button" hidden>Show more</button>
                </section>
            </div>
        </section>

        <section id="panel-members" class="tab-panel" role="tabpanel" aria-labelledby="tab-members" tabindex="0" hidden>
            <div class="section-heading">
                <div><h2>Members</h2><p class="section-description">See who has access to this workspace${canManage ? " and manage their roles" : ""}.</p></div>
            </div>
            <p id="member-message" class="form-message" role="status" hidden></p>
            <div id="members-list" class="table-scroll"></div>
        </section>

        ${canManage ? `
            <section id="panel-settings" class="tab-panel settings-panel" role="tabpanel" aria-labelledby="tab-settings" tabindex="0" hidden>
                <div class="section-heading">
                    <div><h2>Workspace settings</h2><p class="section-description">Manage this workspace's identity and ownership.</p></div>
                </div>
                <div class="settings-stack">
                    <section class="settings-card" aria-labelledby="workspace-general-heading">
                        <div class="settings-card-heading"><h3 id="workspace-general-heading">General</h3><p class="section-description">A clear name helps your team find the right workspace.</p></div>
                        <form id="workspace-settings-form" class="inline-form workspace-settings">
                            <div class="field field-wide">
                                <label for="workspace-name">Workspace name</label>
                                <input id="workspace-name" name="name" type="text" maxlength="50" value="${escapeHTML(workspace.name)}" required>
                            </div>
                            <button id="save-workspace-button" type="submit" class="btn-primary">Save name</button>
                        </form>
                        <p id="workspace-message" class="form-message" role="status" hidden></p>
                    </section>

                    <section class="settings-card workspace-customization" aria-labelledby="workspace-icon-heading">
                        <div class="settings-card-heading"><h3 id="workspace-icon-heading">Workspace icon</h3><p class="section-description">Choose an emoji or upload an image to recognize this workspace at a glance.</p></div>
                        <div class="customization-grid">
                            <form id="workspace-emoji-form" class="settings-form">
                                <div class="field">
                                    <label for="workspace-emoji">Emoji</label>
                                    <input id="workspace-emoji" name="emoji" type="text" maxlength="32" placeholder="🚀"
                                        value="${escapeHTML(workspace.icon_type === "emoji" ? workspace.icon_value : "")}" required>
                                </div>
                                <button type="submit" class="btn-secondary">Use emoji</button>
                            </form>
                            <form id="workspace-icon-form" class="settings-form">
                                <div class="field">
                                    <label for="workspace-icon-file">Image</label>
                                    <input id="workspace-icon-file" class="image-upload-input" name="icon" type="file"
                                        accept="image/*" aria-describedby="workspace-icon-help" required>
                                    <p id="workspace-icon-help" class="field-hint">JPG, PNG or WebP, up to 5 MB. Replaces the current icon.</p>
                                </div>
                                <button type="submit" class="btn-secondary">Upload image</button>
                            </form>
                        </div>
                        <p id="workspace-icon-message" class="form-message" role="status" hidden></p>
                    </section>

                    ${isOwner ? `
                        <section class="settings-card danger-zone" aria-labelledby="workspace-ownership-heading">
                            <div class="settings-card-heading"><h3 id="workspace-ownership-heading">Ownership and deletion</h3><p class="section-description">Only the primary owner can make these changes.</p></div>
                            <div class="danger-action workspace-transfer">
                                <h4>Transfer primary ownership</h4>
                                <p class="section-description">Another owner will manage ownership and workspace deletion. You will keep the Owner role.</p>
                                <form id="owner-transfer-form" class="inline-form">
                                    <div class="field field-wide">
                                        <label for="owner-transfer-select">New primary owner</label>
                                        <select id="owner-transfer-select" required></select>
                                    </div>
                                    <button type="submit" class="btn-secondary">Transfer ownership</button>
                                </form>
                                <p id="owner-transfer-help" class="field-hint"></p>
                                <p id="owner-transfer-message" class="form-message" role="status" hidden></p>
                            </div>
                            <div class="danger-action">
                                <div><h4>Delete workspace</h4><p class="section-description">Permanently delete this workspace, its projects and all their tasks.</p></div>
                                <button id="delete-workspace-button" type="button" class="btn-danger">Delete workspace</button>
                                <p id="workspace-delete-message" class="form-message" role="status" hidden></p>
                            </div>
                        </section>
                    ` : ""}
                </div>
            </section>

            <dialog id="create-project-dialog" class="app-dialog" aria-labelledby="create-project-heading">
                <div class="dialog-header"><h2 id="create-project-heading">New project</h2><button class="dialog-close" type="button" aria-label="Close">×</button></div>
                <form id="create-project-form" class="dialog-body">
                    <p class="section-description">Create a project in ${escapeHTML(workspace.name)} to organize related tasks.</p>
                    <div class="field">
                        <label for="project-name-input">Project name</label>
                        <input id="project-name-input" name="name" type="text" placeholder="Enter a project name" maxlength="50" required autofocus>
                    </div>
                    <div class="field">
                        <label for="project-description-input">Description <span class="field-hint">(optional)</span></label>
                        <textarea id="project-description-input" name="description" rows="3" placeholder="What is this project about?"></textarea>
                    </div>
                    <p id="create-project-message" class="form-message" role="status" hidden></p>
                    <div class="dialog-actions"><button type="button" class="btn-secondary" data-close-dialog>Cancel</button><button type="submit" class="btn-primary">Create project</button></div>
                </form>
            </dialog>

            <dialog id="add-member-dialog" class="app-dialog" aria-labelledby="add-member-heading">
                <div class="dialog-header"><h2 id="add-member-heading">Add member</h2><button class="dialog-close" type="button" aria-label="Close">×</button></div>
                <form id="add-member-form" class="dialog-body">
                    <p class="section-description">Add an existing TaskFlow user to this workspace.</p>
                    <div class="field">
                        <label for="member-email">Email</label>
                        <input id="member-email" name="email" type="email" placeholder="name@example.com" autocomplete="email" maxlength="255" required autofocus>
                    </div>
                    <div class="field">
                        <label for="member-role">Role</label>
                        <select id="member-role" name="role">${roleOptions}</select>
                    </div>
                    <p id="add-member-message" class="form-message" role="status" hidden></p>
                    <div class="dialog-actions"><button type="button" class="btn-secondary" data-close-dialog>Cancel</button><button type="submit" class="btn-primary">Add member</button></div>
                </form>
            </dialog>
        ` : ""}
    `;

    const tabButtons = [...content.querySelectorAll(".page-tab")];
    function selectTab(tab, focus = false) {
        activeTab = tab;
        tabButtons.forEach(button => {
            const selected = button.id === `tab-${tab}`;
            button.setAttribute("aria-selected", String(selected));
            button.tabIndex = selected ? 0 : -1;
            content.querySelector(`#${button.getAttribute("aria-controls")}`).hidden = !selected;
            if (selected && focus) button.focus();
        });
        const createButton = content.querySelector("#open-create-project-button");
        const memberButton = content.querySelector("#open-add-member-button");
        const headerActions = content.querySelector(".header-actions");
        if (headerActions) headerActions.hidden = tab === "settings";
        if (createButton) createButton.hidden = tab !== "projects";
        if (memberButton) memberButton.hidden = tab !== "members";
    }
    tabButtons.forEach((button, index) => {
        button.addEventListener("click", () => selectTab(tabs[index]));
        button.addEventListener("keydown", event => {
            let nextIndex;
            if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
            if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
            if (event.key === "Home") nextIndex = 0;
            if (event.key === "End") nextIndex = tabs.length - 1;
            if (nextIndex === undefined) return;
            event.preventDefault();
            selectTab(tabs[nextIndex], true);
        });
    });
    selectTab(activeTab);

    for (const [buttonId, dialogId] of [["open-create-project-button", "create-project-dialog"], ["open-add-member-button", "add-member-dialog"]]) {
        const dialog = content.querySelector(`#${dialogId}`);
        if (!dialog) continue;
        content.querySelector(`#${buttonId}`).addEventListener("click", () => dialog.showModal());
        dialog.querySelectorAll(".dialog-close, [data-close-dialog]").forEach(button => {
            button.addEventListener("click", () => {
                if (!dialog.querySelector('[aria-busy="true"]')) dialog.close();
            });
        });
        dialog.addEventListener("cancel", event => {
            if (dialog.querySelector('[aria-busy="true"]')) event.preventDefault();
        });
    }

    const workspaceMessage = content.querySelector("#workspace-message");
    const projectMessage = content.querySelector("#project-message");
    const memberMessage = content.querySelector("#member-message");
    const createProjectMessage = content.querySelector("#create-project-message");
    const addMemberMessage = content.querySelector("#add-member-message");
    const deleteMessage = content.querySelector("#workspace-delete-message");
    const settingsForm = content.querySelector("#workspace-settings-form");
    content.querySelector(".workspace-title-row img")?.addEventListener("error", event => {
        event.currentTarget.src = "./assets/icons/folder.svg";
    }, { once: true });

    const iconMessage = content.querySelector("#workspace-icon-message");
    const iconControls = content.querySelectorAll(".workspace-customization input, .workspace-customization button");
    let iconSaving = false;
    async function saveIcon(action) {
        if (iconSaving) return;
        iconSaving = true;
        iconControls.forEach(control => { control.disabled = true; });
        setMessage(iconMessage, "");
        try {
            const result = await action();
            if (!current()) return;
            if (result.ok) {
                await navigation.renderWorkspace({ ...workspace, ...result.data, id: workspace.id }, activeTab);
            } else {
                setMessage(iconMessage, result.data?.error || "Could not update the workspace icon.");
            }
        } finally {
            iconSaving = false;
            iconControls.forEach(control => { control.disabled = false; });
        }
    }

    content.querySelector("#workspace-emoji-form")?.addEventListener("submit", async event => {
        event.preventDefault();
        const emoji = content.querySelector("#workspace-emoji").value.trim();
        if (!emoji || Array.from(emoji).length > 16) {
            setMessage(iconMessage, "Enter an emoji or a short symbol of up to 16 characters.");
            return;
        }
        await saveIcon(() => updateWorkspaceEmoji(workspace.id, emoji));
    });

    content.querySelector("#workspace-icon-form")?.addEventListener("submit", async event => {
        event.preventDefault();
        const file = content.querySelector("#workspace-icon-file").files[0];
        if (!file || !/\.(jpe?g|png|webp)$/i.test(file.name) || !file.type.startsWith("image/")) {
            setMessage(iconMessage, "Choose a JPG, PNG or WebP image.");
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            setMessage(iconMessage, "Choose an image no larger than 5 MB.");
            return;
        }
        await saveIcon(() => uploadWorkspaceIcon(workspace.id, file));
    });

    const transferForm = content.querySelector("#owner-transfer-form");
    const transferSelect = content.querySelector("#owner-transfer-select");
    function refreshTransferOwners() {
        if (!transferForm) return;
        const previousValue = transferSelect.value;
        const eligible = (members || []).filter(member => member.role === "owner"
            && String(member.user_id) !== String(workspace.owner_id));
        transferSelect.replaceChildren(new Option("Choose an owner", ""));
        eligible.forEach(member => transferSelect.add(new Option(member.user_name || member.user_email, member.user_id)));
        if (eligible.some(member => String(member.user_id) === previousValue)) transferSelect.value = previousValue;
        transferSelect.disabled = eligible.length === 0;
        transferForm.querySelector("button").disabled = eligible.length === 0;
        content.querySelector("#owner-transfer-help").textContent = !Array.isArray(members)
            ? "Load workspace members before transferring ownership."
            : eligible.length ? "" : "Give another member the Owner role in the Members tab to transfer ownership.";
    }
    refreshTransferOwners();
    transferForm?.addEventListener("submit", async event => {
        event.preventDefault();
        const targetId = Number(transferSelect.value);
        const target = members?.find(member => Number(member.user_id) === targetId && member.role === "owner");
        if (!target || targetId === Number(workspace.owner_id)) return;
        if (!window.confirm(`Transfer primary ownership to ${target.user_name}? They will control ownership and workspace deletion.`)) return;
        const message = content.querySelector("#owner-transfer-message");
        await withBusy(transferForm.querySelector("button"), async () => {
            transferSelect.disabled = true;
            setMessage(message, "");
            try {
                const result = await transferWorkspaceOwner(workspace.id, targetId);
                if (!current()) return;
                if (result.ok) {
                    await navigation.renderWorkspace({ ...workspace, ...result.data, id: workspace.id }, activeTab);
                } else {
                    setMessage(message, result.data?.error || "Could not transfer ownership.");
                }
            } finally {
                refreshTransferOwners();
            }
        });
    });

    settingsForm?.addEventListener("submit", async event => {
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
                await navigation.renderWorkspace({ ...workspace, ...result.data, id: workspace.id }, activeTab);
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
            setMessage(deleteMessage, "The name does not match. Workspace deletion cancelled.");
            return;
        }
        await withBusy(event.currentTarget, async () => {
            setMessage(deleteMessage, "");
            const result = await deleteWorkspace(workspace.id);
            if (!current()) return;
            if (result.ok) {
                await navigation.renderApp(user);
            } else {
                setMessage(deleteMessage, result.data?.error || "Could not delete the workspace.");
            }
        });
    });

    content.querySelector("#create-project-form")?.addEventListener("submit", async event => {
        event.preventDefault();
        const button = event.currentTarget.querySelector("button[type=submit]");
        if (button.disabled) return;
        const name = content.querySelector("#project-name-input").value.trim();
        if (!name) {
            setMessage(createProjectMessage, "Enter a project name.");
            return;
        }
        await withBusy(button, async () => {
            setMessage(createProjectMessage, "");
            const result = await createProject(workspace.id, name, content.querySelector("#project-description-input").value.trim());
            if (!current()) return;
            if (result.ok) {
                await navigation.renderWorkspace(workspace, "projects");
            } else {
                setMessage(createProjectMessage, result.data?.error || "Could not create the project.");
            }
        });
    });

    content.querySelector("#add-member-form")?.addEventListener("submit", async event => {
        event.preventDefault();
        const button = event.currentTarget.querySelector("button[type=submit]");
        if (button.disabled) return;
        const email = content.querySelector("#member-email").value.trim();
        const newRole = content.querySelector("#member-role").value;
        await withBusy(button, async () => {
            setMessage(addMemberMessage, "");
            const result = await addWorkspaceMember(workspace.id, email, newRole);
            if (!current()) return;
            if (result.ok) {
                await navigation.renderWorkspace(workspace, "members");
            } else {
                setMessage(addMemberMessage, result.data?.error || "Could not add this member.");
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
            const initial = Array.from(member.user_name || member.user_email || "?")[0].toUpperCase();
            const row = document.createElement("tr");
            row.innerHTML = `
                <td><span class="member-identity"><span class="avatar" aria-hidden="true"><span>${escapeHTML(initial)}</span><img alt="" hidden></span><span class="member-name">${escapeHTML(memberName)}</span></span></td>
                <td class="member-email">${escapeHTML(member.user_email)}</td>
                <td class="member-role-cell" data-label="Role">${canManageMember ? `
                    <select class="member-role-select" aria-label="Role for ${escapeHTML(member.user_name)}">
                        ${roleOptions}
                    </select>
                ` : escapeHTML(roleLabels[member.role] || member.role)}</td>
                <td>${canManageMember ? `
                    <button type="button" class="btn-quiet btn-danger-quiet delete-member-button"
                        aria-label="Remove ${escapeHTML(member.user_name)} from workspace">Remove</button>
                ` : '<span aria-label="No available actions">—</span>'}</td>
            `;
            const avatarUrl = apiAssetUrl(member.avatar_url);
            if (avatarUrl) {
                const image = row.querySelector(".avatar img");
                image.onerror = () => { image.hidden = true; };
                image.src = avatarUrl;
                image.hidden = false;
            }
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
                        if (ownMembership) {
                            await navigation.renderWorkspace(workspace, "members");
                            return;
                        }
                        refreshTransferOwners();
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
                            if (ownMembership) await navigation.renderApp(user);
                            else await navigation.renderWorkspace(workspace, "members");
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
    const taskMessage = content.querySelector("#workspace-task-message");
    const taskFilter = content.querySelector("#workspace-task-filter");
    const focusList = content.querySelector("#workspace-focus-list");
    const retryTasks = content.querySelector("#retry-workspace-tasks");
    const showMore = content.querySelector("#show-more-workspace-tasks");
    projectsList.setAttribute("aria-busy", "false");
    projectsList.replaceChildren();
    if (!projectsResult.ok) {
        setMessage(projectMessage, projectsResult.data?.error || "Could not load projects.");
        focusList.setAttribute("aria-busy", "false");
        focusList.innerHTML = '<p class="empty-state">Tasks are unavailable until projects can be loaded.</p>';
        retryTasks.hidden = false;
        retryTasks.textContent = "Retry loading workspace";
        retryTasks.addEventListener("click", () => withBusy(retryTasks, () => navigation.renderWorkspace(workspace, activeTab)));
        return;
    }

    const projects = projectsResult.data;
    const records = projects.map(project => ({ project, tasks: [], state: "loading", button: null }));
    let loadingTasks = false;
    let visibleTaskCount = 8;
    const statuses = { todo: "To do", in_progress: "In progress", review: "In review" };
    const priorities = { urgent: "Urgent", high: "High", medium: "Medium", low: "Low" };
    const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
    const dateFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
    content.querySelector("#workspace-project-count").textContent = projects.length;

    function updateProjectProgress(record) {
        const progress = record.button.querySelector(".workspace-project-progress");
        if (record.state !== "loaded") {
            progress.innerHTML = `<span class="workspace-project-detail">${record.state === "loading" ? "Loading task progress…" : "Task progress unavailable"}</span>`;
            return;
        }
        const total = record.tasks.length;
        const done = record.tasks.filter(task => task.status === "done").length;
        const open = record.tasks.filter(task => Object.hasOwn(statuses, task.status));
        const now = Date.now();
        const overdue = open.filter(task => {
            const due = taskDueTime(task.due_date);
            return due !== null && due < now;
        }).length;
        progress.innerHTML = `
            <span class="workspace-project-detail">${total ? `${done} of ${total} tasks done` : "No tasks yet"}</span>
            <progress value="${done}" max="${Math.max(total, 1)}" aria-label="${escapeHTML(record.project.name)}: ${done} of ${total} tasks done"></progress>
            <span class="workspace-project-detail">${open.length} open${overdue ? ` · ${overdue} overdue` : ""}</span>
        `;
    }

    function renderTaskFocus() {
        const now = Date.now();
        const incomplete = records.some(record => record.state !== "loaded");
        const errors = records.filter(record => record.state === "error");
        const unfinished = records.flatMap(record => record.state === "loaded"
            ? record.tasks.filter(task => Object.hasOwn(statuses, task.status)).map(task => ({
                task,
                project: record.project,
                due: taskDueTime(task.due_date),
            })) : []);
        unfinished.forEach(item => { item.overdue = item.due !== null && item.due < now; });
        const overdue = unfinished.filter(item => item.overdue).length;
        const formatCount = count => incomplete ? (count ? `${count}+` : "—") : String(count);
        const openCount = content.querySelector("#workspace-open-count");
        const overdueCount = content.querySelector("#workspace-overdue-count");
        openCount.textContent = formatCount(unfinished.length);
        overdueCount.textContent = formatCount(overdue);
        overdueCount.dataset.alert = String(overdue > 0);
        for (const counter of [openCount, overdueCount]) {
            counter.title = incomplete ? "Some projects' tasks are still unavailable; this total is incomplete." : "";
        }
        if (errors.length) {
            setMessage(taskMessage, `Could not load tasks for ${errors.length} ${errors.length === 1 ? "project" : "projects"}. Totals and the task list are incomplete.`);
        } else {
            setMessage(taskMessage, loadingTasks ? "Loading tasks… Totals and the task list are still incomplete." : "", "info");
        }
        retryTasks.hidden = errors.length === 0;
        retryTasks.disabled = loadingTasks;
        focusList.setAttribute("aria-busy", String(loadingTasks));

        const filter = taskFilter.value;
        const filtered = unfinished.filter(item => filter === "active"
            || (filter === "overdue" ? item.overdue : item.task.status === filter));
        filtered.sort((a, b) => Number(b.overdue) - Number(a.overdue)
            || (a.due ?? Infinity) - (b.due ?? Infinity)
            || (priorityOrder[a.task.priority] ?? 4) - (priorityOrder[b.task.priority] ?? 4)
            || String(a.task.title).localeCompare(String(b.task.title)));
        focusList.replaceChildren();
        if (filtered.length === 0) {
            const empty = document.createElement("p");
            empty.className = "empty-state";
            empty.textContent = loadingTasks ? "Loading tasks…"
                : incomplete ? "No matching tasks in the projects loaded so far. Retry to load the missing projects."
                : projects.length === 0 ? "Tasks will appear here once your first project is ready."
                : filter === "active" ? "No unfinished tasks. Your workspace is up to date."
                : filter === "overdue" ? "No overdue tasks."
                : `No tasks ${filter === "in_progress" ? "in progress" : filter === "review" ? "in review" : "to do"}.`;
            focusList.appendChild(empty);
        }
        for (const { task, project, due, overdue: isOverdue } of filtered.slice(0, visibleTaskCount)) {
            const item = document.createElement("div");
            item.className = "workspace-focus-item";
            item.setAttribute("role", "listitem");
            const button = document.createElement("button");
            button.type = "button";
            button.className = "workspace-focus-task";
            button.dataset.taskId = task.id;
            button.dataset.projectId = project.id;
            button.dataset.color = Object.hasOwn(TASK_COLORS, task.color) ? task.color : "gray";
            button.dataset.status = task.status;
            const dueText = due !== null ? dateFormatter.format(new Date(due)) : "";
            button.innerHTML = `
                <span class="workspace-focus-title">${escapeHTML(task.title)}</span>
                <span class="workspace-focus-meta">
                    <span class="workspace-focus-project">${escapeHTML(project.name)}</span>
                    <span class="task-status" data-status="${task.status}">${statuses[task.status]}</span>
                    ${Object.hasOwn(priorities, task.priority) ? `<span class="task-priority" data-priority="${task.priority}">${priorities[task.priority]}</span>` : ""}
                    ${dueText ? `<time datetime="${escapeHTML(task.due_date)}" data-overdue="${isOverdue}">${isOverdue ? "Overdue · " : "Due "}${escapeHTML(dueText)}</time>` : '<span class="workspace-focus-due">No due date</span>'}
                </span>
            `;
            button.addEventListener("click", async () => {
                if (button.disabled) return;
                await withBusy(button, async () => {
                    const result = await getTaskById(task.id);
                    if (!current()) return;
                    if (result.ok) await navigation.renderTask(result.data, project, workspace);
                    else setMessage(taskMessage, result.data?.error || "Could not open this task.");
                });
            });
            item.appendChild(button);
            focusList.appendChild(item);
        }
        showMore.hidden = filtered.length <= visibleTaskCount;
        showMore.textContent = `Show more (${Math.max(0, filtered.length - visibleTaskCount)})`;
    }

    async function loadWorkspaceTasks() {
        if (loadingTasks) return;
        loadingTasks = true;
        const pending = records.filter(record => record.state !== "loaded");
        pending.forEach(record => {
            record.state = "loading";
            updateProjectProgress(record);
        });
        renderTaskFocus();
        for (let offset = 0; offset < pending.length; offset += 4) {
            if (!current()) return;
            const batch = pending.slice(offset, offset + 4);
            const results = await Promise.all(batch.map(record => getTasks(record.project.id)));
            if (!current()) return;
            results.forEach((result, index) => {
                const record = batch[index];
                record.state = result.ok && Array.isArray(result.data) ? "loaded" : "error";
                record.tasks = record.state === "loaded" ? result.data : [];
                updateProjectProgress(record);
            });
            renderTaskFocus();
        }
        loadingTasks = false;
        renderTaskFocus();
    }

    taskFilter.addEventListener("change", () => {
        visibleTaskCount = 8;
        renderTaskFocus();
    });
    retryTasks.addEventListener("click", () => { void loadWorkspaceTasks(); });
    showMore.addEventListener("click", () => {
        visibleTaskCount += 8;
        renderTaskFocus();
    });

    if (projects.length === 0) {
        projectsList.innerHTML = `<div class="empty-state empty-state-panel"><h3>No projects yet</h3><p>${canManage ? "Create your first project to start organizing your team's work." : "Projects will appear here when a workspace manager creates them."}</p>${canManage ? '<button id="empty-create-project-button" type="button" class="btn-secondary">Create a project</button>' : ""}</div>`;
        content.querySelector("#empty-create-project-button")?.addEventListener("click", () => content.querySelector("#create-project-dialog").showModal());
    }
    for (const record of records) {
        const { project } = record;
        const projectButton = document.createElement("button");
        record.button = projectButton;
        projectButton.type = "button";
        projectButton.className = "project-card workspace-project-card";
        projectButton.dataset.projectId = project.id;
        projectButton.innerHTML = `
            <span class="project-card-icon"><img class="icon icon-folder" src="./assets/icons/folder.svg" width="24" height="24" alt=""></span>
            <span class="project-card-copy"><span class="item-name">${escapeHTML(project.name)}</span><span class="project-card-description">${escapeHTML(project.description || "No description yet.")}</span></span>
            <span class="workspace-project-progress"></span>
            <span class="project-card-footer">Open project <img class="icon icon-chevron" src="./assets/icons/chevron.svg" width="16" height="16" alt=""></span>
        `;
        updateProjectProgress(record);
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
    void loadWorkspaceTasks();
}

function taskDueTime(value) {
    if (!value) return null;
    // Date-only values belong to the user's local calendar; offsets remain explicit.
    const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
    return Number.isNaN(date.getTime()) ? null : date.getTime();
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
