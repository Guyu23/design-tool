import { defineStore } from 'pinia'

interface DesignToolState {
  userElements: {
    id: string;
    type: string;
    x: number;
    y: number;
    [key: string]: any;
  }[];
  selectedIds: string[]; // 框选元素的id（框选，多选，批量操作）
  toolType: string; // 工具类型, 选择，删除，拖拽移动，矩形，圆形，直线，点，三角形
  selectedElement: {
    id: string;
    type: string;
    x: number;
    y: number;
    [key: string]: any;
  } | null; // 选中元素（点击单选）
}


export const useDesignToolStore = defineStore('designTool', {
  state: (): DesignToolState => ({
    userElements: [],
    selectedIds: [],
    toolType: 'select',
    selectedElement: null
  }),
  actions: {
    addElement(element: any) {
      this.userElements.push(element);
    }
  },
  persist: true
})
