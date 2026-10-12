<template>
    <!-- Privacy notice. Public page. -->
    <main id="page-content" class="privacy-page">
        <header>
            <a href="/">Back to TaskFlow</a>
            <h1>Privacy</h1>
            <p class="privacy-version">8 October 2026</p>
            <p class="privacy-notice">TaskFlow is operated by Auxance Jourdan. For a personal-data request, write to <a href="mailto:contact@auxance.dev?subject=TaskFlow%20-%20personal%20data%20request">contact@auxance.dev</a>. Do not send your password.</p>
        </header>
        <section aria-labelledby="data-heading">
            <h2 id="data-heading">The data used by TaskFlow</h2>
            <p>A username, email address and password are needed to create and secure an account. Passwords are stored as hashes, not as readable passwords. Your first name and profile picture are optional; you can clear them in your profile.</p>
            <p>The application stores your workspace memberships and roles, projects, tasks, uploaded workspace icons, workspace messages and direct messages. It also uses sessions and technical information such as IP addresses to operate and protect the service.</p>
        </section>
        <section aria-labelledby="purpose-heading">
            <h2 id="purpose-heading">Why this information is used</h2>
            <p>Account information enables sign-in and identifies your contributions. Memberships and roles control access. Tasks and messages support collaboration. Technical information helps detect errors and limit abusive requests.</p>
            <p>Running the account and the collaboration features you ask for is done to provide the service. Keeping sessions, limiting abusive requests and recording technical errors is done for the legitimate interest of protecting the service and the people who use it.</p>
        </section>
        <section aria-labelledby="sharing-heading">
            <h2 id="sharing-heading">Who can see your information</h2>
            <p>Workspace members can see the shared projects, tasks and workspace chat, together with the usernames, roles and pictures needed to collaborate. The member list does not disclose email addresses. Direct messages are limited to the participants while they share a workspace. Administrators of the service may access data when necessary for maintenance or a data request.</p>
            <p>The service is hosted on a VPS controlled by the operator. Cloudflare proxies the public site, terminates HTTPS and can see connection data needed to deliver and protect traffic. That data may be processed outside the country where the VPS is located, under Cloudflare's contract with the operator. TaskFlow does not sell data and does not use an audience-measurement tool. The Socket.IO script, fonts and styles are served by TaskFlow itself.</p>
        </section>
        <section aria-labelledby="control-heading">
            <h2 id="control-heading">Access and control</h2>
            <p>In your profile, you can change or clear your first name, remove your picture and download a JSON copy of your account information, memberships, accessible tasks attributed to you and messages you sent. The download asks for your current password. It does not include other people's message history, password hashes or session tokens.</p>
            <p>You may request access, correction, deletion, restriction, objection or portability where the corresponding right applies. For other data, an image copy, a large export or a username/email correction, use the contact below. Changing an email address requires identity and address verification.</p>
            <p>Write to <a href="mailto:contact@auxance.dev?subject=TaskFlow%20-%20personal%20data%20request">contact@auxance.dev</a>. Say what you are asking for (access, correction, deletion, restriction, objection or a copy) and enough detail to find the account. Do not send your password. If you can still sign in, use the profile actions first. Requests are answered within one month. A username or email change is applied only after the operator can verify the account and the new address.</p>
            <p>You can also <a href="https://www.cnil.fr/fr/adresser-une-plainte">contact the French data protection authority, the CNIL</a>.</p>
        </section>
        <section aria-labelledby="deletion-heading">
            <h2 id="deletion-heading">Account deletion and shared content</h2>
            <p>Account deletion first shows a summary and asks for your current password. It is blocked if you own a workspace with other members: transfer ownership or explicitly delete that workspace first. Deleting the account removes all sessions, memberships, direct messages (including those visible to the other participant) and the solo workspaces listed in the summary, with their projects, tasks and chat. Current uploaded profile and workspace images are queued for removal; disk failures are retried separately, and images with no remaining profile/workspace reference are no longer served.</p>
            <p>Tasks and messages left in another person's workspace can remain with your account reference removed. Their text may still contain personal information; removing the account reference does not automatically make the content anonymous.</p>
        </section>
        <section aria-labelledby="retention-heading">
            <h2 id="retention-heading">Storage and retention</h2>
            <p>A signed-in session lasts 24 hours. Expired sessions, and sessions revoked for more than 7 days, are deleted by the cleanup job. Projects, tasks and messages stay until the workspace or the account is deleted. An uploaded image that is no longer referenced is deleted after 24 hours. Database backups are kept for 30 days and at most 14 copies, outside the application repository. A deleted account can remain inside an older backup until that copy expires. Each account deletion is also written to a file kept outside the database for 30 days, whether you delete the account yourself or the operator does it for you. After a restore, those recorded deletions are applied again before the service is reopened. Image files live on separate volumes and are not inside the SQL dump.</p>
            <p>See <a href="/cookies/">Cookies &amp; storage</a> for the information stored in your browser.</p>
        </section>
    </main>
</template>
