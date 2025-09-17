
import { LibraryItem, QuizQuestion, AppData, LibraryData, SavedQuiz, Flashcard, FailedQuestionEntry, PausedQuizState, StoredFile, StoredURL, StudyPlanSession, MnemonicRule, StudyPlanConfig, UserAnswersMap, QuizSettings, ScoreRecord, ActiveQuizType, GeneratedQuiz, DocumentItem, QuestionFlag, StoredFileItem, FlashcardDeck, StoredURLItem, ManualCorrectionsMap } from "../types.ts";
import * as settingsService from './settingsService.ts';

const DB_NAME = 'QUEENZZ_DB';
const DB_VERSION = 4;
const APP_DATA_STORE = 'appData';
const APP_DATA_KEY = 'appData';
const OLD_LOCALSTORAGE_KEY = 'queenzz_app_data';

let db: IDBDatabase;

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db);
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = (event) => reject(`Error opening IndexedDB: ${(event.target as IDBOpenDBRequest).error}`);
    request.onsuccess = (event) => {
      db = (event.target as IDBOpenDBRequest).result;
      resolve(db);
    };
    request.onupgradeneeded = (event) => {
      const dbInstance = (event.target as IDBOpenDBRequest).result;
      if (!dbInstance.objectStoreNames.contains(APP_DATA_STORE)) {
        dbInstance.createObjectStore(APP_DATA_STORE);
      }
      if (!dbInstance.objectStoreNames.contains('assets')) {
        dbInstance.createObjectStore('assets');
      }
    };
  });
};

const getFromDB = <T>(storeName: string, key: IDBValidKey): Promise<T | undefined> => {
    return new Promise(async (resolve, reject) => {
        const db = await openDB();
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(`Error getting ${key} from ${storeName}`);
    });
};

const saveToDB = <T>(storeName: string, value: T, key: IDBValidKey): Promise<void> => {
     return new Promise(async (resolve, reject) => {
        const db = await openDB();
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        store.put(value, key);
        transaction.oncomplete = () => resolve();
        transaction.onerror = (e) => reject(`Error saving to ${storeName}: ${(e.target as IDBRequest).error}`);
    });
}

const deleteFromDB = (storeName: string, key: IDBValidKey): Promise<void> => {
    return new Promise(async (resolve, reject) => {
        const db = await openDB();
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        store.delete(key);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(`Error deleting ${key} from ${storeName}`);
    });
};

export const saveFileContent = (id: string, content: string): Promise<void> => saveToDB('assets', content, id);
export const getFileContent = (id: string): Promise<string | undefined> => getFromDB('assets', id);
export const getMnemonicImageUrl = (id: string): Promise<string | undefined> => getFromDB('assets', `mnemonic_${id}`);
export const getQuestionAssets = async (questionId: string): Promise<{ imageUrl?: string, sourcePageImage?: string }> => {
    const assets: { imageUrl?: string, sourcePageImage?: string } = {};
    const [imageUrl, sourcePageImage] = await Promise.all([
        getFromDB<string>('assets', `q_image_${questionId}`),
        getFromDB<string>('assets', `q_source_image_${questionId}`)
    ]);
    if (imageUrl) assets.imageUrl = imageUrl;
    if (sourcePageImage) assets.sourcePageImage = sourcePageImage;
    return assets;
};

const getISOWeek = (date: Date): number => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
};

export const getQuestionSignature = (question: QuizQuestion): string => {
    const questionText = question.question.trim().toLowerCase().replace(/\s+/g, ' ');
    const optionsText = [...question.options].sort().join('').trim().toLowerCase().replace(/\s+/g, '');
    return `${questionText}|${optionsText}`;
};

export const flattenItems = (items: LibraryItem[]): LibraryItem[] => {
    let flatList: LibraryItem[] = [];
    items.forEach(item => {
        flatList.push(item);
        if (item.type === 'folder') {
            flatList = flatList.concat(flattenItems(item.children));
        }
    });
    return flatList;
};

export const flattenQuizzes = (items: LibraryItem[]): SavedQuiz[] => {
    const quizzes: SavedQuiz[] = [];
    const recurse = (currentItems: LibraryItem[]) => {
        for (const item of currentItems) {
            if (item.type === 'quiz') quizzes.push(item);
            else if (item.type === 'folder') recurse(item.children);
        }
    };
    recurse(items);
    return quizzes;
};

export const getInitialAppData = (): AppData => {
    const defaultLibraryId = crypto.randomUUID();
    const defaultLibrary: LibraryData = {
        id: defaultLibraryId,
        name: "Biblioteca Principal",
        createdAt: new Date().toISOString(),
        library: [], documentLibrary: [], failedQuestions: [], answeredQuestionIds: [],
        failedFlashcards: [], pausedQuizState: null, allTimeFailedQuestionIds: [],
        allTimeUnansweredQuestionIds: [], mnemonics: [], openFolderIds: [],
    };
    return { activeLibraryId: defaultLibraryId, libraries: { [defaultLibraryId]: defaultLibrary } };
};

export const migrateData = (appData: any): AppData => {
    let needsSave = false;
    if (!appData || !appData.libraries) {
      return getInitialAppData();
    }
    for (const libId in appData.libraries) {
        const lib = appData.libraries[libId];
        if (!lib) continue;

        if (!Array.isArray(lib.library)) { lib.library = []; needsSave = true; }
        if (!Array.isArray(lib.failedQuestions)) { lib.failedQuestions = []; needsSave = true; }
        if (!Array.isArray(lib.answeredQuestionIds)) { lib.answeredQuestionIds = []; needsSave = true; }
        if (!Array.isArray(lib.failedFlashcards)) { lib.failedFlashcards = []; needsSave = true; }
        if (typeof lib.pausedQuizState === 'undefined') { lib.pausedQuizState = null; needsSave = true; }
        if (!Array.isArray(lib.allTimeFailedQuestionIds)) { lib.allTimeFailedQuestionIds = []; needsSave = true; }
        if (!Array.isArray(lib.allTimeUnansweredQuestionIds)) { lib.allTimeUnansweredQuestionIds = []; needsSave = true; }
        if (typeof lib.studyPlanConfig === 'undefined') { lib.studyPlanConfig = undefined; needsSave = true; }
        if (!Array.isArray(lib.studyPlanSessions)) { lib.studyPlanSessions = []; needsSave = true; }
        if (!Array.isArray(lib.mnemonics)) { lib.mnemonics = []; needsSave = true; }
        if (!Array.isArray(lib.openFolderIds)) { lib.openFolderIds = []; needsSave = true; }

        if (lib.studyPlan) { delete lib.studyPlan; needsSave = true; }

        if (!lib.documentLibrary && (lib.storedFiles || lib.storedURLs)) {
            console.log(`Migrating stored files/URLs to documentLibrary for library "${lib.name}".`);
            const newDocumentLibrary: DocumentItem[] = [];
            (lib.storedFiles || []).forEach((file: StoredFile) => {
                const { base64Content, ...fileData } = file;
                newDocumentLibrary.push({ ...fileData, type: 'file' });
                if (base64Content) saveFileContent(file.id, base64Content);
            });
            (lib.storedURLs || []).forEach((url: StoredURL) => newDocumentLibrary.push({ ...url, type: 'url' }));
            lib.documentLibrary = newDocumentLibrary;
            delete lib.storedFiles;
            delete lib.storedURLs;
            needsSave = true;
        }
        if (!lib.documentLibrary) { lib.documentLibrary = []; needsSave = true; }
    }
    if (needsSave) console.log("Data migration performed.");
    return appData as AppData;
}

export const loadAppData = async (): Promise<AppData> => {
    let appData: AppData | undefined = await getFromDB(APP_DATA_STORE, APP_DATA_KEY);

    if (!appData) {
        try {
            const oldDataStr = localStorage.getItem(OLD_LOCALSTORAGE_KEY);
            if (oldDataStr) {
                console.log("Migrating data from localStorage to IndexedDB...");
                appData = JSON.parse(oldDataStr);
                localStorage.removeItem(OLD_LOCALSTORAGE_KEY);
            }
        } catch (e) { console.error("Failed to parse old localStorage data:", e); }
    }
    
    if (!appData) {
        appData = getInitialAppData();
    }
    
    const migratedData = migrateData(appData);
    await saveAppData(migratedData);
    return migratedData;
};

export const saveAppData = async (appData: AppData): Promise<void> => {
    window.dispatchEvent(new CustomEvent('savestart'));
    try {
        await saveToDB(APP_DATA_STORE, appData, APP_DATA_KEY);
        window.dispatchEvent(new CustomEvent('savesuccess'));
    } catch (e) {
        window.dispatchEvent(new CustomEvent('saveerror'));
        console.error("Failed to save app data to IndexedDB", e);
    }
};

// --- Pure State Update Functions ---

const updateActiveLibrary = (appData: AppData, updater: (activeLibrary: LibraryData) => LibraryData): AppData => {
    const activeId = appData.activeLibraryId;
    if (!activeId || !appData.libraries[activeId]) return appData;

    return {
        ...appData,
        libraries: {
            ...appData.libraries,
            [activeId]: updater(appData.libraries[activeId]),
        },
    };
};

export const getAppDataWithUpdatedLibrary = (appData: AppData, newLibrary: LibraryItem[]): AppData => {
    return updateActiveLibrary(appData, active => ({ ...active, library: newLibrary }));
};

export const getAppDataWithToggledFolder = (appData: AppData, folderId: string): AppData => {
    return updateActiveLibrary(appData, active => {
        const openIds = new Set(active.openFolderIds || []);
        if (openIds.has(folderId)) {
            openIds.delete(folderId);
        } else {
            openIds.add(folderId);
        }
        return { ...active, openFolderIds: Array.from(openIds) };
    });
};

export const getAppDataWithNewDocLibrary = (appData: AppData, newDocLibrary: DocumentItem[]): AppData => {
    return updateActiveLibrary(appData, active => ({ ...active, documentLibrary: newDocLibrary }));
};

export const getAppDataWithResetProgress = (appData: AppData, libraryId: string): AppData => {
    const targetLibrary = appData.libraries[libraryId];
    if (!targetLibrary) return appData;

    const resetHistoryInItems = (items: LibraryItem[]): LibraryItem[] => items.map(item => {
        if (item.type === 'quiz') {
            const { scoreHistory, completionCount, ...rest } = item;
            return { ...rest, scoreHistory: [], completionCount: 0 };
        }
        if (item.type === 'folder') {
            return { ...item, children: resetHistoryInItems(item.children) };
        }
        return item;
    });

    const newLibraryData: LibraryData = {
        ...targetLibrary,
        answeredQuestionIds: [],
        failedQuestions: [],
        allTimeFailedQuestionIds: [],
        allTimeUnansweredQuestionIds: [],
        failedFlashcards: [],
        pausedQuizState: null,
        library: resetHistoryInItems(targetLibrary.library),
    };

    return {
        ...appData,
        libraries: {
            ...appData.libraries,
            [libraryId]: newLibraryData,
        },
    };
};

export const getAppDataWithPausedState = (appData: AppData, pausedState: PausedQuizState | null): AppData => {
    return updateActiveLibrary(appData, active => ({ ...active, pausedQuizState: pausedState }));
};

export const updateAppDataWithFlashcardResult = (appData: AppData, cardId: string, wasCorrect: boolean): AppData => {
    return updateActiveLibrary(appData, active => {
        const failedFlashcards = active.failedFlashcards || [];
        if (wasCorrect) {
            return { ...active, failedFlashcards: failedFlashcards.filter(c => c.id !== cardId) };
        } else {
            const cardInDeck = flattenItems(active.library)
                .filter((item): item is FlashcardDeck => item.type === 'deck')
                .flatMap(deck => deck.cards)
                .find(card => card.id === cardId);
            if (cardInDeck && !failedFlashcards.some(c => c.id === cardId)) {
                return { ...active, failedFlashcards: [...failedFlashcards, cardInDeck] };
            }
        }
        return active;
    });
};

export const getAppDataWithUpdatedPlan = (appData: AppData, config: StudyPlanConfig, sessions: StudyPlanSession[]): AppData => {
    return updateActiveLibrary(appData, active => ({ ...active, studyPlanConfig: config, studyPlanSessions: sessions }));
};

export const getAppDataWithSavedMnemonic = (appData: AppData, rule: MnemonicRule): AppData => {
    return updateActiveLibrary(appData, active => ({ ...active, mnemonics: [...(active.mnemonics || []).filter(m => m.id !== rule.id), rule] }));
};

export const getAppDataWithDeletedMnemonic = (appData: AppData, ruleId: string): AppData => {
    return updateActiveLibrary(appData, active => ({ ...active, mnemonics: (active.mnemonics || []).filter(m => m.id !== ruleId) }));
};

export const getAppDataWithMovedItems = (appData: AppData, itemIds: Set<string>, targetFolderId: string | null): AppData => {
    return updateActiveLibrary(appData, activeLib => {
        const itemsToMove: LibraryItem[] = [];

        const extractItems = (items: LibraryItem[]): LibraryItem[] => {
            return items.filter(item => {
                if (itemIds.has(item.id)) {
                    itemsToMove.push(item);
                    return false;
                }
                if (item.type === 'folder') {
                    item.children = extractItems(item.children);
                }
                return true;
            });
        };

        const libraryAfterExtraction = extractItems(activeLib.library);

        if (itemsToMove.length === 0) {
            console.error("Move operation aborted: Target item(s) not found.");
            return activeLib;
        }

        if (targetFolderId === null) {
            return { ...activeLib, library: [...itemsToMove, ...libraryAfterExtraction] };
        } else {
            const findAndInsert = (items: LibraryItem[]): LibraryItem[] => {
                return items.map(item => {
                    if (item.id === targetFolderId && item.type === 'folder') {
                        return { ...item, children: [...itemsToMove, ...item.children] };
                    }
                    if (item.type === 'folder') {
                        return { ...item, children: findAndInsert(item.children) };
                    }
                    return item;
                });
            };
            return { ...activeLib, library: findAndInsert(libraryAfterExtraction) };
        }
    });
};

export const getAppDataWithDeletedItems = (appData: AppData, itemIds: Set<string>): AppData => {
    return updateActiveLibrary(appData, active => {
        const recurseDelete = (items: LibraryItem[]): LibraryItem[] => {
            return items.filter(item => {
                if (itemIds.has(item.id)) return false;
                if (item.type === 'folder') item.children = recurseDelete(item.children);
                return true;
            });
        };
        return { ...active, library: recurseDelete(active.library) };
    });
};

export const getAppDataWithDeletedDocItems = (appData: AppData, itemIds: Set<string>): AppData => {
    const filesToDelete = new Set<string>();
    const updatedAppData = updateActiveLibrary(appData, active => {
        const recurseDelete = (items: DocumentItem[]): DocumentItem[] => {
            return items.filter(item => {
                if (itemIds.has(item.id)) {
                    if (item.type === 'file') filesToDelete.add(item.id);
                    else if (item.type === 'folder') {
                        const collectIds = (folderItems: DocumentItem[]) => folderItems.forEach(child => {
                            if (child.type === 'file') filesToDelete.add(child.id);
                            if (child.type === 'folder') collectIds(child.children);
                        });
                        collectIds(item.children);
                    }
                    return false;
                }
                if (item.type === 'folder') item.children = recurseDelete(item.children);
                return true;
            });
        };
        return { ...active, documentLibrary: recurseDelete(active.documentLibrary || []) };
    });
    filesToDelete.forEach(id => deleteFromDB('assets', id));
    return updatedAppData;
};

export const getAppDataWithRenamedDocItem = (appData: AppData, itemId: string, newName: string): AppData => {
    return updateActiveLibrary(appData, active => {
        const updateInTree = (items: DocumentItem[]): DocumentItem[] => items.map(item => {
            if (item.id === itemId) return { ...item, name: newName } as DocumentItem;
            if (item.type === 'folder') return { ...item, children: updateInTree(item.children) };
            return item;
        });
        return { ...active, documentLibrary: updateInTree(active.documentLibrary || []) };
    });
};

export const getAppDataWithMovedDocItems = (appData: AppData, itemIds: Set<string>, folderId: string | null): AppData => {
    return updateActiveLibrary(appData, active => {
        let itemsToMove: DocumentItem[] = [];
        const extractItems = (items: DocumentItem[]): DocumentItem[] => items.filter(item => {
            if (itemIds.has(item.id)) { itemsToMove.push(item); return false; }
            if (item.type === 'folder') item.children = extractItems(item.children);
            return true;
        });
        const libraryAfterExtraction = extractItems(active.documentLibrary || []);

        if (folderId === null) {
            return { ...active, documentLibrary: [...itemsToMove, ...libraryAfterExtraction] };
        } else {
            const findAndInsert = (items: DocumentItem[]): DocumentItem[] => items.map(item => {
                if (item.id === folderId && item.type === 'folder') return { ...item, children: [...itemsToMove, ...item.children] };
                if (item.type === 'folder') return { ...item, children: findAndInsert(item.children) };
                return item;
            });
            return { ...active, documentLibrary: findAndInsert(libraryAfterExtraction) };
        }
    });
};

export const getAppDataWithSwitchedLibrary = (appData: AppData, libraryId: string): AppData => {
    if (appData.libraries[libraryId]) return { ...appData, activeLibraryId: libraryId };
    return appData;
};

export const getAppDataWithNewLibrary = (appData: AppData, name: string): AppData => {
    const newId = crypto.randomUUID();
    const newLibrary: LibraryData = {
        id: newId, name: name.trim(), createdAt: new Date().toISOString(),
        library: [], documentLibrary: [], failedQuestions: [], answeredQuestionIds: [],
        failedFlashcards: [], pausedQuizState: null, allTimeFailedQuestionIds: [],
        allTimeUnansweredQuestionIds: [], mnemonics: [], openFolderIds: [],
    };
    return {
        ...appData,
        activeLibraryId: newId,
        libraries: { ...appData.libraries, [newId]: newLibrary },
    };
};

export const getAppDataWithRenamedLibrary = (appData: AppData, newName: string): AppData => {
    return updateActiveLibrary(appData, active => ({ ...active, name: newName }));
};

export const getAppDataWithDeletedLibrary = (appData: AppData): AppData => {
    const activeId = appData.activeLibraryId;
    if (!activeId || Object.keys(appData.libraries).length <= 1) return appData;
    const newLibraries = { ...appData.libraries };
    delete newLibraries[activeId];
    const remainingIds = Object.keys(newLibraries);
    return { ...appData, libraries: newLibraries, activeLibraryId: remainingIds[0] || null };
};

export const getAppDataWithDeletedQuestions = (appData: AppData, questionIds: Set<string>): AppData => {
    return updateActiveLibrary(appData, active => {
        const updateInTree = (items: LibraryItem[]): LibraryItem[] => items.map(item => {
            if (item.type === 'quiz') return { ...item, questions: item.questions.filter(q => !questionIds.has(q.id)) };
            if (item.type === 'folder') return { ...item, children: updateInTree(item.children) };
            return item;
        });
        return {
            ...active,
            library: updateInTree(active.library),
            failedQuestions: active.failedQuestions.filter(entry => !questionIds.has(entry.question.id)),
        };
    });
};

export const getAppDataWithFlaggedQuestions = (appData: AppData, questionIds: Set<string>, flag: QuestionFlag | null): AppData => {
    return updateActiveLibrary(appData, active => {
        const updateInTree = (items: LibraryItem[]): LibraryItem[] => items.map(item => {
            if (item.type === 'quiz') return { ...item, questions: item.questions.map(q => {
                if (questionIds.has(q.id)) {
                    const updatedQ = { ...q };
                    if (flag) updatedQ.flag = flag; else delete updatedQ.flag;
                    return updatedQ;
                }
                return q;
            }) };
            if (item.type === 'folder') return { ...item, children: updateInTree(item.children) };
            return item;
        });
        return { ...active, library: updateInTree(active.library) };
    });
};

export const getAppDataWithUpdatedQuestion = (appData: AppData, updatedQuestion: QuizQuestion): AppData => {
    return updateActiveLibrary(appData, active => {
        // update in main library
        const updateInTree = (items: LibraryItem[]): LibraryItem[] => {
            return items.map(item => {
                if (item.type === 'quiz' && item.questions.some(q => q.id === updatedQuestion.id)) {
                    return {
                        ...item,
                        questions: item.questions.map(q => q.id === updatedQuestion.id ? updatedQuestion : q)
                    };
                }
                if (item.type === 'folder') {
                    return { ...item, children: updateInTree(item.children) };
                }
                return item;
            });
        };
        const newLibrary = updateInTree(active.library);

        // update in SRS entries
        const newFailedQuestions = (active.failedQuestions || []).map(entry => {
            if (entry.question.id === updatedQuestion.id) {
                return { ...entry, question: updatedQuestion };
            }
            return entry;
        });

        return { ...active, library: newLibrary, failedQuestions: newFailedQuestions };
    });
};

export const getAppDataWithMovedQuestions = (appData: AppData, questionIds: Set<string>, targetQuizId: string): AppData => {
    return updateActiveLibrary(appData, active => {
        let questionsToMove: QuizQuestion[] = [];
        let targetQuizFound = false;

        const findAndExtract = (items: LibraryItem[]): LibraryItem[] => {
            return items.map(item => {
                if(item.type === 'quiz') {
                    const questionsKept = item.questions.filter(q => {
                        if (questionIds.has(q.id)) {
                            questionsToMove.push(q);
                            return false;
                        }
                        return true;
                    });
                    return {...item, questions: questionsKept};
                }
                if (item.type === 'folder') {
                    return {...item, children: findAndExtract(item.children)};
                }
                return item;
            });
        };

        const libraryAfterExtraction = findAndExtract(active.library);

        if (questionsToMove.length === 0) return active;

        const findAndInsert = (items: LibraryItem[]): LibraryItem[] => {
            return items.map(item => {
                if (item.id === targetQuizId && item.type === 'quiz') {
                    const updatedQuestions = questionsToMove.map(q => ({...q, sourceQuizId: item.id, sourceQuizTitle: item.title }));
                    targetQuizFound = true; // El quiz de destino se encontró
                    return { ...item, questions: [...item.questions, ...updatedQuestions] };
                }
                if (item.type === 'folder') {
                    return { ...item, children: findAndInsert(item.children) };
                }
                return item;
            });
        };
        
        const newLibrary = findAndInsert(libraryAfterExtraction);

        if (!targetQuizFound) {
            console.error(`Move operation aborted: Target quiz with ID ${targetQuizId} not found.`);
            return active;
        }

        return { ...active, library: newLibrary };
    });
};


export const calculateQuizCompletion = (appData: AppData, questions: QuizQuestion[], userAnswers: UserAnswersMap, quizSettings: QuizSettings, quizId: string | null, activeQuizType: ActiveQuizType, manualCorrections?: ManualCorrectionsMap): { newAppData: AppData; score: number; questionToSuggestMnemonic: QuizQuestion | null; } => {
    let finalScore = 0;
    let questionToSuggestMnemonic: QuizQuestion | null = null;
    let correctCount = 0;
    let incorrectCount = 0;
    let unansweredCount = 0;

    if (quizSettings.quizMode === 'simulacro' && manualCorrections) {
        const settings = settingsService.getSettings();
        const { pointsCorrect, penaltyThreeOptions, penaltyFourOptions, proratedTotal } = settings.simulacroSettings;
        let rawScore = 0;

        questions.forEach((q, index) => {
            const status = manualCorrections.get(index);
            if (status === 'correct') {
                correctCount++;
                rawScore += pointsCorrect;
            } else if (status === 'incorrect') {
                incorrectCount++;
                rawScore -= q.options.length === 3 ? penaltyThreeOptions : penaltyFourOptions;
            } else {
                unansweredCount++;
            }
        });
        
        if (questions.length > 0) {
            const maxPossibleScore = questions.length * pointsCorrect;
            finalScore = (rawScore / maxPossibleScore) * proratedTotal;
        }
        finalScore = Math.max(0, finalScore);
    } else {
        questions.forEach((q, index) => {
            const answer = userAnswers.get(index);
            if (!answer) {
                unansweredCount++;
            } else if (answer.isCorrect) {
                correctCount++;
            } else {
                incorrectCount++;
            }
        });

        if (questions.length > 0) {
            if (quizSettings.penaltySystem === 'standard') {
                const optionsLength = questions[0]?.options.length || 4;
                const penalty = 1 / (optionsLength - 1);
                finalScore = (correctCount - (incorrectCount * penalty)) / questions.length * 10;
            } else {
                finalScore = (correctCount / questions.length) * 10;
            }
            finalScore = Math.max(0, finalScore);
        }
    }
    
    finalScore = parseFloat(finalScore.toFixed(2));

    const newAppData = updateActiveLibrary(appData, active => {
        let newActive = { ...active };
        
        const newAnswered = new Set(newActive.answeredQuestionIds || []);
        const newFailed = new Set(newActive.allTimeFailedQuestionIds || []);
        const newUnanswered = new Set(newActive.allTimeUnansweredQuestionIds || []);
        
        questions.forEach((q, index) => {
            const answerCorrect = manualCorrections ? manualCorrections.get(index) === 'correct' : userAnswers.get(index)?.isCorrect;
            const wasAnswered = manualCorrections ? manualCorrections.has(index) && manualCorrections.get(index) !== 'unanswered' : userAnswers.has(index);

            if (wasAnswered) {
                newAnswered.add(q.id);
                newUnanswered.delete(q.id);
                if (answerCorrect) {
                    newFailed.delete(q.id);
                } else {
                    newFailed.add(q.id);
                }
            } else if (!newAnswered.has(q.id)) {
                newUnanswered.add(q.id);
            }
        });

        newActive.answeredQuestionIds = Array.from(newAnswered);
        newActive.allTimeFailedQuestionIds = Array.from(newFailed);
        newActive.allTimeUnansweredQuestionIds = Array.from(newUnanswered);

        const isFullAttempt = quizId && activeQuizType === 'normal';
        const isPracticeAttempt = activeQuizType === 'practice' || activeQuizType === 'custom' || quizSettings.quizMode === 'simulacro';
        
        if (quizId && (isFullAttempt || isPracticeAttempt)) {
             const updateInTree = (items: LibraryItem[]): LibraryItem[] => items.map(item => {
                if (item.id === quizId && item.type === 'quiz') {
                    const proratedTotal = quizSettings.quizMode === 'simulacro' ? settingsService.getSettings().simulacroSettings.proratedTotal : 10;
                    const newRecord: ScoreRecord = {
                        score: finalScore,
                        total: proratedTotal,
                        date: new Date().toISOString(),
                        type: isFullAttempt ? 'full' : 'practice',
                        questionsAttempted: questions.length,
                        totalQuestionsInQuiz: item.questions.length,
                        correctCount,
                        failedCount: incorrectCount,
                        unansweredCount,
                    };
                    const newHistory = [newRecord, ...(item.scoreHistory || [])];
                    return { 
                        ...item, 
                        completionCount: isFullAttempt ? (item.completionCount || 0) + 1 : item.completionCount,
                        scoreHistory: newHistory.slice(0, 10) 
                    };
                }
                if (item.type === 'folder') return { ...item, children: updateInTree(item.children) };
                return item;
            });
            newActive.library = updateInTree(newActive.library);
        }

        const today = new Date();
        if (activeQuizType === 'weekly_challenge') newActive.lastWeeklyChallengeCompleted = `${today.getFullYear()}-${getISOWeek(today)}`;
        if (activeQuizType === 'monthly_challenge') newActive.lastMonthlyChallengeCompleted = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}`;
        
        const settings = settingsService.getSettings();
        const newSrsEntries = [...(newActive.failedQuestions || [])];
        
        questions.forEach((q, index) => {
            const answerCorrect = manualCorrections ? manualCorrections.get(index) === 'correct' : userAnswers.get(index)?.isCorrect;
            const wasAnswered = manualCorrections ? manualCorrections.has(index) && manualCorrections.get(index) !== 'unanswered' : userAnswers.has(index);
            const srsIndex = newSrsEntries.findIndex(e => e.question.id === q.id);

            if (wasAnswered && answerCorrect) {
                if (srsIndex > -1) {
                    const entry = { ...newSrsEntries[srsIndex] };
                    entry.srsLevel++;
                    if (entry.srsLevel >= settings.srsIntervals.length || entry.srsLevel >= settings.srsGraduationRequirement) {
                        newSrsEntries.splice(srsIndex, 1);
                    } else {
                        const nextReview = new Date();
                        nextReview.setDate(nextReview.getDate() + settings.srsIntervals[entry.srsLevel]);
                        entry.nextReviewDate = nextReview.toISOString().split('T')[0];
                        newSrsEntries[srsIndex] = entry;
                    }
                }
            } else if (wasAnswered && !answerCorrect) {
                if (srsIndex > -1) {
                    const entry = { ...newSrsEntries[srsIndex] };
                    entry.srsLevel = 0; entry.failureCount = (entry.failureCount || 1) + 1;
                    const nextReview = new Date();
                    nextReview.setDate(nextReview.getDate() + settings.srsIntervals[0]);
                    entry.nextReviewDate = nextReview.toISOString().split('T')[0];
                    if (entry.failureCount >= 3 && !questionToSuggestMnemonic) questionToSuggestMnemonic = q;
                    newSrsEntries[srsIndex] = entry;
                } else {
                    const nextReview = new Date();
                    nextReview.setDate(nextReview.getDate() + settings.srsIntervals[0]);
                    newSrsEntries.push({ question: q, srsLevel: 0, nextReviewDate: nextReview.toISOString().split('T')[0], failureCount: 1 });
                }
            }
        });
        
        return { ...newActive, failedQuestions: newSrsEntries };
    });

    return { newAppData, score: finalScore, questionToSuggestMnemonic };
};

export const filterLibraryData = (fullData: LibraryData, selectedItemIds: Set<string>, includeProgress: boolean): LibraryData => {
    const recurse = (items: LibraryItem[]): LibraryItem[] => {
        return items.reduce<LibraryItem[]>((acc, item) => {
            if (selectedItemIds.has(item.id)) {
                acc.push(item);
            } else if (item.type === 'folder') {
                const filteredChildren = recurse(item.children);
                if (filteredChildren.length > 0) {
                    acc.push({ ...item, children: filteredChildren });
                }
            }
            return acc;
        }, []);
    };
    
    const filteredLibrary = recurse(fullData.library);
    
    let data: LibraryData = {
      ...fullData,
      library: filteredLibrary
    };

    if (!includeProgress) {
      data = {
        ...data,
        failedQuestions: [],
        answeredQuestionIds: [],
        failedFlashcards: [],
        allTimeFailedQuestionIds: [],
        allTimeUnansweredQuestionIds: [],
      };
      const stripHistory = (items: LibraryItem[]): LibraryItem[] => items.map(item => {
        if (item.type === 'quiz') {
            const { scoreHistory, completionCount, ...rest } = item;
            return rest as SavedQuiz;
        }
        if(item.type === 'folder') {
            return { ...item, children: stripHistory(item.children) };
        }
        return item;
      });
      data.library = stripHistory(data.library);
    }
    
    return data;
};

const embedFileContentForExport = async (docLibrary: DocumentItem[]): Promise<DocumentItem[]> => {
    const newLibrary: DocumentItem[] = [];
    for (const item of docLibrary) {
        if (item.type === 'file') {
            const content = await getFileContent(item.id);
            if (content) {
                newLibrary.push({ ...item, base64Content: content } as StoredFileItem);
            } else {
                newLibrary.push(item);
            }
        } else if (item.type === 'folder') {
            newLibrary.push({ ...item, children: await embedFileContentForExport(item.children) });
        } else {
            newLibrary.push(item);
        }
    }
    return newLibrary;
};

export const prepareExportData = async (selectedIds: string[], includeProgress: boolean, includeDocuments: boolean, appData: AppData): Promise<LibraryData> => {
  const activeLib = appData.activeLibraryId ? appData.libraries[appData.activeLibraryId] : null;
  if (!activeLib) throw new Error("No hay una biblioteca activa.");

  let dataToExport = filterLibraryData(activeLib, new Set(selectedIds), includeProgress);

  if (!includeDocuments) {
    dataToExport.documentLibrary = [];
  } else if (dataToExport.documentLibrary && dataToExport.documentLibrary.length > 0) {
    dataToExport.documentLibrary = await embedFileContentForExport(dataToExport.documentLibrary);
  }
  
  return dataToExport;
};

const processImportedAssets = async (docLibrary: DocumentItem[]): Promise<DocumentItem[]> => {
    const newLibrary: DocumentItem[] = [];
    for (const item of docLibrary) {
        if (item.type === 'file' && 'base64Content' in item && item.base64Content) {
            await saveFileContent(item.id, item.base64Content);
            const { base64Content, ...rest } = item as StoredFileItem; // Cast to access base64Content
            newLibrary.push(rest);
        } else if (item.type === 'folder') {
            newLibrary.push({ ...item, children: await processImportedAssets(item.children) });
        } else {
            newLibrary.push(item);
        }
    }
    return newLibrary;
};

export const importAsNewLibrary = async (name: string, dataToImport: LibraryData, includeProgress: boolean, includeDocuments: boolean, appData: AppData): Promise<AppData> => {
    const newId = crypto.randomUUID();
    let newLibrary: LibraryData = {
        ...dataToImport,
        id: newId,
        name: name || dataToImport.name || `Biblioteca Importada`,
        createdAt: new Date().toISOString(),
    };

    if (includeDocuments && newLibrary.documentLibrary) {
        newLibrary.documentLibrary = await processImportedAssets(newLibrary.documentLibrary);
    } else {
        newLibrary.documentLibrary = [];
    }

    if (!includeProgress) {
        const allItemIds = new Set(flattenItems(newLibrary.library).map(i => i.id));
        const tempFilteredData = filterLibraryData({ ...newLibrary, library: newLibrary.library }, allItemIds, false);
        newLibrary = {
            ...newLibrary,
            failedQuestions: tempFilteredData.failedQuestions,
            answeredQuestionIds: tempFilteredData.answeredQuestionIds,
            failedFlashcards: tempFilteredData.failedFlashcards,
            allTimeFailedQuestionIds: tempFilteredData.allTimeFailedQuestionIds,
            allTimeUnansweredQuestionIds: tempFilteredData.allTimeUnansweredQuestionIds,
            library: tempFilteredData.library,
        };
    }
    
    const newAppData = { ...appData };
    newAppData.libraries[newLibrary.id] = newLibrary;
    newAppData.activeLibraryId = newLibrary.id;
    return newAppData;
};

export const importItemsIntoLibrary = async (targetLibraryId: string, importData: LibraryData, includeProgress: boolean, includeDocuments: boolean, appData: AppData): Promise<AppData> => {
    const newAppData = { ...appData, libraries: { ...appData.libraries } };
    let targetLibrary = newAppData.libraries[targetLibraryId];
    if (!targetLibrary) return appData;
    targetLibrary = { ...targetLibrary }; // Create a new object to modify

    if (includeDocuments && importData.documentLibrary) {
        const processedDocLibrary = await processImportedAssets(importData.documentLibrary);
        targetLibrary.documentLibrary = [...(processedDocLibrary || []), ...(targetLibrary.documentLibrary || [])];
    }
    
    targetLibrary.library = [...importData.library, ...targetLibrary.library];
    
    if (includeProgress) {
        targetLibrary.answeredQuestionIds = Array.from(new Set([...(targetLibrary.answeredQuestionIds || []), ...(importData.answeredQuestionIds || [])]));
        targetLibrary.allTimeFailedQuestionIds = Array.from(new Set([...(targetLibrary.allTimeFailedQuestionIds || []), ...(importData.allTimeFailedQuestionIds || [])]));
        targetLibrary.allTimeUnansweredQuestionIds = Array.from(new Set([...(targetLibrary.allTimeUnansweredQuestionIds || []), ...(importData.allTimeUnansweredQuestionIds || [])]));

        const srsMap = new Map((targetLibrary.failedQuestions || []).map(entry => [entry.question.id, entry]));
        (importData.failedQuestions || []).forEach(entry => {
            if (!srsMap.has(entry.question.id)) srsMap.set(entry.question.id, entry);
        });
        targetLibrary.failedQuestions = Array.from(srsMap.values());
        
        const flashcardMap = new Map((targetLibrary.failedFlashcards || []).map(card => [card.id, card]));
        (importData.failedFlashcards || []).forEach(card => {
            if (!flashcardMap.has(card.id)) flashcardMap.set(card.id, card);
        });
        targetLibrary.failedFlashcards = Array.from(flashcardMap.values());
    }

    newAppData.libraries[targetLibraryId] = targetLibrary;
    return newAppData;
};

export const splitLargeQuiz = (quiz: GeneratedQuiz): GeneratedQuiz[] => {
    const MAX_QUESTIONS_PER_QUIZ_IN_LIBRARY = 40;
    const chunks: GeneratedQuiz[] = [];
    for (let i = 0; i < quiz.questions.length; i += MAX_QUESTIONS_PER_QUIZ_IN_LIBRARY) {
        chunks.push({
            title: `${quiz.title} (Parte ${chunks.length + 1})`,
            questions: quiz.questions.slice(i, i + MAX_QUESTIONS_PER_QUIZ_IN_LIBRARY),
        });
    }
    return chunks;
};
export const sortLibraryItems = (items: LibraryItem[]): LibraryItem[] => {
    const sorted = [...items].sort((a, b) => {
        const nameA = (a.type === 'folder' ? a.name : a.title);
        const nameB = (b.type === 'folder' ? b.name : b.title);
        return nameA.localeCompare(nameB, 'es', { numeric: true, sensitivity: 'base' });
    });

    return sorted.map(item => {
        if (item.type === 'folder') {
            return { ...item, children: sortLibraryItems(item.children) };
        }
        return item;
    });
};
export const searchQuestions = (
    libraryData: LibraryData,
    filters: {
        query: string;
        searchIn: { question: boolean; options: boolean; explanation: boolean };
        status: { correct: boolean; failed: boolean; unanswered: boolean; srs: boolean };
        flags: QuestionFlag[];
        quizIds: string[];
    }
): QuizQuestion[] => {
    const { query, searchIn, status, flags, quizIds } = filters;
    const lowerCaseQuery = query.toLowerCase();

    const quizzesInScope = flattenQuizzes(libraryData.library).filter(q => quizIds.includes(q.id));
    const allQuestions = quizzesInScope.flatMap(q => q.questions.map(question => ({
        ...question,
        sourceQuizId: q.id,
        sourceQuizTitle: q.title
    })));

    const answeredIds = new Set(libraryData.answeredQuestionIds || []);
    const failedIds = new Set(libraryData.allTimeFailedQuestionIds || []);
    const srsIds = new Set((libraryData.failedQuestions || []).map(entry => entry.question.id));
    const unansweredIds = new Set(libraryData.allTimeUnansweredQuestionIds || []);

    const results = allQuestions.filter(q => {
        if (lowerCaseQuery) {
            const keywords = lowerCaseQuery.includes('::') 
                ? lowerCaseQuery.split('::').map(kw => kw.trim()).filter(Boolean)
                : [lowerCaseQuery];
            
            const textToSearch = `${searchIn.question ? q.question.toLowerCase() : ''} ${searchIn.options ? q.options.join(' ').toLowerCase() : ''} ${searchIn.explanation ? q.explanation.toLowerCase() : ''}`;

            const match = keywords.every(keyword => textToSearch.includes(keyword));
            
            if (!match) return false;
        }

        const statusFilterActive = status.correct || status.failed || status.unanswered || status.srs;
        if (statusFilterActive) {
            let statusMatch = false;
            if (status.failed && failedIds.has(q.id)) statusMatch = true;
            if (!statusMatch && status.srs && srsIds.has(q.id)) statusMatch = true;
            if (!statusMatch && status.unanswered && unansweredIds.has(q.id) && !failedIds.has(q.id)) statusMatch = true;
            if (!statusMatch && status.correct && answeredIds.has(q.id) && !failedIds.has(q.id) && !unansweredIds.has(q.id)) statusMatch = true;
            
            if (!statusMatch) return false;
        }

        if (flags.length > 0) {
            if (!q.flag || !flags.includes(q.flag)) return false;
        }

        return true;
    });

    return results;
};
