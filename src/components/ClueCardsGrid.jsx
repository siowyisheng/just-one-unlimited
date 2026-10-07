import React, { useEffect, useRef, useState } from 'react';

/** Same placeholder the guesser sees for peers' submitted clues during clue-giving. */
export const MASKED_CLUE_PLACEHOLDER = '******';

/**
 * Shared clue cards grid used by the filter review phase, end-of-round
 * results (victory / loss), and the clue-giving waiting view.
 * Matches filter styling for hidden & duplicate clues.
 *
 * Only truly hidden cards (manual hide or exact-duplicate) get faded /
 * strikethrough chrome plus a HIDDEN or DUPLICATE badge. Plain guesser-
 * masked `******` cards stay normal submitted chrome.
 *
 * Waiting rows may set `hideStatus: 'hidden' | 'duplicate'` (from real
 * submitted text + synced invalid_clues) so the guesser's masked cards
 * pick up the same live hide styling without revealing the clue word.
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
 * Pass `lockInPlayerKey` for a brief local "locks in" scale on submit.
 * Pass `staggerEnter` to fade/slide cards in with a light stagger on round start.
 *
 * Waiting-slot keys are stable per playerKey so submit / take-back morphs the
 * same card instead of remounting and re-firing round-enter.
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
  /** Player key whose card should play the brief submit lock-in scale. */
  lockInPlayerKey = null,
  /** Fade/slide cards in with ~40ms stagger (round start / phase enter). */
  staggerEnter = false,
}) {
  const ownEntryInputRef = useRef(null);
  // One-shot round-enter keys for this grid mount only — never re-added after
  // clear/lock-in, so submit/take-back cannot re-fire slide-in.
  const [enteringKeys, setEnteringKeys] = useState(() => new Set());
  const enterSeededRef = useRef(false);

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

  // Seed enter keys once when stagger is on and slots exist (round/phase mount).
  useEffect(() => {
    if (!staggerEnter || enterSeededRef.current) return undefined;
    if (!Array.isArray(clues) || clues.length === 0) return undefined;
    enterSeededRef.current = true;
    const keys = new Set(
      clues.map((c, idx) => c?.playerKey || `slot-${idx}`)
    );
    setEnteringKeys(keys);
    // Longest stagger (~40ms * n) + 280ms enter; clear with buffer.
    const timer = window.setTimeout(() => setEnteringKeys(new Set()), 700);
    return () => window.clearTimeout(timer);
  }, [staggerEnter, clues]);

  // Drop a slot from the enter set so removing another animation class cannot
  // restore `.round-enter-card` and restart slide-in (lock-in end / bonk end).
  const dropEnteringKey = (playerKey) => {
    if (!playerKey) return;
    setEnteringKeys((prev) => {
      if (!prev.has(playerKey)) return prev;
      const next = new Set(prev);
      next.delete(playerKey);
      return next;
    });
  };

  useEffect(() => {
    dropEnteringKey(lockInPlayerKey);
  }, [lockInPlayerKey]);

  // Bonk: while shake wins via CSS specificity, `.round-enter-card` may still be
  // on the node. When shake is removed, that animation property returns and
  // restarts slide-in — consume enter as soon as bonk starts.
  useEffect(() => {
    dropEnteringKey(bonkingPlayerKey);
  }, [bonkingPlayerKey]);

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

        // Waiting slots: stable per player so submit/take-back does not remount.
        // Filter/results: include clue text so distinct rows stay distinct.
        const slotKey = waitingDisplay
          ? c.playerKey || `slot-${idx}`
          : `${c.playerKey || 'p'}-${idx}-${displayClue}`;

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

        const isLockingIn =
          Boolean(lockInPlayerKey) &&
          Boolean(c?.playerKey) &&
          c.playerKey === lockInPlayerKey &&
          hasClueText;

        // Prefer row hideStatus (waiting/masked path from App) so ****** cards
        // can mirror synced hides without using the placeholder as the clue.
        const hideFromRow = c?.hideStatus === 'hidden' || c?.hideStatus === 'duplicate';
        const isExactDup = hideFromRow
          ? c.hideStatus === 'duplicate'
          : !waitingDisplay &&
            typeof isExactDuplicateClue === 'function' &&
            isExactDuplicateClue(c.clue, clues);
        const norm =
          !waitingDisplay &&
          !hideFromRow &&
          typeof normalizeClue === 'function' &&
          c?.clue
            ? normalizeClue(c.clue)
            : '';
        const isManuallyHidden = hideFromRow
          ? c.hideStatus === 'hidden'
          : !waitingDisplay && Boolean(norm) && invalidClues.includes(norm) && !isExactDup;
        const isInvisible = isExactDup || isManuallyHidden;
        // Masked `******` alone is not hidden — only manual hide / exact-dup are.
        const showHiddenVisual = isInvisible;
        const canToggle =
          interactive &&
          !waitingDisplay &&
          !isExactDup &&
          !isGuesser &&
          typeof onToggleClue === 'function';

        // Own waiting card: amber/orange self treatment (PLAYERS-row style, no "(You)").
        const ownChrome =
          'bg-amber-500/10 border-amber-500/30 shadow-md';

        const submittedChrome = 'bg-slate-700/70 border-slate-600/80 shadow-md';
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
                    ? `${submittedChrome} cursor-pointer hover:border-slate-500`
                    : `${submittedChrome} ${canToggle ? 'hover:border-sky-400/60 cursor-pointer' : 'cursor-default'}`;

        // Enter only while this slot is in the one-shot set (round start).
        // Never combine with bonk/lock-in — overlapping animation properties
        // restart slide-in when shake/lock-in class is removed.
        const showEnter =
          enteringKeys.has(slotKey) && !isCardBonking && !isLockingIn;
        const enterClass = showEnter ? ' round-enter-card' : '';
        const cardClass = `clue-card-chrome p-3.5 rounded-xl text-center border select-none relative ${baseChrome}${
          isCardBonking ? ' clue-card-bonk-shake' : ''
        }${isLockingIn ? ' clue-lock-in' : ''}${enterClass}`;

        const enterStyle = showEnter
          ? { '--enter-delay': `${idx * 40}ms` }
          : undefined;

        const byline = (
          <p className="text-xs italic text-slate-400 mt-1">
            by {getPlayerName(c.playerKey, c.username)}
          </p>
        );

        const statusBadge = isManuallyHidden ? (
          <span className="absolute top-2 right-2 text-[9px] font-extrabold bg-rose-500/20 text-rose-300 border border-rose-500/40 px-1.5 py-0.5 rounded uppercase tracking-wider">
            HIDDEN
          </span>
        ) : isExactDup ? (
          <span className="absolute top-2 right-2 text-[9px] font-extrabold bg-slate-500/20 text-slate-300 border border-slate-500/40 px-1.5 py-0.5 rounded uppercase tracking-wider">
            DUPLICATE
          </span>
        ) : null;

        const clueText = (
          <p
            className={`${clueWordClass} clue-word-hideable ${showHiddenVisual ? 'is-hidden' : ''} ${
              showTyping || (waitingDisplay && !hasClueText) || isOwnEntryCard
                ? 'min-h-[2rem] flex items-center justify-center'
                : ''
            }`}
            {...(isInvisible
              ? {
                  'aria-label': isExactDup
                    ? 'Duplicate clue'
                    : 'Hidden clue',
                }
              : {})}
          >
            {isOwnEntryCard ? (
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
            ) : showTyping ? (
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
        );

        // Waiting: always the same element type + stable key so submit / take-back
        // / bonk mode swaps reconcile in place (no remount → no re-entrance).
        if (waitingDisplay) {
          const waitingProps = isOwnEntryCard
            ? {
                role: 'group',
                'aria-label': 'Enter your clue',
                title: 'Enter your clue',
                onClick: () => ownEntryInputRef.current?.focus(),
              }
            : isTakeBackCard
              ? {
                  role: 'button',
                  tabIndex: 0,
                  'aria-label': 'Change clue',
                  title: 'Change clue',
                  onClick: onTakeBack,
                  onKeyDown: (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onTakeBack?.();
                    }
                  },
                }
              : isBonkCard
                ? {
                    role: 'button',
                    tabIndex: 0,
                    'aria-label': `Bonk ${getPlayerName(c.playerKey, c.username)}`,
                    title: 'Bonk',
                    onClick: () => onBonk(c.playerKey),
                    onKeyDown: (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onBonk?.(c.playerKey);
                      }
                    },
                  }
                : {};

          return (
            <div
              key={slotKey}
              className={`${cardClass} w-full`}
              style={enterStyle}
              {...waitingProps}
            >
              {statusBadge}
              {clueText}
              {byline}
            </div>
          );
        }

        // Filter / results path (non-waiting): unchanged interactive div cards.
        return (
          <div
            key={slotKey}
            onClick={canToggle ? () => onToggleClue(c.clue) : undefined}
            className={cardClass}
            style={enterStyle}
          >
            {statusBadge}
            {clueText}
            {byline}
          </div>
        );
      })}
    </div>
  );
}
