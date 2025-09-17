

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { LibraryData, LibraryItem, Folder, DocumentItem } from '../types.ts';
import { ArrowPathIcon, BookOpenIcon, FolderIcon, FolderOpenIcon, QueueListIcon, DocumentArrowUpIcon, PlusCircleIcon, CheckCircleIcon, ChevronDownIcon, CheckIcon } from './Icons.tsx';
import * as libraryService from '../services/libraryService.ts';


const CustomCheckbox: React.FC<{ isSelected: boolean }> = ({ isSelected }) => (
    <div
        className={`h-5 w-5 rounded flex-shrink-0 flex items-center justify-center border-2 transition-colors ${
            isSelected 
                ? 'bg-sky-600 border-sky-700' 
                : 'bg-white dark:bg-slate-600 border-slate-300 dark:border-slate-500'
        }`}
    >
        {isSelected && <CheckIcon className="h-3.5 w-3.5 text-white" />}
    </div>
);

const ItemCheckbox: React.FC<{
    item: LibraryItem;
    level: number;
    selection: Set<string>;
    onToggleSelection: (item: LibraryItem, event: React.MouseEvent) => void;
    isOpen: boolean;
    onToggleFolder: () => void;
}> = ({ item, level, selection, onToggleSelection, isOpen, onToggleFolder }) => {
    const isSelected = selection.has(item.id);
    const isFolder = item.type === 'folder';
    const Icon = isFolder ? (isOpen ? FolderOpenIcon : FolderIcon) : (item.type === 'deck' ? QueueListIcon : BookOpenIcon);
    const iconColor = isFolder ? 'text-lime-500' : (item.type === 'deck' ? 'text-sky-500' : 'text-slate-500');

    return (
        <div 
            style={{ paddingLeft: `${level * 1.5}rem` }}
            onClick={(e) => onToggleSelection(item, e)}
            className="flex items-center gap-2 p-1.5 rounded-md cursor-pointer hover:bg-slate-200/50 dark:hover:bg-slate-700/50"
            role="checkbox"
            aria-checked={isSelected}
            tabIndex={0}
        >
             <CustomCheckbox isSelected={isSelected} />

            {isFolder ? (
                <button 
                    type="button" 
                    onClick={(e) => { e.stopPropagation(); onToggleFolder(); }} 
                    className="p-1"
                >
                    <ChevronDownIcon className={`h-4 w-4 text-slate-500 transition-transform flex-shrink-0 ${!isOpen && '-rotate-90'}`} />
                </button>
            ) : (
                <div className="w-6 h-6 flex-shrink-0" /> // Spacer for alignment
            )}
            <Icon className={`h-5 w-5 ${iconColor} flex-shrink-0`} />
            <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                {item.type === 'folder' ? item.name : item.title}
            </span>
        </div>
    );
};


interface ImportConfiguratorProps {
  importData: LibraryData;
  libraries: { id: string; name: string }[];
  activeLibraryId: string;
  onImportIntoLibrary: (targetLibraryId: string, data: LibraryData, includeProgress: boolean, includeDocuments: boolean) => void;
  onImportAsNew: (data: LibraryData, includeProgress: boolean, includeDocuments: boolean) => void;
  onCancel: () => void;
}

const ImportConfigurator: React.FC<ImportConfiguratorProps> = ({ importData, libraries, activeLibraryId, onImportIntoLibrary, onImportAsNew, onCancel }) => {
  const NEW_LIBRARY_OPTION_VALUE = '--new--';
  const [targetLibraryId, setTargetLibraryId] = useState(NEW_LIBRARY_OPTION_VALUE);
  const [includeProgress, setIncludeProgress] = useState(true);
  const [includeDocuments, setIncludeDocuments] = useState(true);
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);


  const sortedLibrary = useMemo(() => libraryService.sortLibraryItems(importData.library), [importData.library]);

  const flattenedLibrary = useMemo(() => {
    const flatList: LibraryItem[] = [];
    const recurse = (items: LibraryItem[]) => {
        items.forEach(item => {
            flatList.push(item);
            if (item.type === 'folder' && openFolders.has(item.id)) {
                recurse(item.children);
            }
        });
    };
    recurse(sortedLibrary);
    return flatList;
  }, [sortedLibrary, openFolders]);

  useEffect(() => {
    const allFolderIds = new Set<string>();
    const recurse = (items: LibraryItem[]) => {
        items.forEach(item => {
            if (item.type === 'folder') {
                allFolderIds.add(item.id);
                recurse(item.children);
            }
        });
    };
    recurse(importData.library);
    setOpenFolders(allFolderIds);
  }, [importData.library]);

  const handleToggleFolder = (folderId: string) => {
    setOpenFolders(prev => {
        const newSet = new Set(prev);
        if (newSet.has(folderId)) {
            newSet.delete(folderId);
        } else {
            newSet.add(folderId);
        }
        return newSet;
    });
  };

  const hasProgressData = useMemo(() => {
    return (importData.failedQuestions && importData.failedQuestions.length > 0) ||
           (importData.answeredQuestionIds && importData.answeredQuestionIds.length > 0) ||
           (importData.failedFlashcards && importData.failedFlashcards.length > 0);
  }, [importData]);

  const hasDocuments = useMemo(() => {
    if (!importData.documentLibrary) return false;
    const checkItems = (items: DocumentItem[]): boolean => {
        return items.some(item => {
            if (item.type === 'file') return true;
            if (item.type === 'folder') return checkItems(item.children);
            return false;
        });
    };
    return checkItems(importData.documentLibrary);
  }, [importData]);

  const allItemIds = useMemo(() => {
    const ids = new Set<string>();
    const recurse = (items: LibraryItem[]) => {
      items.forEach(item => {
        ids.add(item.id);
        if (item.type === 'folder') {
          recurse(item.children);
        }
      });
    };
    recurse(importData.library);
    return ids;
  }, [importData.library]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(allItemIds);
  
  const toggleItemSelection = useCallback((item: LibraryItem, event: React.MouseEvent) => {
    const newSelection = new Set(selectedIds);
    const isCurrentlySelected = newSelection.has(item.id);

    if (event.shiftKey && lastClickedId) {
        const lastIndex = flattenedLibrary.findIndex(i => i.id === lastClickedId);
        const currentIndex = flattenedLibrary.findIndex(i => i.id === item.id);
        if (lastIndex !== -1 && currentIndex !== -1) {
            const start = Math.min(lastIndex, currentIndex);
            const end = Math.max(lastIndex, currentIndex);
            const shouldSelect = !isCurrentlySelected;
            for (let i = start; i <= end; i++) {
                if (shouldSelect) newSelection.add(flattenedLibrary[i].id);
                else newSelection.delete(flattenedLibrary[i].id);
            }
        }
    } else {
        const getAllChildIds = (currentItem: LibraryItem): string[] => {
            let ids: string[] = [currentItem.id];
            if (currentItem.type === 'folder') {
                currentItem.children.forEach(child => ids.push(...getAllChildIds(child)));
            }
            return ids;
        };
        const idsToToggle = getAllChildIds(item);
        const shouldSelect = !isCurrentlySelected;
        idsToToggle.forEach(id => {
            if (shouldSelect) newSelection.add(id);
            else newSelection.delete(id);
        });
        setLastClickedId(item.id);
    }
    setSelectedIds(newSelection);
}, [selectedIds, lastClickedId, flattenedLibrary]);

  const handleConfirmImport = () => {
    if (!targetLibraryId || selectedCount === 0) return;
    const filteredData = libraryService.filterLibraryData(importData, selectedIds, true);
    if (targetLibraryId === NEW_LIBRARY_OPTION_VALUE) {
        onImportAsNew(filteredData, includeProgress, includeDocuments);
    } else {
        onImportIntoLibrary(targetLibraryId, filteredData, includeProgress, includeDocuments);
    }
  };

  const renderItemTree = (items: LibraryItem[], level = 0): React.ReactNode => {
    return items.map(item => (
      <React.Fragment key={item.id}>
        <ItemCheckbox 
            item={item} 
            level={level} 
            selection={selectedIds} 
            onToggleSelection={toggleItemSelection} 
            isOpen={item.type === 'folder' && openFolders.has(item.id)}
            onToggleFolder={() => handleToggleFolder(item.id)}
        />
        {item.type === 'folder' && openFolders.has(item.id) && item.children.length > 0 && renderItemTree(item.children, level + 1)}
      </React.Fragment>
    ));
  };

  const selectedCount = selectedIds.size;

  return (
    <form onSubmit={(e) => { e.preventDefault(); handleConfirmImport(); }} className="animate-fade-in w-full max-w-5xl mx-auto flex flex-col h-full">
      <header className="flex-shrink-0 flex justify-between items-center mb-6">
        <h2 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-200 flex items-center gap-3">
          <DocumentArrowUpIcon className="h-8 w-8 text-sky-500" />
          Asistente de Importación
        </h2>
        <button type="button" onClick={onCancel} className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-slate-300 dark:border-slate-600 text-sm font-bold rounded-md text-slate-600 dark:text-slate-300 bg-white/50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
          <ArrowPathIcon className="h-5 w-5" />
          Volver
        </button>
      </header>
      
      <main className="flex-grow flex flex-col lg:flex-row gap-8 min-h-0">
        {/* Left Column: Content Selection */}
        <div className="lg:w-[60%] xl:w-2/3 flex flex-col space-y-4 h-full min-h-0">
            <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 flex-shrink-0">1. Selecciona el Contenido</h3>
            <div className="flex-grow flex flex-col p-4 bg-white/50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 min-h-0">
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 flex-shrink-0">Elige qué importar de <span className="font-semibold">"{importData.name}"</span> ({selectedCount} de {allItemIds.size} seleccionados).</p>
                <div className="flex-grow overflow-y-auto p-3 bg-slate-100/50 dark:bg-slate-900/40 rounded-md border border-slate-200 dark:border-slate-600 min-h-0">
                  {sortedLibrary.length > 0 ? renderItemTree(sortedLibrary) : <p className="text-sm text-center text-slate-500">El archivo no contiene elementos para importar.</p>}
                </div>
                <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-600 space-y-2 flex-shrink-0">
                    {hasProgressData && (
                        <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-100/70 dark:hover:bg-slate-700/50 cursor-pointer">
                            <CustomCheckbox isSelected={includeProgress} />
                            <span onClick={() => setIncludeProgress(p => !p)} className="text-sm font-medium text-slate-800 dark:text-slate-200">
                                Importar también el progreso de estudio
                            </span>
                        </label>
                    )}
                     {hasDocuments && (
                        <label className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-100/70 dark:hover:bg-slate-700/50 cursor-pointer">
                           <CustomCheckbox isSelected={includeDocuments} />
                            <span onClick={() => setIncludeDocuments(p => !p)} className="text-sm font-medium text-slate-800 dark:text-slate-200">
                                Importar también los archivos del Gestor de Contenido
                            </span>
                        </label>
                    )}
                </div>
             </div>
        </div>
        {/* Right Column: Destination & Actions */}
        <div className="lg:w-[40%] xl:w-1/3 flex flex-col space-y-4">
            <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100">2. Elige un Destino</h3>
            <div className="flex flex-col p-4 bg-white/50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 space-y-3">
                <button type="button" onClick={() => setTargetLibraryId(NEW_LIBRARY_OPTION_VALUE)} className={`w-full text-left p-4 rounded-lg border-2 flex items-center gap-3 transition-all ${targetLibraryId === NEW_LIBRARY_OPTION_VALUE ? 'bg-white dark:bg-slate-700/50 border-lime-500 shadow-md' : 'bg-slate-100 dark:bg-slate-700/30 border-transparent hover:bg-slate-200/70 dark:hover:bg-slate-700'}`}>
                    <PlusCircleIcon className="h-6 w-6 text-lime-600 dark:text-lime-400" />
                    <span className="font-semibold text-slate-800 dark:text-slate-100">Importar como <br/>Colección Nueva</span>
                </button>
                <div className="space-y-2 overflow-y-auto">
                    {libraries.map(lib => (
                         <button key={lib.id} type="button" onClick={() => setTargetLibraryId(lib.id)} className={`w-full text-left p-4 rounded-lg border-2 flex items-center gap-3 transition-all ${targetLibraryId === lib.id ? 'bg-white dark:bg-slate-700/50 border-lime-500 shadow-md' : 'bg-slate-100 dark:bg-slate-700/30 border-transparent hover:bg-slate-200/70 dark:hover:bg-slate-700'}`}>
                            <FolderIcon className="h-6 w-6 text-slate-500" />
                            <span className="font-medium text-slate-700 dark:text-slate-200">{lib.name}</span>
                        </button>
                    ))}
                </div>
            </div>
            <div className="mt-auto">
                <button type="submit" disabled={!targetLibraryId || selectedCount === 0} className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 border border-transparent text-base font-bold rounded-md shadow-lg shadow-lime-500/30 text-white bg-lime-600 hover:bg-lime-700 disabled:bg-slate-400 disabled:shadow-none">
                    <CheckCircleIcon className="h-5 w-5" />
                    Añadir a Colección
                </button>
            </div>
        </div>
      </main>
    </form>
  );
};

export default ImportConfigurator;