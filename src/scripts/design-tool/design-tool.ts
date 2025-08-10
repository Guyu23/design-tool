import * as d3 from "d3";
import { useDesignToolStore, type GraphicElement, ToolType } from "@/store/useDesignTool";

// 数据类型定义
interface GeometryData {
  sx: string;
  sy: string;
  ex: string;
  ey: string;
  r?: string | null;
  startAngle?: string | null;
  endAngle?: string | null;
  x?: string | null;
  y?: string | null;
}

interface BlastingPart {
  partName: string;
  parts: GeometryData[];
}

interface TestData {
  digLines: GeometryData[];
  blastingDesignLibraryParts: BlastingPart[];
}

export default class DesignTool {
  private container: HTMLElement;
  private svg: d3.Selection<SVGSVGElement, unknown, null, undefined> | null =
    null;
  private width: number = 0;
  private height: number = 0;
  private margin = { top: 20, right: 20, bottom: 20, left: 20 };

  // 坐标系统相关
  private xScale: d3.ScaleLinear<number, number> | null = null;
  private yScale: d3.ScaleLinear<number, number> | null = null;
  private zoom: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null;
  private transform = d3.zoomIdentity;

  // SVG 分组
  private mainGroup: d3.Selection<
    SVGGElement,
    unknown,
    null,
    undefined
  > | null = null;
  private axisGroup: d3.Selection<
    SVGGElement,
    unknown,
    null,
    undefined
  > | null = null;
  private zeroLinesGroup: d3.Selection<
    SVGGElement,
    unknown,
    null,
    undefined
  > | null = null;
  private shapesGroup: d3.Selection<
    SVGGElement,
    unknown,
    null,
    undefined
  > | null = null;
  private userElementsGroup: d3.Selection<
    SVGGElement,
    unknown,
    null,
    undefined
  > | null = null;

  // 基础单位像素（以Y轴为准）
  private baseUnitPixels = 20;

  // 尺寸监听器
  private resizeObserver: ResizeObserver | null = null;

  // 缓存测试数据，用于重绘
  private cachedTestData: TestData | null = null;
  
  // 缓存初始变换，用于复位功能
  private initialTransform: d3.ZoomTransform | null = null;

  // Store实例
  private store = useDesignToolStore();

  // 绘制状态
  private isCurrentlyDrawing = false;
  private drawingStartPoint: { x: number; y: number } | null = null;
  private previewElement: d3.Selection<any, unknown, null, undefined> | null = null;

  // 拖拽状态
  private isDraggingElement = false;
  private draggedElementId: string | null = null;
  private dragStartPoint: { x: number; y: number } | null = null;
  private elementStartPosition: { x: number; y: number } | null = null;

  // 控制点拖拽状态
  private isDraggingHandle = false;
  private draggedHandleType: string | null = null; // 'resize-tl', 'resize-tr', 'resize-bl', 'resize-br', 'line-start', 'line-end', 'point-resize'
  private handleStartData: any = null; // 存储拖拽开始时的元素数据

  // 控制点组
  private controlsGroup: d3.Selection<SVGGElement, unknown, null, undefined> | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.init();
    this.setupStoreWatchers();
  }

  private init() {
    this.setupDimensions();
    this.createSVG();
    this.setupScales();
    this.setupGroups();
    this.setupZoom();
    this.drawAxis();
    this.drawZeroLines();
    this.setupResizeObserver();
    
    // 渲染从localStorage加载的用户元素
    this.renderUserElements();
  }

  private setupDimensions() {
    const rect = this.container.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
  }

  private createSVG() {
    this.svg = d3
      .select(this.container)
      .append("svg")
      .attr("width", this.width)
      .attr("height", this.height)
      .style("background-color", "#fff")
      .style("cursor", "grab");
  }

  private setupScales() {
    // 计算有效绘图区域（排除坐标轴占用的空间）
    const effectiveWidth = this.width - this.margin.left - this.margin.right;
    const effectiveHeight = this.height - this.margin.top - this.margin.bottom;

    // Y轴固定显示范围 [-10, 10]，共20个单位
    const yRange = 20; // 从-10到10
    // 根据Y轴范围计算像素单位
    this.baseUnitPixels = effectiveHeight / yRange;
    // X轴根据有效宽度和像素单位计算范围，保持1:1比例
    const xRange = effectiveWidth / this.baseUnitPixels;

    // 比例尺映射到有效绘图区域（不包括坐标轴空间）
    this.xScale = d3
      .scaleLinear()
      .domain([-xRange / 2, xRange / 2])
      .range([this.margin.left, this.width - this.margin.right]);

    this.yScale = d3
      .scaleLinear()
      .domain([-10, 10]) // 固定Y轴范围
      .range([this.height - this.margin.bottom, this.margin.top]);
  }



  private setupGroups() {
    if (!this.svg) return;

    // 主绘图组（会被缩放和平移）
    this.mainGroup = this.svg.append("g").attr("class", "main-group");

    // 零点线组（在主组内，会跟随变换）
    this.zeroLinesGroup = this.mainGroup
      .append("g")
      .attr("class", "zero-lines");

    // 图形组（在主组内，会跟随变换）
    this.shapesGroup = this.mainGroup.append("g").attr("class", "shapes");

    // 用户绘制元素组（在主组内，会跟随变换）
    this.userElementsGroup = this.mainGroup.append("g").attr("class", "user-elements");

    // 控制点组（在主组内，会跟随变换）
    this.controlsGroup = this.mainGroup.append("g").attr("class", "controls");

    // 坐标轴组（固定位置，不跟随缩放平移）
    this.axisGroup = this.svg.append("g").attr("class", "axis");
  }

  private setupZoom() {
    if (!this.svg || !this.xScale || !this.yScale) return;

    // 计算缩放限制：Y轴从[-10,10]到[-30,30]，即最大缩小到1/3
    // 最大放大到显示[-3.33,3.33]，即放大3倍
    this.zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([1 / 3, 3]) // 缩小到1/3，放大到3倍
      .filter((event) => {
        // 在绘图模式下，只允许缩放（滚轮事件），禁用拖拽（鼠标拖拽事件）
        if (this.store.isDrawingTool) {
          // 允许滚轮缩放，但禁用鼠标拖拽
          return event.type === 'wheel';
        }
        
        // 如果正在拖拽图形元素或控制点，禁用坐标系的拖拽，但允许缩放
        if (this.isDraggingElement || this.isDraggingHandle) {
          return event.type === 'wheel';
        }
        
        return true;
      })
      .on("zoom", (event) => {
        this.transform = event.transform;
        this.updateOnZoom();
      });

    this.svg.call(this.zoom);

    // 添加绘图交互事件
    this.setupDrawingInteractions();
  }

  private updateOnZoom() {
    if (!this.mainGroup || !this.xScale || !this.yScale) return;

    // 应用变换到主组
    this.mainGroup.attr("transform", this.transform.toString());

    // 重新绘制坐标轴（需要根据新的缩放级别调整）
    this.drawAxis();

    // 重新绘制零点线（需要根据新的视口范围调整）
    this.drawZeroLines();
  }

  private drawAxis() {
    if (!this.axisGroup || !this.xScale || !this.yScale) return;

    // 清除之前的坐标轴
    this.axisGroup.selectAll("*").remove();

    // 计算当前的坐标范围（考虑缩放和平移）
    const currentXScale = this.transform.rescaleX(this.xScale);
    const currentYScale = this.transform.rescaleY(this.yScale);

    // X轴（在底部，距离底部20px）
    const xAxisGroup = this.axisGroup
      .append("g")
      .attr("class", "x-axis")
      .attr("transform", `translate(0, ${this.height - this.margin.bottom})`);

    // Y轴（在右侧，距离右侧20px）
    const yAxisGroup = this.axisGroup
      .append("g")
      .attr("class", "y-axis")
      .attr("transform", `translate(${this.width - this.margin.right}, 0)`);

    // 创建坐标轴生成器
    const xAxis = d3
      .axisBottom(currentXScale)
      .tickSize(12) // X轴主刻度长度
      .tickPadding(8);

    const yAxis = d3
      .axisRight(currentYScale)
      .tickSize(12) // Y轴主刻度长度
      .tickPadding(8);

    // 动态计算刻度密度
    const xDomain = currentXScale.domain();
    const yDomain = currentYScale.domain();

    // 根据缩放级别计算合适的刻度间距
    const tickSpacing = this.calculateOptimalTickSpacing(this.transform.k);

    // 计算主刻度和副刻度
    const xMajorTicks = this.generateTicks(
      xDomain[0],
      xDomain[1],
      tickSpacing.major
    );
    const yMajorTicks = this.generateTicks(
      yDomain[0],
      yDomain[1],
      tickSpacing.major
    );

    const xMinorTicks = this.generateTicks(
      xDomain[0],
      xDomain[1],
      tickSpacing.minor
    );
    const yMinorTicks = this.generateTicks(
      yDomain[0],
      yDomain[1],
      tickSpacing.minor
    );

    // 绘制X轴主刻度
    xAxisGroup.call(xAxis.tickValues(xMajorTicks));

    // 绘制X轴副刻度
    xAxisGroup
      .selectAll(".minor-tick")
      .data(xMinorTicks.filter((d) => !xMajorTicks.includes(d)))
      .enter()
      .append("line")
      .attr("class", "minor-tick")
      .attr("x1", (d) => currentXScale(d))
      .attr("x2", (d) => currentXScale(d))
      .attr("y1", 0)
      .attr("y2", 6)
      .attr("stroke", "#ccc")
      .attr("stroke-width", 1);

    // 绘制Y轴主刻度
    yAxisGroup.call(yAxis.tickValues(yMajorTicks));

    // 绘制Y轴副刻度
    yAxisGroup
      .selectAll(".minor-tick")
      .data(yMinorTicks.filter((d) => !yMajorTicks.includes(d)))
      .enter()
      .append("line")
      .attr("class", "minor-tick")
      .attr("x1", 0)
      .attr("x2", 6) // 向右（正方向）显示，长度为3px
      .attr("y1", (d) => currentYScale(d))
      .attr("y2", (d) => currentYScale(d))
      .attr("stroke", "#ccc")
      .attr("stroke-width", 1);

    // 设置坐标轴样式
    this.axisGroup
      .selectAll(".domain")
      .attr("stroke", "#ccc")
      .attr("stroke-width", 1);
    this.axisGroup
      .selectAll(".tick text")
      .attr("fill", "#ccc")
      .attr("font-size", "12px");
    this.axisGroup.selectAll(".tick line").attr("stroke", "#ccc");

    yAxisGroup
      .selectAll(".tick text")
      .style("transform", `translate(-15px, 10px)`);

    xAxisGroup
      .selectAll(".tick text")
      .style("transform", `translate(10px, -12px)`);
  }

  private drawZeroLines() {
    if (!this.zeroLinesGroup || !this.xScale || !this.yScale) return;

    // 清除之前的零点线
    this.zeroLinesGroup.selectAll("*").remove();

    // 计算当前变换后的可视区域范围
    const currentXScale = this.transform.rescaleX(this.xScale);
    const currentYScale = this.transform.rescaleY(this.yScale);

    // 获取当前可视区域的数据范围
    const visibleXDomain = currentXScale.domain();
    const visibleYDomain = currentYScale.domain();

    // 检查零点是否在可视范围内，如果在则绘制零点线

    // X轴零点线（垂直线）- 只有当x=0在可视范围内时才绘制
    if (visibleXDomain[0] <= 0 && visibleXDomain[1] >= 0) {
      this.zeroLinesGroup
        .append("line")
        .attr("class", "zero-line-x")
        .attr("x1", this.xScale(0))
        .attr("x2", this.xScale(0))
        .attr("y1", this.yScale(visibleYDomain[1])) // 从顶部可视区域开始
        .attr("y2", this.yScale(visibleYDomain[0])) // 到底部可视区域结束
        .attr("stroke", "#ccc")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "4,4");
    }

    // Y轴零点线（水平线）- 只有当y=0在可视范围内时才绘制
    if (visibleYDomain[0] <= 0 && visibleYDomain[1] >= 0) {
      this.zeroLinesGroup
        .append("line")
        .attr("class", "zero-line-y")
        .attr("x1", this.xScale(visibleXDomain[0])) // 从左侧可视区域开始
        .attr("x2", this.xScale(visibleXDomain[1])) // 到右侧可视区域结束
        .attr("y1", this.yScale(0))
        .attr("y2", this.yScale(0))
        .attr("stroke", "#ccc")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "4,4");
    }
  }

  private calculateOptimalTickSpacing(zoomScale: number): {
    major: number;
    minor: number;
  } {
    // 根据缩放级别调整刻度密度（缩放范围：1/3 到 3）
    let majorSpacing: number;
    let minorSpacing: number;

    if (zoomScale >= 2.5) {
      // 最大放大级别：显示约[-4,4]范围
      majorSpacing = 1;
      minorSpacing = 0.2;
    } else if (zoomScale >= 1.5) {
      // 中等放大级别：显示约[-6.7,6.7]范围
      majorSpacing = 1;
      minorSpacing = 0.5;
    } else if (zoomScale >= 1) {
      // 标准级别：显示[-10,10]范围
      majorSpacing = 2;
      minorSpacing = 0.5;
    } else if (zoomScale >= 0.5) {
      // 中等缩小级别：显示约[-20,20]范围
      majorSpacing = 5;
      minorSpacing = 1;
    } else {
      // 最大缩小级别：显示[-30,30]范围
      majorSpacing = 10;
      minorSpacing = 2;
    }

    return { major: majorSpacing, minor: minorSpacing };
  }

  private generateTicks(min: number, max: number, step: number): number[] {
    const ticks: number[] = [];
    const start = Math.ceil(min / step) * step;
    const end = Math.floor(max / step) * step;

    for (let i = start; i <= end; i += step) {
      // 避免浮点数精度问题
      const value = Math.round(i * 100) / 100; // 保留两位小数
      ticks.push(value);
    }

    return ticks;
  }

  private setupResizeObserver() {
    // 检查浏览器是否支持 ResizeObserver
    if (typeof ResizeObserver === "undefined") {
      console.warn("ResizeObserver is not supported in this browser");
      return;
    }

    this.resizeObserver = new ResizeObserver(() => {
      // 防抖处理，避免频繁重绘
      this.handleResize();
    });

    this.resizeObserver.observe(this.container);
  }

  private handleResize() {
    // 更新尺寸
    const rect = this.container.getBoundingClientRect();
    const newWidth = rect.width;
    const newHeight = rect.height;

    // 只有尺寸真的变化了才重绘
    if (newWidth !== this.width || newHeight !== this.height) {
      this.width = newWidth;
      this.height = newHeight;
      this.redraw();
    }
  }

  private redraw() {
    if (!this.svg) return;

    // 更新 SVG 尺寸
    this.svg.attr("width", this.width).attr("height", this.height);

    // 重新计算比例尺
    this.setupScales();

    // 重新应用缩放变换到比例尺
    if (this.zoom && this.xScale && this.yScale) {
      // 保持当前的变换状态
      this.svg.call(this.zoom.transform, this.transform);
    }

    // 重绘坐标轴和零点线
    this.drawAxis();
    this.drawZeroLines();

    // 重绘图形数据（如果有缓存的数据）
    if (this.cachedTestData) {
      this.redrawShapes();
    }
  }

  // 重绘图形（容器尺寸变化时调用）
  private redrawShapes() {
    if (!this.cachedTestData || !this.shapesGroup) return;

    // 清除之前的图形
    this.shapesGroup.selectAll("*").remove();

    // 重新绘制图形
    this.drawDigLines(this.cachedTestData.digLines);
    this.drawBlastingParts(this.cachedTestData.blastingDesignLibraryParts);
    
    // 重新绘制用户元素
    this.renderUserElements();
  }

  // 复位到初始状态（带动画）
  public resetToInitial() {
    if (!this.svg || !this.zoom || !this.initialTransform) return;

    this.svg
      .transition()
      .duration(600) // 600ms 动画时长
      .ease(d3.easeQuadInOut) // 平滑缓动
      .call(this.zoom.transform, this.initialTransform);
  }

  // 清理方法
  public destroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    if (this.svg) {
      this.svg.remove();
      this.svg = null;
    }

    // 清理缓存数据
    this.cachedTestData = null;
    this.initialTransform = null;
  }

  // 加载并绘制测试数据
  public async loadTestData() {
    try {
      const response = await fetch("/src/scripts/design-tool/test.json");
      const data: TestData = await response.json();
      this.drawTestData(data);
    } catch (error) {
      console.error("Failed to load test data:", error);
    }
  }

  // 绘制测试数据
  private drawTestData(data: TestData) {
    if (!this.shapesGroup || !this.xScale || !this.yScale) return;

    // 缓存数据用于重绘
    this.cachedTestData = data;

    // 保存初始轮廓数据到Store
    this.store.setInitialOutline({
      digLines: data.digLines,
      blastingDesignLibraryParts: data.blastingDesignLibraryParts
    });

    // 清除之前的图形
    this.shapesGroup.selectAll("*").remove();

    // 绘制轮廓线 (digLines)
    this.drawDigLines(data.digLines);

    // 绘制封闭区域 (blastingDesignLibraryParts)
    this.drawBlastingParts(data.blastingDesignLibraryParts);

    // 计算并应用初始变换（缩放和居中）
    this.fitToView(data);
  }

  // 绘制轮廓线
  private drawDigLines(digLines: GeometryData[]) {
    if (!this.shapesGroup || !this.xScale || !this.yScale) return;

    const digLinesGroup = this.shapesGroup
      .append("g")
      .attr("class", "dig-lines");

    // 将所有 digLines 视为一个整体的封闭轮廓
    let pathData = "";
    digLines.forEach((geometry, index) => {
      const path = this.createPathFromGeometry(geometry, index === 0);
      if (path) {
        pathData += path;
      }
    });

    // 闭合路径并绘制
    if (pathData) {
      pathData += " Z";

      digLinesGroup
        .append("path")
        .attr("d", pathData)
        .attr("stroke", "#ff6b6b")
        .attr("stroke-width", 2)
        .attr("fill", "none")
        .attr("class", "dig-lines-outline");
    }
  }

  // 绘制封闭区域
  private drawBlastingParts(parts: BlastingPart[]) {
    if (!this.shapesGroup || !this.xScale || !this.yScale) return;

    const blastingGroup = this.shapesGroup
      .append("g")
      .attr("class", "blasting-parts");

    parts.forEach((part, partIndex) => {
      const partGroup = blastingGroup
        .append("g")
        .attr("class", `part-${partIndex}`)
        .attr("data-part-name", part.partName);

      // 创建封闭路径
      let pathData = "";
      part.parts.forEach((geometry, index) => {
        const path = this.createPathFromGeometry(geometry, index === 0);
        if (path) {
          pathData += path;
        }
      });

      // 闭合路径
      if (pathData) {
        pathData += " Z";

        partGroup
          .append("path")
          .attr("d", pathData)
          .attr("stroke", "#4ecdc4")
          .attr("stroke-width", 1.5)
          .attr("fill", "rgba(78, 205, 196, 0.1)")
          .attr("class", `part-${partIndex}-area`);
      }
    });
  }

  // 根据几何数据创建SVG路径
  private createPathFromGeometry(
    geometry: GeometryData,
    isFirst: boolean = false
  ): string {
    if (!this.xScale || !this.yScale) return "";

    const sx = parseFloat(geometry.sx);
    const sy = parseFloat(geometry.sy);
    const ex = parseFloat(geometry.ex);
    const ey = parseFloat(geometry.ey);

    // 转换为屏幕坐标
    const startX = this.xScale(sx);
    const startY = this.yScale(sy);
    const endX = this.xScale(ex);
    const endY = this.yScale(ey);

    let pathData = "";

    // 如果是第一个片段，需要移动到起点
    if (isFirst) {
      pathData += `M ${startX} ${startY}`;
    }

    if (
      geometry.r &&
      geometry.startAngle !== null &&
      geometry.endAngle !== null &&
      geometry.startAngle !== undefined &&
      geometry.endAngle !== undefined
    ) {
      // 绘制圆弧
      const radius = parseFloat(geometry.r);
      const startAngle = parseFloat(geometry.startAngle);
      const endAngle = parseFloat(geometry.endAngle);

      // 转换为屏幕坐标的半径
      const screenRadius = Math.abs(this.xScale(radius) - this.xScale(0));

      // 计算大弧标志和扫描方向
      let deltaAngle = endAngle - startAngle;
      if (deltaAngle < 0) deltaAngle += 360;

      const largeArcFlag = deltaAngle > 180 ? 1 : 0;
      const sweepFlag = 0; // 逆时针

      pathData += ` A ${screenRadius} ${screenRadius} 0 ${largeArcFlag} ${sweepFlag} ${endX} ${endY}`;
    } else {
      // 绘制直线
      pathData += ` L ${endX} ${endY}`;
    }

    return pathData;
  }

  // 计算图形包围盒
  private calculateBounds(data: TestData): {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    // 处理所有几何数据
    const allGeometries = data.digLines;

    allGeometries.forEach((geometry) => {
      // 处理起点和终点
      const sx = parseFloat(geometry.sx);
      const sy = parseFloat(geometry.sy);
      const ex = parseFloat(geometry.ex);
      const ey = parseFloat(geometry.ey);

      minX = Math.min(minX, sx, ex);
      maxX = Math.max(maxX, sx, ex);
      minY = Math.min(minY, sy, ey);
      maxY = Math.max(maxY, sy, ey);

      // 如果是圆弧，还需要考虑圆弧可能达到的极值点
      if (
        geometry.r &&
        geometry.startAngle !== null &&
        geometry.endAngle !== null &&
        geometry.startAngle !== undefined &&
        geometry.endAngle !== undefined
      ) {
        const radius = parseFloat(geometry.r);
        const centerX = parseFloat(geometry.x || "0");
        const centerY = parseFloat(geometry.y || "0");
        const startAngle = parseFloat(geometry.startAngle);
        const endAngle = parseFloat(geometry.endAngle);

        // 检查圆弧是否跨越极值角度（0°, 90°, 180°, 270°）
        const extremeAngles = [0, 90, 180, 270];
        extremeAngles.forEach((angle) => {
          if (this.angleInRange(angle, startAngle, endAngle)) {
            const radians = (angle * Math.PI) / 180;
            const x = centerX + radius * Math.cos(radians);
            const y = centerY + radius * Math.sin(radians);
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
        });
      }
    });

    return { minX, maxX, minY, maxY };
  }

  // 检查角度是否在圆弧范围内
  private angleInRange(
    targetAngle: number,
    startAngle: number,
    endAngle: number
  ): boolean {
    // 标准化角度到 [0, 360) 范围
    const normalize = (angle: number) => ((angle % 360) + 360) % 360;

    const target = normalize(targetAngle);
    const start = normalize(startAngle);
    const end = normalize(endAngle);

    if (start <= end) {
      return target >= start && target <= end;
    } else {
      // 跨越 0° 的情况
      return target >= start || target <= end;
    }
  }

  // 自适应视图（缩放和居中）
  private fitToView(data: TestData) {
    if (!this.svg || !this.zoom || !this.xScale || !this.yScale) return;

    // 计算图形包围盒
    const bounds = this.calculateBounds(data);

    // 计算包围盒尺寸
    const boundsWidth = bounds.maxX - bounds.minX;
    const boundsHeight = bounds.maxY - bounds.minY;

    if (boundsWidth === 0 || boundsHeight === 0) return;

    // 计算目标高度（有效绘图区域高度的2/3）
    const effectiveHeight = this.height - this.margin.top - this.margin.bottom;
    const targetHeight = (effectiveHeight * 2) / 3;

    // 计算缩放比例（以高度为准）
    const scale = targetHeight / (boundsHeight * this.baseUnitPixels);

    // 确保缩放比例在允许范围内
    const clampedScale = Math.max(1 / 3, Math.min(3, scale));

    // 计算有效绘图区域的中心点（在数据坐标系中）
    const effectiveCenterX =
      (this.margin.left + (this.width - this.margin.right)) / 2;
    const effectiveCenterY =
      (this.margin.top + (this.height - this.margin.bottom)) / 2;

    // 创建变换
    const initialTransform = d3.zoomIdentity
      .translate(effectiveCenterX, effectiveCenterY)
      .scale(clampedScale)
      .translate(-effectiveCenterX, (-effectiveCenterY * 2) / 3);

    // 缓存初始变换，用于复位功能
    this.initialTransform = initialTransform;

    // 应用带动画的变换
    this.svg
      .transition()
      .duration(800) // 800ms 动画时长
      .ease(d3.easeQuadInOut) // 平滑缓动
      .call(this.zoom.transform, initialTransform);
  }

  // 设置绘图交互
  private setupDrawingInteractions() {
    if (!this.svg) return;

    this.svg
      .on("mousedown", (event) => this.handleMouseDown(event))
      .on("mousemove", (event) => this.handleMouseMove(event))
      .on("mouseup", (event) => this.handleMouseUp(event))
      .on("click", (event) => this.handleClick(event));
  }

  // 鼠标按下事件
  private handleMouseDown(event: MouseEvent) {
    // 如果正在拖拽元素或控制点，不处理绘图相关的鼠标事件
    if (this.isDraggingElement || this.isDraggingHandle) return;
    
    if (!this.store.isDrawingTool || !this.xScale || !this.yScale) return;

    event.preventDefault();
    // 获取相对于SVG的坐标，然后应用变换
    const [x, y] = d3.pointer(event, this.svg?.node());
    
    // 转换为数据坐标（应用当前变换）
    const dataX = this.transform.rescaleX(this.xScale).invert(x);
    const dataY = this.transform.rescaleY(this.yScale).invert(y);

    this.drawingStartPoint = { x: dataX, y: dataY };

    // 对于需要拖拽的工具，开始绘制预览
    if ([ToolType.LINE, ToolType.CIRCLE, ToolType.RECTANGLE].includes(this.store.currentTool as any)) {
      this.isCurrentlyDrawing = true;
      this.store.setDrawing(true);
      this.startPreview(dataX, dataY);
    }
  }

  // 鼠标移动事件
  private handleMouseMove(event: MouseEvent) {
    if (!this.xScale || !this.yScale) return;

    // 获取相对于SVG的坐标，然后应用变换
    const [x, y] = d3.pointer(event, this.svg?.node());
    const dataX = this.transform.rescaleX(this.xScale).invert(x);
    const dataY = this.transform.rescaleY(this.yScale).invert(y);

    // 处理控制点拖拽
    if (this.isDraggingHandle && this.draggedElementId && this.draggedHandleType && this.handleStartData && this.dragStartPoint) {
      this.updateElementByHandle(this.draggedElementId, this.draggedHandleType, dataX, dataY);
      return;
    }

    // 处理元素拖拽
    if (this.isDraggingElement && this.draggedElementId && this.elementStartPosition && this.dragStartPoint) {
      const deltaX = dataX - this.dragStartPoint.x;
      const deltaY = dataY - this.dragStartPoint.y;
      
      const newX = this.elementStartPosition.x + deltaX;
      const newY = this.elementStartPosition.y + deltaY;
      
      this.updateElementPosition(this.draggedElementId, newX, newY);
      return;
    }

    // 处理绘图预览
    if (this.isCurrentlyDrawing && this.drawingStartPoint) {
      this.updatePreview(this.drawingStartPoint.x, this.drawingStartPoint.y, dataX, dataY);
    }
  }

  // 鼠标抬起事件
  private handleMouseUp(event: MouseEvent) {
    if (!this.xScale || !this.yScale) return;

    // 处理控制点拖拽结束
    if (this.isDraggingHandle) {
      this.isDraggingHandle = false;
      this.draggedHandleType = null;
      this.handleStartData = null;
      this.draggedElementId = null;
      this.dragStartPoint = null;
      return;
    }

    // 处理元素拖拽结束
    if (this.isDraggingElement) {
      this.isDraggingElement = false;
      this.draggedElementId = null;
      this.dragStartPoint = null;
      this.elementStartPosition = null;
      return;
    }

    // 处理绘图结束
    if (this.isCurrentlyDrawing && this.drawingStartPoint) {
      // 获取相对于SVG的坐标，然后应用变换
      const [x, y] = d3.pointer(event, this.svg?.node());
      const dataX = this.transform.rescaleX(this.xScale).invert(x);
      const dataY = this.transform.rescaleY(this.yScale).invert(y);

      this.finishDrawing(this.drawingStartPoint.x, this.drawingStartPoint.y, dataX, dataY);
      this.clearPreview();
      this.isCurrentlyDrawing = false;
      this.store.setDrawing(false);
      this.drawingStartPoint = null;
    }
  }

  // 鼠标点击事件（用于点工具）
  private handleClick(event: MouseEvent) {
    if (this.store.currentTool !== ToolType.POINT || !this.xScale || !this.yScale) return;

    // 获取相对于SVG的坐标，然后应用变换
    const [x, y] = d3.pointer(event, this.svg?.node());
    const dataX = this.transform.rescaleX(this.xScale).invert(x);
    const dataY = this.transform.rescaleY(this.yScale).invert(y);

    this.createPoint(dataX, dataY);
  }

  // 渲染用户绘制的元素
  public renderUserElements() {
    if (!this.userElementsGroup || !this.xScale || !this.yScale) return;

    // 清除现有元素
    this.userElementsGroup.selectAll(".user-element").remove();

    // 渲染所有用户元素
    this.store.getUserElements.forEach(element => {
      this.renderElement(element);
    });

    // 渲染控制点
    this.renderControls();
  }

  // 开始预览
  private startPreview(_startX: number, _startY: number) {
    if (!this.userElementsGroup) return;
    this.clearPreview();
    this.previewElement = this.userElementsGroup.append("g").attr("class", "preview");
  }

  // 更新预览
  private updatePreview(startX: number, startY: number, currentX: number, currentY: number) {
    if (!this.previewElement || !this.xScale || !this.yScale) return;

    this.previewElement.selectAll("*").remove();
    const startScreenX = this.xScale(startX);
    const startScreenY = this.yScale(startY);
    const currentScreenX = this.xScale(currentX);
    const currentScreenY = this.yScale(currentY);

    switch (this.store.currentTool) {
      case ToolType.LINE:
        this.previewElement.append("line")
          .attr("x1", startScreenX).attr("y1", startScreenY)
          .attr("x2", currentScreenX).attr("y2", currentScreenY)
          .attr("stroke", "#333").attr("stroke-width", 2).attr("stroke-dasharray", "5,5");
        break;
      case ToolType.CIRCLE:
        const radius = Math.sqrt(Math.pow(currentX - startX, 2) + Math.pow(currentY - startY, 2));
        const radiusPixels = Math.abs(this.xScale(radius) - this.xScale(0));
        this.previewElement.append("circle")
          .attr("cx", startScreenX).attr("cy", startScreenY).attr("r", radiusPixels)
          .attr("stroke", "#2196F3").attr("stroke-width", 2).attr("stroke-dasharray", "5,5")
          .attr("fill", "rgba(33, 150, 243, 0.2)");
        break;
      case ToolType.RECTANGLE:
        const width = Math.abs(currentX - startX), height = Math.abs(currentY - startY);
        const widthPixels = Math.abs(this.xScale(width) - this.xScale(0));
        const heightPixels = Math.abs(this.yScale(height) - this.yScale(0));
        this.previewElement.append("rect")
          .attr("x", Math.min(startScreenX, currentScreenX)).attr("y", Math.min(startScreenY, currentScreenY))
          .attr("width", widthPixels).attr("height", heightPixels)
          .attr("stroke", "#FF9800").attr("stroke-width", 2).attr("stroke-dasharray", "5,5")
          .attr("fill", "rgba(255, 152, 0, 0.2)");
        break;
    }
  }

  // 清除预览
  private clearPreview() {
    if (this.previewElement) {
      this.previewElement.remove();
      this.previewElement = null;
    }
  }

  // 完成绘制
  private finishDrawing(startX: number, startY: number, endX: number, endY: number) {
    const id = this.store.generateId();
    switch (this.store.currentTool) {
      case ToolType.LINE:
        this.store.addElement({ id, type: 'line', x: startX, y: startY, x2: endX, y2: endY, style: { stroke: '#333', strokeWidth: 2 } });
        break;
      case ToolType.CIRCLE:
        const radius = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
        this.store.addElement({ id, type: 'circle', x: startX, y: startY, radius, style: { stroke: '#2196F3', strokeWidth: 2, fill: 'rgba(33, 150, 243, 0.3)' } });
        break;
      case ToolType.RECTANGLE:
        const width = Math.abs(endX - startX), height = Math.abs(endY - startY);
        this.store.addElement({ id, type: 'rectangle', x: Math.min(startX, endX), y: Math.min(startY, endY), width, height, style: { stroke: '#FF9800', strokeWidth: 2, fill: 'rgba(255, 152, 0, 0.3)' } });
        break;
    }
    this.renderUserElements();
  }

  // 创建点
  private createPoint(x: number, y: number) {
    const id = this.store.generateId();
    this.store.addElement({ id, type: 'point', x, y, radius: 0.2, style: { fill: 'rgba(76, 175, 80, 0.6)' } });
    this.renderUserElements();
  }

  // 渲染单个元素
  private renderElement(element: GraphicElement) {
    if (!this.userElementsGroup || !this.xScale || !this.yScale) return;

    const isSelected = this.store.data.selectedIds.includes(element.id);
    const group = this.userElementsGroup.append("g")
      .attr("class", "user-element")
      .attr("data-id", element.id)
      .style("cursor", this.store.currentTool === ToolType.SELECT ? "move" : "pointer")
      .on("mousedown", (event) => this.handleElementMouseDown(event, element.id))
      .on("click", (event) => this.handleElementClick(event, element.id));
    
    // 重要：使用原始比例尺，因为用户元素组会跟随mainGroup的变换
    const screenX = this.xScale(element.x);
    const screenY = this.yScale(element.y);

    switch (element.type) {
      case 'point':
        const pointElement = element as any;
        const radiusPixels = Math.abs(this.xScale(pointElement.radius || 0.2) - this.xScale(0));
        group.append("circle")
          .attr("cx", screenX)
          .attr("cy", screenY)
          .attr("r", radiusPixels)
          .attr("fill", element.style?.fill || 'rgba(76, 175, 80, 0.6)')
          .attr("stroke", isSelected ? "#ff4444" : "none")
          .attr("stroke-width", isSelected ? 2 : 0);
        break;
      case 'line':
        const lineElement = element as any;
        const endScreenX = this.xScale(lineElement.x2);
        const endScreenY = this.yScale(lineElement.y2);
        group.append("line")
          .attr("x1", screenX)
          .attr("y1", screenY)
          .attr("x2", endScreenX)
          .attr("y2", endScreenY)
          .attr("stroke", isSelected ? "#ff4444" : (element.style?.stroke || '#333'))
          .attr("stroke-width", isSelected ? 3 : (element.style?.strokeWidth || 2));
        break;
      case 'circle':
        const circleElement = element as any;
        const circleRadiusPixels = Math.abs(this.xScale(circleElement.radius) - this.xScale(0));
        group.append("circle")
          .attr("cx", screenX)
          .attr("cy", screenY)
          .attr("r", circleRadiusPixels)
          .attr("stroke", isSelected ? "#ff4444" : (element.style?.stroke || '#2196F3'))
          .attr("stroke-width", isSelected ? 3 : (element.style?.strokeWidth || 2))
          .attr("fill", element.style?.fill || 'rgba(33, 150, 243, 0.3)');
        break;
      case 'rectangle':
        const rectElement = element as any;
        const widthPixels = Math.abs(this.xScale(rectElement.width) - this.xScale(0));
        const heightPixels = Math.abs(this.yScale(rectElement.height) - this.yScale(0));
        
        // 计算矩形的四个角在屏幕坐标系中的位置
        const x1 = this.xScale(rectElement.x);
        const y1 = this.yScale(rectElement.y);
        const x2 = this.xScale(rectElement.x + rectElement.width);
        const y2 = this.yScale(rectElement.y + rectElement.height);
        
        // SVG矩形的x,y应该是左上角，所以取屏幕坐标的最小值
        const rectX = Math.min(x1, x2);
        const rectY = Math.min(y1, y2);
        
        group.append("rect")
          .attr("x", rectX)
          .attr("y", rectY)
          .attr("width", widthPixels)
          .attr("height", heightPixels)
          .attr("stroke", isSelected ? "#ff4444" : (element.style?.stroke || '#FF9800'))
          .attr("stroke-width", isSelected ? 3 : (element.style?.strokeWidth || 2))
          .attr("fill", element.style?.fill || 'rgba(255, 152, 0, 0.3)');
        break;
    }
  }

  // 设置Store监听器
  private setupStoreWatchers() {
    // 监听工具切换，更新光标样式
    this.store.$subscribe(() => {
      this.updateCursor();
    });
  }

  // 更新光标样式
  private updateCursor() {
    if (!this.svg) return;

    let cursor = "grab";
    
    if (this.store.isDrawingTool) {
      // 根据不同绘图工具设置不同光标
      switch (this.store.currentTool) {
        case ToolType.POINT:
          cursor = "crosshair";
          break;
        case ToolType.LINE:
          cursor = "crosshair";
          break;
        case ToolType.CIRCLE:
          cursor = "crosshair";
          break;
        case ToolType.RECTANGLE:
          cursor = "crosshair";
          break;
        default:
          cursor = "crosshair";
      }
    } else if (this.store.currentTool === ToolType.SELECT) {
      cursor = "grab";
    }

    this.svg.style("cursor", cursor);
  }

  // 清除所有用户绘制的元素
  public clearUserElements() {
    this.store.clearUserElements();
    this.renderUserElements();
  }

  // 重新加载并渲染持久化数据
  public reloadPersistedData() {
    this.store.loadData();
    this.renderUserElements();
  }

  // 处理元素鼠标按下事件
  private handleElementMouseDown(event: MouseEvent, elementId: string) {
    // 只在选择模式下允许拖拽元素
    if (this.store.currentTool !== ToolType.SELECT || !this.xScale || !this.yScale) return;

    event.stopPropagation(); // 阻止事件冒泡到SVG
    event.preventDefault();

    // 获取元素数据
    const element = this.store.getUserElements.find(el => el.id === elementId);
    if (!element) return;

    // 获取鼠标坐标
    const [x, y] = d3.pointer(event, this.svg?.node());
    const dataX = this.transform.rescaleX(this.xScale).invert(x);
    const dataY = this.transform.rescaleY(this.yScale).invert(y);

    // 设置拖拽状态
    this.isDraggingElement = true;
    this.draggedElementId = elementId;
    this.dragStartPoint = { x: dataX, y: dataY };
    this.elementStartPosition = { x: element.x, y: element.y };

    // 选中元素
    this.store.clearSelection();
    this.store.selectElement(elementId);
    this.renderUserElements(); // 重新渲染以显示选中状态
  }

  // 处理元素点击事件
  private handleElementClick(event: MouseEvent, elementId: string) {
    // 只在选择模式下处理点击
    if (this.store.currentTool !== ToolType.SELECT) return;

    event.stopPropagation(); // 阻止事件冒泡到SVG

    // 如果不是拖拽操作（点击），则切换选中状态
    if (!this.isDraggingElement) {
      if (this.store.data.selectedIds.includes(elementId)) {
        this.store.removeFromSelection(elementId);
      } else {
        // 如果没有按住Ctrl/Cmd键，清除其他选中
        if (!event.ctrlKey && !event.metaKey) {
          this.store.clearSelection();
        }
        this.store.selectElement(elementId);
      }
      this.renderUserElements(); // 重新渲染以显示选中状态
    }
  }

  // 更新元素位置
  private updateElementPosition(elementId: string, newX: number, newY: number) {
    const element = this.store.getUserElements.find(el => el.id === elementId);
    if (!element) return;

    // 根据元素类型更新位置
    if (element.type === 'line') {
      const lineElement = element as any;
      const deltaX = newX - element.x;
      const deltaY = newY - element.y;
      const updates = {
        x: newX,
        y: newY,
        x2: lineElement.x2 + deltaX,
        y2: lineElement.y2 + deltaY
      };
      this.store.updateElement(elementId, updates);
    } else {
      const updates: Partial<GraphicElement> = { x: newX, y: newY };
      this.store.updateElement(elementId, updates);
    }

    this.renderUserElements();
  }

  // 渲染控制点
  private renderControls() {
    if (!this.controlsGroup || !this.xScale || !this.yScale) return;

    // 清除现有控制点
    this.controlsGroup.selectAll("*").remove();

    // 只在选择模式下显示控制点
    if (this.store.currentTool !== ToolType.SELECT) return;

    // 为每个选中的元素渲染控制点
    this.store.getSelectedElements.forEach(element => {
      this.renderControlsForElement(element);
    });
  }

  // 为单个元素渲染控制点
  private renderControlsForElement(element: GraphicElement) {
    if (!this.controlsGroup || !this.xScale || !this.yScale) return;

    const elementGroup = this.controlsGroup.append("g")
      .attr("class", "element-controls")
      .attr("data-element-id", element.id);

    switch (element.type) {
      case 'rectangle':
        this.renderRectangleControls(elementGroup, element as any);
        break;
      case 'circle':
        this.renderCircleControls(elementGroup, element as any);
        break;
      case 'line':
        this.renderLineControls(elementGroup, element as any);
        break;
      case 'point':
        this.renderPointControls(elementGroup, element as any);
        break;
    }
  }

  // 渲染矩形控制点
  private renderRectangleControls(group: d3.Selection<SVGGElement, unknown, null, undefined>, element: any) {
    const x = this.xScale!(element.x);
    const y = this.yScale!(element.y);
    const x2 = this.xScale!(element.x + element.width);
    const y2 = this.yScale!(element.y + element.height);

    // 绘制包围盒
    group.append("rect")
      .attr("x", Math.min(x, x2))
      .attr("y", Math.min(y, y2))
      .attr("width", Math.abs(x2 - x))
      .attr("height", Math.abs(y2 - y))
      .attr("fill", "none")
      .attr("stroke", "#4285f4")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "4,4");

    // 四个角的控制点
    const handles = [
      { type: 'resize-tl', x: Math.min(x, x2), y: Math.min(y, y2), cursor: 'nw-resize' },
      { type: 'resize-tr', x: Math.max(x, x2), y: Math.min(y, y2), cursor: 'ne-resize' },
      { type: 'resize-bl', x: Math.min(x, x2), y: Math.max(y, y2), cursor: 'sw-resize' },
      { type: 'resize-br', x: Math.max(x, x2), y: Math.max(y, y2), cursor: 'se-resize' }
    ];

    handles.forEach(handle => {
      this.createControlHandle(group, handle.x, handle.y, handle.type, handle.cursor, element.id);
    });
  }

  // 渲染圆形控制点
  private renderCircleControls(group: d3.Selection<SVGGElement, unknown, null, undefined>, element: any) {
    const centerX = this.xScale!(element.x);
    const centerY = this.yScale!(element.y);
    const radiusPixels = Math.abs(this.xScale!(element.radius) - this.xScale!(0));

    // 绘制包围盒
    group.append("rect")
      .attr("x", centerX - radiusPixels)
      .attr("y", centerY - radiusPixels)
      .attr("width", radiusPixels * 2)
      .attr("height", radiusPixels * 2)
      .attr("fill", "none")
      .attr("stroke", "#4285f4")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "4,4");

    // 使用类似点的缩放方式，只在右侧放置一个控制点
    this.createControlHandle(group, centerX + radiusPixels, centerY, 'circle-resize', 'e-resize', element.id);
  }

  // 渲染线条控制点
  private renderLineControls(group: d3.Selection<SVGGElement, unknown, null, undefined>, element: any) {
    const x1 = this.xScale!(element.x);
    const y1 = this.yScale!(element.y);
    const x2 = this.xScale!(element.x2);
    const y2 = this.yScale!(element.y2);

    // 起点控制点
    this.createControlHandle(group, x1, y1, 'line-start', 'move', element.id);
    
    // 终点控制点
    this.createControlHandle(group, x2, y2, 'line-end', 'move', element.id);
  }

  // 渲染点控制点
  private renderPointControls(group: d3.Selection<SVGGElement, unknown, null, undefined>, element: any) {
    const centerX = this.xScale!(element.x);
    const centerY = this.yScale!(element.y);
    const radiusPixels = Math.abs(this.xScale!(element.radius || 0.2) - this.xScale!(0));

    // 绘制调整大小的控制点
    this.createControlHandle(group, centerX + radiusPixels, centerY, 'point-resize', 'e-resize', element.id);
  }

  // 创建单个控制点
  private createControlHandle(
    group: d3.Selection<SVGGElement, unknown, null, undefined>,
    x: number, y: number, type: string, cursor: string, elementId: string
  ) {
    group.append("rect")
      .attr("x", x - 4)
      .attr("y", y - 4)
      .attr("width", 8)
      .attr("height", 8)
      .attr("fill", "#4285f4")
      .attr("stroke", "white")
      .attr("stroke-width", 1)
      .style("cursor", cursor)
      .on("mousedown", (event) => this.handleControlMouseDown(event, elementId, type));
  }

  // 处理控制点鼠标按下事件
  private handleControlMouseDown(event: MouseEvent, elementId: string, handleType: string) {
    if (!this.xScale || !this.yScale) return;

    event.stopPropagation();
    event.preventDefault();

    // 获取元素数据
    const element = this.store.getUserElements.find(el => el.id === elementId);
    if (!element) return;

    // 获取鼠标坐标
    const [x, y] = d3.pointer(event, this.svg?.node());
    const dataX = this.transform.rescaleX(this.xScale).invert(x);
    const dataY = this.transform.rescaleY(this.yScale).invert(y);

    // 设置控制点拖拽状态
    this.isDraggingHandle = true;
    this.draggedElementId = elementId;
    this.draggedHandleType = handleType;
    this.dragStartPoint = { x: dataX, y: dataY };
    this.handleStartData = { ...element }; // 深拷贝元素数据
  }

  // 根据控制点类型更新元素
  private updateElementByHandle(elementId: string, handleType: string, currentX: number, currentY: number) {
    const element = this.store.getUserElements.find(el => el.id === elementId);
    if (!element || !this.handleStartData || !this.dragStartPoint) return;

    const deltaX = currentX - this.dragStartPoint.x;
    const deltaY = currentY - this.dragStartPoint.y;

    switch (element.type) {
      case 'rectangle':
        this.updateRectangleByHandle(elementId, handleType, deltaX, deltaY);
        break;
      case 'circle':
        this.updateCircleByHandle(elementId, handleType, deltaX, deltaY);
        break;
      case 'line':
        this.updateLineByHandle(elementId, handleType, currentX, currentY);
        break;
      case 'point':
        this.updatePointByHandle(elementId, handleType, deltaX, deltaY);
        break;
    }

    this.renderUserElements();
  }

  // 更新矩形（通过控制点）
  private updateRectangleByHandle(elementId: string, handleType: string, deltaX: number, deltaY: number) {
    const originalData = this.handleStartData;
    
    // 让我重新理解坐标系：
    // 在我们的数据坐标系中，Y轴向上为正
    // 矩形的存储格式：(x, y) 是左下角，width和height是正值
    // 
    // 矩形的四个角在数据坐标系中：
    // BL(x, y+height) ---- BR(x+width, y+height)  <- 上边
    //    |                    |
    // TL(x, y) ------------ TR(x+width, y)        <- 下边
    //
    // 等等，我需要确认一下矩形的存储方式...
    
    // 实际上，让我直接用当前鼠标位置来计算新的角点位置
    if (!this.dragStartPoint) return;
    
    const currentMouseX = this.dragStartPoint.x + deltaX;
    const currentMouseY = this.dragStartPoint.y + deltaY;
    
    let updates: any = {};
    
    switch (handleType) {
      case 'resize-tl': // 左上角
        // 固定右下角
        const fixedBRX_TL = originalData.x + originalData.width;
        const fixedBRY_TL = originalData.y;
        
        updates.x = Math.min(currentMouseX, fixedBRX_TL);
        updates.y = Math.min(currentMouseY, fixedBRY_TL);
        updates.width = Math.abs(fixedBRX_TL - currentMouseX);
        updates.height = Math.abs(currentMouseY - fixedBRY_TL);
        break;
        
      case 'resize-tr': // 右上角
        // 固定左下角
        const fixedBLX_TR = originalData.x;
        const fixedBLY_TR = originalData.y;
        
        updates.x = Math.min(currentMouseX, fixedBLX_TR);
        updates.y = Math.min(currentMouseY, fixedBLY_TR);
        updates.width = Math.abs(currentMouseX - fixedBLX_TR);
        updates.height = Math.abs(currentMouseY - fixedBLY_TR);
        break;
        
      case 'resize-bl': // 左下角
        // 固定右上角
        const fixedTRX_BL = originalData.x + originalData.width;
        const fixedTRY_BL = originalData.y + originalData.height;
        
        updates.x = Math.min(currentMouseX, fixedTRX_BL);
        updates.y = Math.min(currentMouseY, fixedTRY_BL);
        updates.width = Math.abs(fixedTRX_BL - currentMouseX);
        updates.height = Math.abs(fixedTRY_BL - currentMouseY);
        break;
        
      case 'resize-br': // 右下角
        // 固定左上角
        const fixedTLX_BR = originalData.x;
        const fixedTLY_BR = originalData.y + originalData.height;
        
        updates.x = Math.min(currentMouseX, fixedTLX_BR);
        updates.y = Math.min(currentMouseY, fixedTLY_BR);
        updates.width = Math.abs(currentMouseX - fixedTLX_BR);
        updates.height = Math.abs(fixedTLY_BR - currentMouseY);
        break;
    }

    // 确保最小尺寸
    if (updates.width < 0.1) updates.width = 0.1;
    if (updates.height < 0.1) updates.height = 0.1;

    this.store.updateElement(elementId, updates);
  }

  // 更新圆形（通过控制点）
  private updateCircleByHandle(elementId: string, handleType: string, deltaX: number, _deltaY: number) {
    if (handleType !== 'circle-resize') return;

    const originalData = this.handleStartData;
    // 控制点跟手：新半径 = 原始半径 + 鼠标移动距离
    // deltaX 就是鼠标在数据坐标系中的移动距离
    let newRadius = originalData.radius + deltaX;
    if (newRadius < 0.1) newRadius = 0.1; // 最小半径

    this.store.updateElement(elementId, { radius: newRadius });
  }

  // 更新线条（通过控制点）
  private updateLineByHandle(elementId: string, handleType: string, currentX: number, currentY: number) {
    let updates: any = {};

    if (handleType === 'line-start') {
      updates.x = currentX;
      updates.y = currentY;
    } else if (handleType === 'line-end') {
      updates.x2 = currentX;
      updates.y2 = currentY;
    }

    this.store.updateElement(elementId, updates);
  }

  // 更新点（通过控制点）
  private updatePointByHandle(elementId: string, handleType: string, deltaX: number, _deltaY: number) {
    if (handleType !== 'point-resize') return;

    const originalData = this.handleStartData;
    // 控制点跟手：新半径 = 原始半径 + 鼠标移动距离
    let newRadius = originalData.radius + deltaX;
    if (newRadius < 0.05) newRadius = 0.05; // 最小半径

    this.store.updateElement(elementId, { radius: newRadius });
  }

  // 公共方法：获取Store实例
  public getStore() {
    return this.store;
  }
}
