<template>
  <svg viewBox="0 0 24 24" :width="size" :height="size" :fill="color">
    <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
  </svg>
</template>

<script lang="ts" setup>
withDefaults(defineProps<{ size?: number; color?: string }>(), {
  size: 24,
  color: 'currentColor',
})
</script>
