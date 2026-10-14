import React, { useEffect, useId, useRef, useState } from 'react';

const CARD_WIDTH = 760;
const OUTER = 28;
const PAD = 36;
const SCALE_MAX_HEIGHT = 16000;

const COLORS = {
  canvas: '#0b1220',
  card: '#1e293b',
  tile: '#0f172a',
  border: '#334155',
  row: '#243044',
  text: '#f1f5f9',
  muted: '#94a3b8',
  faint: '#64748b',
  amber: '#f59e0b',
  amberSoft: 'rgba(245, 158, 11, 0.14)',
  amberBorder: 'rgba(245, 158, 11, 0.45)',
  emerald: '#34d399',
  rose: '#fb7185',
  white: '#f8fafc',
};

const uiFont = 'ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif';
const displayFont = `Fraunces, Georgia, "Times New Roman", serif`;

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function fitText(ctx, text, maxWidth) {
  const value = String(text ?? '');
  if (ctx.measureText(value).width <= maxWidth) return value;
  let trimmed = value;
  while (trimmed.length > 1 && ctx.measureText(`${trimmed}…`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed}…`;
}

function keywordPhrase(count) {
  return `${count} ${count === 1 ? 'keyword' : 'keywords'} played`;
}

function guessPhrase(percent) {
  return `${percent}% correct guesses`;
}

function layoutChips(ctx, items, maxWidth) {
  ctx.font = `700 15px ${uiFont}`;
  const gap = 8;
  const chipH = 32;
  const rows = [];
  let row = [];
  let rowW = 0;
  items.forEach((item) => {
    const label = fitText(ctx, item.text, maxWidth - 24);
    const w = Math.min(maxWidth, Math.ceil(ctx.measureText(label).width) + 24);
    if (row.length && rowW + gap + w > maxWidth) {
      rows.push(row);
      row = [];
      rowW = 0;
    }
    row.push({ ...item, label, w, h: chipH });
    rowW += (row.length > 1 ? gap : 0) + w;
  });
  if (row.length) rows.push(row);
  return { rows, gap, chipH };
}

function drawCard(ctx, { keywords, players, percent }, measureOnly) {
  const inner = CARD_WIDTH - PAD * 2;
  const width = CARD_WIDTH + OUTER * 2;
  let y = OUTER;

  const paint = (fn) => {
    if (!measureOnly) fn();
  };

  const cardTop = y;
  y += PAD;

  ctx.font = `700 28px ${displayFont}`;
  const titleY = y + 28;
  paint(() => {
    ctx.fillStyle = COLORS.white;
    ctx.textBaseline = 'alphabetic';
    const just = 'Just ';
    const one = 'ONE';
    const rest = ' Unlimited';
    ctx.font = `700 28px ${displayFont}`;
    ctx.fillStyle = COLORS.white;
    ctx.fillText(just, OUTER + PAD, titleY);
    const justW = ctx.measureText(just).width;
    ctx.fillStyle = COLORS.amber;
    ctx.fillText(one, OUTER + PAD + justW, titleY);
    const oneW = ctx.measureText(one).width;
    ctx.fillStyle = COLORS.white;
    ctx.fillText(rest, OUTER + PAD + justW + oneW, titleY);
  });
  y += 40;

  ctx.font = `700 40px ${displayFont}`;
  paint(() => {
    ctx.fillStyle = COLORS.text;
    ctx.font = `700 40px ${displayFont}`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('Past Keywords', OUTER + PAD, y + 36);
  });
  y += 56;

  const tileGap = 14;
  const tileW = (inner - tileGap) / 2;
  const tileH = 92;
  const tiles = [
    { value: String(keywords.length), label: keywords.length === 1 ? 'keyword played' : 'keywords played', valueColor: COLORS.text },
    { value: `${percent}%`, label: 'correct guesses', valueColor: COLORS.emerald },
  ];
  tiles.forEach((tile, index) => {
    const x = OUTER + PAD + index * (tileW + tileGap);
    paint(() => {
      roundRect(ctx, x, y, tileW, tileH, 16);
      ctx.fillStyle = COLORS.tile;
      ctx.fill();
      ctx.strokeStyle = COLORS.border;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.textBaseline = 'alphabetic';
      ctx.font = `700 36px ${displayFont}`;
      ctx.fillStyle = tile.valueColor;
      ctx.fillText(tile.value, x + 18, y + 48);
      ctx.font = `600 15px ${uiFont}`;
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(tile.label, x + 18, y + 74);
    });
  });
  y += tileH + 28;

  const drawHeading = (label) => {
    paint(() => {
      ctx.font = `700 12px ${uiFont}`;
      ctx.fillStyle = COLORS.faint;
      ctx.textBaseline = 'alphabetic';
      const tracking = 1.4;
      let x = OUTER + PAD;
      for (const ch of label) {
        ctx.fillText(ch, x, y + 12);
        x += ctx.measureText(ch).width + tracking;
      }
    });
    y += 22;
  };

  drawHeading('PLAYERS');
  const rowH = 42;
  const rowGap = 8;
  if (players.length === 0) {
    paint(() => {
      ctx.font = `500 15px ${uiFont}`;
      ctx.fillStyle = COLORS.muted;
      ctx.textBaseline = 'middle';
      ctx.fillText('No players in the room', OUTER + PAD, y + 12);
    });
    y += 28;
  } else {
    players.forEach((player) => {
      paint(() => {
        roundRect(ctx, OUTER + PAD, y, inner, rowH, 12);
        ctx.fillStyle = player.isMe ? COLORS.amberSoft : COLORS.row;
        ctx.fill();
        ctx.strokeStyle = player.isMe ? COLORS.amberBorder : COLORS.border;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.font = `600 16px ${uiFont}`;
        ctx.textBaseline = 'middle';
        ctx.fillStyle = player.isMe ? COLORS.amber : COLORS.text;
        const name = player.username || 'Anonymous';
        const suffix = player.isMe ? ' (You)' : '';
        ctx.fillText(fitText(ctx, `${name}${suffix}`, inner - 28), OUTER + PAD + 14, y + rowH / 2);
      });
      y += rowH + rowGap;
    });
    y += 8;
  }

  y += 8;
  drawHeading('KEYWORDS');
  const chips = layoutChips(ctx, keywords, inner);
  chips.rows.forEach((row) => {
    let x = OUTER + PAD;
    row.forEach((chip) => {
      paint(() => {
        roundRect(ctx, x, y, chip.w, chip.h, chip.h / 2);
        ctx.fillStyle = COLORS.tile;
        ctx.fill();
        ctx.strokeStyle = chip.correct ? COLORS.emerald : COLORS.rose;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.font = `700 15px ${uiFont}`;
        ctx.fillStyle = COLORS.amber;
        ctx.textBaseline = 'middle';
        ctx.fillText(chip.label, x + 12, y + chip.h / 2 + 0.5);
      });
      x += chip.w + chips.gap;
    });
    y += chips.chipH + chips.gap;
  });

  y += 8;
  paint(() => {
    ctx.font = `500 13px ${uiFont}`;
    ctx.textBaseline = 'middle';
    let x = OUTER + PAD;
    const legendY = y + 8;
    const drawKey = (color, label) => {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.arc(x + 6, legendY, 5, 0, Math.PI * 2);
      ctx.stroke();
      x += 16;
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(label, x, legendY);
      x += ctx.measureText(label).width + 16;
    };
    drawKey(COLORS.emerald, 'Guessed');
    drawKey(COLORS.rose, 'Missed');
  });
  y += 24;

  return {
    width,
    height: y + PAD + OUTER,
    cardTop,
    cardHeight: y + PAD - cardTop,
  };
}

function paintCardChrome(ctx, layout) {
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 10;
  roundRect(ctx, OUTER, layout.cardTop, CARD_WIDTH, layout.cardHeight, 28);
  ctx.fillStyle = COLORS.card;
  ctx.fill();
  ctx.restore();
  roundRect(ctx, OUTER, layout.cardTop, CARD_WIDTH, layout.cardHeight, 28);
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not create the image.'));
    }, 'image/png');
  });
}

async function renderPastKeywordsImage({ keywords, players, percent }) {
  if (document.fonts?.ready) await document.fonts.ready;
  try {
    await document.fonts.load('700 40px Fraunces');
    await document.fonts.load('700 28px Fraunces');
  } catch {
    // System serif is fine if Fraunces is not ready.
  }

  const scratch = document.createElement('canvas').getContext('2d');
  const measured = drawCard(scratch, { keywords, players, percent }, true);
  let scale = 2;
  if (measured.height * scale > SCALE_MAX_HEIGHT) {
    scale = Math.max(1, Math.floor(SCALE_MAX_HEIGHT / measured.height));
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(measured.width * scale);
  canvas.height = Math.ceil(measured.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = COLORS.canvas;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);
  paintCardChrome(ctx, measured);
  drawCard(ctx, { keywords, players, percent }, false);
  return canvasToBlob(canvas);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function IconButton({ label, onClick, disabled, buttonRef, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      ref={buttonRef}
      aria-label={label}
      title={label}
      className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
    >
      {children}
    </button>
  );
}

function SaveIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16.5V19a1.5 1.5 0 001.5 1.5h13A1.5 1.5 0 0020 19v-2.5M12 4v11m0 0l-4-4m4 4l4-4" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function PastKeywordsModal({ keywords, players, percent, onClose }) {
  const titleId = useId();
  const closeRef = useRef(null);
  const [saveState, setSaveState] = useState('idle');
  const [copyState, setCopyState] = useState('idle');
  const [notice, setNotice] = useState('');
  const busy = saveState === 'working' || copyState === 'working';

  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const flash = (setter) => {
    setter('done');
    window.setTimeout(() => setter('idle'), 1600);
  };

  const onSave = async () => {
    if (busy) return;
    setNotice('');
    setSaveState('working');
    try {
      let handle = null;
      if (typeof window.showSaveFilePicker === 'function') {
        handle = await window.showSaveFilePicker({
          suggestedName: 'just-one-past-keywords.png',
          types: [
            {
              description: 'PNG image',
              accept: { 'image/png': ['.png'] },
            },
          ],
        });
      }
      const blob = await renderPastKeywordsImage({ keywords, players, percent });
      if (handle) {
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else {
        downloadBlob(blob, 'just-one-past-keywords.png');
      }
      flash(setSaveState);
    } catch (error) {
      if (error?.name === 'AbortError') {
        setSaveState('idle');
        return;
      }
      setSaveState('idle');
      setNotice('Could not save the image.');
    }
  };

  const onCopy = async () => {
    if (busy) return;
    setNotice('');
    setCopyState('working');
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
        throw new Error('clipboard');
      }
      const blobPromise = renderPastKeywordsImage({ keywords, players, percent });
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blobPromise }),
      ]);
      flash(setCopyState);
    } catch {
      setCopyState('idle');
      setNotice('Could not copy the image.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex w-full max-w-3xl max-h-[min(90svh,44rem)] flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-800 text-left shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-700 px-5 py-4">
          <h2 id={titleId} className="m-0 text-lg font-bold text-slate-100">
            Past Keywords
          </h2>
          <div className="flex items-center gap-1">
            <IconButton label="Save image" onClick={onSave} disabled={busy}>
              {saveState === 'done' ? <CheckIcon /> : <SaveIcon />}
            </IconButton>
            <IconButton label="Copy image" onClick={onCopy} disabled={busy}>
              {copyState === 'done' ? <CheckIcon /> : <CopyIcon />}
            </IconButton>
            <IconButton label="Close past keywords" onClick={onClose} buttonRef={closeRef}>
              <CloseIcon />
            </IconButton>
          </div>
        </div>

        <div className="overflow-y-auto px-5 py-5">
          {notice && (
            <p className="mb-3 text-sm text-rose-300" role="status">
              {notice}
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3">
              <p className="text-3xl font-extrabold tabular-nums text-slate-100 leading-none">
                {keywords.length}
              </p>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {keywords.length === 1 ? 'keyword played' : 'keywords played'}
              </p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3">
              <p className="text-3xl font-extrabold tabular-nums text-emerald-400 leading-none">
                {percent}%
              </p>
              <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                correct guesses
              </p>
            </div>
          </div>
          <p className="sr-only">
            {keywordPhrase(keywords.length)}. {guessPhrase(percent)}.
          </p>

          <h3 className="mt-6 mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
            Players
          </h3>
          {players.length === 0 ? (
            <p className="text-sm text-slate-400">No players in the room.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {players.map((player) => (
                <li
                  key={player.key}
                  className={`min-w-0 rounded-lg border px-3 py-2 text-sm font-medium truncate ${
                    player.isMe
                      ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                      : 'border-slate-700/60 bg-slate-700/30 text-slate-200'
                  }`}
                >
                  {player.username || 'Anonymous'}
                  {player.isMe ? ' (You)' : ''}
                </li>
              ))}
            </ul>
          )}

          <h3 className="mt-6 mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">
            Keywords
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {keywords.map((item, index) => (
              <span
                key={`${item.text}-${index}`}
                className={`text-xs font-bold px-2 py-0.5 rounded-full border text-amber-500 ${
                  item.correct ? 'border-emerald-400' : 'border-rose-400'
                }`}
              >
                {item.text}
              </span>
            ))}
          </div>
          <p className="mt-3 flex items-center gap-3 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full border border-emerald-400" aria-hidden="true" />
              Guessed
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full border border-rose-400" aria-hidden="true" />
              Missed
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function PastKeywordsWidget({ keywords, players }) {
  const [open, setOpen] = useState(false);
  const list = Array.isArray(keywords) ? keywords : [];
  const roster = Array.isArray(players) ? players : [];
  const correct = list.filter((item) => item.correct).length;
  const percent = list.length === 0 ? 0 : Math.round((correct / list.length) * 100);

  if (list.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Past keywords, ${keywordPhrase(list.length)}, ${guessPhrase(percent)}. Open details.`}
        className="bg-slate-800 border border-slate-700 rounded-xl p-5 flex flex-col h-fit w-full text-left cursor-pointer hover:border-slate-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400 transition-colors"
      >
        <div className="text-sm font-semibold mb-4 text-slate-200 flex items-center gap-1 w-full">
          <span className="uppercase">Past Keywords ({list.length}</span>
          <span className="mx-0.5 h-3 w-px bg-slate-300 shrink-0" aria-hidden="true" />
          <span>{percent}%</span>
          <svg className="w-3.5 h-3.5 text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <span>)</span>
          <svg className="w-4 h-4 ml-auto text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V6a2 2 0 012-2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2" />
          </svg>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {list.map((item, idx) => (
            <span
              key={`${item.text}-${idx}`}
              className={`text-xs font-bold px-2 py-0.5 rounded-full border text-amber-500 ${
                item.correct ? 'border-emerald-400' : 'border-rose-400'
              }`}
            >
              {item.text}
            </span>
          ))}
        </div>
      </button>

      {open && (
        <PastKeywordsModal
          keywords={list}
          players={roster}
          percent={percent}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
