import React, { useState, useEffect, useRef } from 'react';
import {
  supabase,
  measureServerTimeOffset,
  getServerNowMs,
  getServerNowIso,
} from './supabaseClient';

import WordSubmissionWidget from './components/WordSubmissionWidget';
import ClueCardsGrid from './components/ClueCardsGrid';

// Lightweight native Web Audio victory sound synth
const playVictorySound = () => {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    // Notes for a short, upbeat victory arpeggio: C5 -> E5 -> G5 -> C6
    const notes = [523.25, 659.25, 783.99, 1046.5];
    const startTime = ctx.currentTime;

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime + idx * 0.1);

      gain.gain.setValueAtTime(0.3, startTime + idx * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + idx * 0.1 + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime + idx * 0.1);
      osc.stop(startTime + idx * 0.1 + 0.25);
    });
  } catch (err) {
    console.error('Audio playback error:', err);
  }
};

const normalizeKeyword = (value) => String(value ?? '').trim().replace(/\s+/g, '').toUpperCase();

const keywordText = (item) => (typeof item === 'object' && item !== null ? item.text : item);

// Shared guesser/word pick used by startNextRound and skip-keyword.
// playerList order matters: first candidate with a non-empty eligible pool wins.
const pickGuesserAndWord = (availableWords, playerList, counts = {}) => {
  if (!availableWords?.length || !playerList?.length) {
    return { kind: 'game_over' };
  }

  let chosenGuesser = null;
  let validWordPool = [];

  for (let i = 0; i < playerList.length; i++) {
    const candidate = playerList[i];
    const pool = availableWords.filter(
      (w) => typeof w === 'object' && w.authorId !== candidate.key
    );

    if (pool.length > 0) {
      chosenGuesser = candidate;
      validWordPool = pool;
      break;
    }
  }

  if (!chosenGuesser || validWordPool.length === 0) {
    return { kind: 'game_over' };
  }

  const weightedPool = validWordPool.map((word) => {
    const authorId = typeof word === 'object' ? word.authorId : 'unknown';
    const timesChosen = counts[authorId] || 0;
    const weight = 1 / (timesChosen + 1);
    return { word, weight };
  });

  const totalWeight = weightedPool.reduce((sum, item) => sum + item.weight, 0);
  let randomValue = Math.random() * totalWeight;
  let selectedWord = validWordPool[0];

  for (const item of weightedPool) {
    if (randomValue < item.weight) {
      selectedWord = item.word;
      break;
    }
    randomValue -= item.weight;
  }

  const authorId = typeof selectedWord === 'object' ? selectedWord.authorId : null;
  const updatedCounts = { ...counts };
  if (authorId) {
    updatedCounts[authorId] = (updatedCounts[authorId] || 0) + 1;
  }

  const updatedWordList = availableWords.filter((w) => w !== selectedWord);

  return {
    kind: 'round',
    chosenGuesser,
    selectedWord,
    updatedCounts,
    updatedWordList,
  };
};

const generateRandomUsername = () => {
  const randomId = Math.floor(1000 + Math.random() * 9000);
  return `Player_${randomId}`;
};

const getPersistentClientId = () => {
  let clientId = localStorage.getItem('just_one_client_id');
  if (!clientId) {
    clientId = 'client_' + Math.random().toString(36).substring(2, 11);
    localStorage.setItem('just_one_client_id', clientId);
  }
  return clientId;
};

const getInitialUsername = () => {
  const savedName = localStorage.getItem('just_one_username');
  if (savedName) return savedName;

  const newName = generateRandomUsername();
  localStorage.setItem('just_one_username', newName);
  return newName;
};

// Earliest join → latest join; tie-break by stable presence key (CLIENT_ID).
const sortPlayersByJoinOrder = (players) =>
  [...players].sort((a, b) => {
    const aJoin = Number.isFinite(a.joinedAt) ? a.joinedAt : Number.POSITIVE_INFINITY;
    const bJoin = Number.isFinite(b.joinedAt) ? b.joinedAt : Number.POSITIVE_INFINITY;
    if (aJoin !== bJoin) return aJoin - bJoin;
    return String(a.key).localeCompare(String(b.key));
  });

const CLIENT_ID = getPersistentClientId();
const CLUE_GLOW_MS = 1000;
const TYPING_IDLE_MS = 1000;
const WIN_PHRASES = [
  'NAILED IT!',
  'BIG BRAIN!',
  'TOO EASY!',
  'CHEF\'S KISS!',
  'CRUSHED IT!',
];
const LOSS_PHRASES = [
  'OOF!',
  'NOT TODAY!',
  'SWING AND A MISS!',
  'TOUGH BREAK!',
  'BIG WHIFF!',
];

// Guessing-phase hard limit: UI counts 30→0; authoritative loss at 31s (1s leeway).
const GUESS_COUNTDOWN_SECONDS = 30;
const GUESS_TIMEOUT_SECONDS = 31;

// Clue-review: delay before READY FOR GUESSER is clickable (client-local).
const READY_FOR_GUESSER_DELAY_SECONDS = 3;

const guesserTurnStartedAtOf = (word) =>
  typeof word === 'object' && word && typeof word.guesserTurnStartedAt === 'string'
    ? word.guesserTurnStartedAt
    : null;

const isGuessRoundTimedOut = (word) =>
  Boolean(typeof word === 'object' && word && word.timedOut);

export default function GameRoom() {
  const [sessionId, setSessionId] = useState(null);
  const [wordList, setWordList] = useState([]);
  const [newWord, setNewWord] = useState('');
  const [keywordError, setKeywordError] = useState('');
  const [loading, setLoading] = useState(false);

  // Username & Presence State
  const [myUsername, setMyUsername] = useState(getInitialUsername);
  const [tempName, setTempName] = useState(myUsername);
  const [isEditingName, setIsEditingName] = useState(false);
  const [onlinePlayers, setOnlinePlayers] = useState([]); // [{ key, username, isTyping, joinedAt }]

  // Start Game & Game State
  const [hasClickedStart, setHasClickedStart] = useState(false);
  const [startRequesters, setStartRequesters] = useState(new Set());
  const [gameStatus, setGameStatus] = useState('lobby'); // 'lobby', 'in_round', 'game_over'
  const [currentGuesserId, setCurrentGuesserId] = useState(null);
  const [currentWord, setCurrentWord] = useState(null);
  const [submittedClues, setSubmittedClues] = useState([]);
  const [myClueInput, setMyClueInput] = useState('');
  // Past keywords for this session. Stored in board_state as { text, correct }.
  const [playedKeywords, setPlayedKeywords] = useState([]);
  const advancingRoundRef = useRef(false);
  const skipKeywordInFlightRef = useRef(false);
  const clueTakeBackInFlightRef = useRef(false);
  const clueSubmitInFlightRef = useRef(false);

  // Tracks clues marked invisible (e.g. ['apple', 'fruit'])
  const [invalidClues, setInvalidClues] = useState([]);
  // Latest list, including clicks that have not been saved yet. Rapid clicks
  // read this so they do not all toggle the same stale snapshot.
  const invalidCluesRef = useRef([]);
  // Lists this client has already moved past. A late save of one of these
  // must not flip the card back.
  const supersededInvalidRef = useRef(new Set());
  const invalidWriteTailRef = useRef(Promise.resolve());
  const invalidWritePendingRef = useRef(false);

  // Guesser & Clue Interaction State
  const [guessInput, setGuessInput] = useState('');
  const [submittedGuess, setSubmittedGuess] = useState(null);
  const [roundWon, setRoundWon] = useState(false);
  const [showGiveUpConfirm, setShowGiveUpConfirm] = useState(false);
  const winPhraseRef = useRef(null);
  // True after the victory sound has played for the current win. Later saves
  // that still carry the old win flag must not play it again.
  const victorySoundPlayedRef = useRef(false);
  const lossPhraseRef = useRef(null);

  useEffect(() => {
    if (!roundWon) winPhraseRef.current = null;
  }, [roundWon]);

  const currentWinPhrase = () => {
    if (!winPhraseRef.current) {
      winPhraseRef.current = WIN_PHRASES[Math.floor(Math.random() * WIN_PHRASES.length)];
    }
    return winPhraseRef.current;
  };

  // Clue Glow / Flash State
  const [flashedClueText, setFlashedClueText] = useState(null);
  // Flash ids already shown on this client. The clicker records one before the
  // write, so the database echo does not play the glow a second time.
  const seenFlashIdsRef = useRef(new Set());
  const flashClearTokenRef = useRef(0);

  // Timer State
  const [guessCountdownSeconds, setGuessCountdownSeconds] = useState(GUESS_COUNTDOWN_SECONDS);
  const [guessCountdownProgress, setGuessCountdownProgress] = useState(1);
  const [clueWaitSeconds, setClueWaitSeconds] = useState(0);
  const [readyDelaySeconds, setReadyDelaySeconds] = useState(READY_FOR_GUESSER_DELAY_SECONDS);
  const guessTimeoutInFlightRef = useRef(false);
  const fireGuessTimeoutRef = useRef(null);

  // Animated Dots State for "STARTING SOON..."
  const [animatedDots, setAnimatedDots] = useState('.');
  const [linkCopied, setLinkCopied] = useState(false);
  const copyResetRef = useRef(null);

  // Cycling animation effect for 1, 2, 3 periods
  useEffect(() => {
    let interval = null;
    if (hasClickedStart) {
      interval = setInterval(() => {
        setAnimatedDots((prev) => {
          if (prev === '.') return '..';
          if (prev === '..') return '...';
          return '.';
        });
      }, 500);
    } else {
      setAnimatedDots('.');
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [hasClickedStart]);

  // Helper: Normalize clue strings for exact case-insensitive matching
  const normalizeClue = (text) => text.trim().toLowerCase();

  // Dynamic Username Resolver: Finds the active name for a playerKey in onlinePlayers
  const getPlayerName = (playerKey, fallbackName = 'Anonymous') => {
    const player = onlinePlayers.find((p) => p.key === playerKey);
    return player ? player.username : fallbackName;
  };

  // Auto-deduplicate exact identical clues
  const getAutoDeduplicatedClues = (clues) => {
    const counts = {};
    clues.forEach((c) => {
      if (!c?.clue) return;
      const norm = normalizeClue(c.clue);
      counts[norm] = (counts[norm] || 0) + 1;
    });

    // Collect clues that appear more than once
    const exactDuplicates = new Set();
    Object.keys(counts).forEach((norm) => {
      if (counts[norm] > 1) {
        exactDuplicates.add(norm);
      }
    });

    return exactDuplicates;
  };


  const channelRef = useRef(null);
  const editInputRef = useRef(null);
  const myUsernameRef = useRef(myUsername);
  myUsernameRef.current = myUsername;
  // Set once per channel subscribe; preserved across username re-track().
  const joinedAtRef = useRef(null);
  const isTypingRef = useRef(false);
  const typingIdleTimerRef = useRef(null);
  const wordListRef = useRef(wordList);
  wordListRef.current = wordList;
  const onlinePlayersRef = useRef(onlinePlayers);
  onlinePlayersRef.current = onlinePlayers;
  const gameStatusRef = useRef(gameStatus);
  gameStatusRef.current = gameStatus;
  const currentWordRef = useRef(currentWord);
  currentWordRef.current = currentWord;
  const submittedGuessRef = useRef(submittedGuess);
  submittedGuessRef.current = submittedGuess;
  const roundWonRef = useRef(roundWon);
  roundWonRef.current = roundWon;
  const submittedCluesRef = useRef(submittedClues);
  submittedCluesRef.current = submittedClues;
  const startNextRoundRef = useRef(null);
  const startRoundInFlightRef = useRef(false);

  // Align local clocks to Supabase REST Date so guess deadlines stay in sync.
  useEffect(() => {
    measureServerTimeOffset();
  }, []);

  // Existing rule: start once >=2 distinct start clicks. Only one client
  // (lexicographically first requester) writes the round to avoid racing picks.
  const tryStartRoundIfReady = (requesters) => {
    if (!requesters || requesters.size < 2) return;
    if (gameStatusRef.current !== 'lobby') return;
    if (startRoundInFlightRef.current) return;
    const leaderId = [...requesters].sort()[0];
    if (leaderId !== CLIENT_ID) return;
    const startRound = startNextRoundRef.current;
    if (!startRound) return;
    startRoundInFlightRef.current = true;
    startRound(wordListRef.current, onlinePlayersRef.current);
  };

  // Typing is broadcast-only so presence stays a stable join/leave roster.
  // Re-track() on typing start/stop was dropping peers from presence sync.
  const setPlayerTyping = (playerKey, isTyping) => {
    setOnlinePlayers((prev) => {
      let changed = false;
      const next = prev.map((player) => {
        if (player.key !== playerKey) return player;
        const nextTyping = Boolean(isTyping);
        if (Boolean(player.isTyping) === nextTyping) return player;
        changed = true;
        return { ...player, isTyping: nextTyping };
      });
      return changed ? next : prev;
    });
  };

  const broadcastTyping = (isTyping) => {
    if (!channelRef.current) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'player_typing',
      payload: { playerKey: CLIENT_ID, isTyping: Boolean(isTyping) },
    });
  };

  const clearTyping = () => {
    window.clearTimeout(typingIdleTimerRef.current);
    typingIdleTimerRef.current = null;
    if (!isTypingRef.current) return;
    isTypingRef.current = false;
    setPlayerTyping(CLIENT_ID, false);
    broadcastTyping(false);
  };

  const signalTyping = () => {
    window.clearTimeout(typingIdleTimerRef.current);
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      setPlayerTyping(CLIENT_ID, true);
      broadcastTyping(true);
    }
    typingIdleTimerRef.current = window.setTimeout(() => {
      clearTyping();
    }, TYPING_IDLE_MS);
  };

  // Drop typing when leaving setup / clue phases (or any status change).
  useEffect(() => {
    clearTyping();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameStatus]);

  useEffect(() => {
    return () => {
      window.clearTimeout(typingIdleTimerRef.current);
    };
  }, []);

  // Stable identity for the active keyword (object refs change on every row sync).
  const currentWordKey = [
    String(keywordText(currentWord) ?? ''),
    typeof currentWord === 'object' && currentWord ? String(currentWord.authorId ?? '') : '',
  ].join('\0');

  const guesserTurnStartedAt = guesserTurnStartedAtOf(currentWord);
  const roundTimedOut = isGuessRoundTimedOut(currentWord);

  // True while the guesser still has at least one visible clue (not give-up / wiped).
  const hasVisibleGuessClues = () => {
    const clues = submittedCluesRef.current;
    const invalid = invalidCluesRef.current;
    const exactDupes = getAutoDeduplicatedClues(clues);
    return clues.some((c) => {
      if (!c?.clue) return false;
      const norm = normalizeClue(c.clue);
      return !invalid.includes(norm) && !exactDupes.has(norm);
    });
  };

  // Authoritative timeout: any client may write timedOut once elapsed ≥ 31s.
  // CAS on guesser_turn + null guess + keyword text so a late guess wins cleanly.
  const fireGuessTimeout = async () => {
    if (!sessionId || guessTimeoutInFlightRef.current) return;
    if (gameStatusRef.current !== 'guesser_turn') return;
    if (submittedGuessRef.current || roundWonRef.current) return;
    // Give-up / zero-clue loss already ended the round — leave that path alone.
    if (!hasVisibleGuessClues()) return;

    const word = currentWordRef.current;
    if (typeof word !== 'object' || !word || word.timedOut) return;
    if (!word.guesserTurnStartedAt) return;

    const expectedText = String(keywordText(word) ?? '').trim();
    if (!expectedText) return;

    guessTimeoutInFlightRef.current = true;
    try {
      const { data, error } = await supabase
        .from('game_sessions')
        .update({
          current_word: { ...word, timedOut: true },
        })
        .eq('id', sessionId)
        .eq('game_status', 'guesser_turn')
        .is('submitted_guess', null)
        .eq('current_word->>text', expectedText)
        .select('id');

      if (error) {
        console.error('Error recording guess timeout:', error);
        return;
      }
      if (data?.length) {
        setCurrentWord((prev) =>
          typeof prev === 'object' && prev ? { ...prev, timedOut: true } : prev
        );
      }
    } finally {
      guessTimeoutInFlightRef.current = false;
    }
  };
  fireGuessTimeoutRef.current = fireGuessTimeout;

  // Shared countdown from current_word.guesserTurnStartedAt (set on READY).
  // UI: 30→0. Loss write: only after GUESS_TIMEOUT_SECONDS (31).
  useEffect(() => {
    if (
      gameStatus !== 'guesser_turn' ||
      roundWon ||
      submittedGuess ||
      roundTimedOut
    ) {
      setGuessCountdownSeconds(GUESS_COUNTDOWN_SECONDS);
      setGuessCountdownProgress(1);
      return undefined;
    }

    if (!guesserTurnStartedAt) {
      setGuessCountdownSeconds(GUESS_COUNTDOWN_SECONDS);
      setGuessCountdownProgress(1);
      return undefined;
    }

    const startedMs = Date.parse(guesserTurnStartedAt);
    if (!Number.isFinite(startedMs)) return undefined;

    const tick = () => {
      const elapsedSec = (getServerNowMs() - startedMs) / 1000;
      const remaining = Math.max(
        0,
        GUESS_COUNTDOWN_SECONDS - Math.floor(elapsedSec)
      );
      setGuessCountdownSeconds(remaining);
      setGuessCountdownProgress(
        Math.max(0, Math.min(1, 1 - elapsedSec / GUESS_COUNTDOWN_SECONDS))
      );

      if (elapsedSec >= GUESS_TIMEOUT_SECONDS && hasVisibleGuessClues()) {
        fireGuessTimeoutRef.current?.();
      }
    };

    tick();
    const interval = window.setInterval(tick, 100);
    return () => window.clearInterval(interval);
  }, [
    gameStatus,
    roundWon,
    submittedGuess,
    roundTimedOut,
    guesserTurnStartedAt,
  ]);

  // Ticking timer for the clue-giving phase, shown to every player.
  // Resets when the keyword changes (including SKIP KEYWORD).
  useEffect(() => {
    if (gameStatus !== 'in_round') return;

    const startedAt = Date.now();
    setClueWaitSeconds(0);
    const interval = setInterval(() => {
      setClueWaitSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    return () => {
      clearInterval(interval);
      setClueWaitSeconds(0);
    };
  }, [gameStatus, currentWordKey]);

  // Fresh clue draft + visibility state whenever the keyword changes (skip / next round).
  useEffect(() => {
    setMyClueInput('');
    invalidCluesRef.current = [];
    supersededInvalidRef.current.clear();
    invalidWritePendingRef.current = false;
    setInvalidClues([]);
  }, [currentWordKey]);

  useEffect(() => {
    if (isEditingName && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [isEditingName]);

  // Initial Load Effect: Check URL or Auto-Create Session
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const existingSessionId = urlParams.get('sessionId');

    if (existingSessionId) {
      setSessionId(existingSessionId);
      loadSession(existingSessionId);
    } else {
      // If no session ID is in the URL, automatically create one!
      createNewSession();
    }
  }, []);

  // Realtime Subscription
  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase.channel(`room_${sessionId}`, {
      config: {
        presence: { key: CLIENT_ID },
      },
    });

    channelRef.current = channel;

    // Database changes listener
    channel.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'game_sessions',
        filter: `id=eq.${sessionId}`,
      },
      (payload) => {
        const data = payload.new;
        if (data.word_list) setWordList(data.word_list);
        if (data.current_guesser_id !== undefined) setCurrentGuesserId(data.current_guesser_id);
        if (data.current_word !== undefined) setCurrentWord(data.current_word);
        if (data.submitted_clues) setSubmittedClues(data.submitted_clues);
        if (Array.isArray(data.invalid_clues)) {
          acceptRemoteInvalidRef.current(data.invalid_clues);
        }
        if (Array.isArray(data.board_state)) setPlayedKeywords(data.board_state);

        if (data.game_status) {
          setGameStatus(data.game_status);
          if (data.game_status === 'in_round') {
            setSubmittedGuess(null);
            setRoundWon(false);
            setGuessInput('');
          }
        }
        if (data.submitted_guess !== undefined) setSubmittedGuess(data.submitted_guess);
        if (data.round_won !== undefined) {
          const won = Boolean(data.round_won);
          if (won && !victorySoundPlayedRef.current) {
            victorySoundPlayedRef.current = true;
            playVictorySound();
          }
          if (!won) victorySoundPlayedRef.current = false;
          setRoundWon(won);
        }
        if (data.last_flashed_clue?.clueText) {
          const flash = data.last_flashed_clue;
          const flashKey = flash.flashId
            || (flash.timestamp != null ? `${flash.clueText}:${flash.timestamp}` : null);
          // Skip the clicker's own echo and any later row update that still
          // carries the same flash.
          if (flashKey && seenFlashIdsRef.current.has(flashKey)) {
            // already played
          } else {
            if (flashKey) seenFlashIdsRef.current.add(flashKey);
            const token = ++flashClearTokenRef.current;
            setFlashedClueText(flash.clueText);
            setTimeout(() => {
              if (flashClearTokenRef.current === token) setFlashedClueText(null);
            }, CLUE_GLOW_MS);
          }
        }
      }
    );

    // Clue glow for everyone except the clicker, who already glowed locally.
    channel.on('broadcast', { event: 'clue_flash' }, ({ payload }) => {
      const clueText = payload?.clueText;
      const flashId = payload?.flashId;
      if (!clueText) return;
      if (flashId && seenFlashIdsRef.current.has(flashId)) return;
      if (flashId) seenFlashIdsRef.current.add(flashId);
      const token = ++flashClearTokenRef.current;
      setFlashedClueText(clueText);
      setTimeout(() => {
        if (flashClearTokenRef.current === token) setFlashedClueText(null);
      }, CLUE_GLOW_MS);
    });

    // Presence listener — roster only. Typing is merged from local/broadcast state
    // so a presence sync does not wipe indicators or require re-track().
    // Order is earliest joinedAt → latest (not Object.keys order).
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();

      setOnlinePlayers((prev) => {
        const prevTyping = new Map(prev.map((p) => [p.key, Boolean(p.isTyping)]));
        const players = [];

        Object.keys(state).forEach((key) => {
          const presences = state[key];
          if (presences && presences.length > 0) {
            // Prefer the latest meta if multiple exist (e.g. username re-track).
            // Prefer a meta that still carries joinedAt so a bad re-track cannot
            // wipe join order for peers mid-session.
            let meta = presences[presences.length - 1];
            for (let i = presences.length - 1; i >= 0; i--) {
              if (Number.isFinite(Number(presences[i]?.joinedAt))) {
                meta = {
                  ...presences[i],
                  ...presences[presences.length - 1],
                  joinedAt: Number(presences[i].joinedAt),
                };
                break;
              }
            }
            const joinedAtRaw = Number(meta.joinedAt);
            players.push({
              key, // CLIENT_ID
              username: meta.username || 'Anonymous',
              joinedAt: Number.isFinite(joinedAtRaw) ? joinedAtRaw : null,
              // Keep local typing across presence sync; peers come from broadcasts.
              isTyping:
                key === CLIENT_ID
                  ? isTypingRef.current
                  : Boolean(prevTyping.get(key)),
            });
          }
        });

        return sortPlayersByJoinOrder(players);
      });
    });

    // Typing indicators (setup keywords + clue typing). Not presence-tracked.
    channel.on('broadcast', { event: 'player_typing' }, ({ payload }) => {
      const playerKey = payload?.playerKey;
      if (!playerKey || playerKey === CLIENT_ID) return;
      setPlayerTyping(playerKey, Boolean(payload?.isTyping));
    });

    // Start Game Broadcast Listener — re-check the existing >=2 threshold so the
    // mutual-click race (both at size 1 locally) still starts the round.
    channel.on('broadcast', { event: 'start_game_click' }, (payload) => {
      const pKey = payload.payload?.playerKey;
      if (!pKey) return;

      setStartRequesters((prev) => {
        const next = new Set(prev);
        next.add(pKey);
        queueMicrotask(() => tryStartRoundIfReady(next));
        return next;
      });
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        isTypingRef.current = false;
        if (joinedAtRef.current == null) {
          joinedAtRef.current = Date.now();
        }
        await channel.track({
          username: myUsernameRef.current,
          joinedAt: joinedAtRef.current,
        });
      }
    });

    return () => {
      window.clearTimeout(typingIdleTimerRef.current);
      typingIdleTimerRef.current = null;
      isTypingRef.current = false;
      joinedAtRef.current = null;
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [sessionId]);

  // Auto-creates a new session and updates the URL
  const createNewSession = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from('game_sessions')
      .insert([{ word_list: [], game_status: 'lobby' }])
      .select()
      .single();

    if (error) {
      console.error('Error auto-creating session:', error);
      setLoading(false);
      return;
    }

    const newId = data.id;
    setWordList([]);
    setSessionId(newId);

    // Smoothly update URL query param without full page reload
    const newUrl = `${window.location.origin}${window.location.pathname}?sessionId=${newId}`;
    window.history.pushState({ path: newUrl }, '', newUrl);

    setLoading(false);
  };

  // Fetches an existing session or redirects to a fresh auto-created one if invalid
  const loadSession = async (id) => {
    setLoading(true);

    const { data, error } = await supabase
      .from('game_sessions')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      alert('Session expired or not found. Redirecting to a new game session...');
      // Clear URL param and auto-create a new session if link is dead/expired
      window.history.pushState({}, '', window.location.pathname);
      createNewSession();
    } else {
      setWordList(data.word_list || []);
      setGameStatus(data.game_status || 'lobby');
      setCurrentGuesserId(data.current_guesser_id || null);
      setCurrentWord(data.current_word || null);
      setSubmittedClues(data.submitted_clues || []);
      acceptRemoteInvalidClues(data.invalid_clues || []);
      setPlayedKeywords(Array.isArray(data.board_state) ? data.board_state : []);
      setSubmittedGuess(data.submitted_guess ?? null);
      const alreadyWon = Boolean(data.round_won);
      setRoundWon(alreadyWon);
      victorySoundPlayedRef.current = alreadyWon;
      setLoading(false);
    }
  };

  // Helper: Check if a clue is an exact duplicate across submitted clues
  const isExactDuplicateClue = (clueText, allClues) => {
    const norm = clueText.trim().toLowerCase();
    const count = allClues.filter(
      (c) => c.clue.trim().toLowerCase() === norm
    ).length;
    return count > 1;
  };

  // A round can start when some online player did not write at least one keyword.
  const roundCanStart = (words, players) => {
    if (!words?.length || !players?.length) return false;
    return players.some((player) =>
      words.some((word) => typeof word === 'object' && word.authorId !== player.key)
    );
  };

  // Helper: Start Next Round Logic with Weighted Word Selection.
  // When retiring a keyword (NEXT KEYWORD / playedEntry), concurrent clicks are
  // safe via compare-and-swap on current_word text — only the first successful
  // UPDATE appends to board_state and advances the round (same idea as SKIP).
  const startNextRound = async (availableWords, playerList, playedEntry) => {
    const expectedKeywordText = playedEntry
      ? String(playedEntry.text ?? '').trim()
      : null;

    // 1. Fetch counts, played history, and (when advancing) the server word pool
    const { data: sessionData } = await supabase
      .from('game_sessions')
      .select('player_word_counts, board_state, word_list, current_word')
      .eq('id', sessionId)
      .single();

    const counts = sessionData?.player_word_counts || {};
    const existingPlayed = Array.isArray(sessionData?.board_state) ? sessionData.board_state : [];

    // Prefer the server word list when retiring a keyword so racing clients
    // share one pool (local wordList can lag a concurrent skip/advance).
    const wordsForPick = expectedKeywordText
      ? (sessionData?.word_list || availableWords)
      : availableWords;

    // Append-once: skip if this keyword is already in past history.
    let nextPlayed = existingPlayed;
    if (playedEntry) {
      const entryNorm = normalizeKeyword(playedEntry.text);
      const alreadyLogged = existingPlayed.some(
        (item) => normalizeKeyword(keywordText(item)) === entryNorm
      );
      if (!alreadyLogged) {
        nextPlayed = [...existingPlayed, playedEntry];
      }
    }

    // Another client already advanced past this keyword — no-op.
    if (expectedKeywordText) {
      const serverText = String(keywordText(sessionData?.current_word) ?? '').trim();
      if (serverText !== expectedKeywordText) return;
    }

    const pick = pickGuesserAndWord(wordsForPick, playerList, counts);

    // CAS when retiring a keyword: UPDATE … WHERE id AND same current_word text.
    // .select() returns rows only when the WHERE matched — empty means we lost.
    const applyAdvanceUpdate = (patch) => {
      let query = supabase
        .from('game_sessions')
        .update(patch)
        .eq('id', sessionId);
      if (expectedKeywordText) {
        query = query.eq('current_word->>text', expectedKeywordText);
      }
      return query.select('id');
    };

    if (pick.kind === 'game_over') {
      const { data: updated, error } = await applyAdvanceUpdate({
        game_status: 'game_over',
        round_won: false,
        board_state: nextPlayed,
      });
      if (error) {
        console.error('Error ending game after next keyword:', error);
        return;
      }
      if (expectedKeywordText && !updated?.length) return;
      if (playedEntry) setPlayedKeywords(nextPlayed);
      return;
    }

    const { data: updated, error } = await applyAdvanceUpdate({
      game_status: 'in_round',
      current_guesser_id: pick.chosenGuesser.key,
      current_word: pick.selectedWord,
      submitted_clues: [],
      invalid_clues: [],
      submitted_guess: null,
      round_won: false,
      word_list: pick.updatedWordList,
      player_word_counts: pick.updatedCounts,
      board_state: nextPlayed,
    });

    if (error) {
      console.error('Error advancing to next keyword:', error);
      return;
    }
    if (expectedKeywordText && !updated?.length) return;

    if (playedEntry) setPlayedKeywords(nextPlayed);
  };
  startNextRoundRef.current = startNextRound;

  const copySessionLink = async () => {
    if (!sessionId) return;

    const shareUrl = `${window.location.origin}${window.location.pathname}?sessionId=${sessionId}`;
    let copied = false;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        copied = true;
      }
    } catch {
      copied = false;
    }

    if (!copied) {
      const textarea = document.createElement('textarea');
      textarea.value = shareUrl;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.top = '0';
      textarea.style.left = '0';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      copied = document.execCommand('copy');
      document.body.removeChild(textarea);
    }

    if (!copied) return;

    setLinkCopied(true);
    window.clearTimeout(copyResetRef.current);
    copyResetRef.current = window.setTimeout(() => setLinkCopied(false), 1600);
  };

  useEffect(() => {
    return () => window.clearTimeout(copyResetRef.current);
  }, []);

  // Handler for submitting edited username
  const handleSaveUsername = async (newName) => {
    const trimmed = newName.trim();
    if (!trimmed) return;

    localStorage.setItem('just_one_username', trimmed);
    setMyUsername(trimmed);

    // Re-track username but keep the original joinedAt (do not reset join order).
    if (channelRef.current) {
      if (joinedAtRef.current == null) {
        joinedAtRef.current = Date.now();
      }
      await channelRef.current.track({
        username: trimmed,
        joinedAt: joinedAtRef.current,
      });
    }

    setIsEditingName(false);
  };

  // Handle Start Game Button Click
  const handleStartGame = async () => {
    if (!sessionId || hasClickedStart) return;

    setHasClickedStart(true);
    const updatedRequesters = new Set(startRequesters);
    updatedRequesters.add(CLIENT_ID);
    setStartRequesters(updatedRequesters);

    // Broadcast my click to other clients
    if (channelRef.current) {
      await channelRef.current.send({
        type: 'broadcast',
        event: 'start_game_click',
        payload: { playerKey: CLIENT_ID },
      });
    }

    // If 2 or more players have clicked start, initialize round
    tryStartRoundIfReady(updatedRequesters);
  };

  const updateNewWord = (value) => {
    setNewWord(value);
    if (keywordError) setKeywordError('');
    // Keyword typing is setup-only (lobby / between-round game_over).
    const inSetup = gameStatus === 'lobby' || gameStatus === 'game_over';
    if (!inSetup) return;
    if (value) signalTyping();
    else clearTyping();
  };

  const handleAddWord = async (e) => {
    e.preventDefault();
    const trimmed = normalizeKeyword(newWord);
    if (!trimmed || !sessionId) return;

    const alreadyInList = wordList.some((item) => normalizeKeyword(keywordText(item)) === trimmed);
    const alreadyPlayed = playedKeywords.some((item) => normalizeKeyword(keywordText(item)) === trimmed);
    if (alreadyInList) {
      setKeywordError('This keyword is already in the Shared Keyword List.');
      return;
    }
    if (alreadyPlayed) {
      setKeywordError('This keyword is already a past keyword.');
      return;
    }
    setKeywordError('');
    clearTyping();

    // Store word as an object with author details
    const newEntry = {
      text: trimmed,
      authorId: CLIENT_ID,
      authorName: myUsername,
    };

    const updatedWords = [...wordList, newEntry];
    setWordList(updatedWords);
    setNewWord('');

    const { error } = await supabase
      .from('game_sessions')
      .update({ word_list: updatedWords })
      .eq('id', sessionId);

    if (error) {
      console.error('Error adding word:', error);
      setWordList(wordList);
      return;
    }

    if (gameStatus === 'game_over' && roundCanStart(updatedWords, onlinePlayers)) {
      await startNextRound(updatedWords, onlinePlayers);
    }
  };

  const handleRemoveWord = async (index) => {
    if (!sessionId || index < 0 || index >= wordList.length) return;

    const updatedWords = wordList.filter((_, i) => i !== index);
    setWordList(updatedWords);

    const { error } = await supabase
      .from('game_sessions')
      .update({ word_list: updatedWords })
      .eq('id', sessionId);

    if (error) {
      console.error('Error removing word:', error);
      setWordList(wordList);
    }
  };

  // Read-modify-write submitted_clues with CAS so concurrent take-backs / submits
  // do not clobber each other (last-write-wins on the whole array).
  const casUpdateSubmittedClues = async (expectedText, mutate, maxAttempts = 5) => {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const { data: row, error: readError } = await supabase
        .from('game_sessions')
        .select('submitted_clues, game_status, current_word')
        .eq('id', sessionId)
        .maybeSingle();

      if (readError) return { ok: false, error: readError, clues: null };
      if (!row || row.game_status !== 'in_round') {
        return { ok: false, error: null, clues: null, aborted: true };
      }
      if (String(keywordText(row.current_word) ?? '').trim() !== expectedText) {
        return { ok: false, error: null, clues: null, aborted: true };
      }

      const prev = Array.isArray(row.submitted_clues) ? row.submitted_clues : [];
      const next = mutate(prev);
      if (next == null) {
        return { ok: false, error: null, clues: prev, aborted: true };
      }

      const unchanged =
        next.length === prev.length &&
        next.every(
          (c, i) =>
            c?.playerKey === prev[i]?.playerKey &&
            c?.clue === prev[i]?.clue &&
            c?.username === prev[i]?.username
        );
      if (unchanged) {
        return { ok: true, error: null, clues: prev };
      }

      const { data: updated, error } = await supabase
        .from('game_sessions')
        .update({ submitted_clues: next })
        .eq('id', sessionId)
        .eq('game_status', 'in_round')
        .eq('current_word->>text', expectedText)
        .eq('submitted_clues', prev)
        .select('submitted_clues');

      if (error) return { ok: false, error, clues: null };
      if (updated?.length) {
        return { ok: true, error: null, clues: updated[0].submitted_clues };
      }
      // CAS miss (another client changed submitted_clues) — retry.
    }
    return { ok: false, error: null, clues: null, aborted: true };
  };

  // Handle Giving a Clue
  const handleGiveClue = async (e) => {
    e.preventDefault();
    const trimmed = myClueInput.trim().replace(/\s+/g, '').toUpperCase();
    if (!trimmed || !sessionId || clueSubmitInFlightRef.current) return;
    if (submittedClues.some((c) => c.playerKey === CLIENT_ID)) return;

    const expectedText = String(keywordText(currentWord) ?? '').trim();
    if (!expectedText) return;

    clearTyping();
    clueSubmitInFlightRef.current = true;

    const newClueEntry = {
      clue: trimmed,
      playerKey: CLIENT_ID,
      username: myUsername,
    };

    const optimistic = [...submittedClues, newClueEntry];
    setSubmittedClues(optimistic);
    setMyClueInput('');

    try {
      const { ok, error, clues, aborted } = await casUpdateSubmittedClues(
        expectedText,
        (prev) => {
          if (prev.some((c) => c.playerKey === CLIENT_ID)) return prev;
          return [...prev, newClueEntry];
        }
      );

      if (error) {
        console.error('Error submitting clue:', error);
        setSubmittedClues((prev) => prev.filter((c) => c.playerKey !== CLIENT_ID));
        setMyClueInput(trimmed);
        return;
      }
      if (!ok || aborted) {
        // Keyword skipped / phase changed; realtime will resync.
        setSubmittedClues((prev) => prev.filter((c) => c.playerKey !== CLIENT_ID));
        return;
      }
      if (Array.isArray(clues)) setSubmittedClues(clues);
    } finally {
      clueSubmitInFlightRef.current = false;
    }
  };

  // Take back own clue while still waiting on other clue givers, then re-enter.
  const handleTakeBackClue = async () => {
    if (!sessionId || clueTakeBackInFlightRef.current) return;
    if (gameStatus !== 'in_round') return;

    const myClue = submittedClues.find((c) => c.playerKey === CLIENT_ID);
    if (!myClue) return;

    const clueGiverCount = onlinePlayers.filter((p) => p.key !== currentGuesserId).length;
    if (clueGiverCount > 0 && submittedClues.length >= clueGiverCount) return;

    const expectedText = String(keywordText(currentWord) ?? '').trim();
    if (!expectedText) return;

    clueTakeBackInFlightRef.current = true;
    const previousClueText = myClue.clue || '';
    const snapshotBefore = submittedClues;

    setSubmittedClues((prev) => prev.filter((c) => c.playerKey !== CLIENT_ID));
    setMyClueInput(previousClueText);

    try {
      const { ok, error, clues, aborted } = await casUpdateSubmittedClues(
        expectedText,
        (prev) => {
          if (!prev.some((c) => c.playerKey === CLIENT_ID)) return prev;
          // Once every clue giver has submitted, take-back is closed.
          if (clueGiverCount > 0 && prev.length >= clueGiverCount) return null;
          return prev.filter((c) => c.playerKey !== CLIENT_ID);
        }
      );

      if (error) {
        console.error('Error taking back clue:', error);
        setSubmittedClues(snapshotBefore);
        setMyClueInput('');
        return;
      }
      if (!ok || aborted) {
        // Too late (review started) or keyword/phase changed — restore or resync.
        if (Array.isArray(clues) && clues.some((c) => c.playerKey === CLIENT_ID)) {
          setSubmittedClues(clues);
          setMyClueInput('');
        } else if (!aborted) {
          setSubmittedClues(snapshotBefore);
          setMyClueInput('');
        }
        return;
      }
      if (Array.isArray(clues)) setSubmittedClues(clues);
    } finally {
      clueTakeBackInFlightRef.current = false;
    }
  };

  const invalidClueSig = (list) => (Array.isArray(list) ? list.join('\u0000') : '');

  // Apply a list saved by someone else. Ignore it while this client is still
  // ahead of the database, and ignore an older list this client already left.
  const acceptRemoteInvalidClues = (next) => {
    const remote = Array.isArray(next) ? next : [];
    const remoteSig = invalidClueSig(remote);
    const localSig = invalidClueSig(invalidCluesRef.current);
    if (remoteSig === localSig) {
      supersededInvalidRef.current.clear();
      invalidWritePendingRef.current = false;
      return;
    }
    if (invalidWritePendingRef.current || supersededInvalidRef.current.has(remoteSig)) {
      return;
    }
    supersededInvalidRef.current.clear();
    invalidCluesRef.current = remote;
    setInvalidClues(remote);
  };
  const acceptRemoteInvalidRef = useRef(acceptRemoteInvalidClues);
  acceptRemoteInvalidRef.current = acceptRemoteInvalidClues;

  // Show the new visibility immediately, then save the latest list once.
  // Intermediate clicks are not written, so their echoes cannot flash the card.
  const persistInvalidClues = (next) => {
    const prevSig = invalidClueSig(invalidCluesRef.current);
    const nextSig = invalidClueSig(next);
    if (prevSig !== nextSig) supersededInvalidRef.current.add(prevSig);
    invalidCluesRef.current = next;
    setInvalidClues(next);
    invalidWritePendingRef.current = true;

    const targetSession = sessionId;
    invalidWriteTailRef.current = invalidWriteTailRef.current
      .catch(() => {})
      .then(async () => {
        if (invalidClueSig(invalidCluesRef.current) !== nextSig) return;
        try {
          const { error } = await supabase
            .from('game_sessions')
            .update({ invalid_clues: invalidCluesRef.current })
            .eq('id', targetSession);
          if (invalidClueSig(invalidCluesRef.current) !== nextSig) return;
          if (error) {
            console.error('Error updating clue visibility:', error);
            supersededInvalidRef.current.clear();
            invalidWritePendingRef.current = false;
            return;
          }
          invalidWritePendingRef.current = false;
        } catch (err) {
          console.error('Error updating clue visibility:', err);
          supersededInvalidRef.current.clear();
          invalidWritePendingRef.current = false;
        }
      });
  };

  // Toggle a clue's visibility state (between translucent/invisible and active)
  const handleToggleClueVisibility = (clueText) => {
    if (isGuesser || !sessionId) return;

    const normalized = normalizeClue(clueText);
    const current = invalidCluesRef.current;
    const updated = current.includes(normalized)
      ? current.filter((c) => c !== normalized)
      : [...current, normalized];

    persistInvalidClues(updated);
  };

  // Transition game phase when READY is clicked.
  // CAS on the current keyword so a concurrent SKIP KEYWORD is not overridden
  // into guesser_turn with a wiped clue list.
  // Stamps guesserTurnStartedAt (server-aligned ISO) on current_word so every
  // client — including late joiners — shares one countdown deadline.
  const handleConfirmCluesReady = async () => {
    if (!sessionId || readyDelaySeconds > 0) return;
    const expectedText = String(keywordText(currentWord) ?? '').trim();
    if (!expectedText) return;

    await measureServerTimeOffset();
    const baseWord =
      typeof currentWord === 'object' && currentWord
        ? currentWord
        : { text: currentWord };

    await supabase
      .from('game_sessions')
      .update({
        game_status: 'guesser_turn',
        current_word: {
          ...baseWord,
          text: expectedText,
          guesserTurnStartedAt: getServerNowIso(),
          timedOut: false,
        },
      })
      .eq('id', sessionId)
      .eq('game_status', 'in_round')
      .eq('current_word->>text', expectedText);
  };

  // 3. Trigger Clue Glow / Shine Effect for all players.
  // The clicker glows immediately; everyone else glows from the database update.
  const handleFlashClue = async (clueText) => {
    if (!sessionId) return;

    const flashId = `${Date.now()}-${++flashClearTokenRef.current}`;
    seenFlashIdsRef.current.add(flashId);
    const token = flashClearTokenRef.current;
    setFlashedClueText(clueText);
    setTimeout(() => {
      if (flashClearTokenRef.current === token) setFlashedClueText(null);
    }, CLUE_GLOW_MS);

    channelRef.current?.send({
      type: 'broadcast',
      event: 'clue_flash',
      payload: { clueText, flashId },
    });

    const { error } = await supabase
      .from('game_sessions')
      .update({
        last_flashed_clue: {
          clueText,
          timestamp: Date.now(),
          flashId,
        },
      })
      .eq('id', sessionId);

    if (error) console.error('Error flashing clue:', error);
  };

  // 4. Handle Guesser Submission
  const handleGuessSubmit = async (e) => {
    e.preventDefault();
    const trimmed = guessInput.trim().replace(/\s+/g, '').toUpperCase();
    if (!trimmed || !sessionId) return;
    if (isGuessRoundTimedOut(currentWord)) return;

    const keyWordText = currentWord && typeof currentWord === 'object' ? currentWord.text : currentWord;
    const isMatch = trimmed.toLowerCase() === String(keyWordText ?? '').toLowerCase();

    // Optimistic local stop so the 31s timeout cannot blank the results panel
    // while the realtime echo is in flight.
    setSubmittedGuess(trimmed);
    submittedGuessRef.current = trimmed;

    // 1. Update database for ALL players to receive
    const { data, error } = await supabase
      .from('game_sessions')
      .update({
        submitted_guess: trimmed,
        round_won: isMatch,
      })
      .eq('id', sessionId)
      .eq('game_status', 'guesser_turn')
      .is('submitted_guess', null)
      .select('id');

    if (error) {
      console.error('Error submitting guess:', error);
      setSubmittedGuess(null);
      submittedGuessRef.current = null;
      return;
    }
    // Lost the race to timeout (or a duplicate submit) — resync from realtime.
    if (!data?.length) {
      setSubmittedGuess(null);
      submittedGuessRef.current = null;
      return;
    }

    if (isMatch) {
      setRoundWon(true);
      if (!victorySoundPlayedRef.current) {
        victorySoundPlayedRef.current = true;
        playVictorySound();
      }
    }
  };

  // 5. Handle "CLOSE ENOUGH" Override Action
  const handleCloseEnough = async () => {
    if (!sessionId) return;
    setRoundWon(true);
    if (!victorySoundPlayedRef.current) {
      victorySoundPlayedRef.current = true;
      playVictorySound();
    }

    await supabase
      .from('game_sessions')
      .update({ round_won: true })
      .eq('id', sessionId);
  };

  // 6. Handle "NEXT KEYWORD" Button Click (Advances Guesser & Word).
  // Concurrent clicks across clients are serialized in startNextRound via CAS
  // on current_word text + append-once dedupe into board_state.
  const handleNextWord = async () => {
    if (!sessionId || advancingRoundRef.current) return;
    advancingRoundRef.current = true;

    const playedText = currentWord && typeof currentWord === 'object' ? currentWord.text : currentWord;
    const playedEntry = playedText
      ? { text: String(playedText).trim(), correct: Boolean(roundWon) }
      : null;

    // Find index of current guesser
    const currentGuesserIdx = onlinePlayers.findIndex((p) => p.key === currentGuesserId);

    // Reorder players array starting from the next player down the list
    const nextPlayersOrder = [
      ...onlinePlayers.slice(currentGuesserIdx + 1),
      ...onlinePlayers.slice(0, currentGuesserIdx + 1),
    ];

    // Reset round state variables in UI
    setSubmittedGuess(null);
    setRoundWon(false);
    setGuessInput('');

    try {
      // Call round setup helper
      await startNextRound(wordList, nextPlayersOrder, playedEntry);
    } finally {
      advancingRoundRef.current = false;
    }
  };

  // Clue-giver skip: replace the round keyword without scoring it.
  // Concurrent clicks are safe via compare-and-swap on current_word text +
  // guesser + in_round — only the first successful UPDATE wins.
  const handleSkipKeyword = async () => {
    if (!sessionId || skipKeywordInFlightRef.current) return;
    if (gameStatus !== 'in_round') return;
    if (CLIENT_ID === currentGuesserId) return;

    const expectedText = String(keywordText(currentWord) ?? '').trim();
    const expectedGuesserId = currentGuesserId;
    if (!expectedText || !expectedGuesserId) return;

    skipKeywordInFlightRef.current = true;
    clearTyping();

    try {
      const { data: sessionData, error: fetchError } = await supabase
        .from('game_sessions')
        .select('word_list, player_word_counts, current_word, current_guesser_id, game_status')
        .eq('id', sessionId)
        .single();

      if (fetchError || !sessionData) {
        console.error('Error loading session for skip:', fetchError);
        return;
      }

      if (sessionData.game_status !== 'in_round') return;
      if (sessionData.current_guesser_id !== expectedGuesserId) return;
      if (String(keywordText(sessionData.current_word) ?? '').trim() !== expectedText) return;

      const availableWords = sessionData.word_list || [];
      const counts = sessionData.player_word_counts || {};
      const players = onlinePlayersRef.current;

      // Prefer keeping the same guesser; otherwise rotate like NEXT KEYWORD.
      const guesserIdx = players.findIndex((p) => p.key === expectedGuesserId);
      const playerList =
        guesserIdx >= 0
          ? [...players.slice(guesserIdx), ...players.slice(0, guesserIdx)]
          : players;

      const pick = pickGuesserAndWord(availableWords, playerList, counts);

      // CAS: UPDATE … WHERE id AND in_round AND same guesser AND same keyword text.
      // .select() returns rows only when the WHERE matched — empty means we lost the race.
      const applySkipUpdate = (patch) =>
        supabase
          .from('game_sessions')
          .update(patch)
          .eq('id', sessionId)
          .eq('game_status', 'in_round')
          .eq('current_guesser_id', expectedGuesserId)
          .eq('current_word->>text', expectedText)
          .select('id');

      if (pick.kind === 'game_over') {
        const { data: updated, error } = await applySkipUpdate({
          game_status: 'game_over',
          round_won: false,
          submitted_clues: [],
          invalid_clues: [],
          submitted_guess: null,
          current_word: null,
        });

        if (error) {
          console.error('Error ending game after skip:', error);
          return;
        }
        if (!updated?.length) return;
        return;
      }

      const { data: updated, error } = await applySkipUpdate({
        game_status: 'in_round',
        current_guesser_id: pick.chosenGuesser.key,
        current_word: pick.selectedWord,
        submitted_clues: [],
        invalid_clues: [],
        submitted_guess: null,
        round_won: false,
        word_list: pick.updatedWordList,
        player_word_counts: pick.updatedCounts,
      });

      if (error) {
        console.error('Error skipping keyword:', error);
        return;
      }
      if (!updated?.length) return;

      setMyClueInput('');
    } finally {
      skipKeywordInFlightRef.current = false;
    }
  };

  // User details & round helpers
  const isGuesser = CLIENT_ID === currentGuesserId;
  const numClueGivers = onlinePlayers.filter((p) => p.key !== currentGuesserId).length;
  const mySubmittedClue = submittedClues.find((c) => c.playerKey === CLIENT_ID) || null;
  const hasSubmittedMyClue = Boolean(mySubmittedClue);
  const allCluesSubmitted = submittedClues.length >= numClueGivers && numClueGivers > 0;
  const canTakeBackClue =
    !isGuesser &&
    hasSubmittedMyClue &&
    !allCluesSubmitted &&
    gameStatus === 'in_round';

  // Client-local delay before READY FOR GUESSER: starts when review UI appears
  // (all clues in), not from earlier page load / clue-giving wait.
  useEffect(() => {
    if (gameStatus !== 'in_round' || !allCluesSubmitted) {
      setReadyDelaySeconds(READY_FOR_GUESSER_DELAY_SECONDS);
      return undefined;
    }

    const startedAt = Date.now();
    setReadyDelaySeconds(READY_FOR_GUESSER_DELAY_SECONDS);

    const tick = () => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setReadyDelaySeconds(
        Math.max(0, READY_FOR_GUESSER_DELAY_SECONDS - elapsed)
      );
    };

    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [gameStatus, allCluesSubmitted, currentWordKey]);

  // Guesser give-up: mark every clue invisible so the existing zero-clue
  // roundLost path runs for all clients (same loss UI, no new column).
  const handleConfirmGiveUp = () => {
    if (!sessionId || !isGuesser) return;
    const allNorms = submittedClues
      .map((c) => (c?.clue ? normalizeClue(c.clue) : null))
      .filter(Boolean);
    const next = [...new Set([...invalidCluesRef.current, ...allNorms])];
    persistInvalidClues(next);
    setShowGiveUpConfirm(false);
  };

  // Auto-flag exact duplicate clues as invisible when all clues arrive
  useEffect(() => {
    if (
      gameStatus === 'in_round' &&
      allCluesSubmitted &&
      submittedClues.length > 0
    ) {
      const exactDupes = Array.from(getAutoDeduplicatedClues(submittedClues));
      const currentInvalid = invalidCluesRef.current;

      // Combine existing manually hidden clues with exact duplicate clues
      const combinedInvalid = Array.from(
        new Set([...currentInvalid, ...exactDupes])
      );

      // Only update if there are new duplicate items not yet present
      if (invalidClueSig(combinedInvalid) !== invalidClueSig(currentInvalid)) {
        persistInvalidClues(combinedInvalid);
      }
    }
  }, [allCluesSubmitted, submittedClues, gameStatus]);

  const exactDuplicateClues = getAutoDeduplicatedClues(submittedClues);
  const visibleClues = submittedClues.filter((c) => {
    if (!c?.clue) return false;
    const norm = normalizeClue(c.clue);
    return !invalidClues.includes(norm) && !exactDuplicateClues.has(norm);
  });
  const keyWordText = currentWord && typeof currentWord === 'object' ? currentWord.text : currentWord;
  const clueWordClass = 'text-2xl font-extrabold text-sky-400';
  const keywordClass = 'text-2xl font-extrabold text-amber-500';
  const waitingLineClass = 'text-center text-slate-100 font-medium py-3 italic animate-pulse';
  const pastKeywords = (Array.isArray(playedKeywords) ? playedKeywords : []).filter(
    (item) => item && typeof item.text === 'string' && item.text.trim()
  );
  const pastKeywordCorrect = pastKeywords.filter((item) => item.correct).length;
  const pastKeywordPercent = pastKeywords.length === 0
    ? 0
    : Math.round((pastKeywordCorrect / pastKeywords.length) * 100);
  const roundLost =
    gameStatus === 'guesser_turn' &&
    !submittedGuess &&
    !roundWon &&
    (visibleClues.length === 0 || roundTimedOut);

  useEffect(() => {
    if (!roundLost) lossPhraseRef.current = null;
  }, [roundLost]);

  useEffect(() => {
    if (roundLost || gameStatus !== 'guesser_turn' || submittedGuess) {
      setShowGiveUpConfirm(false);
    }
  }, [roundLost, gameStatus, submittedGuess]);

  const currentLossPhrase = () => {
    if (roundTimedOut) return 'OUT OF TIME!';
    if (!lossPhraseRef.current) {
      lossPhraseRef.current = LOSS_PHRASES[Math.floor(Math.random() * LOSS_PHRASES.length)];
    }
    return lossPhraseRef.current;
  };

  return (
    <div className="flex flex-col items-center min-h-screen bg-slate-900 text-slate-100 p-6 pb-14">
      <header className="mb-8 text-center">
        <h1 className="game-title text-4xl">
          Just <span className="keyword-mark">One</span> Unlimited
        </h1>
        {sessionId && (
          <button
            type="button"
            onClick={copySessionLink}
            aria-label={linkCopied ? 'Session link copied' : 'Copy session link'}
            title={linkCopied ? 'Link copied' : 'Copy session link'}
            className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-slate-400 hover:text-amber-300 hover:bg-slate-800 text-sm font-mono tracking-wide cursor-pointer transition-colors"
          >
            <span className="whitespace-nowrap">{linkCopied ? 'Link Copied!' : sessionId.slice(0, 8)}</span>
            {linkCopied ? (
              <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </button>
        )}
      </header>

      {/* Main Layout Grid */}
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 flex flex-col gap-6">

          {/* GUESSER TURN PHASE: no clues left, so the round is lost */}
          {roundLost && (
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 flex flex-col gap-6 shadow-xl">
              <div className="flex flex-col items-center gap-6 bg-slate-900/80 border border-rose-500/30 p-8 rounded-2xl w-full max-w-lg mx-auto shadow-2xl text-center">
                <h2 className="text-3xl font-black text-rose-400 tracking-wider">
                  {currentLossPhrase()}
                </h2>
                <div className="bg-slate-900/80 px-6 py-3 rounded-xl border border-slate-700">
                  <p className="text-xs text-slate-400 uppercase tracking-widest">Keyword</p>
                  <p className={keywordClass}>
                    {keyWordText}
                  </p>
                </div>
                <ClueCardsGrid
                  clues={submittedClues}
                  invalidClues={invalidClues}
                  normalizeClue={normalizeClue}
                  isExactDuplicateClue={isExactDuplicateClue}
                  getPlayerName={getPlayerName}
                  clueWordClass={clueWordClass}
                />
                <button
                  onClick={handleNextWord}
                  className="mt-2 px-8 py-3.5 bg-slate-700 hover:bg-slate-600 text-slate-100 font-extrabold text-lg rounded-xl transition-all cursor-pointer shadow-lg active:scale-95 flex items-center gap-2"
                >
                  <span>NEXT KEYWORD</span>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* GUESSER TURN PHASE */}
          {gameStatus === 'guesser_turn' && visibleClues.length > 0 && (!roundTimedOut || submittedGuess) && (
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 flex flex-col gap-6 shadow-xl relative">

              {/* Timer & Phase Header */}
              <div className="flex items-center justify-between border-b border-slate-700 pb-4 gap-4">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-2.5 h-2.5 rounded-full animate-ping shrink-0 ${isGuesser ? 'bg-emerald-500' : 'bg-amber-400'}`}></span>
                  <span className="text-sm font-bold text-slate-300 uppercase tracking-wider">
                    Guessing Phase
                  </span>
                </div>
                <div
                  className={`guess-countdown ${guessCountdownSeconds <= 5 ? 'guess-countdown--urgent' : ''} ${guessCountdownSeconds === 0 ? 'guess-countdown--zero' : ''}`}
                  role="timer"
                  aria-live="polite"
                  aria-atomic="true"
                  aria-label={`${guessCountdownSeconds} seconds remaining`}
                >
                  <svg className="guess-countdown__ring" viewBox="0 0 36 36" aria-hidden="true">
                    <circle className="guess-countdown__track" cx="18" cy="18" r="15.5" />
                    <circle
                      className="guess-countdown__progress"
                      cx="18"
                      cy="18"
                      r="15.5"
                      style={{
                        strokeDasharray: `${guessCountdownProgress * 97.4} 97.4`,
                      }}
                    />
                  </svg>
                  <span className="guess-countdown__value">{guessCountdownSeconds}</span>
                </div>
              </div>

              {/* SUB-PHASE A: GUESS IN PROGRESS (No guess submitted yet) */}
              {!submittedGuess ? (
                <div className="flex flex-col gap-6">

                  {/* Guesser Input Form (Only visible to the Guesser) */}
                  {isGuesser && (
                    <div className="flex flex-col gap-3 w-full">
                      <form onSubmit={handleGuessSubmit} className="flex w-full">
                        <input
                          type="text"
                          value={guessInput}
                          onChange={(e) => setGuessInput(e.target.value.replace(/\s+/g, '').toUpperCase())}
                          aria-label="Guess keyword"
                          className={`flex-1 min-w-0 text-center bg-slate-800 border border-slate-600 border-r-0 rounded-l-xl rounded-r-none px-3 py-3 focus:outline-none focus:border-amber-400 uppercase ${keywordClass}`}
                        />
                        <button
                          type="submit"
                          className="px-5 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-r-xl rounded-l-none transition-all cursor-pointer whitespace-nowrap shadow-md active:scale-95"
                        >
                          GUESS KEYWORD
                        </button>
                      </form>
                      <button
                        type="button"
                        onClick={() => setShowGiveUpConfirm(true)}
                        className="self-center px-4 py-2 text-sm font-semibold text-slate-400 hover:text-slate-200 bg-slate-900/60 hover:bg-slate-700/80 border border-slate-700 rounded-lg transition-colors cursor-pointer"
                      >
                        Give up
                      </button>
                    </div>
                  )}

                  {/* Visible Clues Grid (Shown to BOTH Guesser and Clue Givers) */}
                  <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-2 gap-3">
                      {visibleClues.map((c, idx) => {
                        const isFlashed = flashedClueText === c.clue;

                        return (
                          <div
                            key={idx}
                            onClick={() => !isGuesser && handleFlashClue(c.clue)}
                            className={`p-4 rounded-xl text-center border transition-all select-none relative overflow-hidden ${!isGuesser ? 'cursor-pointer' : 'cursor-default'
                              } ${isFlashed
                                ? 'bg-slate-900 border-sky-400 shadow-[0_0_25px_rgba(56,189,248,0.85)] scale-105 z-10'
                                : 'bg-slate-700/80 border-slate-600/80 text-slate-100'
                              }`}
                          >
                            <p className={clueWordClass}>
                              {c.clue}
                            </p>
                            <p className="text-xs italic mt-1 text-slate-300">
                              by {getPlayerName(c.playerKey, c.username)}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Word Submission Widget for Clue Givers while waiting for guesser */}
                  {!isGuesser && (
                    <div className="pt-4 border-t border-slate-700/60">
                      <WordSubmissionWidget
                        newWord={newWord}
                        setNewWord={updateNewWord}
                        onAddWord={handleAddWord}
                        onRemoveWord={handleRemoveWord}
                        wordList={wordList}
                        getPlayerName={getPlayerName}
                        currentUserId={CLIENT_ID}
                        keywordError={keywordError}
                      />
                    </div>
                  )}
                </div>
              ) : (
                /* SUB-PHASE B: GUESS SUBMITTED / RESULTS VIEW (Shown to ALL PLAYERS) */
                <div className="flex flex-col items-center gap-6 text-center py-4 w-full">

                  {/* CASE 1 OR OVERRIDDEN: VICTORY STATE */}
                  {roundWon ? (
                    <div className="flex flex-col items-center gap-4 bg-emerald-500/10 border border-emerald-500/40 p-8 rounded-2xl w-full max-w-lg shadow-2xl animate-fade-in">
                      <span className="text-5xl">🎉</span>
                      <h2 className="text-3xl font-black text-emerald-400 tracking-wider">
                        {currentWinPhrase()}
                      </h2>
                      <div className="bg-slate-900/80 px-6 py-3 rounded-xl border border-slate-700">
                        <p className="text-xs text-slate-400 uppercase tracking-widest">Keyword</p>
                        <p className={keywordClass}>
                          {keyWordText}
                        </p>
                      </div>
                      <ClueCardsGrid
                        clues={submittedClues}
                        invalidClues={invalidClues}
                        normalizeClue={normalizeClue}
                        isExactDuplicateClue={isExactDuplicateClue}
                        getPlayerName={getPlayerName}
                        clueWordClass={clueWordClass}
                      />

                      <button
                        onClick={handleNextWord}
                        className="mt-4 px-8 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-lg rounded-xl transition-all cursor-pointer shadow-lg active:scale-95 flex items-center gap-2"
                      >
                        <span>NEXT KEYWORD</span>
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    /* CASE 2: INCORRECT GUESS STATE */
                    <div className="flex flex-col items-center gap-6 bg-slate-900/80 border border-rose-500/30 p-8 rounded-2xl w-full max-w-lg shadow-2xl">
                      <div className="grid grid-cols-2 gap-4 w-full">
                        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                          <p className="text-xs text-slate-400 uppercase tracking-wider">Guess</p>
                          <p className="text-2xl font-bold text-rose-400 truncate">{submittedGuess}</p>
                        </div>
                        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                          <p className="text-xs text-slate-400 uppercase tracking-wider">Keyword</p>
                          <p className={`${keywordClass} truncate`}>
                            {keyWordText}
                          </p>
                        </div>
                      </div>
                      <ClueCardsGrid
                        clues={submittedClues}
                        invalidClues={invalidClues}
                        normalizeClue={normalizeClue}
                        isExactDuplicateClue={isExactDuplicateClue}
                        getPlayerName={getPlayerName}
                        clueWordClass={clueWordClass}
                      />

                      <div className="flex flex-wrap sm:flex-nowrap gap-3 w-full">
                        <button
                          onClick={handleCloseEnough}
                          className="flex-1 px-5 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold rounded-xl transition-all cursor-pointer shadow-lg active:scale-95 flex items-center justify-center gap-2"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          <span>CLOSE ENOUGH</span>
                        </button>

                        <button
                          onClick={handleNextWord}
                          className="flex-1 px-5 py-3.5 bg-slate-700 hover:bg-slate-600 text-slate-100 font-extrabold rounded-xl transition-all cursor-pointer shadow-lg active:scale-95 flex items-center justify-center gap-2"
                        >
                          <span>NEXT KEYWORD</span>
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* GAME OVER VIEW */}
          {/* 1. GAME OVER VIEW */}
          {gameStatus === 'game_over' ? (
            <>
              <div className="bg-slate-800 border border-slate-700 rounded-2xl p-12 text-center shadow-2xl">
                <h2 className="text-5xl font-extrabold text-red-500 mb-4 tracking-wider">
                  NO KEYWORDS LEFT
                </h2>
                <p className="text-slate-300">
                  Add more keywords to continue.
                </p>
              </div>
              <WordSubmissionWidget
                newWord={newWord}
                setNewWord={updateNewWord}
                onAddWord={handleAddWord}
                onRemoveWord={handleRemoveWord}
                wordList={wordList}
                getPlayerName={getPlayerName}
                currentUserId={CLIENT_ID}
                keywordError={keywordError}
              />
            </>
          ) : gameStatus === 'in_round' ? (
            /* MAIN GAME DIV */
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 flex flex-col gap-6 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-700 pb-4">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full animate-ping ${isGuesser ? 'bg-yellow-400' : 'bg-emerald-500'}`}></span>
                  <span className="text-sm font-bold text-slate-300 uppercase tracking-wider">
                    Clue-Giving Phase
                  </span>
                </div>
                <div className="font-mono text-base font-bold bg-slate-900 border border-slate-700 px-3 py-1 rounded-lg text-slate-100">
                  ⏱️ {clueWaitSeconds}s
                </div>
              </div>
              {isGuesser ? (
                /* GUESSER VIEW */
                <div className="flex flex-col gap-6">
                  <div className="text-center bg-slate-900/60 p-6 rounded-xl border border-slate-700">
                    <p className={waitingLineClass}>
                      Waiting for clue givers...
                    </p>
                  </div>

                  <WordSubmissionWidget
                    newWord={newWord}
                    setNewWord={updateNewWord}
                    onAddWord={handleAddWord}
                    onRemoveWord={handleRemoveWord}
                    wordList={wordList}
                    getPlayerName={getPlayerName}
                    currentUserId={CLIENT_ID}
                    keywordError={keywordError}
                  />
                </div>
              ) : (
                /* CLUE GIVER VIEW */
                <div className="flex flex-col gap-6">
                  {/* Chosen Word Banner */}
                  <div className="text-center bg-slate-900/60 p-6 rounded-xl border border-slate-700">
                    <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">
                      Keyword
                    </p>
                    <p className={keywordClass}>
                      {keyWordText}
                    </p>
                    {currentWord && typeof currentWord === 'object' && (
                      <p className="text-xs italic text-slate-400 mt-2">
                        Submitted by {getPlayerName(currentWord.authorId, currentWord.authorName)}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleSkipKeyword}
                    className="self-center px-4 py-2 text-sm font-semibold text-slate-400 hover:text-slate-200 bg-slate-900/60 hover:bg-slate-700/80 border border-slate-700 rounded-lg transition-colors cursor-pointer uppercase tracking-wide"
                  >
                    SKIP KEYWORD
                  </button>

                  {/* Clue Input Form or Waiting Text */}
                  {!hasSubmittedMyClue && (
                    <form onSubmit={handleGiveClue} className="flex w-full">
                      <input
                        type="text"
                        value={myClueInput}
                        onChange={(e) => {
                          const next = e.target.value.replace(/\s+/g, '').toUpperCase();
                          setMyClueInput(next);
                          if (next) signalTyping();
                          else clearTyping();
                        }}
                        placeholder="Enter a clue for the keyword"
                        className="flex-1 min-w-0 text-center bg-slate-900 border border-slate-700 border-r-0 rounded-l-xl rounded-r-none px-4 py-3 text-lg text-sky-400 font-extrabold placeholder:text-slate-500 placeholder:font-normal focus:outline-none focus:border-sky-400 transition-colors"
                      />
                      <button
                        type="submit"
                        className="w-[199px] shrink-0 px-5 py-3 bg-sky-400 hover:bg-sky-300 text-slate-950 text-lg font-bold rounded-r-xl rounded-l-none transition-all cursor-pointer shadow-md active:scale-95 whitespace-nowrap text-center"
                      >
                        GIVE CLUE
                      </button>
                    </form>
                  )}

                  {canTakeBackClue && (
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-full text-center bg-slate-900/60 p-5 rounded-xl border border-slate-700">
                        <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">
                          Your clue
                        </p>
                        <p className={clueWordClass}>{mySubmittedClue.clue}</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleTakeBackClue}
                        className="self-center px-4 py-2 text-sm font-semibold text-slate-400 hover:text-amber-300 bg-slate-900/60 hover:bg-slate-700/80 border border-slate-700 rounded-lg transition-colors cursor-pointer uppercase tracking-wide"
                      >
                        Change clue
                      </button>
                      <p className={waitingLineClass}>
                        Waiting for other clue givers...
                      </p>
                    </div>
                  )}

                  {/* Shared Clues & Visibility Filter View */}
                  {allCluesSubmitted && (
                    <div className="mt-4 pt-6 border-t border-slate-700 flex flex-col gap-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">
                            Review & Filter Clues
                          </h3>
                          <p className="text-xs text-slate-400 mt-0.5">
                            Click virtually identical clues to hide them from the guesser.
                          </p>
                        </div>

                        {/* READY Button — disabled for READY_FOR_GUESSER_DELAY_SECONDS */}
                        <button
                          type="button"
                          onClick={handleConfirmCluesReady}
                          disabled={readyDelaySeconds > 0}
                          className={
                            readyDelaySeconds > 0
                              ? 'px-5 py-2.5 bg-slate-700 text-amber-400 border border-amber-500/30 font-extrabold rounded-xl shadow-lg cursor-not-allowed select-none text-sm tracking-wide'
                              : 'px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold rounded-xl transition-all cursor-pointer shadow-lg active:scale-95 text-sm'
                          }
                        >
                          {readyDelaySeconds > 0
                            ? `READY IN ${readyDelaySeconds}…`
                            : 'READY FOR GUESSER'}
                        </button>
                      </div>

                      <ClueCardsGrid
                        clues={submittedClues}
                        invalidClues={invalidClues}
                        normalizeClue={normalizeClue}
                        isExactDuplicateClue={isExactDuplicateClue}
                        getPlayerName={getPlayerName}
                        clueWordClass={clueWordClass}
                        interactive
                        isGuesser={isGuesser}
                        onToggleClue={handleToggleClueVisibility}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : gameStatus === 'lobby' ? (

            /* LOBBY VIEW: Word Submission & Start Game */
            <div className="flex flex-col gap-6">

              {/* Start Game Action Control */}
              <div className="flex flex-col items-center justify-center p-6 bg-slate-800 rounded-xl border border-slate-700 shadow-xl">
                {/* Scenario A: This player has clicked START GAME */}
                {hasClickedStart ? (
                  <button
                    disabled
                    className="w-full py-4 px-6 font-extrabold text-lg rounded-xl transition-all bg-slate-700 text-amber-400 border border-amber-500/30 shadow-lg cursor-not-allowed select-none tracking-wide"
                  >
                    STARTING SOON{animatedDots}
                  </button>
                ) : (
                  /* Scenario B: Button active or glowing call-to-action for other players */
                  <button
                    onClick={handleStartGame}
                    disabled={wordList.length < 5}
                    className={`w-full py-4 px-6 font-extrabold text-lg rounded-xl transition-all shadow-lg ${wordList.length < 5
                      ? 'bg-slate-700 text-slate-500 cursor-not-allowed border border-slate-600'
                      : startRequesters.size > 0
                        ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-[0_0_25px_rgba(16,185,129,0.7)] animate-pulse border-2 border-emerald-300 scale-[1.02] cursor-pointer'
                        : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-950/20 active:scale-[0.98] cursor-pointer'
                      }`}
                  >
                    START GAME
                  </button>
                )}

                {/* Status Helper Message (Only shown when under 5 words) */}
                {wordList.length < 5 && (
                  <p className="text-xs text-amber-400/80 mt-5 font-medium flex items-center gap-1.5">
                    5+ words to start ({wordList.length}/5 added)
                  </p>
                )}
              </div>

              <WordSubmissionWidget
                newWord={newWord}
                setNewWord={updateNewWord}
                onAddWord={handleAddWord}
                onRemoveWord={handleRemoveWord}
                wordList={wordList}
                getPlayerName={getPlayerName}
                currentUserId={CLIENT_ID}
                keywordError={keywordError}
              />

            </div>
          ) : null}
        </div>

        {/* Players column */}
        <div className="flex flex-col gap-6">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 flex flex-col h-fit">
            <div className="text-sm font-semibold mb-4 text-slate-200 flex items-center gap-2">
              <span className="uppercase">Players ({onlinePlayers.length})</span>
            </div>

            <div className="flex flex-col gap-2.5">
              {onlinePlayers.map((playerObj, idx) => {
                const isMe = playerObj.key === CLIENT_ID;
                const isGuesserPlayer = playerObj.key === currentGuesserId;

                return (
                  <div key={idx} className="flex flex-col">
                    {isMe && isEditingName ? (
                      <input
                        ref={editInputRef}
                        type="text"
                        value={tempName}
                        onChange={(e) => setTempName(e.target.value)}
                        onBlur={() => handleSaveUsername(tempName)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleSaveUsername(tempName);
                          }
                        }}
                        className="w-full bg-slate-900 text-amber-300 px-3 py-2 rounded-lg border-2 border-amber-400 focus:outline-none text-sm font-medium shadow-inner"
                      />
                    ) : (
                      <div
                        onClick={() => {
                          if (isMe) {
                            setTempName(myUsername);
                            setIsEditingName(true);
                          }
                        }}
                        className={`p-2.5 rounded-lg border text-sm font-medium flex items-center justify-between gap-2 transition-all ${isMe
                          ? 'border-amber-500/30 bg-amber-500/10 text-amber-300 cursor-pointer hover:border-amber-400/80'
                          : 'border-slate-700/50 bg-slate-700/30 text-slate-300'
                          }`}
                      >
                        <span
                          className="truncate min-w-0"
                          title={`${playerObj.username}${isMe ? ' (You)' : ''}`}
                        >
                          {playerObj.username} {isMe && '(You)'}
                        </span>

                        <span className="flex items-center gap-1.5 shrink-0">
                          {playerObj.isTyping && (
                            <span
                              className="typing-indicator"
                              aria-label="typing"
                              title="Typing"
                            >
                              <span className="typing-dot" />
                              <span className="typing-dot" />
                              <span className="typing-dot" />
                            </span>
                          )}
                          {isGuesserPlayer && (
                            <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-500 text-slate-950 px-1.5 py-0.5 rounded">
                              Guesser
                            </span>
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {pastKeywords.length > 0 && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 flex flex-col h-fit">
              <div className="text-sm font-semibold mb-4 text-slate-200 flex items-center gap-1">
                <span className="uppercase">Past Keywords ({pastKeywords.length}</span>
                <span className="mx-0.5 h-3 w-px bg-slate-300 shrink-0" aria-hidden="true"></span>
                <span>{pastKeywordPercent}%</span>
                <svg className="w-3.5 h-3.5 text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span>)</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {pastKeywords.map((item, idx) => (
                  <span
                    key={`${item.text}-${idx}`}
                    className={`text-xs font-bold px-2 py-0.5 rounded-full border text-amber-500 ${item.correct
                      ? 'border-emerald-400'
                      : 'border-rose-400'
                      }`}
                  >
                    {item.text}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <a
        href="https://boardgamegeek.com/boardgame/254640/just-one"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-3 left-1/2 z-20 w-max max-w-[calc(100%-2rem)] -translate-x-1/2 text-center text-xs italic leading-relaxed text-slate-400/60 underline-offset-2 hover:text-slate-200 hover:underline"
      >
        based on Just One designed by Ludovic Roudy & Bruno Sautter
      </a>

      {showGiveUpConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
          role="presentation"
          onClick={() => setShowGiveUpConfirm(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="give-up-title"
            className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="give-up-title" className="text-xl font-bold text-slate-100">
              Give up this round?
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              The round ends as a loss. The keyword will be revealed.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setShowGiveUpConfirm(false)}
                className="flex-1 px-4 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-100 font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmGiveUp}
                className="flex-1 px-4 py-2.5 rounded-xl bg-slate-600 hover:bg-slate-500 text-slate-200 font-semibold border border-slate-500 transition-colors cursor-pointer"
              >
                Give up
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}