import type { ImageFilters } from "./ImageFilters";

export class HistoryState {
  elements: any[];
  filters: ImageFilters;
  drawingData: any[];
  drawingLayer: string;

  constructor(elements: any[], filters: ImageFilters, drawingData: any[] = [], drawingLayer: string = 'bottom') {
    this.elements = elements.map(el => el.clone ? el.clone() : {...el});
    this.filters = filters.clone();
    this.drawingData = [...drawingData];
    this.drawingLayer = drawingLayer;
  }
}