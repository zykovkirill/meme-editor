export class Sticker {
    elementType = 'Sticker';
    id = '';
    url = '';
    name = '';
    category = '';
    x = 0.5;
    y = 0.5;
    width = 100;
    height = 100;
    rotation = 0;
    opacity = 1;

    constructor() {
        this.id = this.generateId();
    }

    generateId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${Math.floor(Math.random() * 10000)}`;
    }


    updatePosition(x: number, y: number): Sticker {
        const cloned = this.clone();
        cloned.x = x;
        cloned.y = y;
        return cloned;
    }

    clone() {
        const st = new Sticker();
        st.url = this.url;
        st.name = this.name;
        st.category = this.category;
        st.x = this.x;
        st.y = this.y;
        st.width = this.width;
        st.height = this.height;
        st.rotation = this.rotation;
        st.opacity = this.opacity;
        return st;
    }
}
