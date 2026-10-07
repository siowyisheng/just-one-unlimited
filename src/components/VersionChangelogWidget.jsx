import React, { useEffect, useId, useState } from 'react';
import { currentVersion, releases } from '../data/changelog';

function formatDate(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  try {
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return isoDate;
  }
}

export default function VersionChangelogWidget() {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const label = `v${currentVersion}`;

  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Version ${label} — open changelog`}
        className="fixed bottom-4 right-4 z-30 px-2 py-1 text-[11px] font-medium tabular-nums tracking-wide text-slate-500 hover:text-slate-300 transition-colors cursor-pointer bg-transparent border-0"
      >
        {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 flex items-end sm:items-center justify-center sm:justify-end sm:pr-4 sm:pb-4 bg-slate-950/50 p-0 sm:p-4"
          role="presentation"
          onClick={close}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="w-full sm:w-[min(100%,22rem)] max-h-[min(90svh,36rem)] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-slate-700 bg-slate-800 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-700 px-5 py-4">
              <div className="text-left min-w-0">
                <h2 id={titleId} className="text-lg font-bold text-slate-100">
                  What’s new
                </h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  The game keeps running — dismiss anytime.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close changelog"
                className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors cursor-pointer"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-5 py-4 text-left">
              {releases.length === 0 ? (
                <p className="text-sm text-slate-400">No releases listed yet.</p>
              ) : (
                <ul className="flex flex-col gap-5">
                  {releases.map((entry) => (
                    <li key={entry.version} className="flex flex-col gap-2">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-bold text-slate-100 tabular-nums">
                          v{entry.version}
                        </span>
                        <time
                          dateTime={entry.date}
                          className="text-xs text-slate-500 shrink-0"
                        >
                          {formatDate(entry.date)}
                        </time>
                      </div>
                      <ul className="list-disc pl-4 flex flex-col gap-1">
                        {(entry.changes || []).map((line, i) => (
                          <li key={i} className="text-sm text-slate-300 leading-relaxed">
                            {line}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
