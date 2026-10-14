// Shared room timer options. "infinity" means no limit.
export const GUESS_TIMER_OPTIONS = [8, 15, 30, 45, 60, 'infinity'];
export const DEFAULT_GUESS_TIMER = 30;
export const DEFAULT_CLUE_TIMER = 'infinity';
export const TIMER_VOTE_SECONDS = 10;
export const TIMER_VOTE_RESULT_MS = 2500;
// Authoritative cutoff is 1s after the UI hits 0, so a last-moment action still lands.
export const GUESS_TIMEOUT_LEEWAY_SECONDS = 1;

export const isInfiniteGuessTimer = (value) => value === 'infinity';

export const normalizeTimer = (value, fallback) => {
  if (value === 'infinity') return 'infinity';
  const n = Number(value);
  if (GUESS_TIMER_OPTIONS.includes(n)) return n;
  return fallback;
};

export const normalizeGuessTimer = (value) => normalizeTimer(value, DEFAULT_GUESS_TIMER);

export const normalizeClueTimer = (value) => normalizeTimer(value, DEFAULT_CLUE_TIMER);

export const guessTimersEqual = (a, b) => normalizeGuessTimer(a) === normalizeGuessTimer(b);

export const clueTimersEqual = (a, b) => normalizeClueTimer(a) === normalizeClueTimer(b);

export const timerVoteTarget = (vote) => (vote?.target === 'clue' ? 'clue' : 'guess');

export const normalizeTimerVote = (raw) => {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string') return null;
  const status = raw.status === 'passed' ? 'passed' : raw.status === 'open' ? 'open' : null;
  if (!status) return null;
  const target = raw.target === 'clue' ? 'clue' : 'guess';
  const fallback = target === 'clue' ? DEFAULT_CLUE_TIMER : DEFAULT_GUESS_TIMER;
  const to = raw.to === 'infinity' ? 'infinity' : normalizeTimer(raw.to, fallback);
  if (raw.to !== 'infinity' && !GUESS_TIMER_OPTIONS.includes(Number(raw.to))) return null;
  const votes = {};
  if (raw.votes && typeof raw.votes === 'object' && !Array.isArray(raw.votes)) {
    Object.entries(raw.votes).forEach(([key, choice]) => {
      if (choice === 'for' || choice === 'against') votes[key] = choice;
    });
  }
  return {
    id: raw.id,
    proposerKey: typeof raw.proposerKey === 'string' ? raw.proposerKey : '',
    proposerName:
      typeof raw.proposerName === 'string' && raw.proposerName.trim()
        ? raw.proposerName.trim()
        : 'Anonymous',
    target,
    from: normalizeTimer(raw.from, fallback),
    to,
    startedAt: typeof raw.startedAt === 'string' ? raw.startedAt : null,
    resolvedAt: typeof raw.resolvedAt === 'string' ? raw.resolvedAt : null,
    votes,
    status,
  };
};

// FOR votes from players still in the room. Passes at >= half the current roster.
export const forVotesAmong = (vote, players) => {
  if (!vote) return 0;
  return (players || []).reduce(
    (count, player) => (vote.votes?.[player.key] === 'for' ? count + 1 : count),
    0
  );
};

export const voteReachesThreshold = (vote, players) => {
  const total = players?.length || 0;
  if (!vote || vote.status !== 'open' || total <= 0) return false;
  return forVotesAmong(vote, players) * 2 >= total;
};
