// Классы для данных
export class TextBlock {
    elementType: string = 'Text';
    id: string = '';
    text: string = 'Введите текст';
    x = 0.5;
    y = 0.5;
    color = '#FFFFFF';
    strokeColor = '#000000';
    fontSize = 36;
    rotation = 0;
    textAlign = 'center';
    fontFamily = 'Impact';
    fontWeight = 'bold';
    fontStyle = 'normal';
    textDecoration = 'none';
    showShadow = true;
    shadowColor = '#000000';
    shadowOffset = 3;
    useGradient = false;
    gradientStartColor = '#FFFFFF';
    gradientEndColor = '#000000';


    clone() {
        const tb = new TextBlock();
        tb.id = this.id;
        tb.text = this.text;
        tb.x = this.x;
        tb.y = this.y;
        tb.color = this.color;
        tb.strokeColor = this.strokeColor;
        tb.fontSize = this.fontSize;
        tb.rotation = this.rotation;
        tb.textAlign = this.textAlign;
        tb.fontFamily = this.fontFamily;
        tb.fontWeight = this.fontWeight;
        tb.fontStyle = this.fontStyle;
        tb.textDecoration = this.textDecoration;
        tb.showShadow = this.showShadow;
        tb.shadowColor = this.shadowColor;
        tb.shadowOffset = this.shadowOffset;
        tb.useGradient = this.useGradient;
        tb.gradientStartColor = this.gradientStartColor;
        tb.gradientEndColor = this.gradientEndColor;

        return tb;
    }
}