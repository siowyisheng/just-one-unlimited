import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';

import WordSubmissionWidget from './components/WordSubmissionWidget';

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

const CLIENT_ID = getPersistentClientId();

export default function GameRoom() {
  const [sessionId, setSessionId] = useState(null);
  const [wordList, setWordList] = useState([]);
  const [newWord, setNewWord] = useState('');
  const [loading, setLoading] = useState(false);

  // Username & Presence State
  const [myUsername, setMyUsername] = useState(getInitialUsername);
  const [tempName, setTempName] = useState(myUsername);
  const [isEditingName, setIsEditingName] = useState(false);
  const [onlinePlayers, setOnlinePlayers] = useState([]); // [{ key, username }]

  // Start Game & Game State
  const [hasClickedStart, setHasClickedStart] = useState(false);
  const [startRequesters, setStartRequesters] = useState(new Set());
  const [gameStatus, setGameStatus] = useState('lobby'); // 'lobby', 'in_round', 'game_over'
  const [currentGuesserId, setCurrentGuesserId] = useState(null);
  const [currentWord, setCurrentWord] = useState(null);
  const [submittedClues, setSubmittedClues] = useState([]);
  const [myClueInput, setMyClueInput] = useState('');

  // Tracks clues marked invisible (e.g. ['apple', 'fruit'])
  const [invalidClues, setInvalidClues] = useState([]);

  // Guesser & Clue Interaction State
  const [guessInput, setGuessInput] = useState('');
  const [submittedGuess, setSubmittedGuess] = useState(null);
  const [roundWon, setRoundWon] = useState(false);

  // Clue Glow / Flash State
  const [flashedClueText, setFlashedClueText] = useState(null);

  // Timer State
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [clueWaitSeconds, setClueWaitSeconds] = useState(0);
  const roundStartTimeRef = useRef(null);

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

  // 1. Ticking Timer: Starts when game_status transitions to 'guesser_turn'
  useEffect(() => {
    let interval = null;
    if (gameStatus === 'guesser_turn' && !roundWon) {
      if (!roundStartTimeRef.current) {
        roundStartTimeRef.current = Date.now();
      }
      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - roundStartTimeRef.current) / 1000);
        setTimerSeconds(elapsed);
      }, 1000);
    } else if (gameStatus !== 'guesser_turn') {
      roundStartTimeRef.current = null;
      setTimerSeconds(0);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [gameStatus, roundWon]);

  // Seconds the guesser has been waiting for clues in this round
  useEffect(() => {
    const waitingForClues = gameStatus === 'in_round' && currentGuesserId === CLIENT_ID;
    if (!waitingForClues) return;

    const startedAt = Date.now();
    const interval = setInterval(() => {
      setClueWaitSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    return () => {
      clearInterval(interval);
      setClueWaitSeconds(0);
    };
  }, [gameStatus, currentGuesserId]);

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
        if (data.invalid_clues) setInvalidClues(data.invalid_clues);

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
          if (data.round_won) playVictorySound();
          setRoundWon(data.round_won);
        }
        if (data.last_flashed_clue) {
          setFlashedClueText(data.last_flashed_clue.clueText);
          setTimeout(() => setFlashedClueText(null), 400); // 0.4s shine duration
        }
      }
    );

    // Presence listener
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const players = [];

      Object.keys(state).forEach((key) => {
        const presences = state[key];
        if (presences && presences.length > 0) {
          players.push({
            key, // CLIENT_ID
            username: presences[0].username || 'Anonymous',
          });
        }
      });

      setOnlinePlayers(players);
    });

    // Start Game Broadcast Listener
    channel.on('broadcast', { event: 'start_game_click' }, (payload) => {
      const pKey = payload.payload?.playerKey;
      if (pKey) {
        setStartRequesters((prev) => {
          const next = new Set(prev);
          next.add(pKey);
          return next;
        });
      }
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ username: myUsername });
      }
    });

    return () => {
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

  // Helper: Start Next Round Logic
  // Helper: Start Next Round Logic with Weighted Word Selection
  const startNextRound = async (availableWords, playerList) => {
    if (!availableWords || availableWords.length === 0) {
      await supabase
        .from('game_sessions')
        .update({ game_status: 'game_over' })
        .eq('id', sessionId);
      return;
    }

    // 1. Fetch existing player_word_counts from database
    const { data: sessionData } = await supabase
      .from('game_sessions')
      .select('player_word_counts')
      .eq('id', sessionId)
      .single();

    const counts = sessionData?.player_word_counts || {};

    // 2. Find a valid guesser who has words NOT submitted by them
    let chosenGuesser = null;
    let validWordPool = [];

    for (let i = 0; i < playerList.length; i++) {
      const candidate = playerList[i];
      // Filter out words authored by this guesser candidate
      const pool = availableWords.filter(
        (w) => typeof w === 'object' && w.authorId !== candidate.key
      );

      if (pool.length > 0) {
        chosenGuesser = candidate;
        validWordPool = pool;
        break;
      }
    }

    // If no player has valid words available, Game Over
    if (!chosenGuesser || validWordPool.length === 0) {
      await supabase
        .from('game_sessions')
        .update({ game_status: 'game_over' })
        .eq('id', sessionId);
      return;
    }

    // 3. Calculate weights for each word in validWordPool based on author's count
    const weightedPool = validWordPool.map((word) => {
      const authorId = typeof word === 'object' ? word.authorId : 'unknown';
      const timesChosen = counts[authorId] || 0;
      // Higher weight for players with fewer chosen words
      const weight = 1 / (timesChosen + 1);
      return { word, weight };
    });

    // 4. Perform Weighted Random Selection
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

    // 5. Update counts for the chosen word's author
    const authorId = typeof selectedWord === 'object' ? selectedWord.authorId : null;
    const updatedCounts = { ...counts };
    if (authorId) {
      updatedCounts[authorId] = (updatedCounts[authorId] || 0) + 1;
    }

    // 6. Remove selected word from remaining word list
    const updatedWordList = availableWords.filter((w) => w !== selectedWord);

    // 7. Push new round state and updated counts to Supabase
    await supabase
      .from('game_sessions')
      .update({
        game_status: 'in_round',
        current_guesser_id: chosenGuesser.key,
        current_word: selectedWord,
        submitted_clues: [],
        invalid_clues: [],
        submitted_guess: null,
        round_won: false,
        word_list: updatedWordList,
        player_word_counts: updatedCounts,
      })
      .eq('id', sessionId);
  };

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

    // Update Supabase Realtime Presence tracking
    if (channelRef.current) {
      await channelRef.current.track({ username: trimmed });
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
    if (updatedRequesters.size >= 2) {
      startNextRound(wordList, onlinePlayers);
    }
  };

  const handleAddWord = async (e) => {
    e.preventDefault();
    const trimmed = newWord.trim().replace(/\s+/g, '').toUpperCase();
    if (!trimmed || !sessionId) return;

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

  // Handle Giving a Clue
  const handleGiveClue = async (e) => {
    e.preventDefault();
    const trimmed = myClueInput.trim().replace(/\s+/g, ''); // Strip all spaces
    if (!trimmed || !sessionId) return;

    const newClueEntry = {
      clue: trimmed,
      playerKey: CLIENT_ID,
      username: myUsername,
    };

    const updatedClues = [...submittedClues, newClueEntry];
    setSubmittedClues(updatedClues);
    setMyClueInput('');

    await supabase
      .from('game_sessions')
      .update({ submitted_clues: updatedClues })
      .eq('id', sessionId);
  };

  // Toggle a clue's visibility state (between translucent/invisible and active)
  const handleToggleClueVisibility = async (clueText) => {
    if (isGuesser || !sessionId) return;

    const normalized = normalizeClue(clueText);
    let updatedInvalid;

    if (invalidClues.includes(normalized)) {
      // Make visible again
      updatedInvalid = invalidClues.filter((c) => c !== normalized);
    } else {
      // Mark as invisible
      updatedInvalid = [...invalidClues, normalized];
    }

    setInvalidClues(updatedInvalid);

    await supabase
      .from('game_sessions')
      .update({ invalid_clues: updatedInvalid })
      .eq('id', sessionId);
  };

  // Transition game phase when READY is clicked
  const handleConfirmCluesReady = async () => {
    if (!sessionId) return;

    await supabase
      .from('game_sessions')
      .update({ game_status: 'guesser_turn' })
      .eq('id', sessionId);
  };

  // 3. Trigger Clue Glow / Shine Effect for all players
  const handleFlashClue = async (clueText) => {
    if (!sessionId) return;

    await supabase
      .from('game_sessions')
      .update({
        last_flashed_clue: {
          clueText,
          timestamp: Date.now(),
        },
      })
      .eq('id', sessionId);
  };

  // 4. Handle Guesser Submission
  const handleGuessSubmit = async (e) => {
    e.preventDefault();
    const trimmed = guessInput.trim().replace(/\s+/g, ''); // Strip spaces
    if (!trimmed || !sessionId) return;

    const keyWordText = typeof currentWord === 'object' ? currentWord.text : currentWord;
    const isMatch = trimmed.toLowerCase() === keyWordText.toLowerCase();

    // 1. Update database for ALL players to receive
    const { error } = await supabase
      .from('game_sessions')
      .update({
        submitted_guess: trimmed,
        round_won: isMatch,
      })
      .eq('id', sessionId);

    if (error) {
      console.error('Error submitting guess:', error);
      return;
    }

    // 2. Play local victory sound if correct
    if (isMatch) {
      playVictorySound();
    }
  };

  // 5. Handle "CLOSE ENOUGH" Override Action
  const handleCloseEnough = async () => {
    if (!sessionId) return;
    setRoundWon(true);
    playVictorySound();

    await supabase
      .from('game_sessions')
      .update({ round_won: true })
      .eq('id', sessionId);
  };

  // 6. Handle "NEXT WORD" Button Click (Advances Guesser & Word)
  const handleNextWord = async () => {
    if (!sessionId) return;

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

    // Call round setup helper
    await startNextRound(wordList, nextPlayersOrder);
  };

  // User details & round helpers
  const isGuesser = CLIENT_ID === currentGuesserId;
  const numClueGivers = onlinePlayers.filter((p) => p.key !== currentGuesserId).length;
  const hasSubmittedMyClue = submittedClues.some((c) => c.playerKey === CLIENT_ID);
  const allCluesSubmitted = submittedClues.length >= numClueGivers && numClueGivers > 0;

  // Auto-flag exact duplicate clues as invisible when all clues arrive
  useEffect(() => {
    if (
      gameStatus === 'in_round' &&
      allCluesSubmitted &&
      submittedClues.length > 0
    ) {
      const exactDupes = Array.from(getAutoDeduplicatedClues(submittedClues));

      // Combine existing manually hidden clues with exact duplicate clues
      const combinedInvalid = Array.from(
        new Set([...invalidClues, ...exactDupes])
      );

      // Only update if there are new duplicate items not yet present in invalidClues
      if (combinedInvalid.length !== invalidClues.length) {
        setInvalidClues(combinedInvalid);
        supabase
          .from('game_sessions')
          .update({ invalid_clues: combinedInvalid })
          .eq('id', sessionId);
      }
    }
  }, [allCluesSubmitted, submittedClues, gameStatus]);



  return (
    <div className="flex flex-col items-center min-h-screen bg-slate-900 text-slate-100 p-6">
      <header className="mb-8 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight text-amber-400">
          Just One Unlimited
        </h1>
        {sessionId && (
          <button
            type="button"
            onClick={copySessionLink}
            aria-label={linkCopied ? 'Session link copied' : 'Copy session link'}
            title={linkCopied ? 'Link copied' : 'Copy session link'}
            className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-slate-400 hover:text-amber-300 hover:bg-slate-800 text-sm font-mono tracking-wide cursor-pointer transition-colors"
          >
            <span>{sessionId.slice(0, 8)}</span>
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

          {/* GUESSER TURN PHASE */}
          {gameStatus === 'guesser_turn' && (
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 flex flex-col gap-6 shadow-xl relative overflow-hidden">

              {/* Timer & Phase Header */}
              <div className="flex items-center justify-between border-b border-slate-700 pb-4">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping"></span>
                  <span className="text-sm font-bold text-slate-300 uppercase tracking-wider">
                    Guessing Phase
                  </span>
                </div>
                <div className="font-mono text-base font-bold bg-slate-900 border border-slate-700 px-3 py-1 rounded-lg text-amber-400">
                  ⏱️ {timerSeconds}s
                </div>
              </div>

              {/* SUB-PHASE A: GUESS IN PROGRESS (No guess submitted yet) */}
              {!submittedGuess ? (
                <div className="flex flex-col gap-6">

                  {/* Guesser Input Form (Only visible to the Guesser) */}
                  {isGuesser && (
                    <div className="bg-slate-900/60 p-6 rounded-xl border border-slate-700 flex flex-col items-center gap-4 text-center">
                      <h2 className="text-2xl font-black text-amber-400 tracking-wide">
                        ENTER YOUR GUESS
                      </h2>
                      <form onSubmit={handleGuessSubmit} className="flex gap-2 w-full max-w-md">
                        <input
                          type="text"
                          value={guessInput}
                          onChange={(e) => setGuessInput(e.target.value.replace(/\s+/g, ''))}
                          placeholder="One word guess (no spaces)..."
                          className="flex-1 bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:border-amber-400 text-lg font-medium"
                        />
                        <button
                          type="submit"
                          className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap shadow-lg"
                        >
                          SUBMIT GUESS
                        </button>
                      </form>
                    </div>
                  )}

                  {/* Visible Clues Grid (Shown to BOTH Guesser and Clue Givers) */}
                  <div className="flex flex-col gap-3">
                    <p className="text-xs text-slate-400 italic">
                      {isGuesser
                        ? 'Watch the clues carefully! Clue givers can tap them to highlight key hints.'
                        : 'Click any clue to trigger a glowing shine on everyone’s screen!'}
                    </p>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {(() => {
                        // Get exact duplicates set
                        const exactDupes = getAutoDeduplicatedClues(submittedClues);

                        return submittedClues
                          .filter((c) => {
                            const norm = c.clue.trim().toLowerCase();
                            const isManuallyHidden = invalidClues.includes(norm);
                            const isExactDup = exactDupes.has(norm);

                            // Exclude both manually hidden clues and exact duplicates!
                            return !isManuallyHidden && !isExactDup;
                          })
                          .map((c, idx) => {
                            const isFlashed = flashedClueText === c.clue;

                            return (
                              <div
                                key={idx}
                                onClick={() => !isGuesser && handleFlashClue(c.clue)}
                                className={`p-4 rounded-xl text-center border transition-all select-none relative overflow-hidden ${!isGuesser ? 'cursor-pointer' : 'cursor-default'
                                  } ${isFlashed
                                    ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-[0_0_25px_rgba(251,191,36,0.8)] scale-105 z-10'
                                    : 'bg-slate-700/80 border-slate-600/80 text-slate-100'
                                  }`}
                              >
                                <p className={`text-2xl font-extrabold ${isFlashed ? 'text-slate-950' : 'text-amber-300'}`}>
                                  {c.clue}
                                </p>
                                <p className={`text-xs italic mt-1 ${isFlashed ? 'text-slate-900 font-semibold' : 'text-slate-400'}`}>
                                  by {getPlayerName(c.playerKey, c.username)}
                                </p>
                              </div>
                            );
                          });
                      })()}
                    </div>
                  </div>

                  {/* Word Submission Widget for Clue Givers while waiting for guesser */}
                  {!isGuesser && (
                    <div className="pt-4 border-t border-slate-700/60">
                      <WordSubmissionWidget
                        newWord={newWord}
                        setNewWord={setNewWord}
                        onAddWord={handleAddWord}
                        onRemoveWord={handleRemoveWord}
                        wordList={wordList}
                        getPlayerName={getPlayerName}
                        currentUserId={CLIENT_ID}
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
                        YOU WON THE ROUND!
                      </h2>
                      <div className="bg-slate-900/80 px-6 py-3 rounded-xl border border-slate-700">
                        <p className="text-xs text-slate-400 uppercase tracking-widest">Key Word</p>
                        <p className="text-3xl font-extrabold text-amber-300">
                          {typeof currentWord === 'object' ? currentWord.text : currentWord}
                        </p>
                      </div>

                      <button
                        onClick={handleNextWord}
                        className="mt-4 px-8 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-lg rounded-xl transition-all cursor-pointer shadow-lg active:scale-95 flex items-center gap-2"
                      >
                        <span>NEXT WORD</span>
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
                          <p className="text-xs text-slate-400 uppercase tracking-wider">Guessed Word</p>
                          <p className="text-2xl font-bold text-rose-400 truncate">{submittedGuess}</p>
                        </div>
                        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                          <p className="text-xs text-slate-400 uppercase tracking-wider">Key Word</p>
                          <p className="text-2xl font-bold text-amber-300 truncate">
                            {typeof currentWord === 'object' ? currentWord.text : currentWord}
                          </p>
                        </div>
                      </div>

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
                          <span>NEXT WORD</span>
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
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-12 text-center shadow-2xl">
              <h2 className="text-5xl font-extrabold text-red-500 mb-4 tracking-wider">
                GAME OVER
              </h2>
              <p className="text-slate-300">
                There are no valid words left for remaining guessers!
              </p>
            </div>
          ) : gameStatus === 'in_round' ? (
            /* MAIN GAME DIV */
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 flex flex-col gap-6 shadow-xl">
              {isGuesser ? (
                /* GUESSER VIEW */
                <div className="flex flex-col gap-6">
                  <div className="text-center bg-slate-900/60 p-6 rounded-xl border border-slate-700">
                    <h2 className="text-3xl font-extrabold text-amber-400 mb-1">
                      YOU ARE THE GUESSER
                    </h2>
                    <p className="text-slate-400 text-sm">
                      Waiting for clue givers ({clueWaitSeconds}s)
                    </p>
                  </div>

                  <WordSubmissionWidget
                    newWord={newWord}
                    setNewWord={setNewWord}
                    onAddWord={handleAddWord}
                    onRemoveWord={handleRemoveWord}
                    wordList={wordList}
                    getPlayerName={getPlayerName}
                    currentUserId={CLIENT_ID}
                  />
                </div>
              ) : (
                /* CLUE GIVER VIEW */
                <div className="flex flex-col gap-6">
                  {/* Chosen Word Banner */}
                  <div className="text-center bg-slate-900/60 p-6 rounded-xl border border-slate-700">
                    <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">
                      Chosen Word
                    </p>
                    <h2 className="text-5xl font-black text-amber-300 tracking-wide">
                      {typeof currentWord === 'object' ? currentWord.text : currentWord}
                    </h2>
                    {typeof currentWord === 'object' && (
                      <p className="text-xs italic text-slate-400 mt-2">
                        Submitted by {getPlayerName(currentWord.authorId, currentWord.authorName)}
                      </p>
                    )}
                  </div>

                  {/* Clue Input Form or Waiting Text */}
                  {!hasSubmittedMyClue && (
                    <form onSubmit={handleGiveClue} className="flex justify-center">
                      <input
                        type="text"
                        value={myClueInput}
                        onChange={(e) => setMyClueInput(e.target.value.replace(/\s+/g, ''))} // Reject spaces
                        placeholder="Enter a one-word clue"
                        className="w-64 max-w-[60%] bg-slate-900 border border-slate-700 border-r-0 rounded-l-xl rounded-r-none px-4 py-3 text-slate-100 focus:outline-none focus:border-sky-400 transition-colors"
                      />
                      <button
                        type="submit"
                        className="px-5 py-3 bg-sky-400 hover:bg-sky-300 text-slate-950 font-bold rounded-r-xl rounded-l-none transition-all cursor-pointer shadow-md active:scale-95 whitespace-nowrap"
                      >
                        GIVE CLUE
                      </button>
                    </form>
                  )}

                  {hasSubmittedMyClue && !allCluesSubmitted && (
                    <p className="text-center text-amber-400/90 font-medium py-3 italic animate-pulse">
                      Waiting for other clues...
                    </p>
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

                        {/* READY Button */}
                        <button
                          onClick={handleConfirmCluesReady}
                          className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold rounded-xl transition-all cursor-pointer shadow-lg active:scale-95 text-sm"
                        >
                          READY FOR GUESSER
                        </button>
                      </div>

                      {/* Clues Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {submittedClues.map((c, idx) => {
                          const norm = normalizeClue(c.clue);
                          const isExactDup = isExactDuplicateClue(c.clue, submittedClues);
                          const isManuallyHidden = invalidClues.includes(norm) && !isExactDup;
                          const isInvisible = isExactDup || isManuallyHidden;

                          return (
                            <div
                              key={idx}
                              onClick={() => {
                                // Only allow toggling if it's NOT an exact duplicate and user is NOT the guesser
                                if (!isExactDup && !isGuesser) {
                                  handleToggleClueVisibility(c.clue);
                                }
                              }}
                              className={`p-3.5 rounded-xl text-center border transition-all select-none relative ${
                                /* 1. EXACT DUPLICATES (Permanently Disabled / Locked) */
                                isExactDup
                                  ? 'opacity-50 bg-slate-900/60 border-slate-800 scale-[0.96] cursor-not-allowed'
                                  /* 2. MANUALLY HIDDEN CLUES (Can be toggled back) */
                                  : isManuallyHidden
                                    ? 'opacity-50 bg-slate-800/40 border-slate-700/50 scale-[0.97] cursor-pointer hover:border-amber-400/40'

                                    /* 3. VISIBLE ACTIVE CLUES */
                                    : 'bg-slate-700/70 border-slate-600/80 hover:border-amber-400/60 shadow-md cursor-pointer'
                                }`}
                            >
                              {/* Status Badges */}
                              {isManuallyHidden ? (
                                <span className="absolute top-2 right-2 text-[9px] font-extrabold bg-rose-500/20 text-rose-300 border border-rose-500/40 px-1.5 py-0.5 rounded uppercase tracking-wider">
                                  HIDDEN
                                </span>
                              ) : null}

                              <p
                                className={`text-xl font-bold transition-all ${isInvisible ? 'text-slate-400 line-through' : 'text-amber-300'
                                  }`}
                              >
                                {c.clue}
                              </p>
                              <p className="text-xs italic text-slate-400 mt-1">
                                by {getPlayerName(c.playerKey, c.username)}
                              </p>
                            </div>
                          );
                        })}
                      </div>
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
                setNewWord={setNewWord}
                onAddWord={handleAddWord}
                onRemoveWord={handleRemoveWord}
                wordList={wordList}
                getPlayerName={getPlayerName}
                currentUserId={CLIENT_ID}
              />

            </div>
          ) : null}
        </div>

        {/* Players Sidebar Widget */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 flex flex-col h-fit">
          <h2 className="text-lg font-semibold mb-4 text-slate-200 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Players ({onlinePlayers.length})</span>
          </h2>

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
                      className={`p-2.5 rounded-lg border text-sm font-medium flex items-center justify-between transition-all ${isMe
                        ? 'border-amber-500/30 bg-amber-500/10 text-amber-300 cursor-pointer hover:border-amber-400/80'
                        : 'border-slate-700/50 bg-slate-700/30 text-slate-300'
                        }`}
                    >
                      <span className="truncate">
                        {playerObj.username} {isMe && '(You)'}
                      </span>

                      {isGuesserPlayer && (
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-500 text-slate-950 px-1.5 py-0.5 rounded">
                          Guesser
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}