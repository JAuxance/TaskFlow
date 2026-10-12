<script setup lang="ts">
// Temporary page: it only shows that the foundation reaches the API. The
// migrated login screen replaces it.
import { useSessionStore } from '../stores/session';

const session = useSessionStore();
</script>

<template>
    <main id="page-content" class="login-page">
        <section class="login-form">
            <div class="login-heading">
                <div class="login-brand"><span>TaskFlow</span></div>
                <h1>Vue foundation</h1>
            </div>
            <p v-if="session.status === 'unknown'" role="status">Checking your session…</p>
            <p v-else-if="session.status === 'signed-in'" role="status">Signed in as {{ session.user?.username }}.</p>
            <p v-else-if="session.status === 'signed-out'" role="status">Not signed in.</p>
            <p v-else class="form-message" role="alert">{{ session.error }}</p>
            <p class="secondary-text">No screen has been migrated yet. The application runs on port 5500.</p>
        </section>
    </main>
</template>
