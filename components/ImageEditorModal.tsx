'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { RotateCw, Crop, PenTool, Undo2, Check, X, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ImageEditorModalProps {
  file: File;
  onSave: (editedFile: File) => void;
  onCancel: () => void;
}

export default function ImageEditorModal({ file, onSave, onCancel }: ImageEditorModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
  const [rotation, setRotation] = useState<number>(0);
  const [mode, setMode] = useState<'draw' | 'crop' | 'view'>('view');
  
  // Drawing state
  const [penColor, setPenColor] = useState<string>('#ef4444'); // Red default
  const [penWidth, setPenWidth] = useState<number>(4);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [history, setHistory] = useState<ImageData[]>([]);

  // Crop state (normalized 0..1 or pixel coords)
  const [cropStart, setCropStart] = useState<{ x: number; y: number } | null>(null);
  const [cropEnd, setCropEnd] = useState<{ x: number; y: number } | null>(null);
  const [isCropping, setIsCropping] = useState<boolean>(false);

  // Load image
  useEffect(() => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        setOriginalImage(img);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }, [file]);

  // Redraw base image with rotation
  const renderBase = useCallback(() => {
    if (!originalImage || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isPerpendicular = rotation % 180 !== 0;
    const width = isPerpendicular ? originalImage.height : originalImage.width;
    const height = isPerpendicular ? originalImage.width : originalImage.height;

    // Limit maximum canvas size for performance on mobile
    const maxDim = 1600;
    let scale = 1;
    if (Math.max(width, height) > maxDim) {
      scale = maxDim / Math.max(width, height);
    }

    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(
      originalImage,
      (-originalImage.width * scale) / 2,
      (-originalImage.height * scale) / 2,
      originalImage.width * scale,
      originalImage.height * scale
    );
    ctx.restore();

    // Save initial state to history
    const initialData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setHistory([initialData]);
  }, [originalImage, rotation]);

  useEffect(() => {
    renderBase();
  }, [renderBase]);

  // Rotate handlers
  const handleRotate = (deg: number) => {
    setRotation((prev) => (prev + deg + 360) % 360);
    setCropStart(null);
    setCropEnd(null);
  };

  // Canvas pointer event helpers (coordinates relative to canvas)
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if ('touches' in e) {
      const touch = e.touches[0];
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      };
    } else {
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    }
  };

  // Drawing
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (mode === 'crop') {
      const coords = getCanvasCoords(e);
      setCropStart(coords);
      setCropEnd(coords);
      setIsCropping(true);
      return;
    }

    if (mode !== 'draw') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    const coords = getCanvasCoords(e);
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
    ctx.strokeStyle = penColor;
    ctx.lineWidth = penWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (mode === 'crop' && isCropping) {
      const coords = getCanvasCoords(e);
      setCropEnd(coords);
      return;
    }

    if (!isDrawing || mode !== 'draw') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const coords = getCanvasCoords(e);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (mode === 'crop') {
      setIsCropping(false);
      return;
    }

    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.closePath();
    const currentData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setHistory((prev) => [...prev.slice(-10), currentData]);
  };

  // Undo
  const handleUndo = () => {
    if (history.length <= 1) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const newHistory = history.slice(0, -1);
    const previous = newHistory[newHistory.length - 1];
    ctx.putImageData(previous, 0, 0);
    setHistory(newHistory);
  };

  // Apply Crop
  const applyCrop = () => {
    if (!cropStart || !cropEnd || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const x = Math.min(cropStart.x, cropEnd.x);
    const y = Math.min(cropStart.y, cropEnd.y);
    const width = Math.abs(cropEnd.x - cropStart.x);
    const height = Math.abs(cropEnd.y - cropStart.y);

    if (width < 20 || height < 20) {
      alert('자를 영역이 너무 작습니다. 마우스나 손가락으로 드래그해 영역을 지정해 주세요.');
      return;
    }

    const croppedData = ctx.getImageData(x, y, width, height);
    canvas.width = width;
    canvas.height = height;
    ctx.putImageData(croppedData, 0, 0);

    setCropStart(null);
    setCropEnd(null);
    setMode('view');
    setHistory([croppedData]);
  };

  // Reset to original
  const handleReset = () => {
    setRotation(0);
    setCropStart(null);
    setCropEnd(null);
    setMode('view');
    renderBase();
  };

  // Save edited image
  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const newFileName = file.name.replace(/\.[^/.]+$/, '') + '_edited.jpg';
        const editedFile = new File([blob], newFileName, { type: 'image/jpeg' });
        onSave(editedFile);
      },
      'image/jpeg',
      0.9
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90 text-white select-none">
      {/* Top Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-neutral-900 border-b border-neutral-800">
        <div className="flex items-center gap-2">
          <span className="font-bold text-base">사진 편집</span>
          <span className="text-xs text-neutral-400">회전·자르기·표시</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} className="text-neutral-300 hover:text-white">
            <X className="w-5 h-5 mr-1" /> 취소
          </Button>
          <Button size="sm" onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white font-bold">
            <Check className="w-5 h-5 mr-1" /> 적용하기
          </Button>
        </div>
      </header>

      {/* Main Canvas Area */}
      <main className="relative flex-1 flex items-center justify-center p-2 sm:p-4 overflow-hidden">
        <div className="relative max-w-full max-h-full flex items-center justify-center">
          <canvas
            ref={canvasRef}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
            className={`max-w-full max-h-[68vh] rounded border border-neutral-700 shadow-2xl object-contain touch-none ${
              mode === 'draw' ? 'cursor-crosshair' : mode === 'crop' ? 'cursor-crosshair' : 'cursor-default'
            }`}
          />

          {/* Crop Overlay UI */}
          {mode === 'crop' && cropStart && cropEnd && canvasRef.current && (
            (() => {
              const canvas = canvasRef.current;
              const rect = canvas.getBoundingClientRect();
              const scaleX = rect.width / canvas.width;
              const scaleY = rect.height / canvas.height;

              const left = Math.min(cropStart.x, cropEnd.x) * scaleX;
              const top = Math.min(cropStart.y, cropEnd.y) * scaleY;
              const width = Math.abs(cropEnd.x - cropStart.x) * scaleX;
              const height = Math.abs(cropEnd.y - cropStart.y) * scaleY;

              return (
                <div
                  style={{
                    position: 'absolute',
                    left: `${left}px`,
                    top: `${top}px`,
                    width: `${width}px`,
                    height: `${height}px`,
                    border: '2px dashed #3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.15)',
                    pointerEvents: 'none',
                  }}
                >
                  <span className="absolute bottom-1 right-1 bg-blue-600 text-white text-[10px] px-1 rounded">
                    자르기 영역
                  </span>
                </div>
              );
            })()
          )}
        </div>
      </main>

      {/* Bottom Tool bar */}
      <footer className="bg-neutral-900 border-t border-neutral-800 p-3 flex flex-col gap-2">
        {/* Secondary controls based on mode */}
        {mode === 'draw' && (
          <div className="flex items-center justify-center gap-4 py-1 text-sm bg-neutral-800/80 rounded-lg">
            <span className="text-neutral-400 text-xs">색상:</span>
            <div className="flex items-center gap-2">
              {[
                { color: '#ef4444', label: '빨강' },
                { color: '#eab308', label: '노랑' },
                { color: '#3b82f6', label: '파랑' },
                { color: '#22c55e', label: '초록' },
              ].map((c) => (
                <button
                  key={c.color}
                  onClick={() => setPenColor(c.color)}
                  className={`w-6 h-6 rounded-full border-2 transition ${
                    penColor === c.color ? 'border-white scale-110' : 'border-transparent opacity-70'
                  }`}
                  style={{ backgroundColor: c.color }}
                  title={c.label}
                />
              ))}
            </div>

            <span className="text-neutral-400 text-xs ml-2">굵기:</span>
            <div className="flex items-center gap-2">
              {[
                { width: 3, label: '얇게' },
                { width: 6, label: '보통' },
                { width: 12, label: '굵게' },
              ].map((w) => (
                <button
                  key={w.width}
                  onClick={() => setPenWidth(w.width)}
                  className={`px-2 py-0.5 rounded text-xs transition ${
                    penWidth === w.width ? 'bg-blue-600 text-white font-bold' : 'bg-neutral-700 text-neutral-300'
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>

            <button
              onClick={handleUndo}
              disabled={history.length <= 1}
              className="flex items-center gap-1 text-xs text-neutral-300 hover:text-white disabled:opacity-40 ml-2"
            >
              <Undo2 className="w-4 h-4" /> 되돌리기
            </button>
          </div>
        )}

        {mode === 'crop' && (
          <div className="flex items-center justify-between px-3 py-1.5 bg-neutral-800/80 rounded-lg text-sm">
            <span className="text-xs text-neutral-300">사진 위에서 자를 부분을 드래그하세요</span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setCropStart(null);
                  setCropEnd(null);
                  setMode('view');
                }}
                className="h-8 text-xs text-neutral-300"
              >
                취소
              </Button>
              <Button
                size="sm"
                onClick={applyCrop}
                disabled={!cropStart || !cropEnd}
                className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold"
              >
                자르기 실행
              </Button>
            </div>
          </div>
        )}

        {/* Primary mode switchers */}
        <div className="flex items-center justify-around gap-2 max-w-lg mx-auto w-full">
          <button
            onClick={() => handleRotate(90)}
            className="flex flex-col items-center gap-1 p-2 text-xs text-neutral-300 hover:text-white transition"
          >
            <RotateCw className="w-5 h-5 text-blue-400" />
            90° 회전
          </button>

          <button
            onClick={() => {
              setMode(mode === 'crop' ? 'view' : 'crop');
              setCropStart(null);
              setCropEnd(null);
            }}
            className={`flex flex-col items-center gap-1 p-2 rounded-lg text-xs transition ${
              mode === 'crop' ? 'bg-blue-600 text-white font-bold' : 'text-neutral-300 hover:text-white'
            }`}
          >
            <Crop className="w-5 h-5 text-amber-400" />
            영역 자르기
          </button>

          <button
            onClick={() => setMode(mode === 'draw' ? 'view' : 'draw')}
            className={`flex flex-col items-center gap-1 p-2 rounded-lg text-xs transition ${
              mode === 'draw' ? 'bg-blue-600 text-white font-bold' : 'text-neutral-300 hover:text-white'
            }`}
          >
            <PenTool className="w-5 h-5 text-red-400" />
            펜/표시하기
          </button>

          <button
            onClick={handleReset}
            className="flex flex-col items-center gap-1 p-2 text-xs text-neutral-400 hover:text-white transition"
          >
            <RotateCcw className="w-5 h-5" />
            원본 복원
          </button>
        </div>
      </footer>
    </div>
  );
}
