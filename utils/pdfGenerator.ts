import jsPDF from 'jspdf';
import { SavedQuiz, LibraryItem } from '../types';

interface TocEntry {
    title: string;
    level: number;
    page: number;
    type: 'folder' | 'quiz' | 'answers';
}

interface OutlineEntry {
    parent: any; // Can be null for root or another outline entry
    title: string;
    page: number;
    self: any; // Reference to the created outline object
}

export const generatePdfBlob = async (items: LibraryItem[], title: string): Promise<Blob> => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageHeight = doc.internal.pageSize.height;
    const margin = 40;
    const maxLineWidth = doc.internal.pageSize.width - margin * 2;
    let y = margin;
    let questionCounter = 1;

    // Store TOC and Outline data in memory to be processed later
    const tocEntries: TocEntry[] = [];
    const outlineData: OutlineEntry[] = [];

    const checkPageBreak = (heightNeeded: number) => {
        if (y + heightNeeded > pageHeight - margin) {
            doc.addPage();
            y = margin;
            return true;
        }
        return false;
    };
    
    // This title is a placeholder on what will become page 2 (or later)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    doc.text(title, doc.internal.pageSize.width / 2, y, { align: 'center' });
    y += 40;

    const processItems = (itemsToProcess: LibraryItem[], parentNode: any, level: number) => {
        itemsToProcess.forEach((item) => {
            checkPageBreak(40); // Check if there's enough space for a title
            const currentPage = doc.getNumberOfPages();

            if (item.type === 'folder') {
                tocEntries.push({ title: item.name, level, page: currentPage, type: 'folder' });
                const folderNode = { parent: parentNode, title: item.name, page: currentPage, self: {} };
                outlineData.push(folderNode);
                
                const hasQuizzes = item.children.some(child => child.type === 'quiz' || (child.type === 'folder' && child.children.length > 0));
                
                if(hasQuizzes) {
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(Math.max(18 - level * 2, 12));
                    const folderTitleLines = doc.splitTextToSize(item.name, maxLineWidth - (level * 15));
                    checkPageBreak(folderTitleLines.length * (Math.max(18 - level * 2, 12) * 1.2));
                    doc.text(folderTitleLines, margin + level * 15, y);
                    y += folderTitleLines.length * (Math.max(18 - level * 2, 12) * 1.2) + 10;
                }
                
                processItems(item.children, folderNode, level + 1);
            
            } else if (item.type === 'quiz') {
                tocEntries.push({ title: item.title, level, page: currentPage, type: 'quiz' });
                const quizNode = { parent: parentNode, title: item.title, page: currentPage, self: {} };
                outlineData.push(quizNode);
                
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(Math.max(14 - level * 2, 10));
                const quizTitleLines = doc.splitTextToSize(item.title, maxLineWidth - (level * 15));
                checkPageBreak(quizTitleLines.length * (Math.max(14 - level * 2, 10) * 1.2));
                doc.text(quizTitleLines, margin + level * 15, y);
                y += quizTitleLines.length * (Math.max(14 - level * 2, 10) * 1.2) + 15;

                const quizAnswers: { number: number; letter: string; text: string }[] = [];
                const fixedIndent = 15; // A standard indent for all questions

                item.questions.forEach(question => {
                    const questionText = `${questionCounter}. ${question.question}`;
                    doc.setFontSize(10);

                    // --- UNIFORM INDENTATION & JUSTIFICATION ---
                    doc.setFont('helvetica', 'bold');
                    const questionLines = doc.splitTextToSize(questionText, maxLineWidth);
                    const questionHeight = questionLines.length * 12;

                    const calculateOptionsHeight = () => {
                        let totalHeight = 0;
                        doc.setFont('helvetica', 'normal');
                        question.options.forEach(opt => {
                             const optionText = `a) ${opt}`;
                             const optionLines = doc.splitTextToSize(optionText, maxLineWidth - fixedIndent);
                             totalHeight += optionLines.length * 12;
                             totalHeight += 2; // Spacing
                        });
                        return totalHeight;
                    };
                    const optionsHeight = calculateOptionsHeight();
                    
                    checkPageBreak(questionHeight + optionsHeight + 20);
                    
                    doc.setFont('helvetica', 'bold');
                    doc.text(questionText, margin, y, { align: 'justify', maxWidth: maxLineWidth });
                    y += questionHeight + 5;
                    
                    doc.setFont('helvetica', 'normal');
                    question.options.forEach((option, index) => {
                        const optionLetter = String.fromCharCode(97 + index);
                        const optionText = `${optionLetter}) ${option}`;
                        const optionMaxWidth = maxLineWidth - fixedIndent;
                        const optionLines = doc.splitTextToSize(optionText, optionMaxWidth);
                        const optionHeight = optionLines.length * 12;

                        checkPageBreak(optionHeight + 2);
                        doc.text(optionText, margin + fixedIndent, y, { align: 'justify', maxWidth: optionMaxWidth });
                        y += optionHeight + 2;
                    });
                    
                    const correctAnswerIndex = question.options.findIndex(opt => opt === question.correctAnswer);
                    const correctAnswerLetter = correctAnswerIndex > -1 ? String.fromCharCode(97 + correctAnswerIndex) : '?';
                    quizAnswers.push({
                        number: questionCounter,
                        letter: correctAnswerLetter,
                        text: question.correctAnswer,
                    });
                    questionCounter++;
                    y += 10;
                });

                if (quizAnswers.length > 0) {
                    doc.addPage();
                    y = margin;
                    
                    const answerPage = doc.getNumberOfPages();
                    tocEntries.push({ title: `Respuestas - ${item.title}`, level: level + 1, page: answerPage, type: 'answers' });
                    const answerNode = { parent: quizNode, title: `Respuestas - ${item.title}`, page: answerPage, self: {} };
                    outlineData.push(answerNode);
                    
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(12);
                    doc.text(`Respuestas - ${item.title}`, margin, y);
                    y += 25;

                    doc.setFontSize(10);
                    
                    const lineHeight = 12;
                    const spacing = 10;

                    for (const answer of quizAnswers) {
                        const prefix = `${answer.number}. ${answer.letter}) `;
                        
                        doc.setFont('helvetica', 'bold');
                        const prefixWidth = doc.getTextWidth(prefix);
                        doc.setFont('helvetica', 'normal');
                        
                        const textLines = doc.splitTextToSize(answer.text, maxLineWidth - prefixWidth - margin);
                        const blockHeight = textLines.length * lineHeight + spacing;

                        checkPageBreak(blockHeight);
                        
                        doc.setFont('helvetica', 'bold');
                        doc.text(prefix, margin, y);
                        
                        doc.setFont('helvetica', 'normal');
                        doc.text(textLines, margin + prefixWidth, y);
                        
                        y += blockHeight;
                    }

                    doc.addPage();
                    y = margin;
                }
            }
        });
    };

    // First pass: render content and collect data
    processItems(items, null, 0);
    if (doc.getNumberOfPages() > 1) {
        doc.setPage(doc.getNumberOfPages());
        if (y === margin) {
            doc.deletePage(doc.getNumberOfPages());
        }
    }


    // --- TOC Calculation and Rendering ---
    const tocLineHeight = 15;
    const tocHeaderHeight = 40;
    const tocMargin = 40;
    const tocContentHeightPerPage = pageHeight - tocMargin * 2;
    
    const tocRenderData: { entry: TocEntry; lines: string[] }[] = [];
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    tocEntries.forEach(entry => {
        const titleText = entry.title;
        const indentedX = tocMargin + entry.level * 20;
        const availableWidth = maxLineWidth - (indentedX - tocMargin) - 30; // 30 for page number
        const lines = doc.splitTextToSize(titleText, availableWidth);
        tocRenderData.push({ entry, lines });
    });

    let tocPageCount = 0;
    if (tocRenderData.length > 0) {
        let linesLeftOnPage = Math.floor((tocContentHeightPerPage - tocHeaderHeight) / tocLineHeight);
        tocPageCount = 1;
        for (const { lines } of tocRenderData) {
            if (lines.length > linesLeftOnPage) {
                tocPageCount++;
                linesLeftOnPage = Math.floor(tocContentHeightPerPage / tocLineHeight) - lines.length;
            } else {
                linesLeftOnPage -= lines.length;
            }
        }
    }

    // Insert pages for TOC
    for (let i = 0; i < tocPageCount; i++) {
        doc.insertPage(1);
    }

    // Render TOC across the new pages
    let currentTocRenderDataIndex = 0;
    for (let page = 1; page <= tocPageCount; page++) {
        doc.setPage(page);
        y = tocMargin;
        if (page === 1) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(20);
            doc.text('Índice', doc.internal.pageSize.width / 2, y, { align: 'center' });
            y += 30;
        }

        doc.setFontSize(10);
        
        while (currentTocRenderDataIndex < tocRenderData.length) {
            const { entry, lines } = tocRenderData[currentTocRenderDataIndex];
            const heightNeeded = lines.length * tocLineHeight;
            
            if (y + heightNeeded > pageHeight - tocMargin && y > tocMargin + 20) {
                break; // Move to next TOC page
            }
            
            if (entry.type === 'folder') {
                doc.setFont('helvetica', 'bold');
            } else {
                doc.setFont('helvetica', 'normal');
            }

            const pageNumber = entry.page + tocPageCount;
            const indentedX = tocMargin + entry.level * 20;
            const pageNumX = doc.internal.pageSize.width - tocMargin;
            
            const titleText = lines.join('\n');

            doc.setTextColor(41, 128, 185); // Blue for links
            doc.textWithLink(titleText, indentedX, y, { pageNumber });
            doc.setTextColor(0, 0, 0);

            doc.setFont('helvetica', 'normal'); // Reset font for page number

            doc.text(String(pageNumber), pageNumX, y, { align: 'right' });
            
            y += heightNeeded;
            currentTocRenderDataIndex++;
        }
    }
    
    // --- Outline / Bookmarks ---
    const outlineMap = new Map<any, any>();
    const rootOutlineNode = doc.outline.add(null, title, { pageNumber: tocPageCount + 1 });
    outlineMap.set(null, rootOutlineNode);
    
    outlineData.forEach(data => {
        const parentOutlineNode = outlineMap.get(data.parent) || rootOutlineNode;
        const newNode = doc.outline.add(parentOutlineNode, data.title, { pageNumber: data.page + tocPageCount });
        data.self = newNode;
        outlineMap.set(data, newNode);
    });

    return doc.output('blob');
};
