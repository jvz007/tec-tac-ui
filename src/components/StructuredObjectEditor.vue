<script setup>
import { computed, ref, watch } from 'vue'

const props = defineProps({
  modelValue: { type: Object, default: () => ({}) },
  title: { type: String, default: '' },
  excludeKeys: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue'])
const advanced = ref(false)
const raw = ref('')
const rawError = ref('')
const newKey = ref('')
const newType = ref('string')

const value = computed(() => props.modelValue && typeof props.modelValue === 'object' && !Array.isArray(props.modelValue) ? props.modelValue : {})
const entries = computed(() => Object.entries(value.value).filter(([key]) => !props.excludeKeys.includes(key)))

function clone(input){ return JSON.parse(JSON.stringify(input ?? {})) }
function commit(next){ emit('update:modelValue', next) }
function setKey(key, nextValue){ const next=clone(value.value); next[key]=nextValue; commit(next) }
function removeKey(key){ const next=clone(value.value); delete next[key]; commit(next) }
function addKey(){ const key=newKey.value.trim(); if(!key || Object.prototype.hasOwnProperty.call(value.value,key)) return; const defaults={string:'',number:0,boolean:false,object:{},array:[]}; setKey(key,clone(defaults[newType.value])); newKey.value='' }
function primitiveInput(event, current){
  if(typeof current==='number'){ const n=Number(event.target.value); return Number.isFinite(n)?n:0 }
  return event.target.value
}
function setArrayItem(key,index,nextValue){ const arr=clone(value.value[key]||[]); arr[index]=nextValue; setKey(key,arr) }
function removeArrayItem(key,index){ const arr=clone(value.value[key]||[]); arr.splice(index,1); setKey(key,arr) }
function addArrayItem(key){ const arr=clone(value.value[key]||[]); const sample=arr[0]; arr.push(typeof sample==='number'?0:typeof sample==='boolean'?false:sample&&typeof sample==='object'?{}:''); setKey(key,arr) }
function syncRaw(){ raw.value=JSON.stringify(value.value,null,2); rawError.value='' }
function toggleAdvanced(){ advanced.value=!advanced.value; if(advanced.value) syncRaw() }
function applyRaw(){ try{ const parsed=JSON.parse(raw.value||'{}'); if(!parsed || typeof parsed!=='object' || Array.isArray(parsed)) throw new Error('Value must be a JSON object.'); commit(parsed); rawError.value='' }catch(e){ rawError.value=e.message||'Invalid JSON.' } }
watch(()=>props.modelValue,()=>{ if(advanced.value) syncRaw() },{deep:true})
</script>

<template>
  <div class="structured-object-editor">
    <div class="structured-head"><span v-if="title" class="eyebrow">{{ title }}</span><button type="button" class="btn sm" @click="toggleAdvanced">{{ advanced ? 'Structured view' : 'Advanced JSON' }}</button></div>
    <template v-if="advanced">
      <textarea v-model="raw" class="mono schedule-json" rows="8" @blur="applyRaw"></textarea>
      <div v-if="rawError" class="state-inline denied smalltext">{{ rawError }}</div>
    </template>
    <template v-else>
      <div v-if="!entries.length" class="muted smalltext structured-empty">No fields configured.</div>
      <div v-for="([key,item]) in entries" :key="key" class="structured-row">
        <div class="structured-label"><span class="mono">{{ key }}</span><button type="button" class="icon-button dangertext" title="Remove field" @click="removeKey(key)">×</button></div>
        <label v-if="typeof item==='boolean'" class="checkline structured-control"><input :checked="item" type="checkbox" @change="setKey(key,$event.target.checked)"> {{ item ? 'True' : 'False' }}</label>
        <input v-else-if="typeof item==='string' || typeof item==='number'" class="structured-control" :class="{mono:typeof item==='number'}" :type="typeof item==='number'?'number':'text'" :value="item" @input="setKey(key,primitiveInput($event,item))">
        <div v-else-if="Array.isArray(item)" class="structured-array structured-control">
          <div v-for="(entry,index) in item" :key="index" class="structured-array-row">
            <input v-if="typeof entry==='string'||typeof entry==='number'" :type="typeof entry==='number'?'number':'text'" :value="entry" @input="setArrayItem(key,index,primitiveInput($event,entry))">
            <label v-else-if="typeof entry==='boolean'" class="checkline"><input :checked="entry" type="checkbox" @change="setArrayItem(key,index,$event.target.checked)"> {{entry?'True':'False'}}</label>
            <StructuredObjectEditor v-else-if="entry && typeof entry==='object'" :model-value="entry" @update:model-value="setArrayItem(key,index,$event)" />
            <button type="button" class="icon-button dangertext" title="Remove item" @click="removeArrayItem(key,index)">×</button>
          </div>
          <button type="button" class="btn sm" @click="addArrayItem(key)">Add item</button>
        </div>
        <StructuredObjectEditor v-else-if="item && typeof item==='object'" class="structured-control nested" :model-value="item" @update:model-value="setKey(key,$event)" />
        <input v-else class="structured-control" value="" @input="setKey(key,$event.target.value)">
      </div>
      <div class="structured-add">
        <input v-model="newKey" placeholder="New field name" @keydown.enter.prevent="addKey">
        <select v-model="newType"><option value="string">Text</option><option value="number">Number</option><option value="boolean">Yes / No</option><option value="object">Object</option><option value="array">List</option></select>
        <button type="button" class="btn sm" :disabled="!newKey.trim()" @click="addKey">Add field</button>
      </div>
    </template>
  </div>
</template>
