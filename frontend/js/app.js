import { login, getCurrentUser, logout } from "./auth.js";
import {
    getWorkspaces,
    createWorkspace,
    getWorkspaceById,
    getWorkspacesMembers,
    addWorkspaceMember,
    updateWorkspaceMemberRole,
    deleteWorkspaceMember,
} from "./workspaces.js";
import { getProjects, createProject, getProjectById } from "./projects.js";
import { getTasks, createTask, getTaskById, updateTask, deleteTask } from "./task.js";

function renderLogin() {
    const app = document.getElementById("app");

    app.innerHTML = `
        <form id="login-form">
            <input type="email" id="email" placeholder="Email" required>
            <input type="password" id="password" placeholder="Password" required>
            <button type="submit">Login</button>
        </form>

        <p id="message"></p>
    `;

    const loginForm = document.getElementById("login-form");

    loginForm.addEventListener("submit", async function(event) {
        event.preventDefault();

        const email = document.getElementById("email").value;
        const password = document.getElementById("password").value;
        const message = document.getElementById("message");

        const result = await login(email, password);

        if (result.ok) {
            renderApp(result.data);
        } else {
            message.textContent = result.data.error;
        }
    });
}

async function initApp() {
    const userResult = await getCurrentUser();

    if (userResult.ok) {
        renderApp(userResult.data);
    } else {
        renderLogin();
    }
}

async function renderApp(user) {
    const app = document.getElementById("app");

    app.innerHTML = `
        <h1>Bienvenue ${user.username}</h1>
        <p>${user.email}</p>

        <button id="logout-button">Logout</button>

        <div id="workspace-list"></div>
    `;

    const workspaceResult = await getWorkspaces();
    const workspaceList = document.getElementById("workspace-list");

    if (workspaceResult.ok) {
        const workspaces = workspaceResult.data;

        if (workspaces.length === 0) {
            workspaceList.innerHTML = `
                <p>Aucun workspace pour le moment.</p>
                <button id="create-workspace-button">Créer un workspace</button>
            `;

            const createWorkspaceButton = document.getElementById("create-workspace-button");

            createWorkspaceButton.addEventListener("click", async function() {
                const name = prompt("Nom du workspace :");

                if (!name) {
                    return;
                }

                const result = await createWorkspace(name);

                if (result.ok) {
                    renderApp(user);
                }
            });
        } else {
            workspaceList.innerHTML = "";

            workspaces.forEach(function(workspace) {
                const workspaceElement = document.createElement("button");

                workspaceElement.textContent = workspace.name;

                workspaceElement.addEventListener("click", async function() {
                    const result = await getWorkspaceById(workspace.id);

                    if (result.ok) {
                        renderWorkspace(result.data);
                    }
                });

                workspaceList.appendChild(workspaceElement);
            });
        }
    }

    console.log(workspaceResult);

    const logoutButton = document.getElementById("logout-button");

    logoutButton.addEventListener("click", async function() {
        const result = await logout();

        if (result.ok) {
            renderLogin();
        }
    });
}

async function renderWorkspace(workspace) {
    const app = document.getElementById("app");

    app.innerHTML = `
        <button id="back-button">← Retour</button>

        <h1>${workspace.name}</h1>
        <p>Worksapce ID: ${workspace.id}</p>

        <h2>Projets<h2>
        <div id="projects-list"></div>

        <h2>Members</h2>

        <form id="add-member-from">
            <input
                id="member-email"
                type="email"
                placeholder="Email du membre"
                required
            >


            <select id="member-role">
                <option value="member">Member</option>
                <option value="guest">Guest</option>
                <option value="admin">Admin</option>
                <option value="owner">Owner</option>
            </select>

            <button type="submit">Ajouter</button>
        </form>
        <p id="member-message"></p>
    
        <div id="members-list"></div>
    
        <div id="projects-list"></div>
    `;
    const addMemberForm = document.getElementById("add-member-from");

    addMemberForm.addEventListener("submit", async function(event) {
        event.preventDefault();

        const email = document.getElementById("member-email").value;
        const role = document.getElementById("member-role").value;
        const message = document.getElementById("member-message");

        const result = await addWorkspaceMember(
            workspace.id,
            email,
            role
        );

        if (result.ok) {
            renderWorkspace(workspace);
        } else {
            message.textContent = result.data.error;
        }
    });
    const projectsResult = await getProjects(workspace.id);
    const projectsList = document.getElementById("projects-list");
    const membersResult = await getWorkspacesMembers(workspace.id);
    const membersList = document.getElementById("members-list");
    if (membersResult.ok) {
        const members = membersResult.data;

        members.forEach(function(member) {
            const memberELement = document.createElement("div");

            memberELement.innerHTML = `
                <strong>${member.user_name}</strong>
                
                <select class="member-role-select">
                   <option value="owner">Owner</option>
                   <option value="admin">Admin</option>
                   <option value="member">Member</option>
                   <option value="guest">Guest</option>
                </select>

                <button class="delete-member-button">
                    Suprimer
                </button>
                `;

            const roleSelect = memberELement.querySelector(".member-role-select");

            roleSelect.value = member.role;

            roleSelect.addEventListener("change", async function() {
                console.log("user id :", member.user_id);
                console.log("nouveau rôle :", roleSelect.value);
                const result = await updateWorkspaceMemberRole(
                    workspace.id,
                    member.user_id,
                    roleSelect.value
                );
                if (!result.ok) {
                    console.log(result);
                    roleSelect.value = member.role;
                }
            });
            membersList.appendChild(memberELement);
            const deleteMemberButton = memberELement.querySelector(".delete-member-button");
            deleteMemberButton.addEventListener("click", async function() {
                const confirmed = confirm(
                    `Supprimer ${member.user_name} du workspace ?`
                );
                if (!confirmed) {
                    return;
                }
                const result = await deleteWorkspaceMember(
                    workspace.id,
                    member.user_id
                );
                if (result.ok) {
                    renderWorkspace(workspace);
                } else {
                    console.log(result)
                }
            })
        });
    }
    if (projectsResult.ok) {
        const projects = projectsResult.data;

        if (projects.length === 0) {
            projectsList.innerHTML = `
                <p>Aucun projet pour le moment.</p>
                <button id="create-project-button">Créer un projet</button>
            `;

            const createProjectButton = document.getElementById("create-project-button");

            createProjectButton.addEventListener("click", async function() {
                const name = prompt("Nom du projet :");

                if (!name) {
                    return;
                }

                const result = await createProject(workspace.id, name);

                if (result.ok) {
                    renderWorkspace(workspace);
                }
            });
        } else {
            projectsList.innerHTML = `
                <button id="create-project-button">Créer un projet</button>
            `;

            projects.forEach(function(project) {
                const projectElement = document.createElement("button");

                projectElement.textContent = project.name;

                projectElement.addEventListener("click", async function() {
                    const result = await getProjectById(project.id);

                    if (result.ok) {
                        renderProject(result.data, workspace);
                    }
                });

                projectsList.appendChild(projectElement);
            });

            const createProjectButton = document.getElementById("create-project-button");

            createProjectButton.addEventListener("click", async function() {
                const name = prompt("Nom du projet :");

                if (!name) {
                    return;
                }

                const result = await createProject(workspace.id, name);

                if (result.ok) {
                    renderWorkspace(workspace);
                }
            });
        }

    }

    console.log(projectsResult);

    const backButton = document.getElementById("back-button");

    backButton.addEventListener("click", async function() {
        const userResult = await getCurrentUser();

        if (userResult.ok) {
            renderApp(userResult.data);
        }
    });
}

async function renderProject(project, workspace) {
    const app = document.getElementById("app");

    app.innerHTML = `
        <button id="back-project-button">← Retour</button>

        <h1>${project.name}</h1>
        <p>${project.description || ""}</p>

        <div id="tasks-list"></div>
    `;
    const tasksResult = await getTasks(project.id);

    const tasksList = document.getElementById("tasks-list")

    if (tasksResult.ok) {
        const tasks = tasksResult.data;

        if (tasks.length === 0) {
            tasksList.innerHTML = `
            <p>Aucune tâche pour le moment.</p>
            <button id="create-task-button">Créer une tâche</button>
            `;
        } else {
            tasksList.innerHTML = `
                <button id="create-task-button">Créer une tâche</button>
                `;

            tasks.forEach(function(task) {
                const taskElement = document.createElement("div");

                taskElement.innerHTML = `
                    <button class="open-task-button">
                        <strong>${task.title}</strong>
                    </button>

                    <p>Status: ${task.status}</p>
                    <p>Priorité: ${task.priority}</p>
                `;
                const openTaskButton = taskElement.querySelector(".open-task-button");
                openTaskButton.addEventListener("click", async function() {
                    const result = await getTaskById(task.id);

                    if (result.ok) {
                        renderTask(result.data, project, workspace);
                    }
                });

                tasksList.appendChild(taskElement);
            });
        }
        const createTaskbutton = document.getElementById("create-task-button");

        createTaskbutton.addEventListener("click", async function() {
            const title = prompt("Titre de la tâche :");

            if (!title) {
                return;
            }

            const result = await createTask(project.id, title);

            if (result.ok) {
                await renderProject(project, workspace);
            } else {
                alert(result.data.error || "Impossible de créer la tâche.");
            }
        });

    }

    const backButton = document.getElementById("back-project-button");

    backButton.addEventListener("click", function() {
        renderWorkspace(workspace);
    });
}

async function renderTask(task, project, workspace) {
    const app = document.getElementById("app");

    app.innerHTML = `
    <button id="back-task-button">← Retour</button>
    
    <label for="task-title">Titre:</label>
    <input
        id="task-title"
        type="text"
        value="${task.title}"
    >

    <label for="task-description">Description :</label>
    <textarea id="task-description">${task.description || ""}</textarea>

    <label for="tasks-status">Status: </label>
    <select id="task-status">
        <option value="todo">Todo</option>
        <option value="in_progress">In porgress</option>
        <option value="review">Review</option>
        <option value="done">Done</option>
    </select>
    <label for="task-priority">Priorité :</label>
    <select id="task-priority">
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
        <option value="urgent">Urgent</option>
    </select>
    <label for="task-due-date">Échéance :</label>
    <input
        id="task-due-date"
        type="datetime-local"
    >
    <label for="task-assignee">Assigné à:</label>
    <select id="task-assignee">
        <option value="">Non assignée</option>
    </select>
    <button id="save-task-button">Engregistrer</button>
    <button id="delete-task-button">Supprimer la tâche</button>
    `;
    const statusSelect = document.getElementById("task-status");

    statusSelect.value = task.status;
    statusSelect.addEventListener("change", async function() {
        const newStatus = statusSelect.value;

        const result = await updateTask(task.id, {
            status: newStatus
        });

        console.log(result)
    });

    const prioritySelect = document.getElementById("task-priority");

    prioritySelect.value = task.priority;

    prioritySelect.addEventListener("change", async function() {
        const newPriority = prioritySelect.value;

        const result = await updateTask(task.id, {
            priority: newPriority
        });

        console.log(result);
    });
    const dueDateInput = document.getElementById("task-due-date");
    if (task.due_date) {
        dueDateInput.value = task.due_date.slice(0, 16);
    }
    const membersResult = await getWorkspacesMembers(workspace.id);
    const assigneeSelect = document.getElementById("task-assignee");

    if (membersResult.ok) {
        const members = membersResult.data;

        members.forEach(function(member) {
            const option = document.createElement("option");

            option.value = member.user_id;
            option.textContent = member.user_name;

            assigneeSelect.appendChild(option);

        });
        if (task.assignee_id) {
            assigneeSelect.value = String(task.assignee_id);
        }
    }
    const titleInput = document.getElementById("task-title");
    const descriptionInput = document.getElementById("task-description");
    const saveTaskButton = document.getElementById("save-task-button");
    saveTaskButton.addEventListener("click", async function() {
        const data = {
            title: titleInput.value,
            description: descriptionInput.value,
            assignee_id: assigneeSelect.value ?
                Number(assigneeSelect.value) : null
        };

        if (dueDateInput.value) {
            data.due_date = dueDateInput.value;
        }

        const result = await updateTask(task.id, data);

        if (result.ok) {
            renderProject(project, workspace);
        } else {
            console.log(result);
        }
    });
    const deleteTaskButton = document.getElementById("delete-task-button");
    deleteTaskButton.addEventListener("click", async function() {
        const confirmed = confirm("Supprimer cette tâche ?");

        if (!confirmed) {
            return;
        }

        const result = await deleteTask(task.id);

        if (result.ok) {
            renderProject(project, workspace);
        }
    });
    const backButton = document.getElementById("back-task-button");

    backButton.addEventListener("click", function() {
        renderProject(project, workspace);
    });
    console.log(task.assignee_id);
}

initApp();