import React, { useState, useRef, useEffect, useCallback } from 'react';
import './MemeEditor.css';
import { TextBlock } from './models/TextBlock';
import { ImageFilters } from './models/ImageFilters';
import { HistoryState } from './models/HistoryState';
import { Sticker } from './models/Sticker';

const MemeEditor = () => {
  // Состояния
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const draggingRef = useRef({
    isDragging: false,
    elementId: null,
    startX: 0,
    startY: 0,
    elementStartX: 0,
    elementStartY: 0,
    tempX: 0,
    tempY: 0
  });
  const [drawingMode, setDrawingMode] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(5);
  const [brushColor, setBrushColor] = useState('#000000');
  const [drawingData, setDrawingData] = useState<{ x: number; y: number; size: number; color: string }[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [activeBlockIndex, setActiveBlockIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('elements'); // 'elements', 'filters', 'draw', 'sticker'
  const [zoomLevel, setZoomLevel] = useState(1);
  const [undoStack, setUndoStack] = useState<HistoryState[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryState[]>([]);
  const [drawingLayer, setDrawingLayer] = useState('bottom'); // 'bottom' или 'top'
  const [showGrid, setShowGrid] = useState(false);
  const [selectedStickerCategory, setSelectedStickerCategory] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [memeElements, setMemeElements] = useState<any[]>([
    new TextBlock()
  ]);
  const [imageFilters, setImageFilters] = useState(new ImageFilters());
  const [allStickers, setAllStickers] = useState<Sticker[]>([]);
  const memeElementsRef = useRef(memeElements);
  const drawingDataRef = useRef(drawingData);
  const pageSize = 12;
  const [imageInfo, setImageInfo] = useState<{
    width: number;
    height: number;
    displayWidth?: number;
    displayHeight?: number;
  } | null>(null);
  const [imageFitMode, setImageFitMode] = useState<'contain' | 'original'>('contain');
  
  useEffect(() => {
    memeElementsRef.current = memeElements;
  }, [memeElements]);
  
  useEffect(() => {
    drawingDataRef.current = drawingData;
  }, [drawingData]);
  
  // Вычисляемые значения
  const currentBlock = memeElements[activeBlockIndex];

  const filteredStickers = selectedStickerCategory === 'all'
    ? allStickers
    : allStickers.filter(s => s.category === selectedStickerCategory);

  const totalPages = Math.ceil(filteredStickers.length / pageSize);

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

 const getImagePosition = useCallback(() => {
  if (!canvasRef.current) return { x: 0, y: 0, width: 0, height: 0 };

  const canvas = canvasRef.current;
  
  if (imageInfo && imageInfo.displayWidth && imageInfo.displayHeight) {
    // Используем сохраненные размеры изображения с учетом зума
    const width = imageInfo.displayWidth * zoomLevel;
    const height = imageInfo.displayHeight * zoomLevel;
    const x = (canvas.width - width) / 2;
    const y = (canvas.height - height) / 2;
    return { x, y, width, height };
  }

  // Fallback - используем zoom
  const scaledWidth = canvas.width * zoomLevel;
  const scaledHeight = canvas.height * zoomLevel;
  const x = (canvas.width - scaledWidth) / 2;
  const y = (canvas.height - scaledHeight) / 2;

  return { x, y, width: scaledWidth, height: scaledHeight };
}, [zoomLevel, imageInfo]);
  // Функция для преобразования координат мыши в нормализованные (с учетом zoom)
  const getNormalizedCoordinates = useCallback((clientX: any, clientY: any) => {
    if (!canvasRef.current) return null;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const canvasX = (clientX - rect.left) * scaleX;
    const canvasY = (clientY - rect.top) * scaleY;

    const imgPos = getImagePosition();

    // Проверяем, попали ли в область изображения
    if (canvasX < imgPos.x || canvasX > imgPos.x + imgPos.width ||
      canvasY < imgPos.y || canvasY > imgPos.y + imgPos.height) {
      return null;
    }

    const normalizedX = (canvasX - imgPos.x) / imgPos.width;
    const normalizedY = (canvasY - imgPos.y) / imgPos.height;

    return { x: normalizedX, y: normalizedY };
  }, [getImagePosition]);

  // Функции истории
  const saveToHistory = useCallback(() => {
    setUndoStack(prev => [...prev, new HistoryState(memeElements, imageFilters, drawingData, drawingLayer)]);
    setRedoStack([]);
  }, [memeElements, imageFilters, drawingData, drawingLayer]);

  const undo = useCallback(async () => {
    if (undoStack.length === 0) return;

    const current = new HistoryState(memeElements, imageFilters, drawingData);
    setRedoStack(prev => [...prev, current]);

    const previous = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    setMemeElements(previous.elements);
    setImageFilters(previous.filters);
    setDrawingData(previous.drawingData || []);

    if (activeBlockIndex >= previous.elements.length) {
      setActiveBlockIndex(previous.elements.length - 1);
    }

    await redrawMeme();
  }, [undoStack, memeElements, imageFilters, drawingData, activeBlockIndex]);

  useEffect(() => {
    applyCanvasFilters();
  }, [imageFilters]);

  const applyCanvasFilters = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let filterString = '';

    if (imageFilters.grayscale) filterString += 'grayscale(100%) ';
    if (imageFilters.sepia) filterString += 'sepia(100%) ';
    if (imageFilters.invert) filterString += 'invert(100%) ';

    filterString += `brightness(${imageFilters.brightness}%) `;
    filterString += `contrast(${imageFilters.contrast}%) `;
    filterString += `saturate(${imageFilters.saturate}%) `;
    filterString += `blur(${imageFilters.blur}px)`;

    canvas.style.filter = filterString;
  };

  const redo = useCallback(async () => {
    if (redoStack.length === 0) return;

    const next = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, -1));
    setMemeElements(next.elements);
    setImageFilters(next.filters);
    setDrawingData(next.drawingData || []);

    saveToHistory();
    await redrawMeme();
  }, [redoStack, saveToHistory]);

  const redrawDuringDrag = useCallback(async (draggedElementId: any, newX: number, newY: number) => {
    if (!selectedTemplate || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    try {
      const bgImage = await loadImageWithCache(selectedTemplate);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const imgPos = getImagePosition();

      ctx.drawImage(bgImage, imgPos.x, imgPos.y, imgPos.width, imgPos.height);
      ctx.filter = 'none';

      const currentElements = memeElementsRef.current;

      // Загружаем стикеры
      const stickerImages = new Map();
      for (const element of currentElements) {
        if (element.elementType === 'Sticker') {
          const img = await loadImageWithCache(element.url);
          stickerImages.set(element.id, img);
        }
      }

      // Рисуем в зависимости от выбранного слоя
      if (drawingLayer === 'bottom') {
        drawDrawingOnCanvas(ctx, drawingData, imgPos.x, imgPos.y, imgPos.width, imgPos.height);
        await drawElementsOnCanvas(
          ctx, currentElements, stickerImages, 
          imgPos.x, imgPos.y, imgPos.width, imgPos.height,
          draggedElementId, newX, newY, true
        );
      } else {
        await drawElementsOnCanvas(
          ctx, currentElements, stickerImages, 
          imgPos.x, imgPos.y, imgPos.width, imgPos.height,
          draggedElementId, newX, newY, true
        );
        drawDrawingOnCanvas(ctx, drawingData, imgPos.x, imgPos.y, imgPos.width, imgPos.height);
      }
      
    } catch (error) {
      console.error('Error during drag redraw:', error);
    }
  }, [selectedTemplate, getImagePosition, drawingData, drawingLayer]);

  // Функции отрисовки
 const redrawMeme = useCallback(async () => {
  if (!selectedTemplate || !canvasRef.current) return;

  const canvas = canvasRef.current;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  try {
    const bgImage = await loadImageWithCache(selectedTemplate);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let x, y, scaledWidth, scaledHeight;
    
    // Если есть информация об изображении, используем сохраненные размеры с учетом зума
    if (imageInfo && imageInfo.displayWidth && imageInfo.displayHeight) {
      // Применяем зум к размерам изображения
      scaledWidth = imageInfo.displayWidth * zoomLevel;
      scaledHeight = imageInfo.displayHeight * zoomLevel;
      x = (canvas.width - scaledWidth) / 2;
      y = (canvas.height - scaledHeight) / 2;
    } else {
      // Стандартное масштабирование с учетом zoom
      scaledWidth = canvas.width * zoomLevel;
      scaledHeight = canvas.height * zoomLevel;
      x = (canvas.width - scaledWidth) / 2;
      y = (canvas.height - scaledHeight) / 2;
    }

    ctx.drawImage(bgImage, x, y, scaledWidth, scaledHeight);
    ctx.filter = 'none';

    const currentElements = memeElementsRef.current;

    // Загружаем стикеры
    const stickerImages = new Map();
    for (const element of currentElements) {
      if (element.elementType === 'Sticker') {
        const img = await loadImageWithCache(element.url);
        stickerImages.set(element.id, img);
      }
    }

    // Рисуем в зависимости от выбранного слоя
    if (drawingLayer === 'bottom') {
      drawDrawingOnCanvas(ctx, drawingData, x, y, scaledWidth, scaledHeight);
      await drawElementsOnCanvas(ctx, currentElements, stickerImages, x, y, scaledWidth, scaledHeight);
    } else {
      await drawElementsOnCanvas(ctx, currentElements, stickerImages, x, y, scaledWidth, scaledHeight);
      drawDrawingOnCanvas(ctx, drawingData, x, y, scaledWidth, scaledHeight);
    }
    
  } catch (error) {
    console.error('Error in redrawMeme:', error);
  }
}, [selectedTemplate, zoomLevel, drawingData, drawingLayer, imageInfo]);
  // Загрузка изображения с кэшем
  const imageCache = new Map();

  const loadImageWithCache = (url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      if (imageCache.has(url)) {
        const cachedImg = imageCache.get(url);
        if (cachedImg && cachedImg.complete) {
          resolve(cachedImg);
          return;
        } else {
          imageCache.delete(url);
        }
      }

      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        imageCache.set(url, img);
        resolve(img);
      };
      img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
      img.src = url;
    });
  };

  const startDrawing = useCallback((e: any) => {
    if (!drawingMode || !canvasRef.current || !selectedTemplate) return;
    
    e.preventDefault();
    setIsDrawing(true);
    
    const clientX = e.clientX ?? e.touches?.[0]?.clientX;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY;
    const normalized = getNormalizedCoordinates(clientX, clientY);
    if (normalized) {
      setDrawingData(prev => [...prev, {
        x: normalized.x,
        y: normalized.y,
        size: brushSize / 100,
        color: brushColor
      }]);
    }
  }, [drawingMode, selectedTemplate, getNormalizedCoordinates, brushSize, brushColor]);

  const drawDrawingOnCanvas = (
    ctx: CanvasRenderingContext2D,
    drawingData: any[],
    x: number,
    y: number,
    scaledWidth: number,
    scaledHeight: number
  ) => {
    if (drawingData.length === 0) return;
    
    ctx.save();
    
    for (let i = 0; i < drawingData.length - 1; i++) {
      const point1 = drawingData[i];
      const point2 = drawingData[i + 1];
      
      if (point1.color !== point2.color) continue;
      
      const posX1 = x + scaledWidth * point1.x;
      const posY1 = y + scaledHeight * point1.y;
      const posX2 = x + scaledWidth * point2.x;
      const posY2 = y + scaledHeight * point2.y;
      
      const brushSizePx = point1.size * Math.min(scaledWidth, scaledHeight) / 10;
      
      ctx.beginPath();
      ctx.moveTo(posX1, posY1);
      ctx.lineTo(posX2, posY2);
      ctx.strokeStyle = point1.color;
      ctx.lineWidth = brushSizePx;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
    
    ctx.restore();
  };

  const drawElementsOnCanvas = async (
    ctx: CanvasRenderingContext2D,
    elements: any[],
    stickerImages: Map<string, HTMLImageElement>,
    x: number,
    y: number,
    scaledWidth: number,
    scaledHeight: number,
    draggedElementId: string | null = null,
    dragNewX: number | null = null,
    dragNewY: number | null = null,
    isDragging: boolean = false
  ) => {
    for (const element of elements) {
      let posX, posY;

      if (element.id === draggedElementId && isDragging && dragNewX !== null && dragNewY !== null) {
        posX = x + scaledWidth * dragNewX;
        posY = y + scaledHeight * dragNewY;
      } else {
        posX = x + scaledWidth * element.x;
        posY = y + scaledHeight * element.y;
      }

      if (element.elementType === 'Sticker') {
        const stickerImg = stickerImages.get(element.id);
        if (!stickerImg) continue;

        ctx.save();
        ctx.translate(posX, posY);
        ctx.rotate(element.rotation * Math.PI / 180);
        ctx.globalAlpha = element.opacity;

        const stickerWidth = element.width;
        const stickerHeight = element.height;
        ctx.drawImage(stickerImg, -stickerWidth / 2, -stickerHeight / 2, stickerWidth, stickerHeight);
        ctx.restore();
      } else if (element.elementType === 'Text') {
        ctx.save();
        ctx.translate(posX, posY);
        ctx.rotate(element.rotation * Math.PI / 180);
        ctx.textAlign = element.textAlign;

        const fontWeight = element.fontWeight;
        const fontStyle = element.fontStyle;
        const fontFamily = element.fontFamily;
        ctx.font = `${fontStyle} ${fontWeight} ${element.fontSize}px ${fontFamily}`;
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 3;

        if (element.showShadow) {
          ctx.fillStyle = element.shadowColor;
          ctx.fillText(element.text, element.shadowOffset, element.shadowOffset);
        }

        ctx.strokeStyle = element.strokeColor;
        ctx.strokeText(element.text, 0, 0);

        if (element.useGradient) {
          const gradient = ctx.createLinearGradient(-100, 0, 100, 0);
          gradient.addColorStop(0, element.gradientStartColor);
          gradient.addColorStop(1, element.gradientEndColor);
          ctx.fillStyle = gradient;
        } else {
          ctx.fillStyle = element.color;
        }

        ctx.fillText(element.text, 0, 0);

        if (element.textDecoration === 'underline') {
          const metrics = ctx.measureText(element.text);
          const textWidth = metrics.width;
          const underlineY = element.fontSize / 2 + 3;

          ctx.beginPath();
          ctx.strokeStyle = element.color;
          ctx.lineWidth = 2;
          ctx.moveTo(-textWidth / 2, underlineY);
          ctx.lineTo(textWidth / 2, underlineY);
          ctx.stroke();
        }

        ctx.restore();
      }
    }
  };

  const draw = useCallback((e: any) => {
    if (!drawingMode || !isDrawing || !canvasRef.current || !selectedTemplate) return;
    
    e.preventDefault();
    
    const clientX = e.clientX ?? e.touches?.[0]?.clientX;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY;
    
    const normalized = getNormalizedCoordinates(clientX, clientY);
    if (normalized) {
      setDrawingData(prev => [...prev, {
        x: normalized.x,
        y: normalized.y,
        size: brushSize / 100,
        color: brushColor
      }]);
      redrawMeme();
    }
  }, [drawingMode, isDrawing, selectedTemplate, getNormalizedCoordinates, brushSize, brushColor, redrawMeme]);

  const stopDrawing = useCallback(() => {
    if (isDrawing) {
      saveToHistory();
      setIsDrawing(false);
    }
  }, [isDrawing, saveToHistory]);

  const clearDrawing = useCallback(async () => {
    saveToHistory();
    setDrawingData([]);
    await redrawMeme();
  }, [saveToHistory, redrawMeme]);

  const toggleDrawingMode = () => {
    setDrawingMode(!drawingMode);
    if (!drawingMode) {
      setIsDrawing(false);
    }
  };

  // Функции работы с элементами
  const addTextBlock = async () => {
    saveToHistory();
    setMemeElements(prev => [...prev, new TextBlock()]);
    setActiveBlockIndex(memeElements.length);
    await redrawMeme();
  };

  const removeTextBlock = async () => {
    if (memeElements.length <= 1) return;
    saveToHistory();
    const newElements = [...memeElements];
    newElements.splice(activeBlockIndex, 1);
    setMemeElements(newElements);
    if (activeBlockIndex >= newElements.length) {
      setActiveBlockIndex(newElements.length - 1);
    }
    await redrawMeme();
  };

  const duplicateTextBlock = async () => {
    if (!currentBlock) return;
    saveToHistory();
    const newBlock = currentBlock.clone();
    newBlock.x += 0.05;
    newBlock.y += 0.05;
    setMemeElements(prev => [...prev, newBlock]);
    setActiveBlockIndex(memeElements.length);
    await redrawMeme();
  };

  // Функции загрузки изображений
  const uploadCustomImage = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: any) => {
  const file = e.target.files[0];
  if (!file) return;

  setIsLoading(true);
  const reader = new FileReader();
  reader.onload = async (event: any) => {
    try {
      saveToHistory();
      
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        if (canvas) {
          const canvasWidth = canvas.width;
          const canvasHeight = canvas.height;
          const imgRatio = img.width / img.height;
          const canvasRatio = canvasWidth / canvasHeight;
          
          let displayWidth, displayHeight;
          
          switch (imageFitMode) {
            case 'original':
              // Оригинальный размер
              displayWidth = canvasWidth;
              displayHeight = canvasHeight;
              break;
            case 'contain':
            default:
              // Сохранить пропорции
              if (imgRatio > canvasRatio) {
                displayWidth = canvasWidth;
                displayHeight = canvasWidth / imgRatio;
              } else {
                displayHeight = canvasHeight;
                displayWidth = canvasHeight * imgRatio;
              }
              break;
          }
          
          setImageInfo({
            width: img.width,
            height: img.height,
            displayWidth,
            displayHeight
          });
          
          setSelectedTemplate(event.target.result);
        }
      };
      img.src = event.target.result;
      
      await redrawMeme();
    } catch (error) {
      console.error('Error loading image:', error);
    } finally {
      setIsLoading(false);
    }
  };
  reader.readAsDataURL(file);
};

  const updateTextProperty = async <K extends keyof TextBlock>(
    property: K,
    value: TextBlock[K]
  ) => {
    if (!currentBlock || currentBlock.elementType !== 'Text') return;
    saveToHistory();
    const newElements = [...memeElements];
    (newElements[activeBlockIndex] as TextBlock)[property] = value;
    setMemeElements(newElements);
    await redrawMeme();
  };
  
  const toggleTextProperty = async <K extends keyof TextBlock>(
    property: K,
    value1: TextBlock[K],
    value2: TextBlock[K]
  ) => {
    if (!currentBlock || currentBlock.elementType !== 'Text') return;
    saveToHistory();
    const newElements = [...memeElements];
    const currentValue = newElements[activeBlockIndex][property];
    newElements[activeBlockIndex][property] = currentValue === value1 ? value2 : value1;
    setMemeElements(newElements);
    await redrawMeme();
  };

  const changeText = (e: any) => updateTextProperty('text', e.target.value);
  const changeColor = (e: any) => updateTextProperty('color', e.target.value);
  const changeStrokeColor = (e: any) => updateTextProperty('strokeColor', e.target.value);
  const changeFontSize = (e: any) => updateTextProperty('fontSize', parseInt(e.target.value));
  const changeFontFamily = (e: any) => updateTextProperty('fontFamily', e.target.value);
  const toggleShowShadow = (e: any) => updateTextProperty('showShadow', e.target.checked);
  const changeShadowColor = (e: any) => updateTextProperty('shadowColor', e.target.value);
  const changeShadowOffset = (e: any) => updateTextProperty('shadowOffset', parseInt(e.target.value));
  const toggleUseGradient = (e: any) => updateTextProperty('useGradient', e.target.checked);
  const changeGradientStartColor = (e: any) => updateTextProperty('gradientStartColor', e.target.value);
  const changeGradientEndColor = (e: any) => updateTextProperty('gradientEndColor', e.target.value);
  const toggleBold = () => toggleTextProperty('fontWeight', 'bold', 'normal');
  const toggleItalic = () => toggleTextProperty('fontStyle', 'italic', 'normal');
  const toggleUnderline = () => toggleTextProperty('textDecoration', 'underline', 'none');

  const changeRotation = async (e: any) => {
    if (!currentBlock) return;
    saveToHistory();
    const newElements = [...memeElements];
    newElements[activeBlockIndex].rotation = parseInt(e.target.value);
    setMemeElements(newElements);
    await redrawMeme();
  };

  const changeStickerSize = async (e: any) => {
    if (!currentBlock || currentBlock.elementType !== 'Sticker') return;
    saveToHistory();
    const newElements = [...memeElements];
    const size = parseInt(e.target.value);
    const aspectRatio = newElements[activeBlockIndex].height / newElements[activeBlockIndex].width;
    newElements[activeBlockIndex].width = size;
    newElements[activeBlockIndex].height = size * aspectRatio;
    setMemeElements(newElements);
    await redrawMeme();
  };

  const changeStickerOpacity = async (e: any) => {
    if (!currentBlock || currentBlock.elementType !== 'Sticker') return;
    saveToHistory();
    const newElements = [...memeElements];
    newElements[activeBlockIndex].opacity = parseInt(e.target.value) / 100;
    setMemeElements(newElements);
    await redrawMeme();
  };

  // Функции фильтров
  const updateFilter = async <K extends keyof ImageFilters>(
    property: K,
    value: ImageFilters[K]
  ) => {
    saveToHistory();
    setImageFilters(prev => {
      const newFilters = prev.clone();
      newFilters[property] = value;
      return newFilters;
    });
    await redrawMeme();
  };

  type BooleanImageFilterKeys = {
    [K in keyof ImageFilters]: ImageFilters[K] extends boolean ? K : never;
  }[keyof ImageFilters];

  const toggleFilter = async <K extends BooleanImageFilterKeys>(
    property: K
  ) => {
    saveToHistory();
    setImageFilters(prev => {
      const newFilters = prev.clone();
      newFilters[property] = !prev[property];
      return newFilters;
    });
    await redrawMeme();
  };

  const changeBrightness = (e: any) => updateFilter('brightness', parseInt(e.target.value));
  const toggleGrayscale = () => toggleFilter('grayscale');
  const changeContrast = (e: any) => updateFilter('contrast', parseInt(e.target.value));
  const toggleSepia = () => toggleFilter('sepia');
  const changeSaturate = (e: any) => updateFilter('saturate', parseInt(e.target.value));
  const toggleInvert = () => toggleFilter('invert');
  const changeBlur = (e: any) => updateFilter('blur', parseFloat(e.target.value));

  const resetFilters = async () => {
    saveToHistory();
    setImageFilters(new ImageFilters());
    await redrawMeme();
  };

  // Функции масштабирования
  const zoomIn = () => {
    setZoomLevel(prev => Math.min(prev + 0.1, 2));
    redrawMeme();
  };

  const zoomOut = () => {
    setZoomLevel(prev => Math.max(prev - 0.1, 0.5));
    redrawMeme();
  };

  const resetZoom = () => {
    setZoomLevel(1);
    redrawMeme();
  };

  const startDrag = useCallback(async (e: any) => {
    e.preventDefault();

    if (!canvasRef.current || !selectedTemplate) return;

    const clientX = e.clientX ?? e.touches?.[0]?.clientX;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY;

    const normalized = getNormalizedCoordinates(clientX, clientY);
    if (!normalized) return;

    const hitIndex = await hitTestWithZoom(clientX, clientY);

    if (hitIndex >= 0) {
      const element = memeElementsRef.current[hitIndex];

      draggingRef.current = {
        isDragging: true,
        elementId: element.id,
        startX: normalized.x,
        startY: normalized.y,
        elementStartX: element.x,
        elementStartY: element.y,
        tempX: element.x,
        tempY: element.y
      };

      setActiveBlockIndex(hitIndex);
      saveToHistory();
    }
  }, [selectedTemplate, saveToHistory, getNormalizedCoordinates]);

  // Исправленный dragText с анимацией
  const dragElement = useCallback((e: any) => {
    if (!draggingRef.current.isDragging || !canvasRef.current) return;

    e.preventDefault();

    const clientX = e.clientX ?? e.touches?.[0]?.clientX;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY;

    const normalized = getNormalizedCoordinates(clientX, clientY);
    if (!normalized) return;

    const deltaX = normalized.x - draggingRef.current.startX;
    const deltaY = normalized.y - draggingRef.current.startY;

    let newElementX = draggingRef.current.elementStartX + deltaX;
    let newElementY = draggingRef.current.elementStartY + deltaY;

    newElementX = Math.max(0.05, Math.min(0.95, newElementX));
    newElementY = Math.max(0.05, Math.min(0.95, newElementY));

    draggingRef.current.tempX = newElementX;
    draggingRef.current.tempY = newElementY;
    redrawDuringDrag(draggingRef.current.elementId, newElementX, newElementY);

  }, [getNormalizedCoordinates, redrawDuringDrag]);

  type MoveDirection = 'up' | 'down' | 'front' | 'back';

  const moveElement = async (direction: MoveDirection) => {
    const isUpOrFront = direction === 'up' || direction === 'front';
    const isFront = direction === 'front';
    const isBack = direction === 'back';

    if (isUpOrFront && activeBlockIndex >= memeElements.length - 1) return;
    if ((direction === 'down' || isBack) && activeBlockIndex <= 0) return;

    saveToHistory();
    const newElements = [...memeElements];
    const element = newElements[activeBlockIndex];

    newElements.splice(activeBlockIndex, 1);

    let newIndex: number;
    if (isFront) newIndex = newElements.length;
    else if (isBack) newIndex = 0;
    else if (direction === 'up') newIndex = activeBlockIndex + 1;
    else newIndex = activeBlockIndex - 1;

    newElements.splice(newIndex, 0, element);
    setMemeElements(newElements);
    setActiveBlockIndex(newIndex);
    await redrawMeme();
  };

  const moveElementUp = () => moveElement('up');
  const moveElementDown = () => moveElement('down');
  const bringToFront = () => moveElement('front');
  const sendToBack = () => moveElement('back');

  const endDrag = useCallback(async () => {
    if (!draggingRef.current.isDragging) return;

    const finalX = draggingRef.current.tempX;
    const finalY = draggingRef.current.tempY;
    const elementId = draggingRef.current.elementId;
    const oldX = draggingRef.current.elementStartX;
    const oldY = draggingRef.current.elementStartY;

    if (elementId && (finalX !== oldX || finalY !== oldY)) {
      saveToHistory();

      // Используем метод updatePosition для обновления координат
      const newElements = memeElementsRef.current.map(el => {
        if (el.id === elementId && typeof el.updatePosition === 'function') {
          return el.updatePosition(finalX, finalY);
        }
        return el;
      });

      setMemeElements(newElements);
      await redrawMeme();
    }

    draggingRef.current = {
      isDragging: false,
      elementId: null,
      startX: 0,
      startY: 0,
      elementStartX: 0,
      elementStartY: 0,
      tempX: 0,
      tempY: 0
    };

  }, [saveToHistory, redrawMeme]);

  const hitTestWithZoom = useCallback((clientX: any, clientY: any) => {
    if (!canvasRef.current) return -1;

    const normalized = getNormalizedCoordinates(clientX, clientY);
    if (!normalized) return -1;

    const currentElements = memeElementsRef.current;

    for (let i = currentElements.length - 1; i >= 0; i--) {
      const element = currentElements[i];

      if (element.elementType === 'Text') {
        const approxWidth = 0.2;
        const approxHeight = 0.08;

        const left = element.x - approxWidth / 2;
        const right = element.x + approxWidth / 2;
        const top = element.y - approxHeight / 2;
        const bottom = element.y + approxHeight / 2;

        if (normalized.x >= left && normalized.x <= right &&
          normalized.y >= top && normalized.y <= bottom) {
          return i;
        }
      } else if (element.elementType === 'Sticker') {
        const canvas = canvasRef.current;
        const stickerWidthNorm = element.width / canvas.width;
        const stickerHeightNorm = element.height / canvas.height;

        const left = element.x - stickerWidthNorm * 0.6;
        const right = element.x + stickerWidthNorm * 0.6;
        const top = element.y - stickerHeightNorm * 0.6;
        const bottom = element.y + stickerHeightNorm * 0.6;

        if (normalized.x >= left && normalized.x <= right &&
          normalized.y >= top && normalized.y <= bottom) {
          return i;
        }
      }
    }

    return -1;
  }, [getNormalizedCoordinates]);

  // Стикеры
  const loadStickers = () => {
    const stickers = [];
    for (let i = 1; i <= 3000; i++) {
      const sticker = new Sticker();
      sticker.url = `/moji/${i}.svg`;
      sticker.name = `Стикер ${i}`;
      sticker.category = i <= 1000 ? '1-1000' : (i <= 2000 ? '1000-2000' : '2000-3000')
      stickers.push(sticker);
    }
    setAllStickers(stickers);
  };

  const addSticker = async (sticker: Sticker) => {
    saveToHistory();
    const newSticker = new Sticker();
    newSticker.url = sticker.url;
    newSticker.name = sticker.name;
    newSticker.category = sticker.category;
    setMemeElements(prev => [...prev, newSticker]);
    setActiveBlockIndex(memeElements.length);
    await redrawMeme();
  };

  const getCurrentPageStickers = () => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredStickers.slice(startIndex, startIndex + pageSize);
  };

  const previousPage = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };

  const nextPage = () => {
    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  };

  const changeStickerCategory = (e: any) => {
    setSelectedStickerCategory(e.target.value);
    setCurrentPage(1);
  };

  // Скачивание
  const downloadMeme = () => {
    if (!selectedTemplate || !canvasRef.current) return;
    const link = document.createElement('a');
    link.download = `meme_${Date.now()}.jpg`;
    link.href = canvasRef.current.toDataURL('image/jpeg', 0.95);
    link.click();
  };

  useEffect(() => {
    const preventSelect = (e: any) => {
      if (draggingRef.current.isDragging) {
        e.preventDefault();
      }
    };

    document.addEventListener('selectstart', preventSelect);
    document.addEventListener('dragstart', preventSelect);

    return () => {
      document.removeEventListener('selectstart', preventSelect);
      document.removeEventListener('dragstart', preventSelect);
    };
  }, []);

  // Клавиатурные сокращения
  useEffect(() => {
    const handleKeyDown = async (e: any) => {
      const ctrl = e.ctrlKey;
      const shift = e.shiftKey;

      switch (e.key) {
        case 'z':
          if (ctrl) { e.preventDefault(); await undo(); }
          break;
        case 'y':
          if (ctrl) { e.preventDefault(); await redo(); }
          break;
        case 'g':
          if (ctrl) { e.preventDefault(); setShowGrid(prev => !prev); }
          break;
        case 'd':
          if (ctrl) { e.preventDefault(); await duplicateTextBlock(); }
          break;
        case 'Delete':
          if (memeElements.length > 1) await removeTextBlock();
          break;
        case 'ArrowUp':
          if (ctrl && shift) { e.preventDefault(); await bringToFront(); }
          else if (ctrl) { e.preventDefault(); await moveElementUp(); }
          break;
        case 'ArrowDown':
          if (ctrl && shift) { e.preventDefault(); await sendToBack(); }
          else if (ctrl) { e.preventDefault(); await moveElementDown(); }
          break;
        case '+':
          if (ctrl) { e.preventDefault(); zoomIn(); }
          break;
        case '-':
          if (ctrl) { e.preventDefault(); zoomOut(); }
          break;
        case '0':
          if (ctrl) { e.preventDefault(); resetZoom(); }
          break;
        case 'Insert':
          await addTextBlock();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, duplicateTextBlock, removeTextBlock, bringToFront, sendToBack, moveElementUp, moveElementDown, memeElements.length, addTextBlock]);

  // Инициализация
  useEffect(() => {
    loadStickers();
    // Пример шаблона
    setSelectedTemplate('https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQkTQKRjWAlmDQSFNG3NUZtIAd96KDCRvcrvw&s');
  }, []);

  useEffect(() => {
    if (selectedTemplate) {
      redrawMeme();
    }
  }, [selectedTemplate, memeElements, imageFilters, zoomLevel, redrawMeme]);

  const getBlockColor = (el: any) => {
    if (el?.elementType === 'Text') return '#667eea';
    if (el?.elementType === 'Sticker') return '#f39c12';
    return '#95a5a6';
  };

  return (
    <div className="meme-editor">
      {/* Верхняя панель инструментов (для мобильных устройств) */}
      <div className="mobile-toolbar">
        <button className="mobile-tool-btn" onClick={toggleMobileMenu}>
          ☰ Меню
        </button>
        <button className="mobile-tool-btn" onClick={downloadMeme}>
          💾 Сохранить
        </button>
      </div>

      <div className="editor-layout">
        {/* Основная область с канвасом */}
        <div className="canvas-area">
          <div className="meme-preview">
            <canvas
              ref={canvasRef}
              width={800}
              height={600}
              className={`meme-canvas ${drawingMode ? 'drawing-mode' : ''}`}
              onMouseDown={drawingMode ? startDrawing : startDrag}
              onMouseMove={drawingMode ? draw : dragElement}
              onMouseUp={drawingMode ? stopDrawing : endDrag}
              onMouseLeave={drawingMode ? stopDrawing : endDrag}
              onTouchStart={drawingMode ? startDrawing : startDrag}
              onTouchMove={drawingMode ? draw : dragElement}
              onTouchEnd={drawingMode ? stopDrawing : endDrag}
              onWheel={(e) => {
                e.preventDefault();
                if (e.deltaY < 0) zoomIn();
                else zoomOut();
              }}
            />

            {/* Плавающие инструменты */}
            <div className="floating-tools">
              <div className="tool-group">
                <button className="tool-btn" onClick={zoomIn} title="Приблизить (Ctrl+Plus)">
                  <ZoomInIcon />
                </button>
                <button className="tool-btn" onClick={zoomOut} title="Отдалить (Ctrl+Minus)">
                  <ZoomOutIcon />
                </button>
                <button className="tool-btn" onClick={resetZoom} title="Сбросить масштаб (Ctrl+0)">
                  <ResetZoomIcon />
                </button>
              </div>

              <div className="tool-divider" />

              <div className="tool-group">
                <button 
                  className={`tool-btn ${showGrid ? 'active' : ''}`} 
                  onClick={() => setShowGrid(!showGrid)} 
                  title="Сетка (Ctrl+G)"
                >
                  <GridIcon />
                </button>
                <button
                  className={`tool-btn ${drawingMode ? 'active' : ''}`}
                  onClick={toggleDrawingMode}
                  title="Режим рисования"
                >
                  <DrawIcon />
                </button>
                <button className="tool-btn" onClick={undo} title="Отменить (Ctrl+Z)">
                  <UndoIcon />
                </button>
                <button className="tool-btn" onClick={redo} title="Повторить (Ctrl+Y)">
                  <RedoIcon />
                </button>
              </div>

              <div className="tool-divider" />

              <div className="tool-group">
                <button className="tool-btn" onClick={moveElementUp} title="Вверх (Ctrl+Up)">
                  <ArrowUpIcon />
                </button>
                <button className="tool-btn" onClick={moveElementDown} title="Вниз (Ctrl+Down)">
                  <ArrowDownIcon />
                </button>
                <button className="tool-btn" onClick={bringToFront} title="На передний план (Ctrl+Shift+Up)">
                  <FrontIcon />
                </button>
                <button className="tool-btn" onClick={sendToBack} title="На задний план (Ctrl+Shift+Down)">
                  <BackIcon />
                </button>
              </div>
            </div>

            {/* Индикатор масштаба */}
            <div className="zoom-indicator">
              {Math.round(zoomLevel * 100)}%
            </div>

            {showGrid && <GridOverlay />}
          </div>
        </div>

        {/* Боковая панель - на десктопе справа, на мобильных снизу */}
        <div className={`sidebar ${mobileMenuOpen ? 'open' : ''}`}>
          <div className="sidebar-header">
            <h2>Редактор мемов</h2>
            <button className="close-sidebar" onClick={toggleMobileMenu}>✕</button>
          </div>

          <div className="sidebar-content">
            {/* Вкладки для лучшей организации */}
            <div className="tabs">
              <button 
                className={`tab ${activeTab === 'elements' ? 'active' : ''}`}
                onClick={() => setActiveTab('elements')}
              >
                📦 Элементы
              </button>
              <button 
                className={`tab ${activeTab === 'filters' ? 'active' : ''}`}
                onClick={() => setActiveTab('filters')}
              >
                ✨ Эффекты
              </button>
              <button 
                className={`tab ${activeTab === 'draw' ? 'active' : ''}`}
                onClick={() => setActiveTab('draw')}
              >
                ✏️ Рисование
              </button>
              <button 
                className={`tab ${activeTab === 'stickers' ? 'active' : ''}`}
                onClick={() => setActiveTab('stickers')}
              >
                😊 Стикеры
              </button>
            </div>

            {/* Вкладка элементов */}
            {activeTab === 'elements' && (
              <div className="tab-content">
                {/* Управление блоками */}
                <div className="control-card">
                  <div className="card-header">
                    <h3>Блоки</h3>
                    <div className="block-buttons">
                      <button className="icon-btn" onClick={addTextBlock} title="Добавить текст">
                        ➕
                      </button>
                      <button className="icon-btn" onClick={removeTextBlock} disabled={memeElements.length <= 1}>
                        ➖
                      </button>
                      <button className="icon-btn" onClick={duplicateTextBlock}>
                        📋
                      </button>
                    </div>
                  </div>
                  <div className="block-indicator">
                    {memeElements.map((el, idx) => (
                      <div 
                        key={idx}
                        className={`block-dot ${idx === activeBlockIndex ? 'active' : ''}`}
                        onClick={() => setActiveBlockIndex(idx)}
                        style={{ background: getBlockColor(el) }}
                      />
                    ))}
                  </div>
                </div>

                {/* Свойства текущего блока */}
                {currentBlock && (
                  <div className="control-card">
                    <h3>Свойства</h3>
                    
                    {currentBlock.elementType === 'Text' && (
                      <>
                        <div className="form-group">
                          <label>Текст</label>
                          <input 
                            type="text" 
                            className="form-control"
                            value={currentBlock.text} 
                            onChange={changeText}
                            maxLength={200}
                          />
                        </div>

                        <div className="form-row">
                          <div className="form-group">
                            <label>Шрифт</label>
                            <select className="form-control" value={currentBlock.fontFamily} onChange={changeFontFamily}>
                              <option value="Impact">Impact</option>
                              <option value="Arial Black">Arial Black</option>
                              <option value="Comic Sans MS">Comic Sans MS</option>
                              <option value="Times New Roman">Times New Roman</option>
                            </select>
                          </div>

                          <div className="form-group">
                            <label>Размер</label>
                            <input 
                              type="range" 
                              className="form-range"
                              min="16" 
                              max="80" 
                              value={currentBlock.fontSize} 
                              onChange={changeFontSize}
                            />
                            <span className="range-value">{currentBlock.fontSize}px</span>
                          </div>
                        </div>

                        <div className="button-group">
                          <button 
                            className={`style-btn ${currentBlock.fontWeight === 'bold' ? 'active' : ''}`}
                            onClick={toggleBold}
                          >
                            <b>Ж</b>
                          </button>
                          <button 
                            className={`style-btn ${currentBlock.fontStyle === 'italic' ? 'active' : ''}`}
                            onClick={toggleItalic}
                          >
                            <i>К</i>
                          </button>
                          <button 
                            className={`style-btn ${currentBlock.textDecoration === 'underline' ? 'active' : ''}`}
                            onClick={toggleUnderline}
                          >
                            <u>Ч</u>
                          </button>
                        </div>

                        <div className="form-row">
                          <div className="form-group">
                            <label>Цвет</label>
                            <input type="color" className="form-color" value={currentBlock.color} onChange={changeColor} />
                          </div>
                          <div className="form-group">
                            <label>Обводка</label>
                            <input type="color" className="form-color" value={currentBlock.strokeColor} onChange={changeStrokeColor} />
                          </div>
                        </div>

                        <div className="form-group">
                          <label className="checkbox">
                            <input type="checkbox" checked={currentBlock.showShadow} onChange={toggleShowShadow} />
                            <span>🌑 Тень</span>
                          </label>
                        </div>

                        {currentBlock.showShadow && (
                          <div className="nested-controls">
                            <div className="form-group">
                              <label>Цвет тени</label>
                              <input type="color" className="form-color" value={currentBlock.shadowColor} onChange={changeShadowColor} />
                            </div>
                            <div className="form-group">
                              <label>Смещение: {currentBlock.shadowOffset}px</label>
                              <input type="range" min="0" max="20" value={currentBlock.shadowOffset} onChange={changeShadowOffset} />
                            </div>
                          </div>
                        )}
                        {/* ГРАДИЕНТ - с вашими функциями */}
                        <div className="form-group">
                          <label className="checkbox">
                            <input 
                              type="checkbox" 
                              checked={currentBlock.useGradient} 
                              onChange={toggleUseGradient} 
                            />
                            <span>🌈 Градиент</span>
                          </label>
                        </div>

                        {currentBlock.useGradient && (
                          <div className="nested-controls">
                            <div className="form-row">
                              <div className="form-group">
                                <label>Градиент от</label>
                                <input 
                                  type="color" 
                                  className="form-color" 
                                  value={currentBlock.gradientStartColor} 
                                  onChange={changeGradientStartColor} 
                                />
                              </div>
                              <div className="form-group">
                                <label>Градиент до</label>
                                <input 
                                  type="color" 
                                  className="form-color" 
                                  value={currentBlock.gradientEndColor} 
                                  onChange={changeGradientEndColor} 
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {currentBlock.elementType === 'Sticker' && (
                      <>
                        <div className="form-group">
                          <label>Размер</label>
                          <input 
                            type="range" 
                            min="50" 
                            max="300" 
                            value={currentBlock.width} 
                            onChange={changeStickerSize}
                          />
                        </div>

                        <div className="form-group">
                          <label>Прозрачность: {Math.round(currentBlock.opacity * 100)}%</label>
                          <input 
                            type="range" 
                            min="20" 
                            max="100" 
                            value={currentBlock.opacity * 100} 
                            onChange={changeStickerOpacity}
                          />
                        </div>
                      </>
                    )}

                    <div className="form-group">
                      <label>Поворот: {currentBlock.rotation || 0}°</label>
                      <input 
                        type="range" 
                        min="-180" 
                        max="180" 
                        value={currentBlock.rotation || 0} 
                        onChange={changeRotation}
                      />
                    </div>
                  </div>
                )}

                {/* Загрузка изображения */}
                <div className="control-card">
                  <h3>Фон</h3>
                  <button className="btn-primary btn-block" onClick={uploadCustomImage}>
                    📤 Загрузить изображение
                  </button>

                  {/* Добавьте опции масштабирования */}
                  <div className="form-group">
                    <label>Режим отображения</label>
                    <select
                      className="form-control"
                      value={imageFitMode}
                      onChange={(e) => setImageFitMode(e.target.value)}
                    >
                      <option value="contain">Сохранить пропорции</option>
                      <option value="original">Размер рабочей области</option>
                    </select>
                  </div>

                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelected}
                    accept="image/jpeg,image/jpg,image/png"
                    style={{ display: 'none' }}
                  />
                </div>
              </div>
            )}

            {/* Вкладка эффектов */}
            {activeTab === 'filters' && (
              <div className="tab-content">
                <div className="control-card">
                  <h3>Быстрые эффекты</h3>
                  <div className="filter-grid">
                    <button 
                      className={`filter-btn ${imageFilters.grayscale ? 'active' : ''}`}
                      onClick={toggleGrayscale}
                    >
                      ⚫ Ч/Б
                    </button>
                    <button 
                      className={`filter-btn ${imageFilters.sepia ? 'active' : ''}`}
                      onClick={toggleSepia}
                    >
                      🔶 Сепия
                    </button>
                    <button 
                      className={`filter-btn ${imageFilters.invert ? 'active' : ''}`}
                      onClick={toggleInvert}
                    >
                      🔄 Инверсия
                    </button>
                    <button className="filter-btn" onClick={resetFilters}>
                      🔄 Сброс
                    </button>
                  </div>
                </div>

                <div className="control-card">
                  <h3>Настройки</h3>
                  
                  <div className="form-group">
                    <label>Яркость: {imageFilters.brightness}%</label>
                    <input 
                      type="range" 
                      min="50" 
                      max="150" 
                      value={imageFilters.brightness} 
                      onChange={changeBrightness}
                    />
                  </div>

                  <div className="form-group">
                    <label>Контраст: {imageFilters.contrast}%</label>
                    <input 
                      type="range" 
                      min="50" 
                      max="150" 
                      value={imageFilters.contrast} 
                      onChange={changeContrast}
                    />
                  </div>

                  <div className="form-group">
                    <label>Насыщенность: {imageFilters.saturate}%</label>
                    <input 
                      type="range" 
                      min="0" 
                      max="200" 
                      value={imageFilters.saturate} 
                      onChange={changeSaturate}
                    />
                  </div>

                  <div className="form-group">
                    <label>Размытие: {imageFilters.blur}px</label>
                    <input 
                      type="range" 
                      min="0" 
                      max="10" 
                      step="0.5" 
                      value={imageFilters.blur} 
                      onChange={changeBlur}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Вкладка рисования */}
            {activeTab === 'draw' && (
              <div className="tab-content">
                <div className="control-card">
                  <button 
                    className={`btn-draw-mode ${drawingMode ? 'active' : ''}`}
                    onClick={toggleDrawingMode}
                  >
                    {drawingMode ? '🔴 Выйти из режима рисования' : '⚫ Войти в режим рисования'}
                  </button>

                  {drawingMode && (
                    <>
                      <div className="form-group">
                        <label>Размер кисти: {brushSize}px</label>
                        <input 
                          type="range" 
                          min="2" 
                          max="50" 
                          value={brushSize} 
                          onChange={(e) => setBrushSize(parseInt(e.target.value))}
                        />
                      </div>

                      <div className="form-group">
                        <label>Цвет кисти</label>
                        <input 
                          type="color" 
                          className="form-color" 
                          value={brushColor} 
                          onChange={(e) => setBrushColor(e.target.value)}
                        />
                      </div>

                      <div className="form-group">
                        <label>Слой</label>
                        <div className="button-group">
                          <button 
                            className={`layer-btn ${drawingLayer === 'bottom' ? 'active' : ''}`}
                            onClick={() => setDrawingLayer('bottom')}
                          >
                            Под элементами
                          </button>
                          <button 
                            className={`layer-btn ${drawingLayer === 'top' ? 'active' : ''}`}
                            onClick={() => setDrawingLayer('top')}
                          >
                            Поверх элементов
                          </button>
                        </div>
                      </div>

                      <button className="btn-danger btn-block" onClick={clearDrawing}>
                        🗑️ Очистить рисунок
                      </button>

                      <div className="info-message">
                        💡 Зажмите левую кнопку мыши и водите по канвасу
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Вкладка стикеров */}
            {activeTab === 'stickers' && (
              <div className="tab-content">
                <div className="control-card">
                  <div className="form-group">
                    <select className="form-control" value={selectedStickerCategory} onChange={changeStickerCategory}>
                      <option value="all">Все стикеры</option>
                      <option value="1-1000">Популярные (1-1000)</option>
                      <option value="1000-2000">Классические (1000-2000)</option>
                      <option value="2000-3000">Новые (2000-3000)</option>
                    </select>
                  </div>

                  <div className="pagination">
                    <button className="page-btn" onClick={previousPage} disabled={currentPage <= 1}>
                      ◀
                    </button>
                    <span className="page-info">
                      {currentPage} / {totalPages}
                    </span>
                    <button className="page-btn" onClick={nextPage} disabled={currentPage >= totalPages}>
                      ▶
                    </button>
                  </div>

                  <div className="stickers-grid">
                    {getCurrentPageStickers().map((sticker, idx) => (
                      <div key={idx} className="sticker-card" onClick={() => addSticker(sticker)}>
                        <img src={sticker.url} alt={sticker.name} loading="lazy" />
                        <span className="sticker-label">{sticker.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {isLoading && <LoadingOverlay />}
    </div>
  );
};

// Иконки (используем простые SVG для кросс-платформенности)
const ZoomInIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>;
const ZoomOutIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="8" y1="11" x2="14" y2="11" /></svg>;
const ResetZoomIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 1 0 9-9" /><path d="M3 3v6h6" /></svg>;
const GridIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="3" x2="21" y2="3" /><line x1="3" y1="21" x2="21" y2="21" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="12" y1="3" x2="12" y2="21" /></svg>;
const UndoIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" /></svg>;
const RedoIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 7v6h-6" /><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" /></svg>;
const ArrowUpIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>;
const ArrowDownIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></svg>;
const FrontIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" /><rect x="8" y="8" width="12" height="12" /></svg>;
const BackIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" /><rect x="8" y="8" width="8" height="8" /></svg>;
const DrawIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 19l7-7 3 3-7 7-3-3z" />
    <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
    <path d="M2 2l7.586 7.586" />
    <circle cx="11" cy="11" r="2" />
  </svg>
);
// Компоненты
const GridOverlay = () => (
  <div className="grid-overlay">
    {[0, 1, 2].map(i => (
      <React.Fragment key={i}>
        <div className="grid-line vertical" style={{ left: `${(i + 1) * 25}%` }} />
        <div className="grid-line horizontal" style={{ top: `${(i + 1) * 25}%` }} />
      </React.Fragment>
    ))}
  </div>
);

const LoadingOverlay = () => (
  <div className="loading-overlay">
    <div className="spinner"></div>
    <p>Загрузка...</p>
  </div>
);

export default MemeEditor;