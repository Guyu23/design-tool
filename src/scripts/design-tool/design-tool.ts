import * as d3 from "d3";
import Konva from "konva";
import { useDesignToolStore } from "@/store/useDesignTool";

export default class DesignTool {
  private container: HTMLDivElement;
  private svg: d3.Selection<SVGSVGElement, unknown, null, undefined> | null =
    null;
  private stage: Konva.Stage | null = null;
  private width: number = 0;
  private height: number = 0;
  private margin = { top: 20, right: 20, bottom: 20, left: 20 };

  // 坐标系统相关
  private xScale: d3.ScaleLinear<number, number> | null = null;
  private yScale: d3.ScaleLinear<number, number> | null = null;
  private zoom: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null;
  private transform = d3.zoomIdentity;
  private axisLayer: Konva.Layer | null = null;
  private drawingLayer: Konva.Layer | null = null;

  private axisGroup: d3.Selection<
    SVGGElement,
    unknown,
    null,
    undefined
  > | null = null;

  // 基础单位像素（以Y轴为准）
  private baseUnitPixels = 20;

  // 尺寸监听器
  private resizeObserver: ResizeObserver | null = null;

  // 缓存初始变换，用于复位功能
  private initialTransform: d3.ZoomTransform | null = null;

  // Store实例
  private store = useDesignToolStore();
  private startDrawing: boolean = false;

  private drawingMode:
    | "DRAG"
    | "BATCHSELECT"
    | "LINE"
    | "CIRCLE"
    | "POINT"
    | "TRANGLE"
    | "RECTANGLE"
    | "";
  private startX: number = 0;
  private startY: number = 0;
  private currentLayer: Konva.Layer | null = null;

  constructor(container: HTMLDivElement) {
    this.container = container;
    this.init();
  }

  private init() {
    this.setupDimensions(); // 设置尺寸
    this.createKonva(); // 创建Konva
    this.createAxisLayer();
    this.createDrawingLayer();
    this.createSVG(); // 创建SVG
    this.setupScales(); // 设置比例尺
    this.drawAxis(); // 绘制坐标轴
    this.setupZoom(); // 设置缩放
    this.updateKonvaAxisLines(); // 初始化konva坐标轴线位置
    this.setupResizeObserver(); // 设置尺寸监听器
  }

  private getRandomId() {
    return (
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15)
    );
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
      .style("cursor", "grab")
      .style("position", "absolute")
      .style("top", "0")
      .style("left", "0");
    // 坐标轴组（固定位置，不跟随缩放平移）
    this.axisGroup = this.svg.append("g").attr("class", "axis");
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

  private setupZoom() {
    if (!this.svg || !this.xScale || !this.yScale) return;

    // 计算缩放限制：Y轴从[-10,10]到[-30,30]，即最大缩小到1/3
    // 最大放大到显示[-3.33,3.33]，即放大3倍
    this.zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([1 / 3, 5]) // 缩小到1/3，放大到3倍
      .filter((event) => {
        // 禁用d3的滚轮缩放，因为我们使用konva的滚轮事件
        if (event.type === "wheel") {
          return false;
        }

        // 禁用d3的拖拽，因为我们使用konva的拖拽
        if (event.type === "mousedown" || event.type === "touchstart") {
          return false;
        }

        return true;
      })
      .on("zoom", (event) => {
        this.transform = event.transform;
        this.updateOnZoom();
      });

    this.svg.call(this.zoom);
  }

  private updateOnZoom() {
    // 重新绘制坐标轴（需要根据新的缩放级别调整）
    this.drawAxis();

    // 更新konva坐标轴线位置
    this.updateKonvaAxisLines();
  }

  // 复位到初始状态（带动画）
  public resetToInitial() {
    if (!this.svg || !this.zoom || !this.stage) return;

    // 重置d3变换
    this.transform = d3.zoomIdentity;
    this.svg
      .transition()
      .duration(600) // 600ms 动画时长
      .ease(d3.easeQuadInOut) // 平滑缓动
      .call(this.zoom.transform, d3.zoomIdentity);

    // 同时重置konva stage的变换（带动画）
    this.stage.to({
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      duration: 0.6, // 与d3动画时长保持一致
      easing: Konva.Easings.EaseInOut,
      onUpdate: () => {
        // 在动画过程中更新坐标轴线
        this.updateKonvaAxisLines();
      },
    });
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

    // 更新 Konva 舞台尺寸和位置
    if (this.stage) {
      this.stage.width(this.width - this.margin.left - this.margin.right);
      this.stage.height(this.height - this.margin.top - this.margin.bottom);
      const ele = this.stage.content as HTMLDivElement;
      ele.style.position = "absolute";
      ele.style.left = `${this.margin.left}px`;
      ele.style.top = `${this.margin.top}px`;
      ele.style.zIndex = "1";
    }

    // 重新计算比例尺
    this.setupScales();

    // 重新应用缩放变换到比例尺
    if (this.zoom && this.xScale && this.yScale) {
      // 保持当前的变换状态
      this.svg.call(this.zoom.transform, this.transform);
    }

    // 重绘坐标轴和零点线
    this.drawAxis();

    // 更新konva坐标轴线位置
    this.updateKonvaAxisLines();
  }

  private getCurrentLayer(): Konva.Layer {
    const layer = this.store.userElements.get(this.store.curLayerId);
    if (layer) {
      return layer;
    } else {
      const layer = new Konva.Layer({ id: this.getRandomId() });
      this.store.userElements.set(this.store.curLayerId, layer);
      return layer;
    }
  }

  private transformToKonvaPosition(x: number, y: number) {
    return {
      x: (x - this.margin.left - this.stage!.position().x) / this.transform.k,
      y: (y - this.margin.top - this.stage!.position().y) / this.transform.k,
    };
  }

  private createKonva() {
    this.stage = new Konva.Stage({
      container: this.container,
      width: this.width - this.margin.left - this.margin.right,
      height: this.height - this.margin.top - this.margin.bottom,
      draggable: true,
    });

    // 鼠标事件
    this.stage.on("mousedown", () => {
      if (this.store.toolType === "select") {
        this.stage?.setAttr("draggable", true);
      } else {
        this.stage?.setAttr("draggable", false);
        this.startDrawing = true;
        switch (this.store.toolType) {
          case "line":
            this.startX = this.stage!.position().x;
            this.startY = this.stage!.position().y;
            this.currentLayer = this.getCurrentLayer();
            const id = this.getRandomId();
            const line = new Konva.Line({
              points: [this.startX, this.startY, this.startX, this.startY],
              strokeWidth: 1,
              stroke: "black",
              name: "line",
              id,
            });
            this.store.selectedElement = line;
            this.currentLayer.add(line);
            break;
        }
      }
    });

    this.stage.on("mousemove", (e) => {
      if (!this.startDrawing) {
        return;
      }
      if (this.store.toolType === "line") {
        this.store.selectedElement.points([
          this.startX,
          this.startY,
          this.transformToKonvaPosition(e.evt.clientX, e.evt.clientY).x,
          this.transformToKonvaPosition(e.evt.clientX, e.evt.clientY).y,
        ]);
      }
    });
    this.stage.on("mouseup", () => {
      this.startDrawing = false;
    });

    // 拖拽事件
    this.stage.on("dragstart", () => {
      this.stage!.container().style.cursor = "grabbing";
    });
    this.stage.on("dragmove", () => {
      // 获取stage的当前位置
      const stagePos = this.stage!.position();

      // 创建新的d3 transform，保持当前的缩放级别，只更新平移
      // konva的position直接对应d3的translate
      const newTransform = d3.zoomIdentity
        .translate(stagePos.x, stagePos.y)
        .scale(this.transform.k);

      // 更新内部transform状态
      this.transform = newTransform;

      // 同步到d3的缩放系统（避免触发zoom事件的无限循环）
      this.svg!.call(this.zoom!.transform, newTransform);

      // 更新konva坐标轴线位置
      this.updateKonvaAxisLines();
    });
    this.stage.on("dragend", () => {
      this.stage!.container().style.cursor = "unset";
    });

    // 添加滚轮缩放事件
    this.stage.on("wheel", (e) => {
      e.evt.preventDefault(); // 阻止页面滚动

      const scaleBy = 1.1; // 缩放倍数
      const stage = this.stage!;
      const pointer = stage.getPointerPosition()!;

      // 计算新的缩放级别
      const oldScale = this.transform.k;
      const newScale =
        e.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;

      // 限制缩放范围，与d3的scaleExtent保持一致
      const clampedScale = Math.max(1 / 3, Math.min(5, newScale));

      if (clampedScale === oldScale) return; // 如果缩放没有变化，直接返回

      // 计算缩放中心点（相对于stage的位置）
      const stagePos = stage.position();
      const centerX = (pointer.x - stagePos.x) / oldScale;
      const centerY = (pointer.y - stagePos.y) / oldScale;

      // 计算新的位置，使缩放以鼠标位置为中心
      const newX = pointer.x - centerX * clampedScale;
      const newY = pointer.y - centerY * clampedScale;

      // 创建新的d3 transform
      const newTransform = d3.zoomIdentity
        .translate(newX, newY)
        .scale(clampedScale);

      // 更新内部transform状态
      this.transform = newTransform;

      // 同步到d3的缩放系统
      this.svg!.call(this.zoom!.transform, newTransform);

      // 同步konva stage的变换
      stage.scale({ x: clampedScale, y: clampedScale });
      stage.position({ x: newX, y: newY });

      // 更新konva坐标轴线位置
      this.updateKonvaAxisLines();
    });

    const ele = this.stage.content as HTMLDivElement;
    ele.style.position = "absolute";
    ele.style.zIndex = "1";
    ele.style.left = `${this.margin.left}px`;
    ele.style.top = `${this.margin.top}px`;
  }

  private createAxisLayer() {
    this.axisLayer = new Konva.Layer();
    this.stage!.add(this.axisLayer);

    // 创建坐标轴线，初始位置在中心
    const ele = this.stage!.content as HTMLDivElement;
    const { width, height } = ele.getBoundingClientRect();

    const xAxis = new Konva.Line({
      points: [-10000, height / 2, width + 10000, height / 2],
      strokeWidth: 1,
      stroke: "#ccc",
      dash: [3],
      name: "x-axis-line", // 添加名称用于后续查找
    });
    this.axisLayer!.add(xAxis);

    const yAxis = new Konva.Line({
      points: [width / 2, -10000, width / 2, height + 10000],
      strokeWidth: 1,
      stroke: "#ccc",
      dash: [3],
      name: "y-axis-line", // 添加名称用于后续查找
    });
    this.axisLayer!.add(yAxis);
  }

  private createDrawingLayer() {
    this.drawingLayer = new Konva.Layer();
    this.stage!.add(this.drawingLayer);
  }

  // 更新konva坐标轴线位置，使其与d3坐标轴的0点对齐
  private updateKonvaAxisLines() {
    if (!this.axisLayer || !this.xScale || !this.yScale || !this.stage) return;

    // 获取当前变换后的比例尺
    const currentXScale = this.transform.rescaleX(this.xScale);
    const currentYScale = this.transform.rescaleY(this.yScale);

    // 计算0点在d3坐标系中的位置
    const zeroXInD3 = currentXScale(0); // d3坐标系中x=0的像素位置
    const zeroYInD3 = currentYScale(0); // d3坐标系中y=0的像素位置

    // 转换到konva的本地坐标系
    // 需要减去margin偏移，然后再减去stage的当前位置，因为坐标轴线是在stage内部
    const stagePos = this.stage.position();
    const zeroXInKonva =
      (zeroXInD3 - this.margin.left - stagePos.x) / this.transform.k;
    const zeroYInKonva =
      (zeroYInD3 - this.margin.top - stagePos.y) / this.transform.k;

    // 获取konva画布尺寸（相对于stage的本地坐标系）
    const konvaWidth =
      (this.width - this.margin.left - this.margin.right) / this.transform.k;
    const konvaHeight =
      (this.height - this.margin.top - this.margin.bottom) / this.transform.k;

    // 更新X轴线（水平线）
    const xAxisLine = this.axisLayer.findOne(
      (node: any) => node.name() === "x-axis-line"
    ) as Konva.Line;
    if (xAxisLine) {
      xAxisLine.points([
        -10000 / this.transform.k,
        zeroYInKonva,
        (konvaWidth + 10000) / this.transform.k,
        zeroYInKonva,
      ]);
    }

    // 更新Y轴线（垂直线）
    const yAxisLine = this.axisLayer.findOne(
      (node: any) => node.name() === "y-axis-line"
    ) as Konva.Line;
    if (yAxisLine) {
      yAxisLine.points([
        zeroXInKonva,
        -10000 / this.transform.k,
        zeroXInKonva,
        (konvaHeight + 10000) / this.transform.k,
      ]);
    }

    // 重绘图层
    this.axisLayer.batchDraw();
  }
}
