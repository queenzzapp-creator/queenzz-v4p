import React, { useRef, useEffect, useState } from 'react';
import { QuizQuestion, UserAnswersMap, QuizSettings } from '../types.ts';

interface AnswerSheetProps {
    questions: QuizQuestion[];
    userAnswers: UserAnswersMap;
    currentPage: number;
    questionsPerPage: number;
    quizSettings: QuizSettings;
    onNavigate: (index: number) => void;
    onAnswer: (questionIndex: number, selectedOption: string) => void;
}

const AnswerSheet: React.FC<AnswerSheetProps> = ({ questions, userAnswers, currentPage, questionsPerPage, quizSettings, onNavigate, onAnswer }) => {
    const [expandedPage, setExpandedPage] = useState<number | null>(currentPage);
    const itemRefs = useRef(new Map<number, HTMLDivElement | HTMLButtonElement>());
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setExpandedPage(currentPage);
    }, [currentPage]);
    
    useEffect(() => {
        const firstQuestionOnPageIndex = expandedPage !== null ? expandedPage * questionsPerPage : -1;
        const activeItem = itemRefs.current.get(firstQuestionOnPageIndex);
        
        if (activeItem && containerRef.current) {
            const container = containerRef.current;
            const containerRect = container.getBoundingClientRect();
            const itemRect = activeItem.getBoundingClientRect();
            
            if (itemRect.top < containerRect.top || itemRect.bottom > containerRect.bottom) {
                activeItem.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });
            }
        }
    }, [expandedPage, questionsPerPage]);

    const getStatusClass = (index: number) => {
        const answer = userAnswers.get(index);
        
        if (answer) {
            if (quizSettings?.showAnswers === 'immediately') {
                return answer.isCorrect
                    ? 'bg-green-500 text-white'
                    : 'bg-red-500 text-white';
            }
            return 'bg-sky-500 text-white'; // Answered in 'atEnd' mode
        }

        return 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200';
    };

    const totalPages = Math.ceil(questions.length / questionsPerPage);

    return (
        <div className="bg-transparent h-full flex flex-col">
            <div ref={containerRef} className="flex-grow overflow-y-auto p-2 font-mono min-h-0">
                <div className="space-y-2">
                    {Array.from({ length: totalPages }).map((_, pageIndex) => {
                        const startIndex = pageIndex * questionsPerPage;
                        const endIndex = Math.min(startIndex + questionsPerPage, questions.length);
                        const isExpanded = expandedPage === pageIndex;

                        return (
                            <div
                                key={`page-${pageIndex}`}
                                ref={(el) => { if (el) itemRefs.current.set(startIndex, el); }}
                                className={`p-2 rounded-lg transition-all duration-200 ${isExpanded ? 'bg-white dark:bg-slate-800/50 border border-slate-300 dark:border-slate-600' : ''}`}
                            >
                                <button
                                    onClick={() => {
                                        if (isExpanded) {
                                            setExpandedPage(null);
                                        } else {
                                            onNavigate(startIndex);
                                            setExpandedPage(pageIndex);
                                        }
                                    }}
                                    className="w-full grid grid-cols-5 gap-1"
                                >
                                    {Array.from({ length: endIndex - startIndex }).map((_, i) => {
                                        const questionIndex = startIndex + i;
                                        return (
                                            <div key={questionIndex} className={`w-full h-8 flex items-center justify-center rounded-md text-xs font-bold transition-colors ${getStatusClass(questionIndex)}`}>
                                                {questionIndex + 1}
                                            </div>
                                        );
                                    })}
                                     {/* Fill remaining grid cells if the last page is not full */}
                                     {Array.from({ length: questionsPerPage - (endIndex - startIndex) }).map((_, i) => (
                                        <div key={`filler-${i}`} className="w-full h-8"></div>
                                    ))}
                                </button>
                                
                                {isExpanded && (
                                    <div className="mt-2 space-y-1 animate-fade-in">
                                        {questions.slice(startIndex, endIndex).map((q, i) => {
                                            const questionIndex = startIndex + i;
                                            const userAnswer = userAnswers.get(questionIndex);

                                            return (
                                                <div key={q.id} className="py-2 border-t border-slate-200 dark:border-slate-700 flex items-center gap-2">
                                                    <div className="w-10 text-center flex-shrink-0 font-bold text-lg text-slate-500 dark:text-slate-400">
                                                        {questionIndex + 1}
                                                    </div>
                                                    <div className="flex-grow flex items-center justify-around">
                                                        {q.options.map((option, oIndex) => {
                                                            const letter = String.fromCharCode(65 + oIndex);
                                                            const isSelected = userAnswer?.selected === option;

                                                            let style = 'bg-slate-100 dark:bg-slate-700/50 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600/50';
                                                            if (isSelected) {
                                                                style = 'bg-sky-500 text-white';
                                                            }

                                                            return (
                                                                <button
                                                                    key={oIndex}
                                                                    onClick={() => onAnswer(questionIndex, option)}
                                                                    className={`w-9 h-9 flex items-center justify-center rounded-md font-bold transition-colors text-sm relative ${style}`}
                                                                >
                                                                    {letter}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default AnswerSheet;