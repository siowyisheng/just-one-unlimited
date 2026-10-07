import React from 'react';

/**
 * Shared clue cards grid used by the filter review phase, end-of-round
 * results (victory / loss), and the clue-giving waiting view.
 * Matches filter styling for hidden & duplicate clues.
 *
 * Set `waitingDisplay` during clue-giving so empty / masked text
 * (`''`, `******`) is not treated as duplicates or hideable, and so slots
 * still render when the clue string is empty. Pass `isTyping` on a clue
 * row to show the bouncing-dots indicator in the clue text area.
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
  waitingDisplay = false,
  /** When set, that player's card is clickable to take back / change their clue. */
  takeBackPlayerKey = null,
  onTakeBack = null,
}) {
  if (!Array.isArray(clues) || clues.length === 0) return null;

  const canTakeBack =
    Boolean(takeBackPlayerKey) && typeof onTakeBack === 'function';

  return (
    <div className="grid grid-cols-2 gap-3 w-full">
      {clues.map((c, idx) => {
        // Filter/results: skip rows with no clue text.
        // Waiting: always paint a slot (blank if empty) so the grid never
        // collapses when presence/submit state is still catching up.
        const hasClueText = Boolean(c?.clue);
        const displayClue = hasClueText ? c.clue : waitingDisplay ? '' : null;
        if (displayClue === null) return null;

        const showTyping =
          waitingDisplay && !hasClueText && Boolean(c?.isTyping);

        const isTakeBackCard =
          canTakeBack && c.playerKey && c.playerKey === takeBackPlayerKey;

        const isExactDup =
          !waitingDisplay &&
          typeof isExactDuplicateClue === 'function' &&
          isExactDuplicateClue(c.clue, clues);
        const norm =
          !waitingDisplay && typeof normalizeClue === 'function' && c?.clue
            ? normalizeClue(c.clue)
            : '';
        const isManuallyHidden =
          !waitingDisplay && Boolean(norm) && invalidClues.includes(norm) && !isExactDup;
        const isInvisible = isExactDup || isManuallyHidden;
        const canToggle =
          interactive &&
          !waitingDisplay &&
          !isExactDup &&
          !isGuesser &&
          typeof onToggleClue === 'function';

        const baseChrome = isExactDup
          ? `opacity-50 bg-slate-900/60 border-slate-800 scale-[0.96] ${interactive ? 'cursor-not-allowed' : 'cursor-default'}`
          : isManuallyHidden
            ? `opacity-50 bg-slate-800/40 border-slate-700/50 scale-[0.97] ${canToggle ? 'cursor-pointer hover:border-sky-400/40' : 'cursor-default'}`
            : isTakeBackCard
              ? 'bg-slate-700/70 border-slate-600/80 shadow-md hover:border-rose-400/70 cursor-pointer'
              : `bg-slate-700/70 border-slate-600/80 shadow-md ${canToggle ? 'hover:border-sky-400/60 cursor-pointer' : 'cursor-default'}`;

        const cardBody = (
          <>
            {isManuallyHidden ? (
              <span className="absolute top-2 right-2 text-[9px] font-extrabold bg-rose-500/20 text-rose-300 border border-rose-500/40 px-1.5 py-0.5 rounded uppercase tracking-wider">
                HIDDEN
              </span>
            ) : null}

            <p
              className={`${clueWordClass} ${isInvisible ? 'line-through opacity-40' : ''} ${
                showTyping || (waitingDisplay && !hasClueText)
                  ? 'min-h-[2rem] flex items-center justify-center'
                  : ''
              }`}
            >
              {showTyping ? (
                <span
                  className="typing-indicator"
                  aria-label="typing"
                  title="Typing"
                >
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </span>
              ) : (
                displayClue
              )}
            </p>
            <p className="text-xs italic text-slate-400 mt-1">
              by {getPlayerName(c.playerKey, c.username)}
            </p>
          </>
        );

        if (isTakeBackCard) {
          return (
            <button
              key={`${c.playerKey || 'p'}-${idx}-${displayClue}`}
              type="button"
              onClick={onTakeBack}
              aria-label="Change clue"
              title="Change clue"
              className={`p-3.5 rounded-xl text-center border transition-[border-color] select-none relative w-full ${baseChrome}`}
            >
              {cardBody}
            </button>
          );
        }

        return (
          <div
            key={`${c.playerKey || 'p'}-${idx}-${displayClue}`}
            onClick={canToggle ? () => onToggleClue(c.clue) : undefined}
            className={`p-3.5 rounded-xl text-center border transition-[border-color] select-none relative ${baseChrome}`}
          >
            {cardBody}
          </div>
        );
      })}
    </div>
  );
}
