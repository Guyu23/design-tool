class SvgAxis {
  private container: HTMLElement;
  private width: number;
  private height: number;

  constructor(container: HTMLElement, width: number, height: number) {
    this.container = container;
    this.width = width;
    this.height = height;
    this.init();
  }

  private init() {
    this.createSVG();
    this.setupScales();
    this.drawAxis();
    this.setupZoom();
  }
}
