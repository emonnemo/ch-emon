"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  getDueReviews,
  getReviewStats,
  submitReview,
  type DueCard,
  type ReviewStats,
} from "@/lib/api";
import {
  isTtsSupported,
  speakChinese,
  stopSpeaking,
  TTS_RATES,
} from "@/lib/tts";
import { useAuth } from "@/components/AuthProvider";
import { Navbar } from "@/components/Navbar";

const RATINGS: {
  value: 1 | 2 | 3 | 4;
  label: string;
  keyHint: string;
  className: string;
}[] = [
  {
    value: 1,
    label: "Again",
    keyHint: "1",
    className: "border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
  },
  {
    value: 2,
    label: "Hard",
    keyHint: "2",
    className: "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100",
  },
  {
    value: 3,
    label: "Good",
    keyHint: "3",
    className:
      "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
  },
  {
    value: 4,
    label: "Easy",
    keyHint: "4",
    className: "border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100",
  },
];

function HighlightedSentence({
  sentence,
  word,
}: {
  sentence: string;
  word: string;
}) {
  const parts = sentence.split(word);
  if (parts.length === 1) return <>{sentence}</>;
  return (
    <>
      {parts.map((part, idx) => (
        <span key={idx}>
          {part}
          {idx < parts.length - 1 && (
            <mark className="rounded bg-orange-100 px-1 text-orange-900 font-semibold">
              {word}
            </mark>
          )}
        </span>
      ))}
    </>
  );
}

export default function ReviewPage() {
  const router = useRouter();
  const { user, loading: authLoading, savePreferences } = useAuth();

  const [queue, setQueue] = useState<DueCard[]>([]);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [revealed, setRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sessionDoneCount, setSessionDoneCount] = useState(0);
  const [speakingTarget, setSpeakingTarget] = useState<
    "word" | "sentence" | null
  >(null);

  const [autoPlay, setAutoPlay] = useState<boolean>(
    user?.preferences?.tts_autoplay_review ?? true
  );
  const [ttsRate, setTtsRate] = useState<number>(() => {
    const pref = user?.preferences?.tts_rate;
    return typeof pref === "number" && pref >= 0.5 && pref <= 1.5 ? pref : 1.0;
  });

  const canSpeak = isTtsSupported();
  const ttsVoiceURI =
    typeof user?.preferences?.tts_voice_uri === "string"
      ? user.preferences.tts_voice_uri
      : null;

  useEffect(() => {
    return () => stopSpeaking();
  }, []);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [authLoading, user, router]);

  const loadSession = useCallback(async () => {
    setLoading(true);
    setError(null);
    stopSpeaking();
    try {
      const [due, st] = await Promise.all([
        getDueReviews(30),
        getReviewStats(),
      ]);
      setQueue(due);
      setStats(st);
      setRevealed(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load review queue."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) loadSession();
  }, [user, loadSession]);

  const currentCard = queue[0] ?? null;

  const speakWord = useCallback(() => {
    if (!canSpeak || !currentCard) return;
    speakChinese(currentCard.word, {
      rate: ttsRate,
      voiceURI: ttsVoiceURI,
      onStart: () => setSpeakingTarget("word"),
      onEnd: () => setSpeakingTarget(null),
      onError: () => setSpeakingTarget(null),
    });
  }, [canSpeak, currentCard, ttsRate, ttsVoiceURI]);

  const speakSentence = useCallback(() => {
    if (!canSpeak || !currentCard?.example_sentence) return;
    speakChinese(currentCard.example_sentence, {
      rate: ttsRate,
      voiceURI: ttsVoiceURI,
      onStart: () => setSpeakingTarget("sentence"),
      onEnd: () => setSpeakingTarget(null),
      onError: () => setSpeakingTarget(null),
    });
  }, [canSpeak, currentCard, ttsRate, ttsVoiceURI]);

  const handleReveal = useCallback(() => {
    setRevealed(true);
    if (autoPlay && canSpeak && currentCard) {
      speakChinese(currentCard.word, {
        rate: ttsRate,
        voiceURI: ttsVoiceURI,
        onStart: () => setSpeakingTarget("word"),
        onEnd: () => setSpeakingTarget(null),
        onError: () => setSpeakingTarget(null),
      });
    }
  }, [autoPlay, canSpeak, currentCard, ttsRate, ttsVoiceURI]);

  const toggleAutoPlay = () => {
    setAutoPlay((prev) => {
      const next = !prev;
      savePreferences({ tts_autoplay_review: next });
      return next;
    });
  };

  const cycleRate = () => {
    const idx = TTS_RATES.indexOf(ttsRate as (typeof TTS_RATES)[number]);
    const next = TTS_RATES[(idx + 1) % TTS_RATES.length];
    setTtsRate(next);
    savePreferences({ tts_rate: next });
  };

  const handleRate = useCallback(
    async (rating: 1 | 2 | 3 | 4) => {
      if (!currentCard || submitting) return;
      stopSpeaking();
      setSpeakingTarget(null);
      setSubmitting(true);
      setError(null);
      try {
        await submitReview(currentCard.id, rating);
        setSessionDoneCount((c) => c + 1);
        setRevealed(false);
        setQueue((prev) => prev.slice(1));
        getReviewStats()
          .then((st) => setStats(st))
          .catch(() => {});
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to submit rating."
        );
      } finally {
        setSubmitting(false);
      }
    },
    [currentCard, submitting]
  );

  // Keyboard shortcuts: Space reveals; A replays word; S plays sentence; 1-4 rates once revealed
  useEffect(() => {
    if (!currentCard) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "a" || e.key === "A") {
        speakWord();
      } else if (e.key === "s" || e.key === "S") {
        if (currentCard.example_sentence) speakSentence();
        else speakWord();
      } else if (!revealed && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        handleReveal();
      } else if (revealed && !submitting) {
        if (e.key === "1") handleRate(1);
        else if (e.key === "2") handleRate(2);
        else if (e.key === "3") handleRate(3);
        else if (e.key === "4") handleRate(4);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    currentCard,
    revealed,
    submitting,
    handleRate,
    handleReveal,
    speakWord,
    speakSentence,
  ]);

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-stone-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 sm:px-6 py-8 flex flex-col">
        {/* Top Stats Strip */}
        {stats && (
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="rounded-xl border border-stone-200 bg-white p-3 text-center">
              <p className="text-xl font-bold text-orange-600">
                {queue.length}
              </p>
              <p className="text-xs text-stone-500">Due in Queue</p>
            </div>
            <div className="rounded-xl border border-stone-200 bg-white p-3 text-center">
              <p className="text-xl font-bold text-emerald-700">
                {stats.reviewed_today}
              </p>
              <p className="text-xs text-stone-500">Reviewed Today</p>
            </div>
            <div className="rounded-xl border border-stone-200 bg-white p-3 text-center">
              <p className="text-xl font-bold text-stone-800">
                {stats.total_vocab}
              </p>
              <p className="text-xs text-stone-500">Total Saved</p>
            </div>
          </div>
        )}

        {/* Audio Preferences Bar */}
        {canSpeak && currentCard && (
          <div className="mb-6 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={toggleAutoPlay}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                autoPlay
                  ? "border-orange-200 bg-orange-50 text-orange-800"
                  : "border-stone-200 bg-white text-stone-500 hover:bg-stone-50"
              }`}
            >
              {autoPlay ? (
                <Volume2 className="h-3.5 w-3.5" />
              ) : (
                <VolumeX className="h-3.5 w-3.5" />
              )}
              <span>Auto-play: {autoPlay ? "ON" : "OFF"}</span>
            </button>
            <button
              type="button"
              onClick={cycleRate}
              className="rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-600 hover:bg-stone-50 transition"
              title="Click to cycle speech speed"
            >
              Speed: {ttsRate}x
            </button>
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-stone-400">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading due cards...
          </div>
        ) : !currentCard ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center rounded-2xl border border-stone-200 bg-white p-10 shadow-xs">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mb-3" />
            <h2 className="text-lg font-bold text-stone-900">
              {stats && stats.total_vocab === 0
                ? "No flashcards yet"
                : "All caught up!"}
            </h2>
            <p className="mt-1 text-sm text-stone-500 max-w-sm">
              {stats && stats.total_vocab === 0
                ? "Open a Chinese book or text in your Library and click words to add them to your review dictionary."
                : sessionDoneCount > 0
                  ? `Nice work! You reviewed ${sessionDoneCount} ${sessionDoneCount === 1 ? "card" : "cards"} in this session.`
                  : "No words are due for review right now. Check back later or add more words while reading."}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-orange-700 transition"
              >
                <BookOpen className="h-4 w-4" />
                Back to Reading
              </Link>
              {stats && stats.total_vocab > 0 && (
                <button
                  type="button"
                  onClick={loadSession}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50 transition"
                >
                  <RotateCcw className="h-4 w-4" />
                  Refresh Queue
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col justify-between gap-6">
            {/* Flashcard */}
            <div
              onClick={() => !revealed && handleReveal()}
              className={`relative rounded-3xl border border-stone-200 bg-white p-8 sm:p-12 shadow-sm flex flex-col items-center justify-center text-center min-h-[340px] transition ${
                !revealed ? "cursor-pointer hover:border-orange-300" : ""
              }`}
            >
              {canSpeak && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    speakWord();
                  }}
                  title="Listen to word (A)"
                  aria-label={`Pronounce ${currentCard.word}`}
                  className={`absolute right-5 top-5 rounded-xl border p-2.5 transition ${
                    speakingTarget === "word"
                      ? "border-orange-300 bg-orange-100 text-orange-700 animate-pulse"
                      : "border-stone-200 bg-stone-50 text-stone-600 hover:bg-orange-50 hover:text-orange-700"
                  }`}
                >
                  <Volume2 className="h-4 w-4" />
                </button>
              )}

              <span className="mb-4 rounded-full bg-stone-100 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider text-stone-500">
                {currentCard.state}
              </span>

              <div className="hanzi-font text-5xl sm:text-6xl font-semibold text-stone-900 tracking-wide">
                {currentCard.word}
              </div>

              {/* Context Sentence on Front */}
              {currentCard.example_sentence && (
                <div className="mt-5 flex items-center justify-center gap-2 max-w-lg">
                  <p className="hanzi-font text-base sm:text-lg text-stone-600 leading-relaxed">
                    <HighlightedSentence
                      sentence={currentCard.example_sentence}
                      word={currentCard.word}
                    />
                  </p>
                  {canSpeak && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        speakSentence();
                      }}
                      title="Listen to sentence (S)"
                      aria-label="Listen to example sentence"
                      className={`shrink-0 rounded-lg p-1.5 transition ${
                        speakingTarget === "sentence"
                          ? "bg-orange-100 text-orange-700 animate-pulse"
                          : "text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                      }`}
                    >
                      <Volume2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )}

              {revealed ? (
                <div className="mt-6 w-full border-t border-stone-100 pt-6 space-y-3">
                  <p className="text-xl font-medium text-orange-700">
                    {currentCard.pinyin}
                  </p>
                  <p className="text-base text-stone-700 leading-relaxed max-w-lg mx-auto">
                    {currentCard.meaning}
                  </p>
                  {currentCard.example_translation && (
                    <p className="rounded-xl bg-stone-50 px-4 py-2 text-sm text-stone-600 max-w-lg mx-auto">
                      “{currentCard.example_translation}”
                    </p>
                  )}
                  {currentCard.notes && (
                    <p className="text-xs text-stone-500 italic">
                      Note: {currentCard.notes}
                    </p>
                  )}
                </div>
              ) : (
                <p className="mt-10 text-xs text-stone-400">
                  Tap card or press{" "}
                  <kbd className="rounded border border-stone-200 bg-stone-50 px-1.5 py-0.5 font-sans">
                    Space
                  </kbd>{" "}
                  to show answer ·{" "}
                  <kbd className="rounded border border-stone-200 bg-stone-50 px-1.5 py-0.5 font-sans">
                    A
                  </kbd>{" "}
                  word ·{" "}
                  <kbd className="rounded border border-stone-200 bg-stone-50 px-1.5 py-0.5 font-sans">
                    S
                  </kbd>{" "}
                  sentence
                </p>
              )}
            </div>

            {/* Bottom Controls */}
            {!revealed ? (
              <button
                type="button"
                onClick={handleReveal}
                className="w-full rounded-2xl bg-orange-600 py-3.5 text-base font-medium text-white shadow-sm hover:bg-orange-700 transition"
              >
                Show Answer
              </button>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {RATINGS.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    disabled={submitting}
                    onClick={() => handleRate(r.value)}
                    className={`flex flex-col items-center justify-center rounded-2xl border py-3 px-2 transition disabled:opacity-50 ${r.className}`}
                  >
                    <span className="text-sm font-semibold">{r.label}</span>
                    <span className="mt-0.5 text-xs opacity-75">
                      {currentCard.interval_previews[String(r.value)] || ""}
                    </span>
                    <span className="mt-1 hidden sm:inline text-[10px] opacity-50">
                      [{r.keyHint}]
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
