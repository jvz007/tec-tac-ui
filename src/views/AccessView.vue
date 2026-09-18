<script setup>
import { ref } from 'vue'
import UsersPanel from '../components/access/UsersPanel.vue'
import RolesPanel from '../components/access/RolesPanel.vue'
import SessionPanel from '../components/access/SessionPanel.vue'
import { requestLeave } from '../unsaved'

const tab = ref('users')
const tabs = [
  { id:'users', label:'Users', hint:'Tactical accounts and role assignment' },
  { id:'roles', label:'Roles & permissions', hint:'Native Tactical and Tec-Tac grants' },
  { id:'session', label:'My session', hint:'Resolved identity and logout' },
]

function selectTab(id) {
  if (id === tab.value) return
  requestLeave(() => { tab.value = id })
}
</script>

<template>
  <section>
    <div class="phead"><div><span class="eyebrow">ACCESS MANAGEMENT</span><h1>Users, roles & permissions</h1><p>Tactical remains the authentication and native RBAC authority. Tec-Tac extends Tactical roles with extension-specific permission grants without changing Tactical source.</p></div></div>
    <nav class="subtabs" aria-label="Access management sections">
      <button v-for="item in tabs" :key="item.id" :class="{ active: tab === item.id }" @click="selectTab(item.id)"><b>{{ item.label }}</b><span>{{ item.hint }}</span></button>
    </nav>
    <UsersPanel v-if="tab === 'users'" />
    <RolesPanel v-else-if="tab === 'roles'" />
    <SessionPanel v-else />
  </section>
</template>
