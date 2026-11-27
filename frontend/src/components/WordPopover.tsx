"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookmarkCheck,
  BookmarkPlus,
  Loader2,
  Volume2,
  X,
} from "lucide-react";
import type { DictionaryEntry, Token } from "@/lib/api";
import { isTtsSupported, speakChinese, stopSpeaking } from "@/lib/tts";

interface WordPopoverProps {
  token: Token;
  entries: DictionaryEntry[];
  sentence: string | null;
  sentenceTranslation: string | null;
  translatingSentence: boolean;
  anchorRect: DOMRect | null;
  savedVocabId: number | null;
  ttsRate: number;
  ttsVoiceURI: string | null;
  onSaveWord: (payload: {
    word: string;
    pinyin: string;
    meaning: string;
    example_sentence?: string;
    example_translation?: string;
  }) => Promise<void>;
  onRemoveWord: (vocabId: number, word: string) => Promise<void>;
  onClose: () => void;
}

function HighlightedSentence({
  sentence,
  word,
}: {
  sentence: string;
  word: string;
}) {
  if (!word) return <>{sentence}</>;
  const parts = sentence.split(word);
  if (parts.length === 1) return <>{sentence}</>;
  return (
    <>
      {parts.map((part, idx) => (
        <span key={idx}>
          {part}
          {idx < parts.length - 1 && (
            <mark className="rounded bg-orange-100 px-0.5 text-orange-900 font-medium">
              {word}
            </mark>
          )}
        </span>
      ))}
    </>
  );
}

export function WordPopover({
  token,
  entries,
  sentence,
  sentenceTranslation,
  translatingSentence,
  anchorRect,
  savedVocabId,
  ttsRate,
  ttsVoiceURI,
  onSaveWord,
  onRemoveWord,
  onClose,
}: WordPopoverProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const canSpeak = isTtsSupported();

  const handleSpeak = useCallback(() => {
    if (!canSpeak) return;
    speakChinese(token.t, {
      rate: ttsRate,
      voiceURI: ttsVoiceURI,
      onStart: () => setSpeaking(true),
      onEnd: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  }, [canSpeak, token.t, ttsRate, ttsVoiceURI]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "s" || e.key === "S") {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag !== "INPUT" && tag !== "TEXTAREA") {
          handleSpeak();
        }
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (cardRef.current?.contains(target)) return;
      if (target?.closest("[data-word-token='true']")) return;
      onClose();
    };
    window.addEventListener("keydown", handleKey);
    window.addEventListener("mousedown", handleClickOutside);
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("mousedown", handleClickOutside);
      stopSpeaking();
    };
  }, [onClose, handleSpeak]);

  const primary = entries[0] ?? null;
  const alternates = entries.slice(1);
  const showTraditional =
    primary && primary.traditional !== primary.simplified
      ? primary.traditional
      : null;

  const displayPinyin = token.p || primary?.pinyin_marks || "";
  const defaultMeaning = primary
    ? primary.definitions.join("; ")
    : "(Custom word — edit meaning in Vocabulary)";

  const handleToggleSave = async () => {
    setBusy(true);
    setActionError(null);
    try {
      if (savedVocabId !== null) {
        await onRemoveWord(savedVocabId, token.t);
      } else {
        await onSaveWord({
          word: token.t,
          pinyin: displayPinyin || token.t,
          meaning: defaultMeaning,
          example_sentence: sentence || undefined,
          example_translation: sentenceTranslation || undefined,
        });
      }
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Could not update dictionary."
      );
    } finally {
      setBusy(false);
    }
  };

  let desktopStyle: React.CSSProperties = {};
  if (anchorRect && typeof window !== "undefined") {
    const popoverWidth = 370;
    const margin = 12;
    const preferredLeft =
      anchorRect.left + anchorRect.width / 2 - popoverWidth / 2;
    const clampedLeft = Math.max(
      margin,
      Math.min(preferredLeft, window.innerWidth - popoverWidth - margin)
    );

    const spaceBelow = window.innerHeight - anchorRect.bottom;
    const openAbove = spaceBelow < 340 && anchorRect.top > 340;

    desktopStyle = openAbove
      ? {
          left: `${clampedLeft}px`,
          bottom: `${window.innerHeight - anchorRect.top + 10}px`,
          width: `${popoverWidth}px`,
        }
      : {
          left: `${clampedLeft}px`,
          top: `${anchorRect.bottom + 10}px`,
          width: `${popoverWidth}px`,
        };
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/20 md:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={cardRef}
        role="dialog"
        aria-label={`Definition for ${token.t}`}
        style={desktopStyle}
        className={[
          "fixed z-50 bg-white border border-stone-200 shadow-xl",
          "inset-x-0 bottom-0 rounded-t-2xl p-5 max-h-[75vh] overflow-y-auto",
          "md:inset-x-auto md:bottom-auto md:rounded-xl md:p-4 md:max-h-[480px]",
        ].join(" ")}
      >
        {/* Header: Hanzi + Pinyin + Audio + Close */}
        <div className="flex items-start justify-between gap-3 border-b border-stone-100 pb-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="hanzi-font text-2xl font-semibold text-stone-900">
                {token.t}
              </span>
              {showTraditional && (
                <span className="hanzi-font text-base text-stone-400">
                  ({showTraditional})
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm font-medium text-orange-700">
              {displayPinyin}
            </p>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {canSpeak && (
              <button
                type="button"
                onClick={handleSpeak}
                title="Listen (S)"
                aria-label={`Pronounce ${token.t}`}
                className={`rounded-lg p-1.5 transition ${
                  speaking
                    ? "bg-orange-100 text-orange-700 animate-pulse"
                    : "text-stone-500 hover:bg-orange-50 hover:text-orange-700"
                }`}
              >
                <Volume2 className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition"
              aria-label="Close definition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Definitions */}
        <div className="mt-3 space-y-3">
          {primary ? (
            <ol className="list-decimal list-inside space-y-1 text-sm leading-relaxed text-stone-700">
              {primary.definitions.map((def, i) => (
                <li key={i}>{def}</li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-stone-500 italic">
              No exact CC-CEDICT entry found for this compound. Pinyin is
              generated automatically.
            </p>
          )}

          {/* Sentence Meaning in Context */}
          {sentence && (
            <div className="rounded-xl border border-stone-100 bg-stone-50/80 p-3 space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
                Full Sentence Meaning
              </p>
              <p className="hanzi-font text-xs leading-relaxed text-stone-800">
                <HighlightedSentence sentence={sentence} word={token.t} />
              </p>
              {translatingSentence ? (
                <p className="inline-flex items-center gap-1.5 text-xs text-stone-400">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Translating sentence...
                </p>
              ) : sentenceTranslation ? (
                <p className="text-xs leading-relaxed text-stone-600">
                  {sentenceTranslation}
                </p>
              ) : null}
            </div>
          )}

          {alternates.length > 0 && (
            <div className="border-t border-stone-100 pt-2.5 space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-stone-400">
                Other readings / entries
              </p>
              {alternates.slice(0, 3).map((alt) => (
                <div key={alt.id} className="text-xs text-stone-600">
                  <span className="font-medium text-orange-700/80">
                    {alt.pinyin_marks}
                  </span>
                  <span className="mx-1.5 text-stone-300">·</span>
                  <span>{alt.definitions.slice(0, 3).join("; ")}</span>
                </div>
              ))}
            </div>
          )}

          {/* Save to Review Dictionary Action */}
          <div className="border-t border-stone-100 pt-3">
            <button
              type="button"
              onClick={handleToggleSave}
              disabled={busy}
              className={`w-full inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition disabled:opacity-60 ${
                savedVocabId !== null
                  ? "border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                  : "bg-orange-600 text-white hover:bg-orange-700 shadow-xs"
              }`}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : savedVocabId !== null ? (
                <BookmarkCheck className="h-4 w-4" />
              ) : (
                <BookmarkPlus className="h-4 w-4" />
              )}
              <span>
                {savedVocabId !== null
                  ? "Saved in Review Dictionary"
                  : "Add to Review Dictionary"}
              </span>
            </button>
            {actionError && (
              <p className="mt-1.5 text-xs text-red-600 text-center">
                {actionError}
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
