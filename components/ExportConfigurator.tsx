
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { LibraryItem, Folder } from '../types.ts';
import { DocumentArrowUpIcon, BookOpenIcon, FolderIcon, QueueListIcon, ArrowPathIcon, CheckIcon, FolderOpenIcon, ChevronDownIcon, CheckCircleIcon } from './Icons.tsx';
import * as libraryService from '../services/libraryService.ts';

// Reusable component to render a selectable item in the tree
const ItemCheckbox: React.FC<{
    item: LibraryItem;
    level: number;
    selection: Set<string>;
    onToggle: (item: LibraryItem, event: React.MouseEvent) => void;
    isOpen: boolean;
    onToggleFolder: () => void;
}> = ({ item, level, selection, onToggle, isOpen, onToggleFolder }) => {
    const isSelected = selection.has(item.id);
    const isFolder = item.type === 'folder';
    const Icon = isFolder ? (isOpen ? FolderOpenIcon : FolderIcon) : (item.type === 'deck' ? QueueListIcon : BookOpenIcon);
    const iconColor = isFolder ? 'text-lime-500' : (item.type === 'deck' ? 'text-sky-500' : 'text-slate-500');

    return (
        <div 
            style={{ paddingLeft: `${level * 1.5}rem` }}
            className="flex items-center gap-2 p-1.5 rounded-md hover:bg-slate-200/50 dark:hover:bg-slate-700/50"
            role="checkbox"
            aria-checked={isSelected}
            tabIndex={0}
            onClick={(e) => onToggle(item, e)}
        >
            <div
                className={`h-5 w-5 rounded flex-shrink-0 flex items-center justify-center border-2 transition-colors ${
                    isSelected 
                        ? 'bg-sky-600 border-sky-700' 
                        : 'bg-white dark:bg-slate-600 border-slate-300 dark:border-slate-500'
                }`}
            >
                {isSelected && <CheckIcon className="h-3.5 w-3.5 text-white" />}
            </div>

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
            <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate cursor-pointer">
                {item.type === 'folder' ? item.name : item.title}
            </span>
        </div>
    );
};


interface ExportConfiguratorProps {
  library: LibraryItem[];
  activeLibraryName: string;
  onExport: (selectedIds: Set<string>, fileName: string, includeProgress: boolean, includeDocuments: boolean) => void;
  onCancel: () => void;
}

const ExportConfigurator: React.FC<ExportConfiguratorProps> = ({ library, activeLibraryName, onExport, onCancel }) => {
  const defaultFileName = `${activeLibraryName.replace(/\s+/g, '_')}_export.json`;
  const [fileName, setFileName] = useState(defaultFileName);
  const [includeProgress, setIncludeProgress] = useState(true);
  const [includeDocuments, setIncludeDocuments] = useState(true);
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  
  const sortedLibrary = useMemo(() => libraryService.sortLibraryItems(library), [library]);
  
  const allItemIds = useMemo(() => {
      const ids = new Set<string>();
      const addIds = (items: LibraryItem[]) => {
          items.forEach(item => {
              ids.add(item.id);
              if(item.type === 'folder') addIds(item.children);
          });
      };
      addIds(sortedLibrary);
      return ids;
  }, [sortedLibrary]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(allItemIds);
  const [openFolders, setOpenFolders] = useState<Set<string>>(allItemIds); // Start with all folders open

  const flattenedLibrary = useMemo(() => {
        const flatList: LibraryItem[] = [];
        const recurse = (items: LibraryItem[]): void => {
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
  
  const handleSelectAll = () => setSelectedIds(allItemIds);
  const handleDeselectAll = () => setSelectedIds(new Set());

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onExport(selectedIds, fileName, includeProgress, includeDocuments);
  };

  const renderItemTree = (items: LibraryItem[], level = 0): React.ReactNode => {
    return items.map(item => (
      <React.Fragment key={item.id}>
        <ItemCheckbox 
            item={item} 
            level={level} 
            selection={selectedIds} 
            onToggle={toggleItemSelection}
            isOpen={item.type === 'folder' ? openFolders.has(item.id) : false}
            onToggleFolder={() => setOpenFolders(prev => {
                const newSet = new Set(prev);
                if(newSet.has(item.id)) newSet.delete(item.id);
                else newSet.add(item.id);
                return newSet;
            })}
        />
        {item.type === 'folder' && openFolders.has(item.id) && item.children.length > 0 && renderItemTree(item.children, level + 1)}
      </React.Fragment>
    ));
  };

  return (
    <form onSubmit={handleSubmit} className="animate-fade-in w-full max-w-5xl mx-auto flex flex-col h-full">
      <header className="flex-shrink-0 flex justify-between items-center mb-6">
        <h2 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-3">
          <DocumentArrowUpIcon className="h-8 w-8 text-sky-500 rotate-180" />
          Exportar Biblioteca a JSON
        </h2>
        <button type="button" onClick={onCancel} className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-slate-300 dark:border-slate-600 text-sm font-bold rounded-md text-slate-600 dark:text-slate-300 bg-white/50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
          <ArrowPathIcon className="h-5 w-5" />
          Volver
        </button>
      </header>

      <main className="flex-grow flex flex-col lg:flex-row gap-8 min-h-0">
          {/* Left Column: Content */}
          <div className="lg:w-[60%] xl:w-2/3 flex flex-col space-y-4 h-full min-h-0">
               <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 flex-shrink-0">1. Seleccionar Contenido</h3>
               <div className="flex-shrink-0 flex gap-2">
                  <button type="button" onClick={handleSelectAll} className="px-3 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-200 dark:bg-slate-700 rounded-md hover:bg-slate-300 dark:hover:bg-slate-600">Seleccionar todo</button>
                  <button type="button" onClick={handleDeselectAll} className="px-3 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-200 dark:bg-slate-700 rounded-md hover:bg-slate-300 dark:hover:bg-slate-600">Deseleccionar todo</button>
              </div>
              <div className="flex-grow overflow-y-auto p-3 bg-white/50 dark:bg-slate-800/50 rounded-md border border-slate-200 dark:border-slate-700 min-h-0">
                  {sortedLibrary.length > 0 ? renderItemTree(sortedLibrary) : <p className="text-sm text-center text-slate-500">No hay contenido para exportar.</p>}
              </div>
          </div>

          {/* Right Column: Options */}
          <div className="lg:w-[40%] xl:w-1/3 flex flex-col space-y-4">
              <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100">2. Opciones de Exportación</h3>
              <div className="flex flex-col p-4 bg-white/50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 space-y-4">
                
                  <label className="flex items-center gap-3 p-2 rounded-lg cursor-pointer">
                      <input type="checkbox" checked={includeProgress} onChange={(e) => setIncludeProgress(e.target.checked)} className="h-4 w-4 rounded-sm bg-slate-100 border-slate-300 text-lime-600 focus:ring-lime-500" />
                      <span className="text-sm font-medium text-slate-800 dark:text-slate-200">Incluir progreso de estudio</span>
                  </label>
                  <label className="flex items-center gap-3 p-2 rounded-lg cursor-pointer">
                      <input type="checkbox" checked={includeDocuments} onChange={(e) => setIncludeDocuments(e.target.checked)} className="h-4 w-4 rounded-sm bg-slate-100 border-slate-300 text-lime-600 focus:ring-lime-500" />
                      <span className="text-sm font-medium text-slate-800 dark:text-slate-200">Incluir archivos del Gestor</span>
                  </label>

                  <div>
                       <label htmlFor="file-name" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nombre del archivo</label>
                      <input id="file-name" type="text" value={fileName} onChange={(e) => setFileName(e.target.value)} className="w-full p-3 bg-white dark:bg-slate-700 border font-sans border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-lime-500 text-slate-900 dark:text-slate-100" />
                  </div>
              </div>
              <div className="mt-auto">
                <button type="submit" disabled={selectedIds.size === 0} className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 border border-transparent text-base font-bold rounded-md shadow-lg shadow-lime-500/30 text-white bg-lime-600 hover:bg-lime-700 disabled:bg-slate-400 disabled:shadow-none">
                    <CheckCircleIcon className="h-5 w-5"/>
                    Exportar JSON
                </button>
              </div>
          </div>
      </main>
    </form>
  );
};

export default ExportConfigurator;
