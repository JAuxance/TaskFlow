import { getCurrentUser } from "../auth.js";
import {
    getWorkspacesMembers,
    addWorkspaceMember,
    updateWorkspaceMemberRole,
    deleteWorkspaceMember,
    updateWorkspace,
    deleteWorkspace,
} from "../workspaces.js";
import { getProjects, createProject, getProjectById } from "../projects.js";

export async function renderWorkspace(workspace, { renderApp, renderWorkspace, renderProject }) {
    const app = document.getElementById("app");

    app.innerHTML = `
        <button id="back-button">← Retour</button>

        <label for="workspace-name">Nom :</label>
    <input
        id="workspace-name"
        type="text"
        value="${workspace.name}"
    >
        <button id="save-workspace-button">Enregistrer</button>
        <button id="delete-workspace-button">Supprimer le workspace</button>

        <p>Worksapce ID: ${workspace.id}</p>

        <h2>Projets</h2>
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
    `;
    const deleteWorkspaceButton = document.getElementById("delete-workspace-button");
    document.getElementById("delet-workspace-button");
    deleteWorkspaceButton.addEventListener("click", async function() {
        const confirmation = prompt(
            `Pour supprimer définitivement ce workspace, tape exactement : ${workspace.name}`
        );
        if (confirmation !== workspace.name) {
            alert("Le nom ne correspond pas. Supression annulée.")
            return;
        }
        const result = await deleteWorkspace(workspace.id);

        if (result.ok) {
            const userResult = await getCurrentUser();

            if (userResult.ok) {
                renderApp(userResult.data);
            }
        } else {
            console.log(result);
        }
    });
    const workspaceNameInput = document.getElementById("workspace-name");
    const saveWorkspaceButton = document.getElementById("save-workspace-button");

    saveWorkspaceButton.addEventListener("click", async function() {
        const result = await updateWorkspace(workspace.id, {
            name: workspaceNameInput.value
        });

        if (result.ok) {
            const userResult = await getCurrentUser();

            if (userResult.ok) {
                renderApp(userResult.data);
            }
        } else {
            console.log(result);
        }
    });
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
