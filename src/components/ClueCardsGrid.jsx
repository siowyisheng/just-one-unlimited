import React, { useEffect, useRef } from 'react';

/**
 * Shared clue cards grid used by the filter review phase, end-of-round
 * results (victory / loss), and the clue-giving waiting view.
 * Matches filter styling for hidden & duplicate clues.
 *
 * Set `waitingDisplay` during clue-giving so empty / masked text
 * (`''`, `******`) is not treated as duplicates or hideable, and so slots
 * still render when the clue string is empty. Pass `isTyping` on a clue
 * row to show the bouncing-dots indicator in the clue text area.
 *
 * Empty waiting slots can call `onBonk(playerKey)` ("bonk" the clue giver).
 * Submitted cards (masked or own) do not bonk; own take-back stays take-back.
 * The clue giver's own empty card is inline entry (not bonk).
 * Pass `bonkingPlayerKey` to play the shared rotating card-shake animation.
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
  /** Clue-giving: mark this player's card as "yours" (amber chrome, no "(You)"). */
  ownPlayerKey = null,
  /** Draft text for the own empty entry card. */
  clueDraft = '',
  onClueDraftChange = null,
  /** Submit path for Enter / blur on the own empty entry card. */
  onClueDraftSubmit = null,
  /** Clue-giving: click an empty slot to hurry that giver (bonk). */
  onBonk = null,
  /** Player key whose CLUE card is currently playing the bonk shake. */
  bonkingPlayerKey = null,
}) {
  const ownEntryInputRef = useRef(null);

  const canTakeBack =
    Boolean(takeBackPlayerKey) && typeof onTakeBack === 'function';
  const canBonk = waitingDisplay && typeof onBonk === 'function';
  const canOwnEntry =
    waitingDisplay &&
    Boolean(ownPlayerKey) &&
    typeof onClueDraftSubmit === 'function';

  // Own empty card is showing (vs submitted take-back card). Used to focus the
  // input when take-back clears the clue and re-enters edit mode.
  const showOwnEntry =
    canOwnEntry &&
    Array.isArray(clues) &&
    clues.some(
      (c) =>
        Boolean(c?.playerKey) &&
        c.playerKey === ownPlayerKey &&
        !c?.clue
    );

  useEffect(() => {
    if (!showOwnEntry) return;
    const frame = window.requestAnimationFrame(() => {
      ownEntryInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [showOwnEntry]);

  if (!Array.isArray(clues) || clues.length === 0) return null;

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

        const isOwnCard =
          Boolean(ownPlayerKey) && Boolean(c?.playerKey) && c.playerKey === ownPlayerKey;

        const isTakeBackCard =
          canTakeBack && c.playerKey && c.playerKey === takeBackPlayerKey;

        // Own empty card: inline clue entry (not bonk).
        const isOwnEntryCard =
          canOwnEntry && isOwnCard && !hasClueText && !isTakeBackCard;

        // Only empty waiting slots bonk — not masked ******, own entry, or take-back.
        const isBonkCard =
          canBonk &&
          !hasClueText &&
          !isTakeBackCard &&
          !isOwnEntryCard &&
          Boolean(c?.playerKey);

        const isCardBonking =
          Boolean(bonkingPlayerKey) &&
          Boolean(c?.playerKey) &&
          c.playerKey === bonkingPlayerKey;

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

        // Own waiting card: amber/orange self treatment (PLAYERS-row style, no "(You)").
        const ownChrome =
          'bg-amber-500/10 border-amber-500/30 shadow-md';

        const baseChrome = isExactDup
          ? `opacity-50 bg-slate-900/60 border-slate-800 scale-[0.96] ${interactive ? 'cursor-not-allowed' : 'cursor-default'}`
          : isManuallyHidden
            ? `opacity-50 bg-slate-800/40 border-slate-700/50 scale-[0.97] ${canToggle ? 'cursor-pointer hover:border-sky-400/40' : 'cursor-default'}`
            : isTakeBackCard
              ? `${ownChrome} hover:border-rose-400/70 cursor-pointer`
              : isOwnEntryCard
                ? `${ownChrome} cursor-text hover:border-amber-400/80`
                : isOwnCard && waitingDisplay
                  ? `${ownChrome} cursor-default`
                  : isBonkCard
                    ? 'bg-slate-700/70 border-slate-600/80 shadow-md cursor-pointer hover:border-slate-500'
                    : `bg-slate-700/70 border-slate-600/80 shadow-md ${canToggle ? 'hover:border-sky-400/60 cursor-pointer' : 'cursor-default'}`;

        const cardClass = `p-3.5 rounded-xl text-center border transition-[border-color] select-none relative ${baseChrome}${
          isCardBonking ? ' clue-card-bonk-shake' : ''
        }`;

        const byline = (
          <p className="text-xs italic text-slate-400 mt-1">
            by {getPlayerName(c.playerKey, c.username)}
          </p>
        );

        if (isOwnEntryCard) {
          return (
            <div
              key={`${c.playerKey || 'p'}-${idx}-entry`}
              role="group"
              aria-label="Enter your clue"
              title="Enter your clue"
              onClick={() => ownEntryInputRef.current?.focus()}
              className={`${cardClass} w-full`}
            >
              <input
                ref={ownEntryInputRef}
                type="text"
                value={clueDraft}
                onChange={(e) => {
                  if (typeof onClueDraftChange !== 'function') return;
                  const next = e.target.value.replace(/\s+/g, '').toUpperCase();
                  onClueDraftChange(next);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onClueDraftSubmit();
                  }
                }}
                onBlur={() => {
                  // Defer so a click on card chrome (byline/padding) can refocus
                  // without treating that as "left the field → submit".
                  window.requestAnimationFrame(() => {
                    if (document.activeElement === ownEntryInputRef.current) return;
                    onClueDraftSubmit();
                  });
                }}
                onClick={(e) => e.stopPropagation()}
                className={`${clueWordClass} w-full min-h-[2rem] bg-transparent border-0 text-center focus:outline-none placeholder:text-slate-500 placeholder:font-normal`}
                placeholder=""
                aria-label="Your clue"
                autoComplete="off"
                spellCheck={false}
              />
              {byline}
            </div>
          );
        }

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
            {byline}
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
              className={`${cardClass} w-full`}
            >
              {cardBody}
            </button>
          );
        }

        if (isBonkCard) {
          return (
            <button
              key={`${c.playerKey || 'p'}-${idx}-${displayClue}`}
              type="button"
              onClick={() => onBonk(c.playerKey)}
              aria-label={`Bonk ${getPlayerName(c.playerKey, c.username)}`}
              title="Bonk"
              className={`${cardClass} w-full`}
            >
              {cardBody}
            </button>
          );
        }

        return (
          <div
            key={`${c.playerKey || 'p'}-${idx}-${displayClue}`}
            onClick={canToggle ? () => onToggleClue(c.clue) : undefined}
            className={cardClass}
          >
            {cardBody}
          </div>
        );
      })}
    </div>
  );
}
