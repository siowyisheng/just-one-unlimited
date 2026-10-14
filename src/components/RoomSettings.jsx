import React, { useEffect, useId, useRef, useState } from 'react';
import { GUESS_TIMER_OPTIONS, TIMER_VOTE_SECONDS, timerVoteTarget } from '../guessTimer';
import { getServerNowMs } from '../supabaseClient';

function GearIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function ArrowRightIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
    </svg>
  );
}

function CheckIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function CrossIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function InfinityIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4Zm0 0c2 2.67 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.33-6 4Z" />
    </svg>
  );
}

function TimerFace({ value, className = '' }) {
  if (value === 'infinity') {
    return <InfinityIcon className={className || 'w-5 h-5'} />;
  }
  return <span className={className}>{value}s</span>;
}

function voteSecondsLeft(startedAt) {
  const startedMs = Date.parse(startedAt || '');
  if (!Number.isFinite(startedMs)) return TIMER_VOTE_SECONDS;
  const elapsed = (getServerNowMs() - startedMs) / 1000;
  return Math.max(0, Math.ceil(TIMER_VOTE_SECONDS - elapsed));
}

const TIMER_ROWS = [
  { target: 'guess', label: 'Guess Timer' },
  { target: 'clue', label: 'Clue Timer' },
];

function timerAria(label, value) {
  const name = label.toLowerCase();
  return value === 'infinity' ? `${name}, no limit` : `${name}, ${value} seconds`;
}

export default function RoomSettings({
  guessTimer,
  clueTimer,
  timerVote,
  onlinePlayers,
  myPlayerKey,
  getPlayerName,
  onPropose,
  onCastVote,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [optionsFor, setOptionsFor] = useState(null);
  const [voteSeconds, setVoteSeconds] = useState(TIMER_VOTE_SECONDS);
  const [closedForVoteId, setClosedForVoteId] = useState(null);
  const menuRef = useRef(null);
  const titleId = useId();
  const voteOpen = Boolean(timerVote);
  const votePassed = timerVote?.status === 'passed';

  if (timerVote && closedForVoteId !== timerVote.id) {
    setClosedForVoteId(timerVote.id);
    setMenuOpen(false);
    setOptionsFor(null);
  }

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointerDown = (event) => {
      if (menuRef.current?.contains(event.target)) return;
      setMenuOpen(false);
      setOptionsFor(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [menuOpen]);

  useEffect(() => {
    if (!timerVote || timerVote.status !== 'open') return undefined;
    const tick = () => setVoteSeconds(voteSecondsLeft(timerVote.startedAt));
    tick();
    const interval = window.setInterval(tick, 200);
    return () => window.clearInterval(interval);
  }, [timerVote]);

  const votedPlayers = () => {
    const votes = timerVote?.votes || {};
    const shown = [];
    const seen = new Set();
    (onlinePlayers || []).forEach((player) => {
      const choice = votes[player.key];
      if (choice !== 'for' && choice !== 'against') return;
      shown.push({ key: player.key, name: player.username, choice });
      seen.add(player.key);
    });
    Object.entries(votes).forEach(([key, choice]) => {
      if (seen.has(key) || (choice !== 'for' && choice !== 'against')) return;
      const name = key === timerVote?.proposerKey
        ? timerVote.proposerName
        : getPlayerName(key);
      shown.push({ key, name, choice });
    });
    return shown;
  };

  const myVote = timerVote?.votes?.[myPlayerKey];

  return (
    <>
      <div ref={menuRef} className="fixed top-4 right-4 z-40">
        <button
          type="button"
          aria-label="Settings"
          aria-expanded={menuOpen}
          title="Settings"
          onClick={() => {
            setMenuOpen((open) => {
              if (open) setOptionsFor(null);
              return !open;
            });
          }}
          className="inline-flex items-center justify-center w-10 h-10 rounded-xl border border-slate-600/80 bg-slate-800/90 text-slate-300 hover:text-slate-100 hover:border-slate-500 hover:bg-slate-700 shadow-lg backdrop-blur-sm transition-colors cursor-pointer"
        >
          <GearIcon />
        </button>

        {menuOpen && (
          <div className="absolute right-0 mt-2 w-60 rounded-xl border border-slate-700 bg-slate-800 p-3 shadow-2xl text-left flex flex-col gap-3">
            {TIMER_ROWS.map((row) => {
              const value = row.target === 'clue' ? clueTimer : guessTimer;
              const open = optionsFor === row.target;
              return (
                <div key={row.target}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-slate-200">{row.label}</span>
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-label={timerAria(row.label, value)}
                      onClick={() => setOptionsFor((current) => (current === row.target ? null : row.target))}
                      className="inline-flex items-center justify-center min-w-12 px-2 py-1 rounded-lg bg-slate-900 border border-slate-600 text-sm font-bold text-amber-300 hover:border-amber-400/70 transition-colors cursor-pointer"
                    >
                      <TimerFace value={value} className={value === 'infinity' ? 'w-5 h-5' : ''} />
                    </button>
                  </div>
                  {open && (
                    <div className="mt-2 flex flex-col gap-1" role="listbox" aria-label={`${row.label} options`}>
                      {GUESS_TIMER_OPTIONS.map((option) => {
                        const current = option === value;
                        const disabled = current || voteOpen;
                        return (
                          <button
                            key={String(option)}
                            type="button"
                            role="option"
                            aria-selected={current}
                            aria-label={option === 'infinity' ? 'No limit' : `${option} seconds`}
                            disabled={disabled}
                            onClick={() => {
                              if (disabled) return;
                              setOptionsFor(null);
                              setMenuOpen(false);
                              onPropose(row.target, option);
                            }}
                            className={`inline-flex items-center justify-center px-2 py-1.5 rounded-lg text-sm font-bold transition-colors ${
                              current
                                ? 'bg-slate-900 text-amber-300 border border-amber-500/40 cursor-default'
                                : disabled
                                  ? 'text-slate-500 cursor-not-allowed'
                                  : 'text-slate-200 hover:bg-slate-700 cursor-pointer'
                            }`}
                          >
                            <TimerFace value={option} className={option === 'infinity' ? 'w-5 h-5' : ''} />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {timerVote && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 p-4" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-2xl text-center"
          >
            <h2 id={titleId} className="text-xl font-bold text-slate-100">
              {votePassed ? 'Changed' : 'Vote'}
            </h2>
            <p className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm text-slate-300">
              <span>{timerVoteTarget(timerVote) === 'clue' ? 'Clue Timer' : 'Guess Timer'}</span>
              <span className="inline-flex items-center font-bold text-slate-100">
                <TimerFace value={timerVote.from} className={timerVote.from === 'infinity' ? 'w-5 h-5' : ''} />
              </span>
              <ArrowRightIcon className="w-4 h-4 text-slate-400" />
              <span className="inline-flex items-center font-bold text-amber-300">
                <TimerFace value={timerVote.to} className={timerVote.to === 'infinity' ? 'w-5 h-5' : ''} />
              </span>
            </p>
            <p className="mt-2 text-sm text-slate-400">
              by {timerVote.proposerName}
            </p>

            {votePassed ? (
              <ul className="mt-5 flex flex-col gap-2 text-left">
                {votedPlayers().map((player) => (
                  <li key={player.key} className="flex items-center gap-2 text-sm text-slate-200">
                    {player.choice === 'for' ? (
                      <CheckIcon className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <CrossIcon className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                    <span className="truncate">{player.name}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <>
                <div className="mt-5 flex items-center justify-center gap-4">
                  <button
                    type="button"
                    aria-label="Vote for"
                    aria-pressed={myVote === 'for'}
                    onClick={() => onCastVote('for')}
                    className={`inline-flex items-center justify-center w-12 h-12 rounded-full border transition-colors cursor-pointer ${
                      myVote === 'for'
                        ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                        : 'bg-slate-900 border-slate-600 text-slate-300 hover:border-emerald-400/70 hover:text-emerald-300'
                    }`}
                  >
                    <CheckIcon />
                  </button>
                  <button
                    type="button"
                    aria-label="Vote against"
                    aria-pressed={myVote === 'against'}
                    onClick={() => onCastVote('against')}
                    className={`inline-flex items-center justify-center w-12 h-12 rounded-full border transition-colors cursor-pointer ${
                      myVote === 'against'
                        ? 'bg-rose-500/20 border-rose-400 text-rose-300'
                        : 'bg-slate-900 border-slate-600 text-slate-300 hover:border-rose-400/70 hover:text-rose-300'
                    }`}
                  >
                    <CrossIcon />
                  </button>
                </div>
                <p
                  className="mt-4 text-xs tabular-nums text-slate-500"
                  role="timer"
                  aria-label={`${voteSeconds} seconds remaining`}
                >
                  {voteSeconds}s
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
