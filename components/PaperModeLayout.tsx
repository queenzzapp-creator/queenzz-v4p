
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { QuizQuestion, QuizSettings, UserAnswersMap, PausedQuizState, MnemonicRule, QuestionFlag, FailedQuestionEntry, Stroke, StrokeStyle, Point, DrawingTool, OptionBox } from '../types.ts';
import { StopCircleIcon, ClockIcon, PauseCircleIcon, ChevronLeftIcon, ChevronRightIcon, ArrowsPointingOutIcon, ArrowsPointingInIcon, ExclamationTriangleIcon, XMarkIcon, QueueListIcon } from './Icons.tsx';
import PaperQuizView from './PaperQuizView.tsx';
import AnswerSheet from './AnswerSheet.tsx';
import DrawingToolbar from './DrawingToolbar.tsx';

const QUESTIONS_PER_PAGE = 5;

interface PaperModeLayoutProps {
  questions: QuizQuestion[];
  onFinish: (failedOnSession: QuizQuestion[], unansweredOnSession: QuizQuestion[], userAnswers: UserAnswersMap) => void;
  quizSettings: QuizSettings;
  onPause: (currentState: Omit<PausedQuizState, 'quizId' | 'quizTitle' | 'activeQuizType'>) => void;
  onViewSource: (question: QuizQuestion) => void;
  mnemonicsByQuestionId: Map<string, MnemonicRule>;
  onViewMnemonic: (rule: MnemonicRule) => void;
  srsEntries: FailedQuestionEntry[];
  onQuestionFlagged: (questionId: string, flag: QuestionFlag | null) => void;
  paperModeLayout: 'left' | 'right';
  initialUserAnswers?: UserAnswersMap;
  initialQuestionIndex?: number;
  initialTimeLeft?: number;
}

const distance = (p1: Point, p2: Point) => Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);

const isStrokeACircle = (path: Point[], minDiameter: number = 20): boolean => {
    if (path.length < 10) return false;

    // 1. Bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    path.forEach(p => {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
    });
    const width = maxX - minX;
    const height = maxY - minY;

    if (width < minDiameter || height < minDiameter) return false;
    const aspectRatio = width / height;
    if (aspectRatio < 0.4 || aspectRatio > 2.5) return false;
    const startPoint = path[0];
    const endPoint = path[path.length - 1];
    const closingDistance = distance(startPoint, endPoint);
    const diagonal = Math.sqrt(width * width + height * height);
    if (closingDistance > diagonal * 0.8) return false;
    const centerX = minX + width / 2;
    const centerY = minY + height / 2;
    
    const distances = path.map(p => distance(p, { x: centerX, y: centerY }));
    const avgDistance = distances.reduce((sum, d) => sum + d, 0) / distances.length;
    
    const stdDev = Math.sqrt(
        distances.map(d => (d - avgDistance) ** 2).reduce((sum, sq) => sum + sq, 0) / distances.length
    );

    if (stdDev > avgDistance * 0.45) return false;

    return true;
};

const PaperModeLayout: React.FC<PaperModeLayoutProps> = ({ 
    questions, 
    onFinish, 
    quizSettings,
    onPause,
    initialUserAnswers,
    initialQuestionIndex,
    initialTimeLeft,
    paperModeLayout,
    onViewSource,
    mnemonicsByQuestionId,
    onViewMnemonic,
    srsEntries,
    onQuestionFlagged,
}) => {
    const [currentPage, setCurrentPage] = useState(initialQuestionIndex ? Math.floor(initialQuestionIndex / QUESTIONS_PER_PAGE) : 0);
    const [userAnswers, setUserAnswers] = useState<UserAnswersMap>(initialUserAnswers || new Map());
    const [timeLeft, setTimeLeft] = useState<number | undefined>(initialTimeLeft);
    const [showFinishConfirm, setShowFinishConfirm] = useState(false);
    const [drawings, setDrawings] = useState<Map<number, Stroke[]>>(new Map());
    const [activeTool, setActiveTool] = useState<DrawingTool>('pencil');
    const [optionBoxes, setOptionBoxes] = useState<Map<number, OptionBox[]>>(new Map());
    const [showClearConfirm, setShowClearConfirm] = useState(false);

    const [isAnswerSheetVisible, setIsAnswerSheetVisible] = useState(false);
    const [answerSheetPosition, setAnswerSheetPosition] = useState({ x: window.innerWidth - 380, y: 80 });
    const [answerSheetSize, setAnswerSheetSize] = useState({ width: 350, height: 500 });
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const dragOffset = useRef({ x: 0, y: 0 });
    const resizeStartRef = useRef<{ startX: number; startY: number; startWidth: number; startHeight: number } | null>(null);
    const answerSheetRef = useRef<HTMLDivElement>(null);

    const pointerStartRef = useRef<{ x: number; y: number; type: string } | null>(null);

    const [toolStyles, setToolStyles] = useState<Record<DrawingTool, StrokeStyle>>({
        pencil: { color: document.documentElement.classList.contains('dark') ? '#94a3b8' : '#334155', lineWidth: 2, compositeOperation: 'source-over' },
        pen: { color: document.documentElement.classList.contains('dark') ? '#60a5fa' : '#1d4ed8', lineWidth: 4, compositeOperation: 'source-over' },
        highlighter: { color: 'rgba(253, 224, 71, 0.5)', lineWidth: 20, compositeOperation: 'multiply' },
        eraser: { color: '#000000', lineWidth: 25, compositeOperation: 'destination-out' },
    });
    
    const timerRef = useRef<number | null>(null);
    const totalPages = Math.ceil(questions.length / QUESTIONS_PER_PAGE);

    const handleToggleAnswerSheet = () => {
        setIsAnswerSheetVisible(prev => !prev);
    };

    const handleDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!answerSheetRef.current) return;
        const rect = answerSheetRef.current.getBoundingClientRect();
        setIsDragging(true);
        dragOffset.current = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };

    const handleResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
        e.stopPropagation();
        setIsResizing(true);
        resizeStartRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            startWidth: answerSheetSize.width,
            startHeight: answerSheetSize.height,
        };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };

    const handlePointerMove = useCallback((e: PointerEvent) => {
        if (isDragging) {
            e.preventDefault();
            const newX = e.clientX - dragOffset.current.x;
            const newY = e.clientY - dragOffset.current.y;
            setAnswerSheetPosition({ x: newX, y: newY });
        } else if (isResizing && resizeStartRef.current) {
            e.preventDefault();
            const dx = e.clientX - resizeStartRef.current.startX;
            const dy = e.clientY - resizeStartRef.current.startY;
            setAnswerSheetSize({
                width: Math.max(280, resizeStartRef.current.startWidth + dx),
                height: Math.max(300, resizeStartRef.current.startHeight + dy),
            });
        }
    }, [isDragging, isResizing]);

    const handleDragResizePointerUp = useCallback(() => {
        setIsDragging(false);
        setIsResizing(false);
        resizeStartRef.current = null;
    }, []);

    useEffect(() => {
        if (isDragging || isResizing) {
            window.addEventListener('pointermove', handlePointerMove);
            window.addEventListener('pointerup', handleDragResizePointerUp);
            window.addEventListener('pointercancel', handleDragResizePointerUp);
        }
        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handleDragResizePointerUp);
            window.removeEventListener('pointercancel', handleDragResizePointerUp);
        };
    }, [isDragging, isResizing, handlePointerMove, handleDragResizePointerUp]);


    const handleStyleChange = (tool: DrawingTool, styleUpdate: Partial<StrokeStyle>) => {
        setToolStyles(prev => ({ ...prev, [tool]: { ...prev[tool], ...styleUpdate } }));
    };

    const handleFinish = useCallback(() => {
        if (timerRef.current) clearInterval(timerRef.current);
        const failed: QuizQuestion[] = [];
        const unanswered: QuizQuestion[] = [];
        questions.forEach((q, index) => {
            const answer = userAnswers.get(index);
            if (!answer) unanswered.push(q);
            else if (!answer.isCorrect) failed.push(q);
        });
        onFinish(failed, unanswered, userAnswers);
    }, [questions, userAnswers, onFinish]);

    const handleTimeUp = useCallback(() => {
        if (quizSettings.mode === 'total') handleFinish();
    }, [quizSettings.mode, handleFinish]);
    
    useEffect(() => {
        if (quizSettings.mode === 'total') setTimeLeft(quizSettings.duration);
    }, [quizSettings]);
    
    useEffect(() => {
        if (timeLeft === undefined) return;
        timerRef.current = window.setInterval(() => {
            setTimeLeft(prev => {
                if (prev === undefined || prev <= 1) {
                    clearInterval(timerRef.current!);
                    handleTimeUp();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [timeLeft, handleTimeUp]);
    
    const handlePause = useCallback(() => {
        if (timerRef.current) clearInterval(timerRef.current);
        const stateToSave: Omit<PausedQuizState, 'quizId' | 'quizTitle' | 'activeQuizType'> = {
            questions, userAnswers: Array.from(userAnswers.entries()), currentQuestionIndex: currentPage * QUESTIONS_PER_PAGE, quizSettings, timeLeft
        };
        onPause(stateToSave);
    }, [questions, userAnswers, currentPage, quizSettings, timeLeft, onPause]);
    
    const handleNavigate = (questionIndex: number) => {
        const pageIndex = Math.floor(questionIndex / QUESTIONS_PER_PAGE);
        setCurrentPage(pageIndex);
    };

    const handleNextPage = useCallback(() => {
      setCurrentPage(prev => Math.min(prev + 1, totalPages - 1));
    }, [totalPages]);

    const handlePrevPage = useCallback(() => {
      setCurrentPage(prev => Math.max(prev - 1, 0));
    }, []);
    
    const handleCircleAnswer = useCallback((questionIndex: number, optionIndex: number) => {
        const question = questions[questionIndex];
        const selectedOption = question.options[optionIndex];
        const isCorrect = selectedOption === question.correctAnswer;
        setUserAnswers(prev => new Map(prev).set(questionIndex, { selected: selectedOption, isCorrect }));
    }, [questions]);
    
    const handleAnswerSheetClick = useCallback((questionIndex: number, selectedOption: string) => {
        const question = questions[questionIndex];
        const isCorrect = selectedOption === question.correctAnswer;
        
        setUserAnswers(prev => {
            const newAnswers = new Map(prev);
            const currentAnswer = newAnswers.get(questionIndex);
            
            if (currentAnswer && currentAnswer.selected === selectedOption) {
                newAnswers.delete(questionIndex);
            } else {
                newAnswers.set(questionIndex, { selected: selectedOption, isCorrect });
            }
            return newAnswers;
        });
    }, [questions]);

    const handleAddStroke = useCallback((newStroke: Stroke, pageStartIndex: number, currentCanvasSize: { width: number; height: number; }) => {
        const pageIndex = Math.floor(pageStartIndex / QUESTIONS_PER_PAGE);
    
        if (activeTool === 'eraser') {
            const pageStrokes = drawings.get(pageIndex) || [];
            const eraserPathAbsolute = newStroke.path.map(p => ({ x: p.x * currentCanvasSize.width, y: p.y * currentCanvasSize.height }));
            const eraserWidth = newStroke.style.lineWidth;
    
            const remainingStrokes = pageStrokes.filter(stroke => {
                const strokePathAbsolute = stroke.path.map(p => ({ x: p.x * currentCanvasSize.width, y: p.y * currentCanvasSize.height }));
                return !strokePathAbsolute.some(strokePoint =>
                    eraserPathAbsolute.some(eraserPoint =>
                        distance(strokePoint, eraserPoint) < (eraserWidth / 2) + (stroke.style.lineWidth / 2)
                    )
                );
            });
            setDrawings(prev => new Map(prev).set(pageIndex, remainingStrokes));
            return;
        }

        setDrawings(prev => {
            const newMap = new Map(prev);
            const pageStrokes = newMap.get(pageIndex) || [];
            newMap.set(pageIndex, [...pageStrokes, newStroke]);
            return newMap;
        });

        if (activeTool === 'pencil' || activeTool === 'pen') {
            const absolutePath = newStroke.path.map(p => ({ x: p.x * currentCanvasSize.width, y: p.y * currentCanvasSize.height }));
            const pageOptionBoxes = optionBoxes.get(pageIndex) || [];

            const findIntersectedBox = (path: Point[]) => {
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                path.forEach(p => { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); });
                const centerX = minX + (maxX - minX) / 2;
                const centerY = minY + (maxY - minY) / 2;

                return pageOptionBoxes.find(box => {
                    const { x, y, width, height } = box.rect;
                    return centerX > x && centerX < x + width && centerY > y && centerY < y + height;
                });
            };
            
            if (isStrokeACircle(absolutePath)) {
                const box = findIntersectedBox(absolutePath);
                if (box) {
                    handleCircleAnswer(box.questionIndex, box.optionIndex);
                }
            }
        }
    }, [activeTool, optionBoxes, handleCircleAnswer, drawings]);
    
    const handleClearDrawingsForPages = useCallback((pages: number[]) => {
        setDrawings(prev => { const newMap = new Map(prev); pages.forEach(p => newMap.delete(p)); return newMap; });
    }, []);
    
    const handleClearAllForPages = useCallback((pages: number[]) => {
        handleClearDrawingsForPages(pages);
        setUserAnswers(prev => { const newMap = new Map(prev); pages.forEach(pageIndex => { const start = pageIndex * QUESTIONS_PER_PAGE; for (let i = start; i < start + QUESTIONS_PER_PAGE; i++) newMap.delete(i); }); return newMap; });
    }, [handleClearDrawingsForPages]);

    const handleInitiateClear = useCallback(() => {
        const pagesToCheck = [currentPage];
        let hasAnswersOnPages = false;
        
        const startIndex = currentPage * QUESTIONS_PER_PAGE;
        const endIndex = Math.min(startIndex + QUESTIONS_PER_PAGE, questions.length);
        for (let i = startIndex; i < endIndex; i++) {
            if (userAnswers.has(i)) {
                hasAnswersOnPages = true;
                break;
            }
        }

        if (hasAnswersOnPages) {
            setShowClearConfirm(true);
        } else {
            handleClearDrawingsForPages(pagesToCheck);
        }
    }, [currentPage, questions.length, userAnswers, handleClearDrawingsForPages]);

    const handlePointerDown = (e: React.PointerEvent) => {
        if (e.pointerType === 'touch') {
            pointerStartRef.current = { x: e.clientX, y: e.clientY, type: e.pointerType };
        }
    };
    
    const handlePointerUp = (e: React.PointerEvent) => {
        const start = pointerStartRef.current;
        if (!start || start.type !== 'touch') return;

        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;

        if (Math.abs(dx) > Math.abs(dy) * 2 && Math.abs(dx) > 50) {
            if (dx > 0) handlePrevPage(); else handleNextPage();
        }
        pointerStartRef.current = null;
    };


    const formatTime = (seconds: number | undefined): string => {
        if (seconds === undefined) return '';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };
    
    const pageStartIndex = currentPage * QUESTIONS_PER_PAGE;
    const questionsForPage = questions.slice(pageStartIndex, pageStartIndex + QUESTIONS_PER_PAGE);

    const handleOptionBoxesCalculated = useCallback((startIndex: number, boxes: OptionBox[]) => {
        const pageIndex = Math.floor(startIndex / QUESTIONS_PER_PAGE);
        setOptionBoxes(prev => new Map(prev).set(pageIndex, boxes));
    }, []);

    const pagesToClear = [currentPage];


    return (
        <div className="flex flex-col w-full max-w-full mx-auto h-full items-start">
            <div className="flex-grow flex flex-col min-w-0 h-full w-full">
                <header className="flex-shrink-0 flex justify-between items-center mb-4 flex-wrap gap-4">
                    <div className="flex items-center gap-4">
                        {quizSettings.mode !== 'none' && (
                            <div className="flex items-center gap-2 text-lg font-bold text-slate-700 dark:text-slate-200">
                                <ClockIcon className="h-6 w-6" />
                                <span>{formatTime(timeLeft)}</span>
                            </div>
                        )}
                        <DrawingToolbar 
                            activeTool={activeTool} 
                            toolStyles={toolStyles} 
                            onToolChange={setActiveTool} 
                            onStyleChange={handleStyleChange} 
                            onClearPage={handleInitiateClear}
                        />
                    </div>
                    
                    <button
                        onClick={handleToggleAnswerSheet}
                        className="flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                    >
                        <QueueListIcon className="h-5 w-5" />
                        Hoja de Respuestas
                    </button>

                    <div className="flex items-center gap-2">
                        <button onClick={handlePause} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600">
                            <PauseCircleIcon className="h-5 w-5" /> Pausar
                        </button>
                        <button onClick={() => setShowFinishConfirm(true)} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600">
                            <StopCircleIcon className="h-5 w-5" /> Finalizar
                        </button>
                    </div>
                </header>

                <main onPointerDown={handlePointerDown} onPointerUp={handlePointerUp} onPointerCancel={() => pointerStartRef.current = null} className="flex-grow w-full flex-col overflow-hidden">
                    <div className="h-full w-full bg-white dark:bg-slate-800 rounded-lg shadow-md border border-slate-200 dark:border-slate-700 flex flex-col overflow-auto">
                        <div className="animate-fade-in flex-grow" key={currentPage}>
                             <PaperQuizView
                                questions={questions}
                                questionsForPage={questionsForPage}
                                pageStartIndex={pageStartIndex}
                                userAnswers={userAnswers}
                                onAnswerSelect={handleAnswerSheetClick}
                                strokes={drawings.get(currentPage) || []}
                                toolStyle={toolStyles[activeTool]}
                                onAddStroke={handleAddStroke}
                                onOptionBoxesCalculated={handleOptionBoxesCalculated}
                                onQuestionFlagged={onQuestionFlagged}
                            />
                        </div>
                    </div>
                </main>
                 <footer className="flex-shrink-0 flex justify-between items-center p-4 mt-4 bg-white/50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                    <button onClick={handlePrevPage} disabled={currentPage === 0} className="flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 disabled:opacity-40">
                        <ChevronLeftIcon className="h-5 w-5" /> Anterior
                    </button>
                    <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                       Página {currentPage + 1} de {totalPages}
                    </span>
                    <button onClick={handleNextPage} disabled={currentPage + 1 >= totalPages} className="flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 disabled:opacity-40">
                        Siguiente <ChevronRightIcon className="h-5 w-5" />
                    </button>
                </footer>
            </div>
            
            {isAnswerSheetVisible && (
                <div
                    ref={answerSheetRef}
                    style={{
                        position: 'fixed',
                        left: answerSheetPosition.x,
                        top: answerSheetPosition.y,
                        width: answerSheetSize.width,
                        height: answerSheetSize.height,
                        touchAction: 'none',
                    }}
                    className="w-full md:w-80 flex-shrink-0 z-30 flex flex-col"
                >
                    <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-md rounded-lg shadow-2xl border border-slate-200 dark:border-slate-700 h-full flex flex-col">
                        <div
                            onPointerDown={handleDragStart}
                            className="flex-shrink-0 p-2 flex justify-between items-center border-b border-slate-200 dark:border-slate-700 cursor-move"
                        >
                            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 pl-2">Hoja de Respuestas</h3>
                             <button onClick={() => setIsAnswerSheetVisible(false)} className="p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-600">
                                <XMarkIcon className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="flex-grow overflow-hidden">
                             <AnswerSheet
                                questions={questions}
                                userAnswers={userAnswers}
                                currentPage={currentPage}
                                questionsPerPage={QUESTIONS_PER_PAGE}
                                quizSettings={quizSettings}
                                onNavigate={handleNavigate}
                                onAnswer={handleAnswerSheetClick}
                            />
                        </div>
                    </div>
                     <div
                        onPointerDown={handleResizeStart}
                        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize opacity-50 hover:opacity-100"
                    >
                         <div className="w-full h-full border-r-2 border-b-2 border-slate-500 dark:border-slate-400"></div>
                    </div>
                </div>
            )}

            {showFinishConfirm && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => setShowFinishConfirm(false)}>
                    <div className="bg-white dark:bg-slate-800 p-8 rounded-lg text-center shadow-lg animate-fade-in" onClick={e => e.stopPropagation()}>
                        <h3 className="text-xl font-bold">¿Finalizar Test?</h3>
                        <p className="my-4 text-slate-600 dark:text-slate-300">¿Estás seguro de que quieres terminar y corregir el test?</p>
                        <div className="flex justify-center gap-4 mt-6">
                            <button onClick={() => setShowFinishConfirm(false)} className="px-6 py-2 font-semibold rounded-md bg-slate-200 dark:bg-slate-700">Cancelar</button>
                            <button onClick={handleFinish} className="px-6 py-2 font-bold rounded-md bg-lime-600 text-white">Confirmar</button>
                        </div>
                    </div>
                </div>
            )}
            {showClearConfirm && (
                <div role="dialog" aria-modal="true" aria-labelledby="clear-dialog-title" className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowClearConfirm(false)}>
                    <div className="bg-white dark:bg-slate-800 p-8 rounded-lg shadow-lg text-center max-w-sm w-full" onClick={e => e.stopPropagation()}>
                        <ExclamationTriangleIcon className="h-12 w-12 text-amber-500 mx-auto mb-4" />
                        <h3 id="clear-dialog-title" className="text-xl font-bold text-slate-800 dark:text-slate-100">Limpiar Página</h3>
                        <p className="my-4 text-slate-600 dark:text-slate-300">Esta página tiene respuestas seleccionadas. ¿Qué quieres hacer?</p>
                        <div className="flex flex-col gap-3 mt-6">
                            <button 
                                onClick={() => {
                                    handleClearAllForPages(pagesToClear);
                                    setShowClearConfirm(false);
                                }} 
                                className="px-4 py-3 font-bold rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors"
                            >
                                Limpiar Todo (Anotaciones y Respuestas)
                            </button>
                            <button 
                                onClick={() => {
                                    handleClearDrawingsForPages(pagesToClear);
                                    setShowClearConfirm(false);
                                }} 
                                className="px-4 py-3 font-semibold rounded-md bg-sky-500 text-white hover:bg-sky-600 transition-colors"
                            >
                                Limpiar Solo Anotaciones
                            </button>
                             <button 
                                onClick={() => setShowClearConfirm(false)} 
                                className="mt-2 px-4 py-2 font-semibold rounded-md bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PaperModeLayout;
