import React, { useState } from 'react';
import { TrophyIcon, SparklesIcon, ArrowPathIcon } from './Icons.tsx';

interface ChallengeConfiguratorProps {
  challengeType: 'weekly' | 'monthly';
  defaultQuestionCount: number;
  maxQuestions: number;
  onStart: (questionCount: number) => void;
  onCancel: () => void;
}

const ChallengeConfigurator: React.FC<ChallengeConfiguratorProps> = ({ challengeType, defaultQuestionCount, maxQuestions, onStart, onCancel }) => {
  const [questionCount, setQuestionCount] = useState(Math.min(defaultQuestionCount, maxQuestions));
  const title = challengeType === 'weekly' ? 'Reto Semanal' : 'Reto Mensual';
  const iconColor = challengeType === 'weekly' ? 'text-amber-500' : 'text-indigo-500';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (questionCount > 0 && questionCount <= maxQuestions) {
        onStart(questionCount);
    }
  };

  return (
    <div className="animate-fade-in w-full max-w-lg mx-auto">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-3">
          <TrophyIcon className={`h-8 w-8 ${iconColor}`} />
          {title}
        </h2>
        <button
          onClick={onCancel}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-slate-300 dark:border-slate-600 text-sm font-bold rounded-md text-slate-600 dark:text-slate-300 bg-white/50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
        >
          <ArrowPathIcon className="h-5 w-5" />
          Volver
        </button>
      </div>

      <div className="bg-white/50 dark:bg-slate-800/50 p-6 rounded-lg border border-slate-200 dark:border-slate-700 mb-8">
        <p className="text-sm text-slate-500 dark:text-slate-400">
            Estás a punto de empezar tu reto. Demuestra lo que sabes con una selección aleatoria de preguntas de toda tu biblioteca.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="question-count" className="block text-lg font-semibold text-slate-700 dark:text-slate-300 mb-3">
            ¿Cuántas preguntas quieres en tu reto?
          </label>
          <input
            id="question-count"
            type="number"
            min="1"
            max={maxQuestions}
            value={questionCount}
            onChange={e => setQuestionCount(Number(e.target.value))}
            className="w-48 p-3 bg-white dark:bg-slate-700 border font-sans border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-lime-500 text-slate-900 dark:text-slate-100"
            autoFocus
          />
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Máximo: {maxQuestions} preguntas disponibles.</p>
        </div>

        <div className="flex justify-end gap-4 pt-6">
          <button
            type="submit"
            disabled={questionCount <= 0 || questionCount > maxQuestions}
            className="inline-flex items-center gap-2 px-6 py-3 border border-transparent text-base font-bold rounded-md shadow-lg shadow-lime-500/30 text-white bg-lime-600 hover:bg-lime-700 disabled:bg-slate-400 disabled:shadow-none"
          >
            <SparklesIcon className="h-5 w-5" />
            Empezar Reto
          </button>
        </div>
      </form>
    </div>
  );
};

export default ChallengeConfigurator;