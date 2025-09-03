<script setup lang="ts">
import { onMounted, ref, computed } from "vue";
import DesignTool from "./scripts/design-tool/design-tool";

const designTool = ref<DesignTool | null>(null);

onMounted(() => {
  const container = document.querySelector(".container");
  designTool.value = new DesignTool(container as HTMLElement);
});
</script>

<template>
  <button @click="designTool?.resetToInitial()">复位</button>
  <div class="container" ref="containerRef"></div>
</template>

<style scoped lang="scss">
button {
  position: absolute;
  top: 10px;
  right: 10px;
  padding: 8px 16px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #f5f5f5;
  }

  &.active {
    background: #2196F3;
    color: white;
    border-color: #2196F3;
  }
}

.circle {
  right: 100px;
}

.point {
  right: 150px;
}

.line {
  right: 200px;
}

.rect {
  right: 250px;
}

.container {
  width: 90%;
  height: 90%;
  border: 1px solid #eee;
  border-radius: 10px;
  box-shadow: 0 0 10px 0 rgba(0, 0, 0, 0.1);
}
</style>
