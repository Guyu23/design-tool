import { defineStore } from 'pinia'

// localStorage 键名
const STORAGE_KEY = 'design-tool-data'

// 加载持久化数据
function loadPersistedData(): GraphicData {
  try {
    const savedData = localStorage.getItem(STORAGE_KEY)
    if (savedData) {
      const parsed = JSON.parse(savedData)
      return {
        axis: parsed.axis || { visible: true, style: {} },
        initialOutline: parsed.initialOutline || { digLines: [], blastingDesignLibraryParts: [] },
        userElements: parsed.userElements || [],
        selectedIds: parsed.selectedIds || []
      }
    }
  } catch (error) {
    console.warn('Failed to load persisted data:', error)
  }
  
  // 返回默认数据
  return {
    axis: { visible: true, style: {} },
    initialOutline: { digLines: [], blastingDesignLibraryParts: [] },
    userElements: [],
    selectedIds: []
  }
}

// 保存数据到localStorage
function saveToLocalStorage(data: GraphicData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (error) {
    console.warn('Failed to save data to localStorage:', error)
  }
}

// 工具类型枚举
export const ToolType = {
  SELECT: 'select',
  POINT: 'point',
  LINE: 'line',
  CIRCLE: 'circle',
  RECTANGLE: 'rectangle'
} as const;

export type ToolType = typeof ToolType[keyof typeof ToolType];

// 基础图形元素接口
export interface BaseElement {
  id: string;
  type: string;
  x: number;
  y: number;
  style?: {
    stroke?: string;
    strokeWidth?: number;
    fill?: string;
  };
}

// 点元素
export interface PointElement extends BaseElement {
  type: 'point';
  radius?: number;
}

// 线元素
export interface LineElement extends BaseElement {
  type: 'line';
  x2: number;
  y2: number;
}

// 圆元素
export interface CircleElement extends BaseElement {
  type: 'circle';
  radius: number;
}

// 矩形元素
export interface RectangleElement extends BaseElement {
  type: 'rectangle';
  width: number;
  height: number;
}

// 联合类型
export type GraphicElement = PointElement | LineElement | CircleElement | RectangleElement;

// 图形数据分类
export interface GraphicData {
  // 坐标轴相关
  axis: {
    visible: boolean;
    style: any;
  };
  // 初始轮廓数据
  initialOutline: {
    digLines: any[];
    blastingDesignLibraryParts: any[];
  };
  // 用户绘制的图形元素
  userElements: GraphicElement[];
  // 选中的元素ID列表
  selectedIds: string[];
}

export const useDesignToolStore = defineStore('designTool', {
  state: (): {
    currentTool: ToolType;
    isDrawing: boolean;
    data: GraphicData;
  } => ({
    // 当前选中的工具
    currentTool: ToolType.SELECT,
    // 是否正在绘制
    isDrawing: false,
    // 图形数据
    data: loadPersistedData()
  }),

  getters: {
    // 获取所有用户绘制的元素
    getUserElements: (state) => state.data.userElements,
    
    // 获取选中的元素
    getSelectedElements: (state) => 
      state.data.userElements.filter(el => state.data.selectedIds.includes(el.id)),
    
    // 检查是否为绘图工具
    isDrawingTool: (state) => 
      [ToolType.POINT, ToolType.LINE, ToolType.CIRCLE, ToolType.RECTANGLE].includes(state.currentTool as any)
  },

  actions: {
    // 设置当前工具
    setCurrentTool(tool: ToolType) {
      this.currentTool = tool;
      this.isDrawing = false;
      // 如果切换到选择工具，清除选中状态
      if (tool === ToolType.SELECT) {
        this.data.selectedIds = [];
      }
    },

    // 切换工具（如果已选中则切换回选择模式）
    toggleTool(tool: ToolType) {
      if (this.currentTool === tool) {
        this.setCurrentTool(ToolType.SELECT);
      } else {
        this.setCurrentTool(tool);
      }
    },

    // 设置绘制状态
    setDrawing(isDrawing: boolean) {
      this.isDrawing = isDrawing;
    },

    // 添加图形元素
    addElement(element: GraphicElement) {
      this.data.userElements.push(element);
      this.saveData();
    },

    // 删除图形元素
    removeElement(id: string) {
      const index = this.data.userElements.findIndex(el => el.id === id);
      if (index > -1) {
        this.data.userElements.splice(index, 1);
      }
      // 同时从选中列表中移除
      this.removeFromSelection(id);
      this.saveData();
    },

    // 更新图形元素
    updateElement(id: string, updates: Partial<GraphicElement>) {
      const element = this.data.userElements.find(el => el.id === id);
      if (element) {
        Object.assign(element, updates);
        this.saveData();
      }
    },

    // 选中元素
    selectElement(id: string) {
      if (!this.data.selectedIds.includes(id)) {
        this.data.selectedIds.push(id);
      }
    },

    // 取消选中元素
    removeFromSelection(id: string) {
      const index = this.data.selectedIds.indexOf(id);
      if (index > -1) {
        this.data.selectedIds.splice(index, 1);
      }
    },

    // 清除所有选中
    clearSelection() {
      this.data.selectedIds = [];
    },

    // 设置初始轮廓数据
    setInitialOutline(data: { digLines: any[]; blastingDesignLibraryParts: any[] }) {
      this.data.initialOutline = data;
    },

    // 生成唯一ID
    generateId(): string {
      return `element_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    },

    // 保存数据到localStorage
    saveData() {
      saveToLocalStorage(this.data);
    },

    // 清除所有用户绘制的元素
    clearUserElements() {
      this.data.userElements = [];
      this.data.selectedIds = [];
      this.saveData();
    },

    // 手动加载数据（用于重置或恢复）
    loadData() {
      this.data = loadPersistedData();
    }
  }
})
