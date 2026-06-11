export class HistoryState {
    elements = [];
    filters = null;

    constructor(elements, filters) {
        this.elements = elements.map(el => el.clone());
        this.filters = filters.clone();
    }
}