<script
  setup
  lang="ts"
>
import { onMounted, ref, computed, watch } from "vue";
import DesignTool from "./scripts/design-tool/design-tool";
import { useDesignToolStore } from "./store/useDesignTool";

const designToolStore = useDesignToolStore();
const designTool = ref<DesignTool | null>(null);

watch(() => designToolStore.holeType, () => {
  console.log('designToolStore.holeType', designToolStore.holeType);
});

onMounted(() => {
  const container = document.querySelector(".container");
  designTool.value = new DesignTool(container as HTMLDivElement);
});

function changeToolType(type: string) {
  designToolStore.toolType = type
}
</script>

<template>
  <div class="function">
    <select v-model="designToolStore.holeType"
            @change="designToolStore.holeLevel = 1">
      <option value="peripheralhole">周边孔</option>
      <option value="cuthole">掏槽孔</option>
      <option value="reliefhole">辅助孔</option>
      <option value="floorhole">底板孔</option>
    </select>
    <input type="number"
           v-model="designToolStore.holeLevel">
    <select name=""
            id=""
            v-model="designToolStore.toolType">
      <option value="select">选择</option>
      <option value="circle">圆形</option>
      <option value="rectangle">矩形</option>
      <option value="line">直线</option>
      <option value="point">点</option>
      <option value="diamond">菱形</option>
      <option value="triangle">三角形</option>
      <option value="polygon">多边形</option>
      <option value="delete">删除</option>
    </select>
    <button @click="designTool?.resetToInitial()">复位</button>
  </div>
  <div class="container"
       ref="containerRef">
  </div>
</template>

<style
  scoped
  lang="scss"
>
.function {
  position: absolute;
  padding: 0 10px;
  top: 10px;
  display: flex;
  align-items: center;
  gap: 10px;

  button {
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
}

.container {
  width: 90%;
  height: 90%;
  border: 1px solid #eee;
  border-radius: 10px;
  box-shadow: 0 0 10px 0 rgba(0, 0, 0, 0.1);
  position: relative;
}
</style>
