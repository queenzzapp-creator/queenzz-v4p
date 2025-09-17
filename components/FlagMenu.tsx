import React, { useState, useEffect, useRef } from 'react';
import { QuestionFlag } from '../types.ts';

interface FlagMenuProps {
    x: number;
    y: number;
    onFlagSet: (flag: QuestionFlag | null) => void;
    onClose: () => void;
}

const FlagMenu: React.FC<FlagMenuProps> = ({ x, y, onFlagSet, onClose }) => {
    const menuRef = useRef<HTMLDivElement>(null);
    const [style, setStyle] = useState<React.CSSProperties>({ top: y, left: x, opacity: 0 });

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);
    
    useEffect(() => {
        if (menuRef.current) {
            const menuRect = menuRef.current.getBoundingClientRect();
            let newX = x;
            let newY = y;
            
            if (x + menuRect.width > window.innerWidth - 10) { // 10px buffer
                newX = x - menuRect.width;
            }
            if (y + menuRect.height > window.innerHeight - 10) { // 10px buffer
                newY = y - menuRect.height;
            }
            setStyle({ top: newY, left: newX, opacity: 1, transition: 'opacity 150ms ease-in-out' });
        }
    }, [x, y]);

    const flagOptions: { label: string, value: QuestionFlag | null, color: string }[] = [
        { label: 'Sin marcar', value: null, color: 'bg-slate-400' },
        { label: 'Buena pregunta', value: 'buena', color: 'bg-green-500' },
        { label: 'Mala pregunta', value: 'mala', color: 'bg-red-500' },
        { label: 'Interesante', value: 'interesante', color: 'bg-yellow-500' },
        { label: 'Revisar', value: 'revisar', color: 'bg-sky-500' },
        { label: 'Suspendida', value: 'suspendida', color: 'bg-purple-500' },
    ];
    
    const handleSelect = (flag: QuestionFlag | null) => {
        onFlagSet(flag);
        onClose();
    };

    return (
        <div ref={menuRef} style={style} className="fixed z-50 w-48 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-600 py-1">
            {flagOptions.map(opt => (
                <button key={opt.label} onClick={() => handleSelect(opt.value)} className="w-full text-left px-3 py-2 text-sm flex items-center gap-3 hover:bg-slate-100 dark:hover:bg-slate-700">
                    <span className={`h-3 w-3 rounded-full ${opt.color}`}></span>
                    <span className="text-slate-700 dark:text-slate-200">{opt.label}</span>
                </button>
            ))}
        </div>
    );
};

export default FlagMenu;
