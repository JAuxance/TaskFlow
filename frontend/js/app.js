import { escapeHTML, setMessage, withBusy } from "./ui.js";
import { getCurrentUser, logout, updateFirstName, uploadAvatar, removeAvatar, exportMyData, getDeletionPreview, deleteAccount } from "./auth.js";
import { setupPrivacyContact } from "./privacy-contact.js";
import { showProtectedImage } from "./api.js";
import { getWorkspaces, getWorkspacesMembers, getWorkspaceById } from "./workspaces.js";
import { renderLogin as renderLoginView } from "./views/loginView.js";
import { renderDashboard } from "./views/dashboardView.js";
import { renderWorkspace as renderWorkspaceView } from "./views/workspaceView.js";
import { renderProject as renderProjectView } from "./views/projectView.js";
import { renderTask as renderTaskView } from "./views/taskView.js";
import { renderDirectMessages as renderDirectMessagesView } from "./views/directMessagesView.js";
import { renderRegister as renderRegisterView } from "./views/registerView.js";
import { getDirectConversations } from "./directMessages.js";

let viewVersion = 0;
let viewCleanups = [];
const navigation = { renderLogin, renderRegister, renderApp, renderWorkspace, renderProject, renderTask, renderDirectMessages, };
const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");

function applyTheme(preference) {
    if (!["system", "light", "dark"].includes(preference)) preference = "system";
    document.documentElement.dataset.themePreference = preference;
    document.documentElement.dataset.theme = preference === "dark" ||
        (preference === "system" && systemTheme.matches) ? "dark" : "light";
    const toggle = document.querySelector("#theme-toggle");
    if (toggle) {
        const label = document.documentElement.dataset.theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
        toggle.setAttribute("aria-label", label);
        toggle.title = label;
    }
}
applyTheme(document.documentElement.dataset.themePreference);
systemTheme.addEventListener("change", () => {
    if (document.documentElement.dataset.themePreference === "system") applyTheme("system");
});
window.addEventListener("storage", event => {
    if (event.key === "taskflow-theme" || event.key === null) applyTheme(event.newValue);
});

async function showView(render, layout) {
    const version = ++viewVersion;
    viewCleanups.forEach(cleanup => cleanup());
    viewCleanups = [];
    const context = {
        ...navigation,
        isCurrent: () => version === viewVersion,
        onCleanup(cleanup) {
            if (version === viewVersion) viewCleanups.push(cleanup);
            else cleanup();
        }
    };
    if (layout) {
        const page = await renderLayout({...layout, navigation: context });
        if (!page) return;
        Object.assign(context, page);
    }
    await render(context);
    if (!context.isCurrent()) return;
    const heading = document.querySelector("#app h1");
    if (heading) {
        heading.id = "page-title";
        heading.tabIndex = -1;
        document.title = heading.textContent === "TaskFlow" ? "TaskFlow — Sign in" : `${heading.textContent} — TaskFlow`;
        document.getElementById("page-content") ?.setAttribute("aria-labelledby", heading.id);
        heading.focus({ preventScroll: true });
    }
    window.scrollTo(0, 0);
}

function renderLogin(error = "") {
    return showView(context => renderLoginView(context, error));
}

function renderRegister() {
    return showView(context => renderRegisterView(context));
}

function renderApp(user) {
    return showView(context => renderDashboard(user, context), { user, pageClass: "dashboard-page" });
}

function renderWorkspace(workspace, initialTab = "projects") {
    return showView(context => renderWorkspaceView(workspace, {...context, initialTab }), {
        workspace,
        pageClass: "workspace-page",
        breadcrumbs: [{ label: "Workspaces", action: () => renderApp() }, { label: workspace.name }]
    });
}

function renderDirectMessages(member, workspace = null) {
    return showView(context => renderDirectMessagesView(member, workspace, context), {
        workspace,
        activeConversationId: member.user_id,
        pageClass: "direct-messages-page",
        breadcrumbs: [
            { label: "Workspaces", action: () => renderApp() },
            ...(workspace ? [{ label: workspace.name, action: () => renderWorkspace(workspace, "members") }] : []),
            { label: "Direct messages" }
        ]
    });
}

function renderProject(project, workspace) {
    return showView(context => renderProjectView(project, workspace, context), {
        workspace,
        pageClass: "project-page",
        breadcrumbs: [
            { label: "Workspaces", action: () => renderApp() },
            { label: workspace.name, action: () => renderWorkspace(workspace) },
            { label: project.name }
        ]
    });
}

function renderTask(task, project, workspace) {
    return showView(context => renderTaskView(task, project, workspace, context), {
        workspace,
        pageClass: "task-page",
        breadcrumbs: [
            { label: "Workspaces", action: () => renderApp() },
            { label: workspace.name, action: () => renderWorkspace(workspace) },
            { label: project.name, action: () => renderProject(project, workspace) },
            { label: "Task details" }
        ]
    });
}

async function initApp() {
    const result = await getCurrentUser();
    if (result.ok) await renderApp(result.data);
    else await renderLogin(result.status === 401 ? "" : result.data.error);
}

async function renderLayout({
    navigation,
    user,
    workspace = null,
    activeConversationId = null,
    breadcrumbs = [{ label: "Workspaces" }],
    pageClass = ""
}) {
    const app = document.getElementById("app");
    app.setAttribute("aria-busy", "true");
    const [userResult, workspaceResult, membersResult, conversationsResult] = await Promise.all([
        user && "first_name" in user && "avatar_url" in user
            ? Promise.resolve({ ok: true, data: user }) : getCurrentUser(),
        getWorkspaces(),
        workspace ? getWorkspacesMembers(workspace.id) : Promise.resolve({ ok: true, data: [] }),
        getDirectConversations()
    ]);
    if (navigation.isCurrent && !navigation.isCurrent()) return null;
    app.removeAttribute("aria-busy");
    if (!userResult.ok) {
        navigation.renderLogin(userResult.status === 401 ? "" : userResult.data.error);
        return null;
    }
    if (workspaceResult.status === 401 || membersResult.status === 401 || conversationsResult.status === 401) {
        navigation.renderLogin();
        return null;
    }

    user = userResult.data;
    const workspaces = workspaceResult.ok ? workspaceResult.data : [];
    const members = membersResult.ok ? membersResult.data : null;
    const isOwner = Boolean(workspace && Number(workspace.owner_id) === Number(user.id));
    const role = isOwner ? "owner" : members ?.find(member =>
        Number(member.user_id) === Number(user.id)) ?.role ?? null;

    app.innerHTML = `
        <div class="app-layout">
            <aside class="sidebar" aria-label="Workspace navigation">
                <div class="sidebar-header"><img class="icon icon-mark" src="./assets/icons/mark.svg" width="24" height="24" alt="" aria-hidden="true"><span>TaskFlow</span></div>
                <nav class="sidebar-navigation" aria-label="Workspaces">
                    <button type="button" id="all-workspaces-button" class="workspace-button ${workspace || activeConversationId ? "" : "is-active"}"
                        ${workspace || activeConversationId ? "" : 'aria-current="page"'}><img class="icon icon-workspace" src="./assets/icons/workspace.svg" width="18" height="18" alt="" aria-hidden="true"><span>All workspaces</span></button>
                   <p class="sidebar-label">Workspaces</p>
                    <div id="workspace-list"></div>
                    <p id="sidebar-message" class="form-message" role="alert" hidden></p>

                    <p class="sidebar-label">Messages</p>
                    <div id="conversation-list"></div>
                    <p id="conversation-message" class="form-message" role="alert" hidden></p>
                </nav>
                <div class="sidebar-account">
                    <button type="button" id="profile-button" class="account-profile" aria-label="Edit your profile">
                        <span class="avatar" aria-hidden="true"><span class="avatar-initial"></span><img alt="" hidden></span>
                        <span class="account-details"><span class="account-name"></span><span class="account-email">${escapeHTML(user.email)}</span></span>
                    </button>
                </div>
            </aside>
            <main class="main-content">
                <header class="main-header">
                    <nav class="breadcrumbs" aria-label="Breadcrumb"></nav>
                    <button id="theme-toggle" type="button" class="theme-toggle" aria-label="Switch theme">
                        <svg class="theme-moon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.9 13.3A9 9 0 0 1 10.7 3.1 9 9 0 1 0 20.9 13.3Z"/></svg>
                        <svg class="theme-sun" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
                    </button>
                </header>
                <section id="page-content" class="page-content ${escapeHTML(pageClass)}" tabindex="-1"></section>
            </main>
        </div>`;

    const content = app.querySelector("#page-content");
    const sidebarMessage = app.querySelector("#sidebar-message");
    const workspaceList = app.querySelector("#workspace-list");
    const conversationList = app.querySelector("#conversation-list");
    const conversationMessage = app.querySelector("#conversation-message");
    const breadcrumbList = app.querySelector(".breadcrumbs");
    const themeToggle = app.querySelector("#theme-toggle");
    applyTheme(document.documentElement.dataset.themePreference);
    themeToggle.addEventListener("click", () => {
        const preference = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
        applyTheme(preference);
        try {
            localStorage.setItem("taskflow-theme", preference);
        } catch {
            themeToggle.title += " (for this visit; preference could not be saved)";
        }
    });
    const current = () => content.isConnected && (!navigation.isCurrent || navigation.isCurrent());
    const updateUser = updated => {
        Object.assign(user, updated);
        const name = user.first_name || user.username || user.email;
        app.querySelector(".account-name").textContent = name;
        app.querySelector(".avatar-initial").textContent = Array.from(name)[0] ?.toUpperCase() || "?";
        showProtectedImage(app.querySelector("#profile-button .avatar img"), user.avatar_url, "");
    };
    updateUser(user);
    setupProfileDialog(app, user, updateUser, current, navigation);

    breadcrumbs.forEach((crumb, index) => {
        if (index) {
            const separator = document.createElement("span");
            separator.className = "breadcrumb-separator";
            separator.textContent = "/";
            separator.setAttribute("aria-hidden", "true");
            breadcrumbList.appendChild(separator);
        }
        const element = document.createElement(crumb.action ? "button" : "span");
        element.textContent = crumb.label;
        element.title = crumb.label;
        if (crumb.action) {
            element.type = "button";
            element.className = "breadcrumb-link";
            element.addEventListener("click", crumb.action);
        } else element.setAttribute("aria-current", "page");
        breadcrumbList.appendChild(element);
    });

    app.querySelector("#all-workspaces-button").addEventListener("click", () => navigation.renderApp(user));
    for (const item of workspaces) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "workspace-button";
        const color = ["gray", "blue", "green", "yellow", "orange", "red", "purple"].includes(item.color) ? item.color : "gray";
        button.dataset.color = color;
        button.innerHTML = `<span class="workspace-icon" data-color="${color}" aria-hidden="true"></span><span>${escapeHTML(item.name)}</span>`;
        const icon = button.querySelector(".workspace-icon");
        if (item.icon_type === "emoji" && item.icon_value) icon.textContent = item.icon_value;
        else {
            const image = document.createElement("img");
            image.alt = "";
            image.onerror = () => {
                image.onerror = null;
                image.src = "./assets/icons/folder.svg";
            };
            showProtectedImage(image, item.icon_type === "image" ? item.icon_value : "", "./assets/icons/folder.svg");
            icon.appendChild(image);
        }
        button.title = item.name;
        if (!activeConversationId && workspace && Number(item.id) === Number(workspace.id)) {
            button.classList.add("is-active");
            button.setAttribute("aria-current", "page");
        }
        button.addEventListener("click", () => withBusy(button, async() => {
            setMessage(sidebarMessage);
            const result = await getWorkspaceById(item.id);
            if (!current()) return;
            if (result.ok) navigation.renderWorkspace(result.data);
            else setMessage(sidebarMessage, result.data.error);
        }));
        workspaceList.appendChild(button);
    }
    if (!workspaceResult.ok) setMessage(sidebarMessage, workspaceResult.data.error);
    else if (!workspaces.length) {
        const empty = document.createElement("p");
        empty.className = "sidebar-empty";
        empty.textContent = "No workspaces yet.";
        workspaceList.appendChild(empty);
    }
    function displayConversations(result) {
        setMessage(conversationMessage, result.ok ? "" : result.data.error);
        if (!result.ok) return;
        conversationList.replaceChildren();
        for (const conversation of result.data) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "workspace-button conversation-button";
            const name = conversation.first_name || conversation.username || "User";
            const initial = Array.from(name)[0]?.toUpperCase() || "?";
            button.innerHTML = `
                <span class="avatar" aria-hidden="true"><span>${escapeHTML(initial)}</span><img alt="" hidden></span>
                <span class="conversation-copy"><span>${escapeHTML(name)}</span><span class="conversation-preview"></span></span>`;
            button.title = name;
            button.querySelector(".conversation-preview").textContent = conversation.last_message;
            showProtectedImage(button.querySelector("img"), conversation.avatar_url, "");
            if (Number(conversation.user_id) === Number(activeConversationId)) {
                button.classList.add("is-active");
                button.setAttribute("aria-current", "page");
            }
            button.addEventListener("click", () => navigation.renderDirectMessages(conversation));
            conversationList.appendChild(button);
        }
        if (!result.data.length) {
            const empty = document.createElement("p");
            empty.className = "sidebar-empty";
            empty.textContent = "No conversations yet.";
            conversationList.appendChild(empty);
        }
    }
    let conversationVersion = 0;
    async function refreshConversations() {
        const version = ++conversationVersion;
        const result = await getDirectConversations();
        if (!current() || version !== conversationVersion) return;
        if (result.status === 401) return navigation.renderLogin();
        displayConversations(result);
    }
    displayConversations(conversationsResult);
    return {
        content,
        user,
        updateUser,
        refreshConversations,
        workspaces,
        members,
        role,
        isOwner,
        membersError: membersResult.ok ? "" : membersResult.data.error,
        workspacesError: workspaceResult.ok ? "" : workspaceResult.data.error
    };
}

function setupProfileDialog(app, user, updateUser, current, navigation) {
    const dialog = document.createElement("dialog");
    dialog.id = "profile-dialog";
    dialog.className = "app-dialog";
    dialog.setAttribute("aria-labelledby", "profile-dialog-title");
    dialog.innerHTML = `
        <div class="dialog-header">
            <h2 id="profile-dialog-title">Your profile</h2>
            <button type="button" class="dialog-close" aria-label="Close profile">×</button>
        </div>
        <div class="dialog-body">
            <div class="profile-identity">
                <span class="avatar avatar-large" aria-hidden="true"><span id="profile-initial"></span><img id="profile-avatar" alt="" hidden></span>
                <div class="heading-copy">
                    <strong>${escapeHTML(user.username)}</strong>
                    <div class="email-copy"><span id="user-email" class="secondary-text">${escapeHTML(user.email)}</span><button id="copy-email-button" type="button" class="btn-quiet">Copy email</button></div>
                </div>
            </div>
            <form id="profile-name-form" class="settings-form profile-section">
                <div class="field">
                    <label for="profile-first-name">First name (optional)</label>
                    <input id="profile-first-name" name="first_name" value="${escapeHTML(user.first_name)}" autocomplete="given-name" maxlength="100" placeholder="Enter your first name" aria-describedby="profile-name-help">
                    <p id="profile-name-help" class="field-hint">Leave empty to use your username instead.</p>
                </div>
                <button type="submit" class="btn-primary">Save name</button>
                <p id="profile-name-message" class="form-message" role="status" hidden></p>
            </form>
            <form id="profile-avatar-form" class="settings-form profile-section">
                <div class="field">
                    <label for="profile-avatar-input">Profile picture</label>
                    <input id="profile-avatar-input" class="image-upload-input" type="file" name="avatar" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" required aria-describedby="profile-avatar-help">
                    <p id="profile-avatar-help" class="field-hint">JPG, PNG or WebP · up to 5 MB</p>
                </div>
                <button type="submit" class="btn-secondary">Upload picture</button>
                <button type="button" id="remove-avatar-button" class="btn-quiet">Remove picture</button>
                <p id="profile-avatar-message" class="form-message" role="status" hidden></p>
            </form>
            <form id="profile-export-form" class="settings-form profile-section">
                <h3>My data</h3>
                <p id="profile-export-help" class="field-hint">Download a JSON copy of your profile, memberships, tasks you created or are assigned to in accessible workspaces, and messages you sent. The file contains personal information: keep it somewhere private. Downloading does not delete your account.</p>
                <div class="field">
                    <label for="profile-export-password">Current password for download</label>
                    <input id="profile-export-password" name="password" type="password" autocomplete="current-password" required aria-describedby="profile-export-help">
                </div>
                <button type="submit" class="btn-secondary">Download my data</button>
                <p id="profile-export-message" class="form-message" role="status" hidden></p>
                <p class="field-hint">For image copies, logs, other data or a username/email correction, use the privacy contact. An email change requires verification.</p>
                <p class="field-hint" data-privacy-contact>For data requests: <a href="mailto:contact@auxance.dev?subject=TaskFlow%20-%20personal%20data%20request">contact@auxance.dev</a>. Please never send your password.</p>
                <nav class="privacy-links" aria-label="Privacy information"><a href="/confidentialite/">Privacy</a><a href="/cookies/">Cookies &amp; storage</a></nav>
            </form>
            <div class="settings-form profile-section">
                <button type="button" id="logout-button" class="btn-secondary">Sign out</button>
                <p id="profile-logout-message" class="form-message" role="alert" hidden></p>
            </div>
            <form id="profile-delete-form" class="settings-form profile-section">
                <h3>Delete account</h3>
                <p id="profile-delete-help" class="field-hint">Review what will be deleted before continuing. If you own a workspace with other members, transfer ownership or explicitly delete that workspace first. Deleting this account removes your direct messages for both participants. Text in other workspaces can remain and may still contain personal information.</p>
                <button type="button" id="review-deletion-button" class="btn-secondary">Review deletion</button>
                <div id="profile-delete-summary" class="deletion-summary" aria-live="polite" hidden></div>
                <p class="field-hint">Counts describe the current data and can change. Use the privacy contact for personal information in shared content. Backup retention is described in the privacy notice.</p>
                <label class="deletion-confirm"><input id="confirm-account-deletion" type="checkbox" required disabled> I have reviewed the summary and understand this cannot be undone.</label>
                <div class="field">
                    <label for="profile-delete-password">Current password</label>
                    <input id="profile-delete-password" name="password" type="password" autocomplete="current-password" required aria-describedby="profile-delete-help">
                </div>
                <button type="submit" id="delete-account-button" class="btn-danger" disabled>Delete my account</button>
                <p id="profile-delete-message" class="form-message" role="alert" hidden></p>
            </form>
        </div>`;
    app.appendChild(dialog);
    app.querySelector("#profile-button").addEventListener("click", () => dialog.showModal());
    dialog.querySelector(".dialog-close").addEventListener("click", () => { if (!profileBusy) dialog.close(); });
    dialog.addEventListener("cancel", event => { if (profileBusy) event.preventDefault(); });
    const profileNameForm = dialog.querySelector("#profile-name-form");
    const profileAvatarForm = dialog.querySelector("#profile-avatar-form");
    const profileButtons = dialog.querySelectorAll('button[type="submit"], #logout-button, #remove-avatar-button, #review-deletion-button');
    let profileBusy = false;
    let deletionPreview = null;
    const deletionConfirm = dialog.querySelector("#confirm-account-deletion");
    const deleteButton = dialog.querySelector("#delete-account-button");
    function updateDeleteButton() {
        deletionConfirm.disabled = profileBusy || !deletionPreview?.can_delete;
        deleteButton.disabled = profileBusy || !deletionPreview?.can_delete || !deletionConfirm.checked;
    }
    deletionConfirm.addEventListener("change", updateDeleteButton);
    function showDeletionSummary(preview) {
        deletionPreview = preview;
        deletionConfirm.checked = false;
        const summary = dialog.querySelector("#profile-delete-summary");
        summary.hidden = false;
        summary.replaceChildren();
        const title = document.createElement("strong");
        title.textContent = preview.can_delete ? "Your deletion summary" : "Handle these shared workspaces first";
        summary.appendChild(title);
        const list = document.createElement("ul");
        for (const workspace of preview.blocked_workspaces) {
            const item = document.createElement("li");
            item.textContent = `${workspace.name} — ${workspace.other_members} other member(s). Transfer ownership in Members, or delete the workspace in its settings.`;
            list.appendChild(item);
        }
        const count = preview.counts;
        const lines = [
            "Your profile and all memberships will be removed; all sessions will end.",
            `${count.direct_messages} direct message(s) will be removed for both participants.`,
            `${count.images} current uploaded image(s) will be removed; failed file cleanup is retried separately.`,
            `Workspaces deleted (no other members): ${preview.workspaces_to_delete.map(w => w.name).join(", ") || "none"}.`,
            `Inside these workspaces: ${count.projects} project(s), ${count.tasks} task(s), ${count.workspace_messages} chat message(s).`,
            `In other owners' workspaces: ${count.retained_tasks} related task(s) and ${count.retained_messages} authored message(s) remain, with account links removed.`
        ];
        for (const line of lines) {
            const item = document.createElement("li");
            item.textContent = line;
            list.appendChild(item);
        }
        summary.appendChild(list);
        updateDeleteButton();
    }
    async function loadDeletionSummary() {
        if (profileBusy) return;
        profileBusy = true;
        deletionPreview = null;
        deletionConfirm.checked = false;
        updateDeleteButton();
        profileButtons.forEach(button => { button.disabled = true; });
        const feedback = dialog.querySelector("#profile-delete-message");
        setMessage(feedback, "Loading deletion summary…", "info");
        try {
            const result = await getDeletionPreview();
            if (!current()) return;
            if (result.ok) {
                showDeletionSummary(result.data);
                setMessage(feedback);
            } else {
                dialog.querySelector("#profile-delete-summary").hidden = true;
                setMessage(feedback, result.data.error);
            }
        } finally {
            profileBusy = false;
            profileButtons.forEach(button => { button.disabled = false; });
            updateDeleteButton();
        }
    }
    dialog.querySelector("#review-deletion-button").addEventListener("click", loadDeletionSummary);
    setupPrivacyContact(dialog);
    const exportForm = dialog.querySelector("#profile-export-form");
    exportForm.addEventListener("submit", async event => {
        event.preventDefault();
        if (profileBusy) return;
        profileBusy = true;
        profileButtons.forEach(button => { button.disabled = true; });
        dialog.setAttribute("aria-busy", "true");
        const feedback = dialog.querySelector("#profile-export-message");
        setMessage(feedback, "Preparing your download…", "info");
        try {
            const result = await exportMyData(exportForm.elements.password.value);
            if (!current()) return;
            if (!result.ok) return setMessage(feedback, result.data.error);
            const file = new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(file);
            const link = document.createElement("a");
            link.href = url;
            link.download = "taskflow-my-data.json";
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
            setMessage(feedback, "Download requested. Check your browser downloads.", "success");
        } finally {
            exportForm.elements.password.value = "";
            profileBusy = false;
            dialog.removeAttribute("aria-busy");
            profileButtons.forEach(button => { button.disabled = false; });
            updateDeleteButton();
        }
    });
    dialog.addEventListener("close", () => {
        exportForm.elements.password.value = "";
        dialog.querySelector("#profile-delete-password").value = "";
        deletionPreview = null;
        deletionConfirm.checked = false;
        dialog.querySelector("#profile-delete-summary").hidden = true;
        updateDeleteButton();
    });
    const deleteForm = dialog.querySelector("#profile-delete-form");
    deleteForm.addEventListener("submit", async event => {
        event.preventDefault();
        if (profileBusy) return;
        const feedback = dialog.querySelector("#profile-delete-message");
        setMessage(feedback);
        const password = deleteForm.elements.password.value;
        if (!password.trim()) return setMessage(feedback, "Enter your current password.");
        if (!deletionPreview?.can_delete || !deletionConfirm.checked) {
            return setMessage(feedback, "Review and confirm the deletion summary first.");
        }
        if (!window.confirm("Delete your account, direct messages and the solo workspaces listed in the summary? This cannot be undone.")) return;
        profileBusy = true;
        dialog.setAttribute("aria-busy", "true");
        profileButtons.forEach(button => { button.disabled = true; });
        try {
            const result = await deleteAccount(password, deletionPreview.workspaces_to_delete.map(workspace => workspace.id));
            if (!current()) return;
            if (result.ok || result.status === 401) {
                dialog.close();
                await navigation.renderLogin();
            } else {
                if (result.status === 409) {
                    deletionPreview = null;
                    deletionConfirm.checked = false;
                    dialog.querySelector("#profile-delete-summary").hidden = true;
                }
                setMessage(feedback, result.data.error);
            }
        } finally {
            deleteForm.elements.password.value = "";
            profileBusy = false;
            dialog.removeAttribute("aria-busy");
            profileButtons.forEach(button => { button.disabled = false; });
            updateDeleteButton();
        }
    });
    dialog.querySelector("#logout-button").addEventListener("click", async() => {
        if (profileBusy) return;
        profileBusy = true;
        dialog.setAttribute("aria-busy", "true");
        profileButtons.forEach(button => { button.disabled = true; });
        const feedback = dialog.querySelector("#profile-logout-message");
        setMessage(feedback);
        try {
            const result = await logout();
            if (!current()) return;
            if (result.ok || result.status === 401) navigation.renderLogin();
            else setMessage(feedback, result.data.error);
        } finally {
            profileBusy = false;
            dialog.removeAttribute("aria-busy");
            profileButtons.forEach(button => { button.disabled = false; });
            updateDeleteButton();
        }
    });
    const displayProfile = () => {
        dialog.querySelector("#profile-initial").textContent = Array.from(user.first_name || user.username || user.email)[0] ?.toUpperCase() || "?";
        showProtectedImage(dialog.querySelector("#profile-avatar"), user.avatar_url, "");
    };
    displayProfile();
    const saveProfile = async(request, feedback, onSuccess) => {
        if (profileBusy) return;
        profileBusy = true;
        dialog.setAttribute("aria-busy", "true");
        profileButtons.forEach(button => { button.disabled = true; });
        setMessage(feedback);
        try {
            const result = await request();
            if (!current()) return;
            if (!result.ok) return setMessage(feedback, result.data.error);
            updateUser(result.data);
            displayProfile();
            onSuccess();
            setMessage(feedback, "Profile updated.", "success");
        } finally {
            profileBusy = false;
            dialog.removeAttribute("aria-busy");
            profileButtons.forEach(button => { button.disabled = false; });
            updateDeleteButton();
        }
    };
    profileNameForm.addEventListener("submit", event => {
        event.preventDefault();
        const input = profileNameForm.elements.first_name;
        const enteredName = input.value;
        const name = enteredName.trim();
        const feedback = dialog.querySelector("#profile-name-message");
        saveProfile(() => updateFirstName(name), feedback, () => {
            if (input.value === enteredName) input.value = user.first_name || "";
        });
    });
    dialog.querySelector("#remove-avatar-button").addEventListener("click", () => {
        saveProfile(removeAvatar, dialog.querySelector("#profile-avatar-message"), () => {
            profileAvatarForm.elements.avatar.value = "";
        });
    });
    profileAvatarForm.addEventListener("submit", event => {
        event.preventDefault();
        const input = profileAvatarForm.elements.avatar;
        const file = input.files[0];
        const feedback = dialog.querySelector("#profile-avatar-message");
        if (!file) return setMessage(feedback, "Choose an image first.");
        if (!/\.(jpe?g|png|webp)$/i.test(file.name) || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
            return setMessage(feedback, "Choose a JPG, PNG or WebP image.");
        }
        if (file.size > 5 * 1024 * 1024) return setMessage(feedback, "Choose an image smaller than 5 MB.");
        saveProfile(() => uploadAvatar(file), feedback, () => {
            if (input.files[0] === file) input.value = "";
        });
    });

    const copy = dialog.querySelector("#copy-email-button");
    copy.addEventListener("click", () => withBusy(copy, async() => {
        try {
            await navigator.clipboard.writeText(user.email);
            if (!current()) return;
            copy.textContent = "Copied!";
            window.setTimeout(() => { if (copy.isConnected) copy.textContent = "Copy email"; }, 1500);
        } catch {
            setMessage(dialog.querySelector("#profile-name-message"), "Could not copy the email. You can select and copy it manually.");
        }
    }));

}

initApp();
