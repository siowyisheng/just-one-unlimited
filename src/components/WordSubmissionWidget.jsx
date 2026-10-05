import React from 'react';

export default function WordSubmissionWidget({
    newWord,
    setNewWord,
    onAddWord,
    wordList,
    getPlayerName,
    title = "Shared Word List",
    placeholder = "Enter a one-word noun",
}) {
    return (
        <div className="flex flex-col gap-4">
            {/* Add Word Form */}
            <form onSubmit={onAddWord} className="flex gap-2">
                <input
                    type="text"
                    value={newWord}
                    onChange={(e) => setNewWord(e.target.value)}
                    placeholder={placeholder}
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:border-amber-400 transition-colors"
                />
                <button
                    type="submit"
                    className="px-5 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl transition-all cursor-pointer shadow-md active:scale-95 whitespace-nowrap"
                >
                    Add
                </button>
            </form>

            {/* Shared Word List Display */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 min-h-[160px]">
                <h3 className="text-sm font-semibold mb-3 text-slate-300 flex justify-between items-center">
                    <span>{title}</span>
                    <span className="text-xs font-normal text-slate-400">
                        {wordList.length} {wordList.length === 1 ? 'word' : 'words'} in pool
                    </span>
                </h3>

                {wordList.length === 0 ? (
                    <p className="text-slate-500 text-center py-8 text-sm italic">
                        No words added yet. Type a word above!
                    </p>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {wordList.map((item, idx) => {
                            const authorId = typeof item === 'object' ? item.authorId : null;
                            const staticAuthorName = typeof item === 'object' ? item.authorName : null;
                            const author = authorId ? getPlayerName(authorId, staticAuthorName) : staticAuthorName;

                            return (
                                <span
                                    key={idx}
                                    className="bg-slate-700 text-amber-300 px-3 py-1.5 rounded-lg text-sm font-medium border border-slate-600/60 flex items-center gap-1.5 tracking-widest select-none"
                                >
                                    <span>******</span>
                                    {author && (
                                        <span className="text-[10px] text-slate-400 italic tracking-normal">
                                            ({author})
                                        </span>
                                    )}
                                </span>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}