import type { ImageFilters } from "./ImageFilters";

export class HistoryState {
    elements: any[] = [];
    filters: ImageFilters;

    constructor(elements: any[], filters: ImageFilters) {
        this.elements = elements.map(el => el.clone());
        this.filters = filters.clone();
    }
}