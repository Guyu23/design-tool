import * as d3 from "d3";
import * as konva from "konva";
import { useDesignToolStore } from "@/store/useDesignTool";

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

  constructor(container: HTMLElement) {
    this.container = container;
    this.init();
  }

  private init() {
    this.setupDimensions();
    this.createSVG();
    this.setupScales();
    this.drawAxis();
    this.setupZoom();
    this.setupResizeObserver();
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
        // 在绘图模式下，只允许缩放（滚轮事件），禁用拖拽（鼠标拖拽事件）
        // if (this.store.isDrawingTool) {
        //   // 允许滚轮缩放，但禁用鼠标拖拽
        //   return event.type === 'wheel';
        // }

        // 如果正在拖拽图形元素或控制点，禁用坐标系的拖拽，但允许缩放
        // if (this.isDraggingElement || this.isDraggingHandle) {
        //   return event.type === 'wheel';
        // }

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
  }

    // 复位到初始状态（带动画）
    public resetToInitial() {
      if (!this.svg || !this.zoom) return;
  
      this.svg
        .transition()
        .duration(600) // 600ms 动画时长
        .ease(d3.easeQuadInOut) // 平滑缓动
        .call(this.zoom.transform, d3.zoomIdentity);
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
  }
}
