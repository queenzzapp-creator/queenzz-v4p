
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { QuizQuestion, UserAnswersMap, Stroke, StrokeStyle, Point, OptionBox, QuestionFlag } from '../types.ts';
import { FlagIcon } from './Icons.tsx';
import FlagMenu from './FlagMenu.tsx';

interface PaperQuizViewProps {
    questions: QuizQuestion[];
    questionsForPage: QuizQuestion[];
    pageStartIndex: number;
    userAnswers: UserAnswersMap;
    onAnswerSelect: (questionIndex: number, selectedOption: string) => void;
    strokes: Stroke[];
    toolStyle: StrokeStyle;
    onAddStroke: (stroke: Stroke, pageStartIndex: number, currentCanvasSize: { width: number; height: number }) => void;
    onOptionBoxesCalculated: (pageStartIndex: number, boxes: OptionBox[]) => void;
    onQuestionFlagged: (questionId: string, flag: QuestionFlag | null) => void;
}

const drawSmoothPath = (ctx: CanvasRenderingContext2D, path: Point[]) => {
    if (path.length < 2) return;

    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);

    for (let i = 1; i < path.length - 1; i++) {
        const xc = (path[i].x + path[i + 1].x) / 2;
        const yc = (path[i].y + path[i + 1].y) / 2;
        ctx.quadraticCurveTo(path[i].x, path[i].y, xc, yc);
    }
    if (path.length > 1) {
      ctx.lineTo(path[path.length - 1].x, path[path.length - 1].y);
    }

    ctx.stroke();
};

const flagColorMap: Record<QuestionFlag, { dark: string, light: string }> = {
    'buena': { dark: '#22c55e', light: '#16a34a' },
    'mala': { dark: '#ef4444', light: '#dc2626' },
    'interesante': { dark: '#facc15', light: '#eab308' },
    'revisar': { dark: '#38bdf8', light: '#0ea5e9' },
    'suspendida': { dark: '#a855f7', light: '#9333ea' },
};


const PaperQuizView: React.FC<PaperQuizViewProps> = ({ 
    questions, questionsForPage, pageStartIndex, userAnswers, onAnswerSelect, strokes, toolStyle, onAddStroke, onOptionBoxesCalculated, onQuestionFlagged
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const livePathRef = useRef<Point[] | null>(null);
    const optionLetterBoxes = useRef<OptionBox[]>([]);
    const flagIconBoxes = useRef(new Map<string, { x: number; y: number; width: number; height: number }>());
    const [flagMenuState, setFlagMenuState] = useState<{ x: number, y: number, questionId: string } | null>(null);

    const getPointerPos = (e: PointerEvent): Point => {
        const rect = canvasRef.current!.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        
        const margin = 20;
        const contentWidth = rect.width > 0 ? rect.width - margin * 2 : 300;
        optionLetterBoxes.current = [];
        flagIconBoxes.current.clear();

        let requiredHeight = 40;
        const calculateWrappedHeight = (text: string, maxWidth: number, lineHeight: number, font: string): number => {
            ctx.font = font;
            const words = text.split(' ');
            let line = '';
            let lines = 1;
            for (let n = 0; n < words.length; n++) {
                const testLine = line + words[n] + ' ';
                if (ctx.measureText(testLine).width > maxWidth && n > 0) {
                    lines++;
                    line = words[n] + ' ';
                } else {
                    line = testLine;
                }
            }
            return lines * lineHeight;
        };
        
        questionsForPage.forEach((q, pageIndex) => {
            const absoluteQIndex = pageStartIndex + pageIndex;
            const questionText = `${absoluteQIndex + 1}. ${q.question}`;
            requiredHeight += calculateWrappedHeight(questionText, contentWidth - 34, 22, 'bold 16px Inter, sans-serif') + 30; // 34 for flag
            q.options.forEach((opt) => {
                requiredHeight += calculateWrappedHeight(opt, contentWidth - 10 - 20, 18, '14px Inter, sans-serif') + 24;
            });
            requiredHeight += 45;
        });

        const finalHeight = requiredHeight;
        if (canvas.width !== rect.width * dpr || canvas.height !== finalHeight * dpr) {
            canvas.width = rect.width * dpr;
            canvas.height = finalHeight * dpr;
            canvas.style.height = `${finalHeight}px`;
            ctx.scale(dpr, dpr);
        }
        
        ctx.fillStyle = document.documentElement.classList.contains('dark') ? '#1f2937' : '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        let yPos = 40;

        const textColor = document.documentElement.classList.contains('dark') ? '#cbd5e1' : '#334155';
        const questionColor = document.documentElement.classList.contains('dark') ? '#f1f5f9' : '#1e293b';

        const wrapText = (text: string, x: number, y: number, maxWidth: number, lineHeight: number, font: string): number => {
            ctx.font = font;
            const words = text.split(' ');
            let line = '';
            let currentY = y;
            for (let n = 0; n < words.length; n++) {
                const testLine = line + words[n] + ' ';
                if (ctx.measureText(testLine).width > maxWidth && n > 0) {
                    ctx.fillText(line, x, currentY);
                    line = words[n] + ' ';
                    currentY += lineHeight;
                } else {
                    line = testLine;
                }
            }
            ctx.fillText(line, x, currentY);
            return currentY;
        };

        questionsForPage.forEach((q, pageIndex) => {
            const absoluteQIndex = pageStartIndex + pageIndex;
            
            const flagSize = 24;
            const flagX = rect.width - margin - flagSize;
            const flagY = yPos - (flagSize / 2) - 4;
            flagIconBoxes.current.set(q.id, { x: flagX, y: flagY, width: flagSize, height: flagSize });
            
            const path = new Path2D("M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6h-5.6z");
            ctx.save();
            ctx.translate(flagX, flagY);
            const scale = flagSize / 24;
            ctx.scale(scale, scale);
            const isDark = document.documentElement.classList.contains('dark');
            
            const colors = q.flag ? flagColorMap[q.flag] : null;
            if (colors) {
                ctx.fillStyle = isDark ? colors.dark : colors.light;
                ctx.fill(path);
            } else {
                ctx.fillStyle = isDark ? '#64748b' : '#9ca3af'; // slate-500 / slate-400
                ctx.fill(path);
            }
            ctx.restore();

            // Draw Question Text
            ctx.fillStyle = questionColor;
            yPos = wrapText(`${absoluteQIndex + 1}. ${q.question}`, margin, yPos, contentWidth - flagSize - 10, 22, 'bold 16px Inter, sans-serif') + 30;
            
            q.options.forEach((opt, oIndex) => {
                const letter = String.fromCharCode(65 + oIndex);
                ctx.font = '14px Inter, sans-serif';
                
                const letterMetrics = ctx.measureText(`${letter})`);
                const letterX = margin + 10;
                const letterY = yPos - 14; 
                const letterWidth = letterMetrics.width;
                const letterHeight = 14; 

                optionLetterBoxes.current.push({
                    questionIndex: absoluteQIndex,
                    optionIndex: oIndex,
                    rect: { x: letterX, y: letterY, width: letterWidth + 10, height: letterHeight + 4 }
                });

                const userAnswer = userAnswers.get(absoluteQIndex);
                const isSelected = userAnswer?.selected === opt;

                const textHeight = calculateWrappedHeight(opt, contentWidth - 10 - 20, 18, '14px Inter, sans-serif');
                
                if (isSelected) {
                    ctx.fillStyle = document.documentElement.classList.contains('dark') ? 'rgba(56, 189, 248, 0.2)' : 'rgba(56, 189, 248, 0.15)';
                    ctx.fillRect(margin, yPos - 14, contentWidth, textHeight + 4); 
                }
                
                ctx.fillStyle = textColor;
                ctx.fillText(`${letter})`, letterX, yPos);
                yPos = wrapText(opt, margin + 10 + 20, yPos, contentWidth - 10 - 20, 18, '14px Inter, sans-serif') + 24;
            });
            yPos += 45;
        });
        
        strokes.forEach(stroke => {
            const { path, style } = stroke;
            ctx.strokeStyle = style.color;
            ctx.lineWidth = style.lineWidth;
            ctx.globalCompositeOperation = style.compositeOperation;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            const absolutePath = path.map(p => ({ x: p.x * rect.width, y: p.y * rect.height }));
            drawSmoothPath(ctx, absolutePath);
        });

        if (livePathRef.current) {
            const { path, style } = { path: livePathRef.current, style: toolStyle };
            ctx.strokeStyle = style.color;
            ctx.lineWidth = style.lineWidth;
            ctx.globalCompositeOperation = style.compositeOperation;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            drawSmoothPath(ctx, path);
        }

        ctx.globalCompositeOperation = 'source-over';
    }, [questionsForPage, strokes, toolStyle, pageStartIndex, userAnswers]);
    
    useEffect(() => {
        let animationFrameId: number;
        const resizeObserver = new ResizeObserver(() => {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = requestAnimationFrame(draw);
        });
        const canvas = canvasRef.current;
        if(canvas) resizeObserver.observe(canvas);
        draw();
        onOptionBoxesCalculated(pageStartIndex, optionLetterBoxes.current);
        return () => {
            if(canvas) resizeObserver.unobserve(canvas);
            cancelAnimationFrame(animationFrameId);
        };
    }, [draw, onOptionBoxesCalculated, pageStartIndex]);

    const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (e.pointerType === 'touch') return;
        e.currentTarget.setPointerCapture(e.pointerId);
        livePathRef.current = [getPointerPos(e.nativeEvent)];
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!livePathRef.current) return;
        const nativeEvent = e.nativeEvent;
        if (typeof nativeEvent.getCoalescedEvents === 'function') {
            const coalescedEvents = nativeEvent.getCoalescedEvents();
            coalescedEvents.forEach(event => {
                livePathRef.current!.push(getPointerPos(event));
            });
        } else {
            livePathRef.current!.push(getPointerPos(nativeEvent));
        }
        draw();
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!livePathRef.current) return;

        const isShortPath = livePathRef.current.length < 5;

        // Reset for drawing logic regardless of click
        const pathForDrawing = [...livePathRef.current];
        livePathRef.current = null;
        
        if (isShortPath) {
            draw(); // Redraw to remove the temporary dot from the down event
            return; // Don't process as a drawing
        }

        const canvas = canvasRef.current;
        if (canvas && pathForDrawing.length > 1) {
            const rect = canvas.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                 const relativePath = pathForDrawing.map(p => ({
                    x: p.x / rect.width,
                    y: p.y / rect.height
                }));
                onAddStroke({
                    id: crypto.randomUUID(),
                    path: relativePath,
                    style: toolStyle,
                }, pageStartIndex, { width: rect.width, height: rect.height });
            }
        }
        
        draw();
    };

    const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const rect = canvasRef.current!.getBoundingClientRect();
        const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };

        for (const [questionId, box] of flagIconBoxes.current.entries()) {
            if (pos.x > box.x && pos.x < box.x + box.width && pos.y > box.y && pos.y < box.y + box.height) {
                setFlagMenuState({ x: e.clientX, y: e.clientY, questionId });
                return;
            }
        }
    };


    return (
        <div className="h-full w-full relative">
            <canvas 
                ref={canvasRef}
                className="w-full h-auto touch-none"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onClick={handleClick}
            />
            {flagMenuState && (
                <FlagMenu 
                    {...flagMenuState}
                    onFlagSet={(flag) => {
                        onQuestionFlagged(flagMenuState!.questionId, flag);
                        setFlagMenuState(null);
                    }}
                    onClose={() => setFlagMenuState(null)}
                />
            )}
        </div>
    );
};

export default PaperQuizView;