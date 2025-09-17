import React, { useState, useMemo } from 'react';
import { LibraryItem, Folder } from '../types.ts';
import { XMarkIcon, FolderIcon, CheckCircleIcon, ChevronRightIcon, FolderOpenIcon } from './Icons.tsx';

// Recursive function to check if a folder is a descendant of another
const isDescendant = (parent: Folder, targetId: string): boolean => {
    return parent.children.some(child => {
        if (child.id === targetId) return true;
        if (child.type === 'folder') return isDescendant(child, targetId);
        return false;
    });
};

interface MoveItemsModalProps {
    library: LibraryItem[];
    selectedIds: Set<string>;
    onMove: (targetFolderId: string | null) => void;
    onClose: () => void;
}

const sortItemsNumerically = (items: LibraryItem[]): LibraryItem[] => {
    const sorted = [...items].sort((a, b) => {
        const nameA = a.type === 'folder' ? a.name : a.title;
        const nameB = b.type === 'folder' ? b.name : b.title;
        return nameA.localeCompare(nameB, 'es', { numeric: true, sensitivity: 'base' });
    });
    return sorted.map(item => {
        if (item.type === 'folder') {
            return { ...item, children: sortItemsNumerically(item.children) };
        }
        return item;
    });
};

const MoveItemsModal: React.FC<MoveItemsModalProps> = ({ library, selectedIds, onMove, onClose }) => {
    const [targetId, setTargetId] = useState<string | null>(null);
    const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());

    const sortedLibrary = useMemo(() => sortItemsNumerically(library), [library]);

    const selectedFolders = useMemo(() => {
        const findSelectedFolders = (items: LibraryItem[]): Folder[] => {
            let folders: Folder[] = [];
            for (const item of items) {
                if (item.type === 'folder') {
                    if (selectedIds.has(item.id)) {
                        folders.push(item);
                    }
                    folders = folders.concat(findSelectedFolders(item.children));
                }
            }
            return folders;
        };
        return findSelectedFolders(library);
    }, [library, selectedIds]);


    const renderTree = (items: LibraryItem[], level = 0): React.ReactNode[] => {
        return items.filter(item => item.type === 'folder').map(item => {
            const folder = item as Folder;
            const isInvalidTarget = selectedIds.has(folder.id) || selectedFolders.some(sf => isDescendant(sf, folder.id));
            if (isInvalidTarget) return null;

            const isOpen = openFolders.has(folder.id);
            const hasSubfolders = folder.children.some(c => c.type === 'folder');

            return (
                <div key={folder.id}>
                    <div
                        onClick={() => setTargetId(folder.id)}
                        className={`w-full text-left p-2.5 rounded-lg border-2 transition-all flex items-center gap-3 ${targetId === folder.id ? 'bg-lime-50 dark:bg-lime-900/40 border-lime-400' : 'bg-white dark:bg-slate-800/60 border-transparent hover:bg-slate-100/70 dark:hover:bg-slate-700/50'}`}
                        style={{ paddingLeft: `${level * 1.5 + 0.75}rem` }}
                    >
                         <div
                            onClick={(e) => {
                                if (hasSubfolders) {
                                    e.stopPropagation();
                                    setOpenFolders(prev => {
                                        const newSet = new Set(prev);
                                        if (newSet.has(folder.id)) newSet.delete(folder.id);
                                        else newSet.add(folder.id);
                                        return newSet;
                                    });
                                }
                            }}
                            className="flex-shrink-0"
                            aria-label={isOpen ? `Contraer ${folder.name}` : `Expandir ${folder.name}`}
                        >
                            {hasSubfolders ? (
                                <ChevronRightIcon className={`h-4 w-4 transition-transform text-slate-500 dark:text-slate-400 ${isOpen ? 'rotate-90' : ''}`} />
                            ) : (
                                <span className="w-4 h-4 inline-block"></span>
                            )}
                        </div>
                        <FolderIcon className="h-5 w-5 text-lime-600 dark:text-lime-400 flex-shrink-0" />
                        <span className="font-medium text-sm truncate">{folder.name}</span>
                    </div>
                    {isOpen && <div className="mt-1 space-y-1">{renderTree(folder.children, level + 1)}</div>}
                </div>
            );
        }).filter(Boolean) as React.ReactNode[];
    };


    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
            <div className="relative bg-white dark:bg-slate-800 w-full max-w-md rounded-xl shadow-2xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                <header className="flex-shrink-0 p-4 border-b border-slate-200 dark:border-slate-700">
                    <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Mover Elementos A...</h2>
                </header>
                
                <div className="p-4 flex-grow overflow-y-auto">
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Elige una carpeta de destino.</p>
                    <div className="space-y-1">
                        <button 
                            onClick={() => setTargetId(null)}
                            className={`w-full text-left flex items-center gap-3 p-2.5 rounded-lg border-2 transition-colors ${targetId === null ? 'bg-lime-50 dark:bg-lime-900/40 border-lime-400' : 'bg-white dark:bg-slate-800/60 border-transparent hover:bg-slate-100/70 dark:hover:bg-slate-700/50'}`}
                        >
                            <FolderOpenIcon className="h-5 w-5 text-lime-600 dark:text-lime-400" />
                            <span className="font-semibold">Biblioteca Principal (Raíz)</span>
                        </button>
                        {renderTree(sortedLibrary)}
                    </div>
                </div>
                
                <footer className="flex-shrink-0 flex justify-end gap-4 p-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700 rounded-b-xl">
                    <button onClick={onClose} className="px-5 py-2 text-sm font-bold rounded-md text-slate-600 dark:text-slate-300 bg-slate-200/80 dark:bg-slate-700/80 hover:bg-slate-300/80 dark:hover:bg-slate-600/80 transition-colors">Cancelar</button>
                    <button 
                        onClick={() => onMove(targetId)}
                        className="inline-flex items-center gap-2 px-5 py-2 text-sm font-bold rounded-md text-white bg-lime-600 hover:bg-lime-700 transition-colors"
                    >
                        <CheckCircleIcon className="h-5 w-5" />
                        Mover aquí
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default MoveItemsModal;