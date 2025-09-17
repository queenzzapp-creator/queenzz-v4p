
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { QuizQuestion, LibraryItem, SavedQuiz, Folder, QuestionFlag, LibraryData } from '../types.ts';
import { MagnifyingGlassIcon, ArrowPathIcon, BookOpenIcon, FolderIcon, CheckCircleIcon, XCircleIcon, QuestionMarkCircleIcon, FolderOpenIcon, DocumentMagnifyingGlassIcon, TrashIcon, XMarkIcon, PencilSquareIcon, FolderPlusIcon, FlagIcon, ClockIcon, ChevronDownIcon, ChevronRightIcon, CheckIcon } from './Icons.tsx';
import SearchBar from './SearchBar.tsx';
import ImageZoomModal from './ImageZoomModal.tsx';
import * as libraryService from '../services/libraryService.ts';
import Loader from './Loader.tsx';
import FlagMenu from './FlagMenu.tsx';

interface AdvancedSearchViewProps {
    library: LibraryItem[];
    activeLibrary: LibraryData;
    onBack: () => void;
    onViewSource: (question: QuizQuestion) => void;
    reloadAppData?: () => Promise<void>;
    onEditQuestion: (question: QuizQuestion, onSave: (updatedQuestion: QuizQuestion) => void) => void;
    onMoveQuestions: (questionIds: Set<string>, onMove: () => void) => void;
    onDeleteQuestions: (questionIds: Set<string>) => Promise<void>;
    onFlagQuestions: (questionIds: Set<string>, flag: QuestionFlag | null) => Promise<void>;
    onQuestionFlagged: (questionId: string, flag: QuestionFlag | null) => void;
}

const Highlight: React.FC<{ text: string; highlightQuery: string }> = ({ text, highlightQuery }) => {
    if (!highlightQuery) return <>{text}</>;
    const keywords = highlightQuery.split('::').map(kw => kw.trim()).filter(Boolean);
    if (keywords.length === 0) return <>{text}</>;

    // Escape special characters for regex
    const escapedKeywords = keywords.map(kw => kw.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'));
    const regex = new RegExp(`(${escapedKeywords.join('|')})`, 'gi');
    const parts = text.split(regex);

    return (
        <>
            {parts.map((part, i) =>
                keywords.some(kw => part.toLowerCase() === kw.toLowerCase()) ? (
                    <mark key={i} className="bg-yellow-200/70 dark:bg-yellow-400/40 px-0.5 rounded-sm">
                        {part}
                    </mark>
                ) : (
                    part
                )
            )}
        </>
    );
};


const CollapsibleSection: React.FC<{ title: string; isOpen: boolean; onToggle: () => void; children: React.ReactNode; }> = ({ title, isOpen, onToggle, children }) => (
    <div className="border-b border-slate-200 dark:border-slate-700 py-2">
        <button type="button" onClick={onToggle} className="w-full flex justify-between items-center py-1 text-sm font-semibold">
            <span>{title}</span>
            <ChevronDownIcon className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        {isOpen && <div className="pt-2 animate-fade-in">{children}</div>}
    </div>
);

const SearchResultCard: React.FC<{
    question: QuizQuestion;
    quizTitle?: string;
    searchQuery: string;
    onViewSource: (q: QuizQuestion) => void;
    onImageClick: (url: string) => void;
    onEdit: () => void;
    onFlagClick: (e: React.MouseEvent) => void;
}> = ({ question, quizTitle, searchQuery, onViewSource, onImageClick, onEdit, onFlagClick }) => {
    const flagColorClasses: Record<QuestionFlag, string> = {
        'buena': 'text-green-500', 'mala': 'text-red-500', 'interesante': 'text-yellow-500',
        'revisar': 'text-sky-500', 'suspendida': 'text-purple-500',
    };
    const flagClass = question.flag ? flagColorClasses[question.flag] : 'text-slate-400 dark:text-slate-500 hover:text-amber-500';

    return (
        <div className="p-4 bg-white/50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 animate-fade-in">
            <div className="flex justify-between items-start gap-2">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">En test: <span className="font-semibold">{quizTitle}</span></p>
                <div className="flex items-center">
                    <button onClick={onFlagClick} className="p-2 rounded-full" title="Marcar pregunta"><FlagIcon className={`h-5 w-5 transition-colors ${flagClass}`} /></button>
                    <button onClick={onEdit} className="p-2 text-slate-400 hover:text-sky-500 rounded-full" title="Editar pregunta"><PencilSquareIcon className="h-5 w-5" /></button>
                    {question.sourceFileId && <button onClick={() => onViewSource(question)} className="p-2 text-slate-400 hover:text-sky-500 rounded-full" title="Ver fuente"><DocumentMagnifyingGlassIcon className="h-5 w-5" /></button>}
                </div>
            </div>
            <p className="font-bold text-slate-800 dark:text-slate-100 mb-4"><Highlight text={question.question} highlightQuery={searchQuery} /></p>
            {question.imageUrl && <div className="mb-4"><button onClick={() => onImageClick(question.imageUrl!)}><img src={question.imageUrl} alt="Pregunta" className="max-w-full max-h-48 rounded-md object-contain cursor-zoom-in" /></button></div>}
            <div className="space-y-2 text-sm">
                {question.options.map((option, oIndex) => <div key={oIndex} className={`p-2 rounded-md ${option === question.correctAnswer ? 'bg-green-100/70 dark:bg-green-900/40 text-green-800 dark:text-green-200 font-semibold' : 'bg-slate-100/60 dark:bg-slate-700/40'}`}><Highlight text={option} highlightQuery={searchQuery} /></div>)}
            </div>
            <div className="mt-4 pt-3 border-t border-slate-200/80 dark:border-slate-700/50">
                <p className="font-semibold text-lime-600 dark:text-lime-400 text-sm">Explicación:</p>
                <p className="text-slate-700 dark:text-slate-300 text-sm"><Highlight text={question.explanation} highlightQuery={searchQuery} /></p>
            </div>
        </div>
    );
};

const CustomCheckbox: React.FC<{ isSelected: boolean }> = ({ isSelected }) => (
    <div
        className={`h-6 w-6 rounded flex-shrink-0 flex items-center justify-center border-2 transition-colors ${
            isSelected 
                ? 'bg-sky-600 border-sky-700' 
                : 'bg-white dark:bg-slate-600 border-slate-300 dark:border-slate-500'
        }`}
    >
        {isSelected && <CheckIcon className="h-4 w-4 text-white" />}
    </div>
);

const SearchResultListItem: React.FC<{
    item: QuizQuestion | QuizQuestion[];
    isSelected: boolean;
    isActive: boolean;
    isMultiSelectActive: boolean;
    onSelect: () => void;
    onToggleSelection: (e: React.MouseEvent) => void;
    onActivate: () => void;
}> = ({ item, isSelected, isActive, isMultiSelectActive, onSelect, onToggleSelection, onActivate }) => {
    const isGroup = Array.isArray(item);
    const question = isGroup ? item[0] : item;
    const count = isGroup ? item.length : 1;
    const longPressTimeout = useRef<number | null>(null);
    
    const handleClick = (e: React.MouseEvent) => {
        if (isMultiSelectActive) {
            onToggleSelection(e);
        } else {
            onSelect();
        }
    };
    
    const handlePointerDown = () => {
        if (isMultiSelectActive) return;
        longPressTimeout.current = window.setTimeout(() => {
            onActivate();
        }, 500);
    };

    const handlePointerUpOrLeave = () => {
        if (longPressTimeout.current) {
            clearTimeout(longPressTimeout.current);
        }
    };

    return (
        <div 
            onClick={handleClick}
            onContextMenu={(e) => { e.preventDefault(); onActivate(); }}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUpOrLeave}
            onPointerLeave={handlePointerUpOrLeave}
            className={`p-3 border-l-4 cursor-pointer transition-colors whitespace-nowrap ${isActive ? 'bg-lime-100 dark:bg-lime-900/40 border-lime-500' : 'border-transparent hover:bg-slate-200/50 dark:hover:bg-slate-700/50'}`}
        >
            <div className="flex items-start gap-3">
                {isMultiSelectActive && <CustomCheckbox isSelected={isSelected} />}
                <div className="flex-grow min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{question.question} {isGroup && <span className="text-xs font-bold text-sky-500">({count} copias)</span>}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">En: {question.sourceQuizTitle}</p>
                </div>
            </div>
        </div>
    );
};

const flagOptions: { value: QuestionFlag; label: string; icon: React.FC<any> }[] = [
    { value: 'buena', label: 'Buena', icon: FlagIcon },
    { value: 'mala', label: 'Mala', icon: FlagIcon },
    { value: 'interesante', label: 'Interesante', icon: FlagIcon },
    { value: 'revisar', label: 'Revisar', icon: FlagIcon },
    { value: 'suspendida', label: 'Suspendida', icon: FlagIcon },
];

const flagColorClasses: Record<QuestionFlag, string> = {
    'buena': 'text-green-500', 'mala': 'text-red-500', 'interesante': 'text-yellow-500',
    'revisar': 'text-sky-500', 'suspendida': 'text-purple-500',
};


const LibraryTreeItem: React.FC<{
    item: LibraryItem;
    level: number;
    selection: Set<string>;
    onToggleSelection: (item: LibraryItem, event: React.MouseEvent) => void;
    openFolders: Set<string>;
    onToggleFolder: (folderId: string) => void;
}> = ({ item, level, selection, onToggleSelection, openFolders, onToggleFolder }) => {
    if (item.type === 'deck') return null; // Decks don't contain questions
    
    const isSelected = selection.has(item.id);
    const isFolder = item.type === 'folder';
    const isOpen = isFolder && openFolders.has(item.id);
    const Icon = isFolder ? (isOpen ? FolderOpenIcon : FolderIcon) : BookOpenIcon;

    return (
        <div style={{ paddingLeft: `${level * 1.5}rem`}}>
            <div className="flex items-center gap-2 p-1.5 rounded-md hover:bg-slate-200/50 dark:hover:bg-slate-700/50">
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {}}
                    onClick={(e) => onToggleSelection(item, e)}
                    className="h-4 w-4 rounded-sm text-sky-600 focus:ring-sky-500"
                />
                <div className="flex items-center gap-1.5 cursor-pointer" onClick={(e) => isFolder ? onToggleFolder(item.id) : onToggleSelection(item, e)}>
                    <Icon className={`h-5 w-5 ${isFolder ? 'text-lime-500' : 'text-slate-500'}`} />
                    <span className="text-sm truncate">{isFolder ? item.name : item.title}</span>
                </div>
            </div>
        </div>
    );
};


const AdvancedSearchView: React.FC<AdvancedSearchViewProps> = ({ library, activeLibrary, onBack, onViewSource, onEditQuestion, onMoveQuestions, onDeleteQuestions, onFlagQuestions, onQuestionFlagged }) => {
    const [query, setQuery] = useState('');
    const [searchIn, setSearchIn] = useState({ question: true, options: true, explanation: true });
    const [status, setStatus] = useState({ correct: false, failed: false, unanswered: false, srs: false });
    const [selectedFlags, setSelectedFlags] = useState<Set<QuestionFlag>>(new Set());
    const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
    const [zoomedImageUrl, setZoomedImageUrl] = useState<string | null>(null);
    const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(new Set());
    const [searchResults, setSearchResults] = useState<QuizQuestion[]>([]);
    const [duplicateGroups, setDuplicateGroups] = useState<QuizQuestion[][]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [flagMenuState, setFlagMenuState] = useState<{ x: number, y: number, questionId: string } | null>(null);
    const [openSections, setOpenSections] = useState({ searchIn: false, status: false, flags: false, scope: true });
    const [lastClickedItemId, setLastClickedItemId] = useState<string | null>(null);
    const [activeSelection, setActiveSelection] = useState<QuizQuestion | QuizQuestion[] | null>(null);
    const [showOnlyDuplicates, setShowOnlyDuplicates] = useState(false);
    const [isMultiSelectActive, setIsMultiSelectActive] = useState(false);
    const [lastClickedResultId, setLastClickedResultId] = useState<string | null>(null);

    // Resizing logic
    const [columnWidths, setColumnWidths] = useState({ col1: 320, col2: 400 });
    const [isResizing, setIsResizing] = useState<number | null>(null);
    const startResizeData = useRef<{ startX: number; startWidths: { col1: number; col2: number } } | null>(null);

    const handlePointerDown = (e: React.PointerEvent, dividerIndex: number) => {
        e.preventDefault();
        setIsResizing(dividerIndex);
        startResizeData.current = {
            startX: e.clientX,
            startWidths: columnWidths,
        };
    };

    const handlePointerMove = useCallback((e: PointerEvent) => {
        if (isResizing === null || !startResizeData.current) return;
        e.preventDefault();

        const deltaX = e.clientX - startResizeData.current.startX;
        const startWidths = startResizeData.current.startWidths;
        
        const MIN_COL1_WIDTH = 240;
        const MAX_COL1_WIDTH = 600;
        const MIN_COL2_WIDTH = 300;
        const MAX_COL2_WIDTH = 900;

        if (isResizing === 1) { // Resizing column 1
            const newCol1Width = startWidths.col1 + deltaX;
            if (newCol1Width > MIN_COL1_WIDTH && newCol1Width < MAX_COL1_WIDTH) {
                setColumnWidths(prev => ({ ...prev, col1: newCol1Width }));
            }
        } else if (isResizing === 2) { // Resizing column 2
            const newCol2Width = startWidths.col2 + deltaX;
            if (newCol2Width > MIN_COL2_WIDTH && newCol2Width < MAX_COL2_WIDTH) {
                setColumnWidths(prev => ({ ...prev, col2: newCol2Width }));
            }
        }
    }, [isResizing]);
    
    const handlePointerUp = useCallback(() => {
        setIsResizing(null);
    }, []);

    useEffect(() => {
        if (isResizing !== null) {
            window.addEventListener('pointermove', handlePointerMove);
            window.addEventListener('pointerup', handlePointerUp);
            window.addEventListener('pointerleave', handlePointerUp);
        }
        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
            window.removeEventListener('pointerleave', handlePointerUp);
        };
    }, [isResizing, handlePointerMove, handlePointerUp]);


    const toggleSection = (section: keyof typeof openSections) => setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
    const sortedLibrary = useMemo(() => libraryService.sortLibraryItems(library), [library]);
    const allLibraryIds = useMemo(() => new Set(libraryService.flattenItems(library).map(item => item.id)), [library]);
    const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(allLibraryIds);

    const allResultIds = useMemo(() => {
        if (showOnlyDuplicates) {
            return new Set(duplicateGroups.flatMap(group => group.map(q => q.id)));
        }
        return new Set(searchResults.map(q => q.id));
    }, [searchResults, duplicateGroups, showOnlyDuplicates]);

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

    const quizIdsInScope = useMemo(() => {
        const quizzesInScope = new Set<string>();
        const recurse = (items: LibraryItem[]) => {
            for (const item of items) {
                if (item.type === 'quiz' && selectedItemIds.has(item.id)) {
                     quizzesInScope.add(item.id);
                } else if (item.type === 'folder') {
                    recurse(item.children);
                }
            }
        };
        recurse(library);
        return Array.from(quizzesInScope);
    }, [library, selectedItemIds]);

    useEffect(() => {
        const debounceTimeout = setTimeout(() => {
            setIsLoading(true);
            let results = libraryService.searchQuestions(activeLibrary, {
                query: query.trim(), searchIn, status,
                flags: Array.from(selectedFlags),
                quizIds: quizIdsInScope,
            });

            const quizOrderMap = new Map<string, number>();
            libraryService.flattenQuizzes(sortedLibrary).forEach((quiz, index) => {
                quizOrderMap.set(quiz.id, index);
            });
    
            results.sort((a, b) => {
                const orderA = a.sourceQuizId ? quizOrderMap.get(a.sourceQuizId) : -1;
                const orderB = b.sourceQuizId ? quizOrderMap.get(b.sourceQuizId) : -1;
    
                if (orderA === undefined || orderB === undefined || orderA === orderB) {
                    return 0;
                }
                return orderA - orderB;
            });
            
            setSearchResults(results);
            setDuplicateGroups([]);

            if (showOnlyDuplicates) {
                const signatures = new Map<string, QuizQuestion[]>();
                results.forEach(q => {
                    const sig = libraryService.getQuestionSignature(q);
                    if (!signatures.has(sig)) signatures.set(sig, []);
                    signatures.get(sig)!.push(q);
                });
                
                const groups: QuizQuestion[][] = [];
                for (const group of signatures.values()) {
                    if (group.length > 1) {
                        groups.push(group);
                    }
                }
                setDuplicateGroups(groups);
                setActiveSelection(groups.length > 0 ? groups[0] : null);
            } else {
                setSearchResults(results);
                setActiveSelection(results.length > 0 ? results[0] : null);
            }


            setIsLoading(false);
        }, 300);
        return () => clearTimeout(debounceTimeout);
    }, [query, searchIn, status, selectedItemIds, selectedFlags, library, activeLibrary, sortedLibrary, quizIdsInScope, showOnlyDuplicates]);
    
    const handleSelectAll = () => setSelectedItemIds(allLibraryIds);
    const handleDeselectAll = () => setSelectedItemIds(new Set());
    
    const handleActivateMultiSelect = (item: QuizQuestion | QuizQuestion[]) => {
        setIsMultiSelectActive(true);
        const ids = Array.isArray(item) ? item.map(q => q.id) : [item.id];
        setSelectedQuestionIds(new Set(ids));
        setLastClickedResultId(ids[0]);
    };

    const handleCancelMultiSelect = () => {
        setIsMultiSelectActive(false);
        setSelectedQuestionIds(new Set());
        setLastClickedResultId(null);
    };

    const handleDeselectAllResults = () => {
        setSelectedQuestionIds(new Set());
        setLastClickedResultId(null);
    };

    const handleSelectAllResults = () => {
        setSelectedQuestionIds(allResultIds);
        setLastClickedResultId(null);
    };

    const handleToggleQuestionSelection = (item: QuizQuestion | QuizQuestion[], event: React.MouseEvent) => {
        const idsToToggle = Array.isArray(item) ? item.map(q => q.id) : [item.id];
        const primaryId = idsToToggle[0];

        setSelectedQuestionIds(prev => {
            const newSet = new Set(prev);
            const isCurrentlySelected = newSet.has(primaryId);

            if (event.shiftKey && lastClickedResultId) {
                const listForShift = showOnlyDuplicates ? duplicateGroups : searchResults;
                const getItemId = (listItem: any) => Array.isArray(listItem) ? listItem[0].id : listItem.id;

                const lastIndex = listForShift.findIndex(i => getItemId(i) === lastClickedResultId);
                const currentIndex = listForShift.findIndex(i => getItemId(i) === primaryId);

                if (lastIndex !== -1 && currentIndex !== -1) {
                    const start = Math.min(lastIndex, currentIndex);
                    const end = Math.max(lastIndex, currentIndex);
                    const shouldSelect = !isCurrentlySelected;
                    for (let i = start; i <= end; i++) {
                        const itemInRange = listForShift[i];
                        const idsInRange = Array.isArray(itemInRange) ? itemInRange.map(q => q.id) : [itemInRange.id];
                        idsInRange.forEach(id => {
                            if (shouldSelect) newSet.add(id); else newSet.delete(id);
                        });
                    }
                    return newSet;
                }
            }
            
            const shouldSelect = !isCurrentlySelected;
            idsToToggle.forEach(id => {
                if (shouldSelect) newSet.add(id); else newSet.delete(id);
            });
            return newSet;
        });
        setLastClickedResultId(primaryId);
    };

    const handleMoveSelected = () => {
        if (selectedQuestionIds.size === 0) return;
        onMoveQuestions(selectedQuestionIds, () => {
            setSelectedQuestionIds(new Set());
            setIsMultiSelectActive(false);
        });
    };

    const handleDeleteSelected = async () => {
        if (selectedQuestionIds.size === 0) return;
        if (window.confirm(`¿Seguro que quieres eliminar ${selectedQuestionIds.size} pregunta(s)?`)) {
            await onDeleteQuestions(selectedQuestionIds);
            setSelectedQuestionIds(new Set());
            setIsMultiSelectActive(false);
        }
    };
    
    const handleToggleItemSelection = useCallback((item: LibraryItem, event: React.MouseEvent) => {
        setSelectedItemIds(prev => {
            const newSelection = new Set(prev);
            const isCurrentlySelected = newSelection.has(item.id);

            if (event.shiftKey && lastClickedItemId) {
                const lastIndex = flattenedLibrary.findIndex(i => i.id === lastClickedItemId);
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
                const processItem = (currentItem: LibraryItem, shouldSelect: boolean) => {
                    if (shouldSelect) newSelection.add(currentItem.id);
                    else newSelection.delete(currentItem.id);
                    if (currentItem.type === 'folder') {
                        currentItem.children.forEach(child => processItem(child, shouldSelect));
                    }
                };
                processItem(item, !isCurrentlySelected);
            }
            setLastClickedItemId(item.id);
            return newSelection;
        });
    }, [flattenedLibrary, lastClickedItemId]);

    const renderLibraryTree = useCallback((items: LibraryItem[], level = 0): React.ReactNode[] => {
        return items.map(item => {
            if (item.type === 'deck') return null;
            return (
                <React.Fragment key={item.id}>
                    <LibraryTreeItem
                        item={item}
                        level={level}
                        selection={selectedItemIds}
                        onToggleSelection={handleToggleItemSelection}
                        openFolders={openFolders}
                        onToggleFolder={(folderId) => setOpenFolders(prev => {
                            const newSet = new Set(prev);
                            if (newSet.has(folderId)) newSet.delete(folderId);
                            else newSet.add(folderId);
                            return newSet;
                        })}
                    />
                    {item.type === 'folder' && openFolders.has(item.id) && renderLibraryTree(item.children, level + 1)}
                </React.Fragment>
            );
        }).filter(Boolean);
    }, [selectedItemIds, openFolders, handleToggleItemSelection]);

    return (
        <div className="animate-fade-in flex flex-col h-full w-full max-w-full mx-auto">
            <header className="flex-shrink-0 flex justify-between items-center mb-6">
                <h2 className="text-2xl sm:text-3xl font-bold flex items-center gap-3"><MagnifyingGlassIcon className="h-8 w-8 text-sky-500" /> Búsqueda Avanzada</h2>
                <button onClick={onBack} className="inline-flex items-center gap-2 px-4 py-2 border rounded-md text-sm font-bold"><ArrowPathIcon className="h-5 w-5" /> Volver</button>
            </header>
            
            <div className="flex-grow flex flex-row min-h-0 w-full gap-2">
                {/* Column 1: Filters */}
                <aside style={{ width: `${columnWidths.col1}px` }} className="flex-shrink-0 h-full flex flex-col bg-slate-50/70 dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-700">
                    <div className="p-4 overflow-y-auto flex-grow flex flex-col">
                        <SearchBar onSearch={setQuery} autoFocus />
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 pl-1">Usa '::' para buscar múltiples palabras</p>
                        <CollapsibleSection title="Buscar en" isOpen={openSections.searchIn} onToggle={() => toggleSection('searchIn')}>
                            <div className="pt-2 pl-2 space-y-2">
                                {[{key: 'question', label: 'Enunciado'}, {key: 'options', label: 'Opciones'}, {key: 'explanation', label: 'Explicación'}].map(({key, label}) => (
                                    <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={searchIn[key as keyof typeof searchIn]} onChange={e => setSearchIn(s => ({ ...s, [key]: e.target.checked }))} className="h-4 w-4 rounded-sm text-sky-600 focus:ring-sky-500" />{label}</label>
                                ))}
                            </div>
                        </CollapsibleSection>
                        <CollapsibleSection title="Estado" isOpen={openSections.status} onToggle={() => toggleSection('status')}>
                            <div className="pt-2 pl-2 space-y-2">
                                <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={status.correct} onChange={e => setStatus(s => ({ ...s, correct: e.target.checked }))} className="h-4 w-4 rounded-sm text-sky-600 focus:ring-sky-500"/><CheckCircleIcon className="h-5 w-5 text-green-500" /> Acertadas</label>
                                <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={status.failed} onChange={e => setStatus(s => ({ ...s, failed: e.target.checked }))} className="h-4 w-4 rounded-sm text-sky-600 focus:ring-sky-500"/><XCircleIcon className="h-5 w-5 text-red-500" /> Falladas</label>
                                <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={status.unanswered} onChange={e => setStatus(s => ({ ...s, unanswered: e.target.checked }))} className="h-4 w-4 rounded-sm text-sky-600 focus:ring-sky-500"/><ClockIcon className="h-5 w-5 text-sky-500" /> En Blanco</label>
                                <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={status.srs} onChange={e => setStatus(s => ({ ...s, srs: e.target.checked }))} className="h-4 w-4 rounded-sm text-sky-600 focus:ring-sky-500"/><ArrowPathIcon className="h-5 w-5 text-amber-500" /> Para Repasar</label>
                            </div>
                        </CollapsibleSection>
                        <CollapsibleSection title="Banderitas" isOpen={openSections.flags} onToggle={() => toggleSection('flags')}>
                            <div className="pt-2 pl-2 space-y-2">
                                {flagOptions.map(({ value, label, icon: Icon }) => (
                                    <label key={value} className="flex items-center gap-2 text-sm cursor-pointer">
                                        <input type="checkbox" checked={selectedFlags.has(value)} onChange={e => { setSelectedFlags(prev => { const newSet = new Set(prev); if (e.target.checked) newSet.add(value); else newSet.delete(value); return newSet; }); }} className={`h-4 w-4 rounded-sm focus:ring-sky-500 ${flagColorClasses[value].replace('text-', 'accent-')}`} />
                                        <Icon className={`h-5 w-5 ${flagColorClasses[value]}`} /> {label}
                                    </label>
                                ))}
                            </div>
                        </CollapsibleSection>
                         <CollapsibleSection title="Mi colección" isOpen={openSections.scope} onToggle={() => toggleSection('scope')}>
                            <div className="pt-2 animate-fade-in flex-grow flex flex-col min-h-0">
                                 <div className="flex justify-between items-center mb-2 px-1">
                                    <button type="button" onClick={selectedItemIds.size === allLibraryIds.size ? handleDeselectAll : handleSelectAll} className="text-xs font-medium text-sky-600 hover:underline">{selectedItemIds.size === allLibraryIds.size ? 'Deseleccionar todo' : 'Seleccionar todo'}</button>
                                    <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer text-slate-600 dark:text-slate-300">
                                        <input type="checkbox" checked={showOnlyDuplicates} onChange={e => setShowOnlyDuplicates(e.target.checked)} className="h-3.5 w-3.5 rounded-sm text-sky-600 focus:ring-sky-500" /> Duplicados
                                    </label>
                                </div>
                                <div className="flex-grow overflow-y-auto -ml-1 pr-1 border rounded-md bg-slate-100/50 dark:bg-slate-900/40 min-h-[200px]">{renderLibraryTree(sortedLibrary)}</div>
                            </div>
                        </CollapsibleSection>
                    </div>
                </aside>
                
                <div onPointerDown={(e) => handlePointerDown(e, 1)} className="w-1.5 h-full cursor-col-resize bg-slate-200 dark:bg-slate-700 hover:bg-sky-500 transition-colors flex-shrink-0 rounded-full"></div>

                {/* Column 2: Results List */}
                <div style={{ width: `${columnWidths.col2}px` }} className="flex-shrink-0 h-full flex flex-col min-h-0 bg-slate-100/50 dark:bg-slate-800/40 rounded-lg border border-slate-200 dark:border-slate-700">
                     <div className="flex-shrink-0 p-3 border-b border-slate-200 dark:border-slate-700 sticky top-0 bg-slate-100/80 dark:bg-slate-800/80 backdrop-blur-sm">
                        {isMultiSelectActive ? (
                            <div className="flex items-center justify-between gap-2 animate-fade-in">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold">{selectedQuestionIds.size} selecc.</span>
                                    <button type="button" onClick={selectedQuestionIds.size === allResultIds.size ? handleDeselectAllResults : handleSelectAllResults} className="text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline"> {selectedQuestionIds.size === allResultIds.size && allResultIds.size > 0 ? 'Deseleccionar todo' : 'Seleccionar todo'} </button>
                                </div>
                                <div className="flex items-center">
                                    <button onClick={handleMoveSelected} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700" title="Mover"><FolderPlusIcon className="h-5 w-5"/></button>
                                    <button onClick={handleDeleteSelected} className="p-2 rounded-full text-red-500 hover:bg-red-100 dark:hover:bg-red-900/40" title="Eliminar"><TrashIcon className="h-5 w-5"/></button>
                                    <div className="h-5 w-px bg-slate-300 dark:bg-slate-600 mx-1"></div>
                                    <button onClick={handleCancelMultiSelect} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700" title="Cancelar Selección"><XMarkIcon className="h-5 w-5"/></button>
                                </div>
                            </div>
                        ) : (
                            <p className="font-semibold">{isLoading ? 'Buscando...' : `${showOnlyDuplicates ? duplicateGroups.length + ' grupos' : searchResults.length} resultado(s)`}</p>
                        )}
                    </div>
                    <div className="flex-grow overflow-y-auto overflow-x-auto">
                        {isLoading ? <Loader message="Cargando..." /> : (
                            showOnlyDuplicates ? (
                                duplicateGroups.length > 0 ? duplicateGroups.map((group, index) => ( <SearchResultListItem key={`${group[0].id}-${index}`} item={group} isSelected={group.every(q => selectedQuestionIds.has(q.id))} isActive={activeSelection === group} isMultiSelectActive={isMultiSelectActive} onSelect={() => setActiveSelection(group)} onToggleSelection={(e) => { handleToggleQuestionSelection(group, e); }} onActivate={() => handleActivateMultiSelect(group)} /> )) : <p className="text-center p-8 text-sm text-slate-500">No se encontraron duplicados.</p>
                            ) : (
                                searchResults.length > 0 ? searchResults.map(q => ( <SearchResultListItem key={q.id} item={q} isSelected={selectedQuestionIds.has(q.id)} isActive={Array.isArray(activeSelection) ? false : activeSelection?.id === q.id} isMultiSelectActive={isMultiSelectActive} onSelect={() => setActiveSelection(q)} onToggleSelection={(e) => { handleToggleQuestionSelection(q, e); }} onActivate={() => handleActivateMultiSelect(q)} /> )) : <p className="text-center p-8 text-sm text-slate-500">No se encontraron preguntas.</p>
                            )
                        )}
                    </div>
                </div>

                <div onPointerDown={(e) => handlePointerDown(e, 2)} className="w-1.5 h-full cursor-col-resize bg-slate-200 dark:bg-slate-700 hover:bg-sky-500 transition-colors flex-shrink-0 rounded-full"></div>

                {/* Column 3: Details View */}
                <main className="flex-grow h-full flex flex-col min-h-0">
                    <div className="flex-grow overflow-y-auto p-2">
                        {activeSelection ? (
                            Array.isArray(activeSelection) ? (
                                <div className="space-y-4"> {activeSelection.map((q) => ( <div key={q.id} className="w-full"> <SearchResultCard question={q} quizTitle={q.sourceQuizTitle} searchQuery={query} onViewSource={onViewSource} onImageClick={setZoomedImageUrl} onEdit={() => onEditQuestion(q, () => {})} onFlagClick={(e) => setFlagMenuState({ x: e.clientX, y: e.clientY, questionId: q.id })} /> </div> ))} </div>
                            ) : (
                                <SearchResultCard question={activeSelection} quizTitle={activeSelection.sourceQuizTitle} searchQuery={query} onViewSource={onViewSource} onImageClick={setZoomedImageUrl} onEdit={() => onEditQuestion(activeSelection, () => {})} onFlagClick={(e) => setFlagMenuState({ x: e.clientX, y: e.clientY, questionId: activeSelection.id })} />
                            )
                        ) : !isLoading && (
                            <div className="flex items-center justify-center h-full bg-slate-100/50 dark:bg-slate-800/40 rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-700">
                                <p className="text-slate-500">Selecciona un resultado para verlo en detalle</p>
                            </div>
                        )}
                    </div>
                </main>
            </div>
            {zoomedImageUrl && <ImageZoomModal imageUrl={zoomedImageUrl} onClose={() => setZoomedImageUrl(null)} />}
            {flagMenuState && <FlagMenu {...flagMenuState} onFlagSet={async (flag) => { await onQuestionFlagged(flagMenuState!.questionId, flag); setFlagMenuState(null); }} onClose={() => setFlagMenuState(null)} />}
        </div>
    );
};

export default AdvancedSearchView;
