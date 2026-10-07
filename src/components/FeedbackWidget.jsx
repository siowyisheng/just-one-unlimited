import React, { useEffect, useId, useRef, useState } from 'react';

const CATEGORIES = [
  { value: 'Bug', label: 'Bug' },
  { value: 'Feature Request', label: 'Feature Request' },
  { value: 'Feedback', label: 'Feedback' },
];

const ACCESS_KEY = import.meta.env.VITE_WEB3FORMS_ACCESS_KEY;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function sendFeedback({ message, category, email }) {
  if (!ACCESS_KEY) {
    throw new Error(
      'Feedback is not configured. Set VITE_WEB3FORMS_ACCESS_KEY before building.'
    );
  }

  const payload = {
    access_key: ACCESS_KEY,
    subject: `[Just One Unlimited] ${category}`,
    from_name: 'Just One Unlimited Feedback',
    category,
    message,
  };

  if (email) {
    payload.email = email;
    payload.replyto = email;
  }

  const res = await fetch('https://api.web3forms.com/submit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok || data?.success === false) {
    throw new Error(data?.message || 'Could not send feedback. Try again.');
  }

  return data;
}

export default function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState('Feedback');
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [status, setStatus] = useState('idle'); // idle | submitting | success | error
  const [statusMessage, setStatusMessage] = useState('');
  const titleId = useId();
  const messageRef = useRef(null);

  const resetForm = () => {
    setMessage('');
    setCategory('Feedback');
    setEmail('');
    setFieldError('');
    setStatus('idle');
    setStatusMessage('');
  };

  const close = () => {
    setOpen(false);
    // Keep success state briefly visible next open only if reset — reset on close
    // so a later open starts clean, without interrupting an in-flight submit.
    if (status !== 'submitting') {
      resetForm();
    }
  };

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        setMessage('');
        setCategory('Feedback');
        setEmail('');
        setFieldError('');
        setStatus('idle');
        setStatusMessage('');
      }
    };

    document.addEventListener('keydown', onKeyDown);
    const t = window.setTimeout(() => {
      messageRef.current?.focus();
    }, 0);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.clearTimeout(t);
    };
  }, [open]);

  const validate = () => {
    const trimmed = message.trim();
    if (!trimmed) {
      setFieldError('Please write a short message.');
      return null;
    }
    const trimmedEmail = email.trim();
    if (trimmedEmail && !EMAIL_PATTERN.test(trimmedEmail)) {
      setFieldError('Email looks invalid — fix it or leave it blank.');
      return null;
    }
    setFieldError('');
    return {
      message: trimmed,
      category,
      email: trimmedEmail || undefined,
    };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const values = validate();
    if (!values) return;

    setStatus('submitting');
    setStatusMessage('');
    try {
      await sendFeedback(values);
      setStatus('success');
      setStatusMessage('Thanks — your note was sent.');
      setMessage('');
      setEmail('');
    } catch (err) {
      setStatus('error');
      setStatusMessage(err?.message || 'Could not send feedback. Try again.');
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="fixed bottom-4 left-4 z-30 px-3 py-2 rounded-lg border border-slate-600/80 bg-slate-800/90 text-slate-300 hover:text-slate-100 hover:border-slate-500 hover:bg-slate-700 text-xs font-bold uppercase tracking-wider shadow-lg backdrop-blur-sm transition-colors cursor-pointer"
      >
        Feedback
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 flex items-end sm:items-center justify-center sm:justify-start sm:pl-4 sm:pb-4 bg-slate-950/50 p-0 sm:p-4"
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
                  Send feedback
                </h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  The game keeps running — dismiss anytime.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close feedback"
                className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-5 py-4">
              {status === 'success' ? (
                <div className="flex flex-col gap-4 text-left" role="status">
                  <p className="text-sm text-emerald-400 font-medium">{statusMessage}</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        resetForm();
                        window.setTimeout(() => messageRef.current?.focus(), 0);
                      }}
                      className="flex-1 px-4 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-100 text-sm font-semibold transition-colors cursor-pointer"
                    >
                      Send another
                    </button>
                    <button
                      type="button"
                      onClick={close}
                      className="flex-1 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-bold transition-colors cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-left" noValidate>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="feedback-message" className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                      Message <span className="text-rose-400">*</span>
                    </label>
                    <textarea
                      ref={messageRef}
                      id="feedback-message"
                      name="message"
                      required
                      rows={4}
                      value={message}
                      onChange={(e) => {
                        setMessage(e.target.value);
                        if (fieldError) setFieldError('');
                      }}
                      placeholder="What happened, or what would help?"
                      aria-invalid={fieldError ? 'true' : 'false'}
                      aria-describedby={fieldError ? 'feedback-field-error' : undefined}
                      className={`w-full resize-y min-h-[6rem] rounded-xl bg-slate-900 border px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none transition-colors ${
                        fieldError && !message.trim()
                          ? 'border-rose-500 focus:border-rose-400'
                          : 'border-slate-600 focus:border-amber-400'
                      }`}
                    />
                  </div>

                  <fieldset className="flex flex-col gap-2">
                    <legend className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                      Category
                    </legend>
                    <div className="flex flex-col gap-1.5">
                      {CATEGORIES.map((opt) => (
                        <label
                          key={opt.value}
                          className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${
                            category === opt.value
                              ? 'border-amber-500/50 bg-amber-500/10 text-amber-200'
                              : 'border-slate-700 bg-slate-900/50 text-slate-300 hover:border-slate-600'
                          }`}
                        >
                          <input
                            type="radio"
                            name="feedback-category"
                            value={opt.value}
                            checked={category === opt.value}
                            onChange={() => setCategory(opt.value)}
                            className="accent-amber-500"
                          />
                          {opt.label}
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="feedback-email" className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                      Email <span className="font-normal normal-case tracking-normal text-slate-500">(optional)</span>
                    </label>
                    <input
                      id="feedback-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (fieldError) setFieldError('');
                      }}
                      placeholder="so we can follow up"
                      className="w-full rounded-xl bg-slate-900 border border-slate-600 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-400 transition-colors"
                    />
                  </div>

                  {fieldError ? (
                    <p id="feedback-field-error" role="alert" className="text-sm font-medium text-rose-400">
                      {fieldError}
                    </p>
                  ) : null}

                  {status === 'error' ? (
                    <p role="alert" className="text-sm font-medium text-rose-400">
                      {statusMessage}
                    </p>
                  ) : null}

                  {!ACCESS_KEY ? (
                    <p className="text-xs text-amber-400/90">
                      Feedback delivery is not configured in this build.
                    </p>
                  ) : null}

                  <button
                    type="submit"
                    disabled={status === 'submitting'}
                    className="w-full px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 disabled:cursor-not-allowed text-slate-950 text-sm font-bold transition-colors cursor-pointer"
                  >
                    {status === 'submitting' ? 'Sending…' : 'Submit'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
