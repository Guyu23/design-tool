<script setup lang="ts">
import { onMounted, ref, computed } from "vue";
import DesignTool from "@/scripts/design-tool/design-tool";
import { ToolType } from "@/store/useDesignTool";

const containerRef = ref<HTMLElement | null>(null);
const designRef = ref<any>(null);

const handleReset = () => {
  if (designRef.value) {
    designRef.value.resetToInitial();
  }
};

const handlePoint = () => {
  if (designRef.value) {
    designRef.value.getStore().toggleTool(ToolType.POINT);
  }
};

const handleLine = () => {
  if (designRef.value) {
    designRef.value.getStore().toggleTool(ToolType.LINE);
  }
};

const handleCircle = () => {
  if (designRef.value) {
    designRef.value.getStore().toggleTool(ToolType.CIRCLE);
  }
};

const handleRect = () => {
  if (designRef.value) {
    designRef.value.getStore().toggleTool(ToolType.RECTANGLE);
  }
};

// 计算按钮状态
const currentTool = computed(() => {
  return designRef.value?.getStore().currentTool || ToolType.SELECT;
});

onMounted(async () => {
  designRef.value = new DesignTool(containerRef.value as HTMLElement);
  // 加载测试数据
  await designRef.value.loadTestData();
});
</script>

<template>
  <button class="reset" @click="handleReset">复位</button>
  <button 
    class="circle" 
    :class="{ active: currentTool === ToolType.CIRCLE }"
    @click="handleCircle"
  >圆</button>
  <button 
    class="point" 
    :class="{ active: currentTool === ToolType.POINT }"
    @click="handlePoint"
  >点</button>
  <button 
    class="line" 
    :class="{ active: currentTool === ToolType.LINE }"
    @click="handleLine"
  >线</button>
  <button 
    class="rect" 
    :class="{ active: currentTool === ToolType.RECTANGLE }"
    @click="handleRect"
  >矩形</button>
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
