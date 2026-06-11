export class ImageFilters {
    grayscale = false;
    sepia = false;
    invert = false;
    brightness = 100;
    contrast = 100;
    saturate = 100;
    blur = 0;

    clone() {

        const imf = new ImageFilters();
        imf.grayscale = this.grayscale;
        imf.sepia = this.sepia;
        imf.invert = this.invert;
        imf.brightness = this.brightness;
        imf.contrast = this.contrast;
        imf.saturate = this.saturate;
        imf.blur = this.blur;
        return imf;
    }
}

