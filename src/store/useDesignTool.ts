import { defineStore } from "pinia";

interface DesignToolState {
  userElements: Map<string, any>;
  selectedIds: string[]; // 框选元素的id（框选，多选，批量操作）
  holeType: string; // 孔类型
  holeLevel: number; // 孔层级
  toolType: string; // 工具类型, 选择，删除，拖拽移动，矩形，圆形，直线，点，三角形
  selectedElement: any; // 选中元素（点击单选）
  history: any[]; // 历史记录
}

export const useDesignToolStore = defineStore("designTool", {
  state: (): DesignToolState => ({
    userElements: new Map(),
    selectedIds: [],
    holeType: "peripheralhole",
    holeLevel: 1,
    toolType: "select",
    selectedElement: null,
    history: [],
  }),
  getters: {
    curLayerId: (state: DesignToolState) =>
      `${state.holeType}-${state.holeLevel}`,
  },
  actions: {},
  persist: true,
});
