<script setup lang="ts">
// Shown on arrival to someone who has no workspace yet.
import { useCreateWorkspace } from '../layout/createWorkspace';

const createWorkspace = useCreateWorkspace();
</script>

<template>
    <div class="empty-state empty-state-panel welcome-panel">
        <h1>Your next project starts here</h1>
        <p>Create a workspace to bring your team and tasks together.</p>
        <button type="button" class="btn-primary" @click="createWorkspace">Create a workspace</button>
    </div>
</template>
