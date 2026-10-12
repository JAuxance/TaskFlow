<template>
    <!-- Cookies and storage notice. Public page. -->
    <main id="page-content" class="privacy-page">
        <header>
            <a href="/">Back to TaskFlow</a>
            <h1>Cookies &amp; storage</h1>
            <p class="privacy-version">8 October 2026</p>
            <p>This page describes the storage used by TaskFlow. Cloudflare may set cookies needed to deliver and protect the public site. TaskFlow itself does not add an advertising or measurement cookie.</p>
        </header>
        <section aria-labelledby="session-heading">
            <h2 id="session-heading">Session cookie</h2>
            <p>The <code>session</code> cookie keeps you signed in and protects actions against unwanted requests. It can also be created before sign-in to protect the login and registration forms. It is a browser-session cookie; browser session restoration may preserve it. The server separately limits authenticated sessions to 24 hours and revokes the current session at sign-out.</p>
            <p>Blocking this cookie prevents normal sign-in and account actions. In production it is restricted to HTTPS and cannot be read by page JavaScript.</p>
        </section>
        <section aria-labelledby="theme-heading">
            <h2 id="theme-heading">Your appearance preference</h2>
            <p>When you choose a light or dark theme, <code>taskflow-theme</code> in local storage remembers that choice on this browser. It has no automatic expiry. Clearing this site's browser data removes it and restores the system preference. It contains no account identifier.</p>
        </section>
        <section aria-labelledby="external-heading">
            <h2 id="external-heading">External resources and tracking</h2>
            <p>The fonts and Socket.IO client are served with TaskFlow. The application does not include an advertising or audience-measurement script. Cloudflare may store what it needs to proxy and protect taskflow.auxance.dev.</p>
            <p>Storage needed for authentication, security and an appearance choice does not by itself require a general “accept all cookies” banner. Any future optional tracking must be assessed before activation. <a href="https://www.cnil.fr/fr/cookies-et-autres-traceurs/que-dit-la-loi">CNIL guidance on cookies and trackers</a>.</p>
        </section>
        <section aria-labelledby="questions-heading">
            <h2 id="questions-heading">Questions about your data</h2>
            <p>See the <a href="/confidentialite/">Privacy information</a> for account data, deletion and your rights.</p>
            <p>Questions: <a href="mailto:contact@auxance.dev?subject=TaskFlow%20-%20personal%20data%20request">contact@auxance.dev</a>.</p>
        </section>
    </main>
</template>
