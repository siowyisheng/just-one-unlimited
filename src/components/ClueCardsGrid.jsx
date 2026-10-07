import React from 'react';

/**
 * Shared clue cards grid used by the filter review phase and end-of-round
 * results (victory / loss). Matches filter styling for hidden & duplicate clues.
 */
export default function ClueCardsGrid({
  clues,
  invalidClues = [],
  normalizeClue,
  isExactDuplicateClue,
  getPlayerName,
  clueWordClass,
  interactive = false,
  isGuesser = false,
  onToggleClue,
}) {
  if (!Array.isArray(clues) || clues.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3 w-full">
      {clues.map((c, idx) => {
        if (!c?.clue) return null;
        const norm = normalizeClue(c.clue);
        const isExactDup = isExactDuplicateClue(c.clue, clues);
        const isManuallyHidden = invalidClues.includes(norm) && !isExactDup;
        const isInvisible = isExactDup || isManuallyHidden;
        const canToggle = interactive && !isExactDup && !isGuesser && typeof onToggleClue === 'function';

        return (
          <div
            key={`${c.playerKey || 'p'}-${idx}-${c.clue}`}
            onClick={canToggle ? () => onToggleClue(c.clue) : undefined}
            className={`p-3.5 rounded-xl text-center border transition-[border-color] select-none relative ${
              isExactDup
                ? `opacity-50 bg-slate-900/60 border-slate-800 scale-[0.96] ${interactive ? 'cursor-not-allowed' : 'cursor-default'}`
                : isManuallyHidden
                  ? `opacity-50 bg-slate-800/40 border-slate-700/50 scale-[0.97] ${canToggle ? 'cursor-pointer hover:border-sky-400/40' : 'cursor-default'}`
                  : `bg-slate-700/70 border-slate-600/80 shadow-md ${canToggle ? 'hover:border-sky-400/60 cursor-pointer' : 'cursor-default'}`
            }`}
          >
            {isManuallyHidden ? (
              <span className="absolute top-2 right-2 text-[9px] font-extrabold bg-rose-500/20 text-rose-300 border border-rose-500/40 px-1.5 py-0.5 rounded uppercase tracking-wider">
                HIDDEN
              </span>
            ) : null}

            <p className={`${clueWordClass} ${isInvisible ? 'line-through opacity-40' : ''}`}>
              {c.clue}
            </p>
            <p className="text-xs italic text-slate-400 mt-1">
              by {getPlayerName(c.playerKey, c.username)}
            </p>
          </div>
        );
      })}
    </div>
  );
}
