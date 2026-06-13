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
  
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [activeBlockIndex, setActiveBlockIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [draggingElement, setDraggingElement] = useState(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragTextStart, setDragTextStart] = useState({ x: 0, y: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [showGrid, setShowGrid] = useState(false);
  const [sectionExpanded, setSectionExpanded] = useState(true);
  const [selectedStickerCategory, setSelectedStickerCategory] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [memeElements, setMemeElements] = useState<any[]>([
    new TextBlock()
  ]);
  const [imageFilters, setImageFilters] = useState(new ImageFilters());
  const [allStickers, setAllStickers] = useState([]);
  
  const pageSize = 10;

  // Вычисляемые значения
  const currentBlock = memeElements[activeBlockIndex];
  
  const filteredStickers = selectedStickerCategory === 'all'
    ? allStickers
    : allStickers.filter(s => s.category === selectedStickerCategory);
  
  const totalPages = Math.ceil(filteredStickers.length / pageSize);

  // Функции истории
  const saveToHistory = useCallback(() => {
    setUndoStack(prev => [...prev, new HistoryState(memeElements, imageFilters)]);
    setRedoStack([]);
  }, [memeElements, imageFilters]);

  const undo = useCallback(async () => {
    if (undoStack.length === 0) return;
    
    const current = new HistoryState(memeElements, imageFilters);
    setRedoStack(prev => [...prev, current]);
    
    const previous = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    setMemeElements(previous.elements);
    setImageFilters(previous.filters);
    
    if (activeBlockIndex >= previous.elements.length) {
      setActiveBlockIndex(previous.elements.length - 1);
    }
    
    await redrawMeme();
  }, [undoStack, memeElements, imageFilters, activeBlockIndex]);

  const redo = useCallback(async () => {
    if (redoStack.length === 0) return;
    
    const next = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, -1));
    setMemeElements(next.elements);
    setImageFilters(next.filters);
    
    saveToHistory();
    await redrawMeme();
  }, [redoStack, saveToHistory]);

  // Функции отрисовки
  const redrawMeme = useCallback(async () => {
    if (!selectedTemplate || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    // Загрузка фонового изображения
    const bgImage = await loadImageWithCache(selectedTemplate);
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Применение фильтров
    let filterString = `brightness(${imageFilters.brightness}%) contrast(${imageFilters.contrast}%) `;
    filterString += `saturate(${imageFilters.saturate}%) blur(${imageFilters.blur}px)`;
    if (imageFilters.grayscale) filterString += ' grayscale(100%)';
    if (imageFilters.sepia) filterString += ' sepia(100%)';
    if (imageFilters.invert) filterString += ' invert(100%)';
    
    ctx.filter = filterString;
    
    const scaledWidth = canvas.width * zoomLevel;
    const scaledHeight = canvas.height * zoomLevel;
    const x = (canvas.width - scaledWidth) / 2;
    const y = (canvas.height - scaledHeight) / 2;
    
    ctx.drawImage(bgImage, x, y, scaledWidth, scaledHeight);
    ctx.filter = 'none';
    
    // Загрузка стикеров
    const stickerImages = new Map();
    for (const element of memeElements) {
      if (element.elementType === 'Sticker') {
        const img = await loadImageWithCache(element.url);
        stickerImages.set(element.id, img);
      }
    }
    
    // Отрисовка элементов
    for (const element of memeElements) {
      if (element.elementType === 'Sticker') {
        const stickerImg = stickerImages.get(element.id);
        if (!stickerImg) continue;
        
        const posX = x + scaledWidth * element.x;
        const posY = y + scaledHeight * element.y;
        
        ctx.save();
        ctx.translate(posX, posY);
        ctx.rotate(element.rotation * Math.PI / 180);
        ctx.globalAlpha = element.opacity;
        
        const stickerWidth = element.width;
        const stickerHeight = element.height;
        ctx.drawImage(stickerImg, -stickerWidth / 2, -stickerHeight / 2, stickerWidth, stickerHeight);
        ctx.restore();
      } else if (element.elementType === 'Text') {
        const posX = x + scaledWidth * element.x;
        const posY = y + scaledHeight * element.y;
        
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
        
        // Тень
        if (element.showShadow) {
          ctx.fillStyle = element.shadowColor;
          ctx.fillText(element.text, element.shadowOffset, element.shadowOffset);
        }
        
        // Обводка
        ctx.strokeStyle = element.strokeColor;
        ctx.strokeText(element.text, 0, 0);
        
        // Заливка
        if (element.useGradient) {
          const gradient = ctx.createLinearGradient(-100, 0, 100, 0);
          gradient.addColorStop(0, element.gradientStartColor);
          gradient.addColorStop(1, element.gradientEndColor);
          ctx.fillStyle = gradient;
        } else {
          ctx.fillStyle = element.color;
        }
        
        ctx.fillText(element.text, 0, 0);
        
        // Подчеркивание
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

  }, [selectedTemplate, memeElements, imageFilters, zoomLevel]);

  // Загрузка изображения с кэшем
  const imageCache = new Map();
  
  const loadImageWithCache = (url : string) : Promise<HTMLImageElement> => {
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

  const moveElementUp = async () => {
    if (activeBlockIndex >= memeElements.length - 1) return;
    saveToHistory();
    const newElements = [...memeElements];
    const element = newElements[activeBlockIndex];
    newElements.splice(activeBlockIndex, 1);
    newElements.splice(activeBlockIndex + 1, 0, element);
    setMemeElements(newElements);
    setActiveBlockIndex(activeBlockIndex + 1);
    await redrawMeme();
  };

  const moveElementDown = async () => {
    if (activeBlockIndex <= 0) return;
    saveToHistory();
    const newElements = [...memeElements];
    const element = newElements[activeBlockIndex];
    newElements.splice(activeBlockIndex, 1);
    newElements.splice(activeBlockIndex - 1, 0, element);
    setMemeElements(newElements);
    setActiveBlockIndex(activeBlockIndex - 1);
    await redrawMeme();
  };

  const bringToFront = async () => {
    if (activeBlockIndex >= memeElements.length - 1) return;
    saveToHistory();
    const newElements = [...memeElements];
    const element = newElements[activeBlockIndex];
    newElements.splice(activeBlockIndex, 1);
    newElements.push(element);
    setMemeElements(newElements);
    setActiveBlockIndex(newElements.length - 1);
    await redrawMeme();
  };

  const sendToBack = async () => {
    if (activeBlockIndex <= 0) return;
    saveToHistory();
    const newElements = [...memeElements];
    const element = newElements[activeBlockIndex];
    newElements.splice(activeBlockIndex, 1);
    newElements.unshift(element);
    setMemeElements(newElements);
    setActiveBlockIndex(0);
    await redrawMeme();
  };

  // Функции загрузки изображений
  const uploadCustomImage = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setIsLoading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      saveToHistory();
      setSelectedTemplate(event.target.result);
      await redrawMeme();
      setIsLoading(false);
    };
    reader.readAsDataURL(file);
  };

  const loadImageFromUrl = async () => {
    if (!imageUrlInput.trim()) return;
    
    setIsLoading(true);
    saveToHistory();
    setSelectedTemplate(imageUrlInput);
    await redrawMeme();
    setImageUrlInput('');
    setIsLoading(false);
  };

  // Функции изменения свойств
  const changeText = async (e) => {
    if (!currentBlock || currentBlock.elementType !== 'Text') return;
    saveToHistory();
    const newElements = [...memeElements];
    newElements[activeBlockIndex].text = e.target.value;
    setMemeElements(newElements);
    await redrawMeme();
  };

  const changeFontFamily = async (e) => {
    if (!currentBlock || currentBlock.elementType !== 'Text') return;
    saveToHistory();
    const newElements = [...memeElements];
    newElements[activeBlockIndex].fontFamily = e.target.value;
    setMemeElements(newElements);
    await redrawMeme();
  };

  const toggleBold = async () => {
    if (!currentBlock || currentBlock.elementType !== 'Text') return;
    saveToHistory();
    const newElements = [...memeElements];
    newElements[activeBlockIndex].fontWeight = 
      newElements[activeBlockIndex].fontWeight === 'bold' ? 'normal' : 'bold';
    setMemeElements(newElements);
    await redrawMeme();
  };

  const toggleItalic = async () => {
    if (!currentBlock || currentBlock.elementType !== 'Text') return;
    saveToHistory();
    const newElements = [...memeElements];
    newElements[activeBlockIndex].fontStyle = 
      newElements[activeBlockIndex].fontStyle === 'italic' ? 'normal' : 'italic';
    setMemeElements(newElements);
    await redrawMeme();
  };

  const toggleUnderline = async () => {
    if (!currentBlock || currentBlock.elementType !== 'Text') return;
    saveToHistory();
    const newElements = [...memeElements];
    newElements[activeBlockIndex].textDecoration = 
      newElements[activeBlockIndex].textDecoration === 'underline' ? 'none' : 'underline';
    setMemeElements(newElements);
    await redrawMeme();
  };

  const changeColor = async (e) => {
    if (!currentBlock || currentBlock.elementType !== 'Text') return;
    saveToHistory();
    const newElements = [...memeElements];
    newElements[activeBlockIndex].color = e.target.value;
    setMemeElements(newElements);
    await redrawMeme();
  };

  const changeStrokeColor = async (e) => {
    if (!currentBlock || currentBlock.elementType !== 'Text') return;
    saveToHistory();
    const newElements = [...memeElements];
    newElements[activeBlockIndex].strokeColor = e.target.value;
    setMemeElements(newElements);
    await redrawMeme();
  };

  const changeFontSize = async (e) => {
    if (!currentBlock || currentBlock.elementType !== 'Text') return;
    saveToHistory();
    const newElements = [...memeElements];
    newElements[activeBlockIndex].fontSize = parseInt(e.target.value);
    setMemeElements(newElements);
    await redrawMeme();
  };

  const changeRotation = async (e) => {
    if (!currentBlock) return;
    saveToHistory();
    const newElements = [...memeElements];
    newElements[activeBlockIndex].rotation = parseInt(e.target.value);
    setMemeElements(newElements);
    await redrawMeme();
  };

  const changeStickerSize = async (e) => {
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

  const changeStickerOpacity = async (e) => {
    if (!currentBlock || currentBlock.elementType !== 'Sticker') return;
    saveToHistory();
    const newElements = [...memeElements];
    newElements[activeBlockIndex].opacity = parseInt(e.target.value) / 100;
    setMemeElements(newElements);
    await redrawMeme();
  };

  const toggleShowShadow = async (e) => {
    if (!currentBlock || currentBlock.elementType !== 'Text') return;
    saveToHistory();
    const newElements = [...memeElements];
    newElements[activeBlockIndex].showShadow = e.target.checked;
    setMemeElements(newElements);
    await redrawMeme();
  };

  const changeShadowColor = async (e) => {
    if (!currentBlock || currentBlock.elementType !== 'Text') return;
    saveToHistory();
    const newElements = [...memeElements];
    newElements[activeBlockIndex].shadowColor = e.target.value;
    setMemeElements(newElements);
    await redrawMeme();
  };

  const changeShadowOffset = async (e) => {
    if (!currentBlock || currentBlock.elementType !== 'Text') return;
    saveToHistory();
    const newElements = [...memeElements];
    newElements[activeBlockIndex].shadowOffset = parseInt(e.target.value);
    setMemeElements(newElements);
    await redrawMeme();
  };

  const toggleUseGradient = async (e) => {
    if (!currentBlock || currentBlock.elementType !== 'Text') return;
    saveToHistory();
    const newElements = [...memeElements];
    newElements[activeBlockIndex].useGradient = e.target.checked;
    setMemeElements(newElements);
    await redrawMeme();
  };

  const changeGradientStartColor = async (e) => {
    if (!currentBlock || currentBlock.elementType !== 'Text') return;
    saveToHistory();
    const newElements = [...memeElements];
    newElements[activeBlockIndex].gradientStartColor = e.target.value;
    setMemeElements(newElements);
    await redrawMeme();
  };

  const changeGradientEndColor = async (e) => {
    if (!currentBlock || currentBlock.elementType !== 'Text') return;
    saveToHistory();
    const newElements = [...memeElements];
    newElements[activeBlockIndex].gradientEndColor = e.target.value;
    setMemeElements(newElements);
    await redrawMeme();
  };

  // Функции фильтров
 const toggleInvert = async () => {
    saveToHistory();
    setImageFilters(prev => {
        const newFilters = prev.clone();
        newFilters.invert = !prev.invert;
        return newFilters;
    });
    await redrawMeme();
};

  const changeBrightness = async (e) => {
    saveToHistory();
    setImageFilters(prev => {
      const newFilters = prev.clone();
      newFilters.brightness = parseInt(e.target.value);
      return newFilters;
    });
    await redrawMeme();
  };

  const changeContrast = async (e) => {
    saveToHistory();
    setImageFilters(prev => {
      const newFilters = prev.clone();
      newFilters.contrast = parseInt(e.target.value);
      return newFilters;
    });
    await redrawMeme();
  };

  const changeSaturate = async (e) => {
    saveToHistory();
    setImageFilters(prev => {
      const newFilters = prev.clone();
      newFilters.saturate = parseInt(e.target.value);
      return newFilters;
    });
    await redrawMeme();
  };

  const changeBlur = async (e) => {
    saveToHistory();
    setImageFilters(prev => {
      const newFilters = prev.clone();
      newFilters.blur = parseFloat(e.target.value);
      return newFilters;
    });
    await redrawMeme();
  };

  const resetFilters = async () => {
    saveToHistory();
    setImageFilters(new ImageFilters());
    await redrawMeme();
  };

  const toggleGrayscale = async () => {
    saveToHistory();
    setImageFilters(prev => {
      const newFilters = prev.clone();
      newFilters.grayscale = !prev.grayscale;
      return newFilters;
    });
    await redrawMeme();
  };

  const toggleSepia = async () => {
    saveToHistory();
    setImageFilters(prev => {
      const newFilters = prev.clone();
      newFilters.sepia = !prev.sepia;
      return newFilters;
    });
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

  // Drag and drop
  const startDrag = async (e) => {
    if (!canvasRef.current) {
      return;
    }
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = e.clientX ?? e.touches?.[0]?.clientX;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY;
    
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    
    const hitIndex = await hitTest(clientX, clientY);
    if (hitIndex >= 0) {
      saveToHistory();
      setIsDragging(true);
      setDraggingElement(memeElements[hitIndex]);
      setActiveBlockIndex(hitIndex);
      setDragStart({ x, y });
      setDragTextStart({ x: memeElements[hitIndex].x, y: memeElements[hitIndex].y });
    }
  };

  const dragText = async (e) => {
    if (!isDragging || !draggingElement || !canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = e.clientX ?? e.touches?.[0]?.clientX;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY;
    
    const newX = (clientX - rect.left) / rect.width;
    const newY = (clientY - rect.top) / rect.height;
    
    const newElementX = dragTextStart.x + (newX - dragStart.x);
    const newElementY = dragTextStart.y + (newY - dragStart.y);
    
    const clampedX = Math.max(0.05, Math.min(0.95, newElementX));
    const clampedY = Math.max(0.05, Math.min(0.95, newElementY));
    
    const newElements = [...memeElements];
    const index = newElements.findIndex(el => el.id === draggingElement.id);
    if (index !== -1) {
      newElements[index].x = clampedX;
      newElements[index].y = clampedY;
      setMemeElements(newElements);
      await redrawMeme();
    }
  };

  const endDrag = () => {
    setIsDragging(false);
    setDraggingElement(null);
  };

  const hitTest = (clientX, clientY) => {
    if(!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    
    const relX = (clientX - rect.left) * scaleX / canvasRef.current.width;
    const relY = (clientY - rect.top) * scaleY / canvasRef.current.height;
    
    for (let i = memeElements.length - 1; i >= 0; i--) {
      const element = memeElements[i];
      const dx = Math.abs(relX - element.x);
      const dy = Math.abs(relY - element.y);
      
      if (element.elementType === 'Text') {
        if (dx < 0.15 && dy < 0.05) return i;
      } else if (element.elementType === 'Sticker') {
        const stickerWidth = element.width / canvasRef.current.width;
        const stickerHeight = element.height / canvasRef.current.height;
        if (dx < stickerWidth / 2 && dy < stickerHeight / 2) return i;
      }
    }
    
    return -1;
  };

  // Стикеры
  const loadStickers = () => {
    const stickers = [];
    for (let i = 1; i <= 3000; i++) {
      stickers.push({
        url: `/moji/${i}.svg`,
        name: `Стикер ${i}`,
        category: i <= 1000 ? 'emoji' : (i <= 2000 ? 'reactions' : 'memes')
      });
    }
    setAllStickers(stickers);
  };

  const addSticker = async (sticker) => {
    saveToHistory();
    const newSticker = new Sticker();
    newSticker.url= sticker.url;
      newSticker.name= sticker.name;
        newSticker.category= sticker.category;
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

  const changeStickerCategory = (e) => {
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

  // Клавиатурные сокращения
  useEffect(() => {
    const handleKeyDown = async (e) => {
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

  const getBlockColor = () => {
    if (currentBlock?.elementType === 'Text') return '#667eea';
    if (currentBlock?.elementType === 'Sticker') return '#f39c12';
    return '#95a5a6';
  };

  return (
    <div className="meme-editor">
      <div className="editor-container">
        {/* Канвас */}
        <div className="meme-preview">
          <canvas
            ref={canvasRef}
            width="800"
            height="600"
            className="meme-canvas"
            onMouseDown={startDrag}
            onMouseMove={dragText}
            onMouseUp={endDrag}
            onMouseLeave={endDrag}
            onWheel={(e) => {
              if (e.deltaY < 0) zoomIn();
              else zoomOut();
            }}
            onTouchStart={startDrag}
            onTouchMove={dragText}
            onTouchEnd={endDrag}
          />
          
          {showGrid && (
            <div className="grid-overlay">
              {[0, 1, 2].map(i => (
                <React.Fragment key={i}>
                  <div className="grid-line vertical" style={{ left: `${(i + 1) * 25}%` }} />
                  <div className="grid-line horizontal" style={{ top: `${(i + 1) * 25}%` }} />
                </React.Fragment>
              ))}
            </div>
          )}
          
          {/* Панель инструментов на канвасе */}
          <div className="canvas-tools">
            <div className="tool-group">
              <button className="tool-btn" onClick={zoomIn} title="Приблизить (Ctrl++)">➕</button>
              <button className="tool-btn" onClick={zoomOut} title="Отдалить (Ctrl+-)">➖</button>
              <button className="tool-btn" onClick={resetZoom} title="Сбросить масштаб (Ctrl+0)">🔄</button>
            </div>
            <div className="tool-group">
              <button className={`tool-btn ${showGrid ? 'active' : ''}`} onClick={() => setShowGrid(!showGrid)} title="Показать сетку (Ctrl+G)">⊞</button>
              <button className="tool-btn" onClick={undo} title="Отменить (Ctrl+Z)">↩️</button>
              <button className="tool-btn" onClick={redo} title="Повторить (Ctrl+Y)">↪️</button>
            </div>
            <div className="tool-group">
              <button className="tool-btn" onClick={moveElementUp} title="Переместить выше (Ctrl+↑)">⬆️</button>
              <button className="tool-btn" onClick={moveElementDown} title="Переместить ниже (Ctrl+↓)">⬇️</button>
              <button className="tool-btn" onClick={bringToFront} title="На передний план (Ctrl+Shift+↑)">📌</button>
              <button className="tool-btn" onClick={sendToBack} title="На задний план (Ctrl+Shift+↓)">💠</button>
            </div>
          </div>
        </div>
        
        {/* Панель управления */}
        <div className="control-panel">
          {/* Настройки блоков */}
          <div className="control-section">
            <h3 className="section-title" onClick={() => setSectionExpanded(!sectionExpanded)}>
              <span>Настройки блоков</span>
              <span>{sectionExpanded ? '▲' : '▼'}</span>
            </h3>
            
            {sectionExpanded && (
              <div className="section-content">
                <div className="control-group">
                  <label>📦 Блоки:</label>
                  <div className="text-blocks-controls">
                    <button className="control-button" onClick={addTextBlock} title="Добавить текст (Ins)">➕</button>
                    <button className="control-button" onClick={removeTextBlock} disabled={memeElements.length <= 1} title="Удалить блок (Del)">➖</button>
                    <button className="control-button" onClick={duplicateTextBlock} title="Дублировать блок (Ctrl+D)">📋</button>
                    <div className="active-text-indicator" style={{ background: getBlockColor() }}>
                      Блок {activeBlockIndex + 1}/{memeElements.length}
                    </div>
                  </div>
                </div>
                
                {currentBlock?.elementType === 'Text' && (
                  <>
                    <div className="control-group">
                      <label>✏️ Текст:</label>
                      <input type="text" className="form-input" value={currentBlock.text} onChange={changeText} />
                    </div>
                    
                    <div className="control-group">
                      <label>🔤 Шрифт:</label>
                      <select className="form-select" value={currentBlock.fontFamily} onChange={changeFontFamily}>
                        <option value="Impact">Impact</option>
                        <option value="Arial Black">Arial Black</option>
                        <option value="Comic Sans MS">Comic Sans MS</option>
                        <option value="Times New Roman">Times New Roman</option>
                        <option value="Courier New">Courier New</option>
                        <option value="Georgia">Georgia</option>
                        <option value="Verdana">Verdana</option>
                      </select>
                    </div>
                    
                    <div className="control-group">
                      <label>📏 Размер: {currentBlock.fontSize} px</label>
                      <input type="range" className="form-range" min="16" max="80" step="2" value={currentBlock.fontSize} onChange={changeFontSize} />
                    </div>
                    
                    <div className="control-group">
                      <label>🎨 Стиль:</label>
                      <div className="text-blocks-controls">
                        <button className={`control-button ${currentBlock.fontWeight === 'bold' ? 'active' : ''}`} onClick={toggleBold}><b>B</b></button>
                        <button className={`control-button ${currentBlock.fontStyle === 'italic' ? 'active' : ''}`} onClick={toggleItalic}><i>I</i></button>
                        <button className={`control-button ${currentBlock.textDecoration === 'underline' ? 'active' : ''}`} onClick={toggleUnderline}><u>U</u></button>
                      </div>
                    </div>
                    
                    <div className="color-controls">
                      <div className="color-control">
                        <label>🎨 Цвет:</label>
                        <input type="color" className="form-color" value={currentBlock.color} onChange={changeColor} />
                      </div>
                      <div className="color-control">
                        <label>✒️ Обводка:</label>
                        <input type="color" className="form-color" value={currentBlock.strokeColor} onChange={changeStrokeColor} />
                      </div>
                    </div>
                    
                    <div className="control-group">
                      <label>
                        <input type="checkbox" checked={currentBlock.showShadow} onChange={toggleShowShadow} />
                        🌑 Тень
                      </label>
                      {currentBlock.showShadow && (
                        <div className="shadow-controls">
                          <div className="color-control">
                            <label>Цвет тени:</label>
                            <input type="color" className="form-color" value={currentBlock.shadowColor} onChange={changeShadowColor} />
                          </div>
                          <div className="control-group">
                            <label>Смещение: {currentBlock.shadowOffset} px</label>
                            <input type="range" className="form-range" min="0" max="20" step="1" value={currentBlock.shadowOffset} onChange={changeShadowOffset} />
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div className="control-group">
                      <label>
                        <input type="checkbox" checked={currentBlock.useGradient} onChange={toggleUseGradient} />
                        🌈 Градиент
                      </label>
                      {currentBlock.useGradient && (
                        <div className="color-controls">
                          <div className="color-control">
                            <label>Градиент от:</label>
                            <input type="color" className="form-color" value={currentBlock.gradientStartColor} onChange={changeGradientStartColor} />
                          </div>
                          <div className="color-control">
                            <label>Градиент до:</label>
                            <input type="color" className="form-color" value={currentBlock.gradientEndColor} onChange={changeGradientEndColor} />
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
                
                {currentBlock?.elementType === 'Sticker' && (
                  <>
                    <div className="control-group">
                      <label>📐 Размер стикера: {Math.round(currentBlock.width / 800 * 100)}%</label>
                      <input type="range" className="form-range" min="50" max="300" step="5" value={currentBlock.width} onChange={changeStickerSize} />
                    </div>
                    
                    <div className="control-group">
                      <label>🔮 Прозрачность: {Math.round(currentBlock.opacity * 100)}%</label>
                      <input type="range" className="form-range" min="20" max="100" step="5" value={currentBlock.opacity * 100} onChange={changeStickerOpacity} />
                    </div>
                  </>
                )}
                
                <div className="control-group">
                  <label>🔄 Наклон: {currentBlock?.rotation || 0}°</label>
                  <input type="range" className="form-range" min="-180" max="180" step="5" value={currentBlock?.rotation || 0} onChange={changeRotation} />
                </div>
              </div>
            )}
          </div>
          
          {/* Шаблоны */}
          <div className="control-section">
            <h3 className="section-title">🎭 Шаблоны</h3>
            
            <div className="upload-section">
              <button className="upload-button" onClick={uploadCustomImage}>
                📤 Загрузить свое изображение
              </button>
              <input type="file" accept="image/jpeg,image/jpg,image/png" style={{ display: 'none' }} ref={fileInputRef} onChange={handleFileSelected} />
            </div>
            
            <div className="url-input-section">
              <input type="text" className="form-input" placeholder="Или вставьте URL изображения..." value={imageUrlInput} onChange={(e) => setImageUrlInput(e.target.value)} />
              <button className="control-button" onClick={loadImageFromUrl}>🔗</button>
            </div>
          </div>
          
          {/* Фильтры */}
          <div className="control-section">
            <h3 className="section-title">✨ Эффекты</h3>
            <div className="control-group">
              <div className="text-blocks-controls">
                <button className="control-button" onClick={resetFilters}>🔄</button>
                <button className={`control-button ${imageFilters.grayscale ? 'active' : ''}`} onClick={toggleGrayscale}>⚫</button>
                <button className={`control-button ${imageFilters.sepia ? 'active' : ''}`} onClick={toggleSepia}>🔶</button>
                <button className={`control-button ${imageFilters.invert ? 'active' : ''}`} onClick={toggleInvert}>🔄</button>
              </div>
            </div>
            <div>
              <div className="control-group">
                <label>💡 Яркость: {imageFilters.brightness}%</label>
                <input type="range" min="50" max="150" step="5" value={imageFilters.brightness} onChange={changeBrightness} />
              </div>
              <div className="control-group">
                <label>🎨 Контраст: {imageFilters.contrast}%</label>
                <input type="range" min="50" max="150" step="5" value={imageFilters.contrast} onChange={changeContrast} />
              </div>
              <div className="control-group">
                <label>🌈 Насыщенность: {imageFilters.saturate}%</label>
                <input type="range" min="0" max="200" step="5" value={imageFilters.saturate} onChange={changeSaturate} />
              </div>
              <div className="control-group">
                <label>💨 Размытие: {imageFilters.blur}px</label>
                <input type="range" min="0" max="10" step="0.5" value={imageFilters.blur} onChange={changeBlur} />
              </div>
            </div>
          </div>
          
          {/* Стикеры */}
          <div className="control-section">
            <h3 className="section-title">😊 Стикеры</h3>
            
            <div className="sticker-categories">
              <select className="form-select" value={selectedStickerCategory} onChange={changeStickerCategory}>
                <option value="all">Все</option>
                <option value="emoji">Эмодзи</option>
                <option value="reactions">Реакции</option>
                <option value="memes">Мемы</option>
              </select>
            </div>
            
            <div className="pagination-container">
              <button className="pagination-btn" onClick={previousPage} disabled={currentPage <= 1}>◀</button>
              <span className="pagination-info">Страница {currentPage} из {totalPages} ({filteredStickers.length} стикеров)</span>
              <button className="pagination-btn" onClick={nextPage} disabled={currentPage >= totalPages}>▶</button>
            </div>
            
            <div className="stickers-grid">
              {getCurrentPageStickers().map((sticker, idx) => (
                <div key={idx} className="sticker-item" onClick={() => addSticker(sticker)}>
                  <img src={sticker.url} alt={sticker.name} />
                  <div className="sticker-name">{sticker.name}</div>
                </div>
              ))}
            </div>
          </div>
          
          {/* Скачивание */}
          <div className="submit-section">
            <button className="download-button" onClick={downloadMeme}>💾 Скачать</button>
          </div>
        </div>
      </div>
      
      {isLoading && (
        <div className="loading-overlay">
          <div className="spinner"></div>
          <p>Загрузка мема...</p>
        </div>
      )}
    </div>
  );
};

export default MemeEditor;