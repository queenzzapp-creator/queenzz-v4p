import React, { useState, useRef, useEffect } from 'react';
import { PencilIcon, TrashIcon, PenIcon, HighlighterIcon, EraserIcon } from './Icons.tsx';
import { DrawingTool, StrokeStyle } from '../types.ts';

interface DrawingToolbarProps {
  activeTool: DrawingTool;
  toolStyles: Record<DrawingTool, StrokeStyle>;
  onToolChange: (tool: DrawingTool) => void;
  onStyleChange: (tool: DrawingTool, style: Partial<StrokeStyle>) => void;
  onClearPage: () => void;
}

const tools: { name: DrawingTool; label: string; icon: React.FC<any> }[] = [
    { name: 'pencil', label: 'Lápiz', icon: PencilIcon },
    { name: 'pen', label: 'Bolígrafo', icon: PenIcon },
    { name: 'highlighter', label: 'Subrayador', icon: HighlighterIcon },
    { name: 'eraser', label: 'Goma', icon: EraserIcon },
];

const StylePopover: React.FC<{
    tool: DrawingTool;
    style: StrokeStyle;
    onStyleChange: (style: Partial<StrokeStyle>) => void;
    onClose: () => void;
    parentRef: React.RefObject<HTMLButtonElement>;
    colorPalette: string[];
    onColorPaletteChange: (index: number, newColor: string) => void;
}> = ({ tool, style, onStyleChange, onClose, parentRef, colorPalette, onColorPaletteChange }) => {
    const popoverRef = useRef<HTMLDivElement>(null);
    
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(event.target as Node) && parentRef.current && !parentRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose, parentRef]);

    const isHighlighter = tool === 'highlighter';

    return (
        <div ref={popoverRef} className="absolute top-full mt-2 w-56 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-600 p-4 z-20">
            <div className="space-y-4">
                {(tool === 'pencil' || tool === 'pen' || tool === 'highlighter') && (
                    <div>
                        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Color</label>
                        <div className="flex flex-wrap gap-2 mt-2">
                            {colorPalette.map((color, index) => {
                                const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
                                    const newHexColor = e.target.value;
                                    const oldColor = colorPalette[index];
                                    let finalNewColor = newHexColor;

                                    if (isHighlighter) {
                                        const currentAlpha = oldColor.startsWith('rgba') ? oldColor.split(',')[3].trim().replace(')','') : '0.5';
                                        const r = parseInt(newHexColor.slice(1, 3), 16);
                                        const g = parseInt(newHexColor.slice(3, 5), 16);
                                        const b = parseInt(newHexColor.slice(5, 7), 16);
                                        finalNewColor = `rgba(${r}, ${g}, ${b}, ${currentAlpha})`;
                                    }

                                    onColorPaletteChange(index, finalNewColor);

                                    if (style.color === oldColor) {
                                        onStyleChange({ color: finalNewColor });
                                    }
                                };

                                const colorValueForInput = () => {
                                    if (color.startsWith('#')) return color.slice(0, 7);
                                    if (color.startsWith('rgba')) {
                                        const parts = color.substring(color.indexOf('(') + 1, color.indexOf(')')).split(',').map(s => parseInt(s.trim()));
                                        return `#${parts[0].toString(16).padStart(2, '0')}${parts[1].toString(16).padStart(2, '0')}${parts[2].toString(16).padStart(2, '0')}`;
                                    }
                                    return '#000000';
                                };

                                return (
                                    <label
                                        key={index}
                                        onDoubleClick={(e) => (e.currentTarget.querySelector('input[type="color"]') as HTMLInputElement)?.click()}
                                        onClick={(e) => {
                                            if (e.detail === 1) { // single click
                                                e.preventDefault();
                                                onStyleChange({ color });
                                            }
                                        }}
                                        className="w-6 h-6 rounded-full border-2 cursor-pointer"
                                        style={{ backgroundColor: color, borderColor: style.color === color ? (document.documentElement.classList.contains('dark') ? '#67e8f9' : '#0ea5e9') : 'transparent' }}
                                    >
                                        <input type="color" value={colorValueForInput()} onChange={handleColorChange} className="w-0 h-0 opacity-0"/>
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                )}
                <div>
                     <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Grosor: {style.lineWidth.toFixed(0)}</label>
                     <input
                        type="range"
                        min={isHighlighter ? "10" : "1"}
                        max={tool === 'eraser' ? 50 : (isHighlighter ? "30" : "15")}
                        value={style.lineWidth}
                        onChange={(e) => onStyleChange({ lineWidth: parseFloat(e.target.value) })}
                        className="w-full h-2 mt-2 bg-slate-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700 accent-lime-500"
                    />
                </div>
            </div>
        </div>
    );
};

const DrawingToolbar: React.FC<DrawingToolbarProps> = ({ activeTool, toolStyles, onToolChange, onStyleChange, onClearPage }) => {
    const [popoverTool, setPopoverTool] = useState<DrawingTool | null>(null);
    const [presetColors, setPresetColors] = useState(['#334155', '#1d4ed8', '#be123c', '#059669', '#d97706']);
    const [highlighterColors, setHighlighterColors] = useState(['rgba(253, 224, 71, 0.5)', 'rgba(163, 230, 53, 0.5)', 'rgba(56, 189, 248, 0.5)', 'rgba(249, 115, 22, 0.5)']);
    
    const activeToolRef = useRef<HTMLButtonElement>(null);
    
    const handleToolClick = (toolName: DrawingTool) => {
        if (toolName === activeTool) {
            setPopoverTool(prev => prev === toolName ? null : toolName);
        } else {
            onToolChange(toolName);
            setPopoverTool(null);
        }
    };

    const handlePaletteChange = (tool: DrawingTool, index: number, newColor: string) => {
        if (tool === 'highlighter') {
            setHighlighterColors(prev => {
                const newPalette = [...prev];
                newPalette[index] = newColor;
                return newPalette;
            });
        } else {
            setPresetColors(prev => {
                const newPalette = [...prev];
                newPalette[index] = newColor;
                return newPalette;
            });
        }
    };

    return (
        <div className="flex items-center gap-1 p-1.5 bg-slate-100 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600 relative">
            {tools.map(tool => (
                <div key={tool.name} className="relative">
                     <button
                        ref={activeTool === tool.name ? activeToolRef : null}
                        type="button"
                        title={tool.label}
                        onClick={() => handleToolClick(tool.name)}
                        className={`p-2.5 rounded-md transition-colors ${
                            activeTool === tool.name
                                ? 'bg-lime-100 dark:bg-lime-800/50 text-lime-600 dark:text-lime-300'
                                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                        }`}
                    >
                        <tool.icon className="h-5 w-5" />
                    </button>
                    {popoverTool === tool.name && (
                         <StylePopover 
                            tool={tool.name}
                            style={toolStyles[tool.name]}
                            onStyleChange={(styleUpdate) => onStyleChange(tool.name, styleUpdate)}
                            onClose={() => setPopoverTool(null)}
                            parentRef={activeToolRef}
                            colorPalette={tool.name === 'highlighter' ? highlighterColors : presetColors}
                            onColorPaletteChange={(index, newColor) => handlePaletteChange(tool.name, index, newColor)}
                        />
                    )}
                </div>
            ))}
            <div className="h-6 w-px bg-slate-300 dark:bg-slate-500 mx-1" />
            <button
                type="button"
                title="Limpiar Página"
                onClick={onClearPage}
                className="p-2.5 rounded-md text-slate-600 dark:text-slate-300 hover:bg-red-100 dark:hover:bg-red-900/50 hover:text-red-600"
            >
                <TrashIcon className="h-5 w-5" />
            </button>
        </div>
    );
};

export default DrawingToolbar;