<template>
  <svg viewBox="0 0 24 24" :width="size" :height="size" :fill="color">
    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
  </svg>
</template>

<script lang="ts" setup>
withDefaults(defineProps<{ size?: number, color?: string }>(), {
  size: 24,
  color: 'currentColor',
})
</script>
