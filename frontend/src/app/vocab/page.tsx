"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookMarked,
  Check,
  Layers,
  Loader2,
  Pencil,
  Search,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import {
  deleteVocab,
  listVocab,
  updateVocab,
  type VocabItem,
} from "@/lib/api";
import { isTtsSupported, speakChinese, stopSpeaking } from "@/lib/tts";
import { useAuth } from "@/components/AuthProvider";
import { Navbar } from "@/components/Navbar";

function formatDueLabel(dueIso: string): { label: string; isDue: boolean } {
  const diffMs = new Date(dueIso).getTime() - Date.now();
  if (diffMs <= 0) return { label: "Due now", isDue: true };
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return { label: `Due in ${mins}m`, isDue: false };
  const hours = Math.round(mins / 60);
  if (hours < 24) return { label: `Due in ${hours}h`, isDue: false };
  const days = Math.round(hours / 24);
  return { label: `Due in ${days}d`, isDue: false };
}

function StateBadge({ state }: { state: string }) {
  const map: Record<string, string> = {
    new: "bg-sky-50 text-sky-700 border-sky-200",
    learning: "bg-amber-50 text-amber-700 border-amber-200",
    relearning: "bg-amber-50 text-amber-700 border-amber-200",
    review: "bg-emerald-50 text-emerald-700 border-emerald-200",
  };
  return (
    <span
      className={`inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        map[state] || "bg-stone-100 text-stone-600 border-stone-200"
      }`}
    >
      {state}
    </span>
  );
}

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
            <mark className="rounded bg-orange-100 px-0.5 text-orange-900 font-medium">
              {word}
            </mark>
          )}
        </span>
      ))}
    </>
  );
}

export default function VocabularyPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [items, setItems] = useState<VocabItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [dueOnly, setDueOnly] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editPinyin, setEditPinyin] = useState("");
  const [editMeaning, setEditMeaning] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editSentence, setEditSentence] = useState("");
  const [editSentenceTrans, setEditSentenceTrans] = useState("");
  const [saving, setSaving] = useState(false);
  const [speakingKey, setSpeakingKey] = useState<string | null>(null);

  const canSpeak = isTtsSupported();
  const ttsRate =
    typeof user?.preferences?.tts_rate === "number"
      ? user.preferences.tts_rate
      : 1.0;
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

  const fetchItems = useCallback(async () => {
    try {
      const data = await listVocab(query, dueOnly);
      setItems(data);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load vocabulary."
      );
    } finally {
      setLoading(false);
    }
  }, [query, dueOnly]);

  useEffect(() => {
    if (!user) return;
    const t = window.setTimeout(fetchItems, 180);
    return () => window.clearTimeout(t);
  }, [user, fetchItems]);

  const handleSpeakText = (key: string, text: string) => {
    if (!canSpeak) return;
    speakChinese(text, {
      rate: ttsRate,
      voiceURI: ttsVoiceURI,
      onStart: () => setSpeakingKey(key),
      onEnd: () => setSpeakingKey((curr) => (curr === key ? null : curr)),
      onError: () => setSpeakingKey((curr) => (curr === key ? null : curr)),
    });
  };

  const startEdit = (item: VocabItem) => {
    setEditingId(item.id);
    setEditPinyin(item.pinyin);
    setEditMeaning(item.meaning);
    setEditNotes(item.notes || "");
    setEditSentence(item.example_sentence || "");
    setEditSentenceTrans(item.example_translation || "");
  };

  const handleSaveEdit = async (id: number) => {
    setSaving(true);
    try {
      const updated = await updateVocab(id, {
        pinyin: editPinyin,
        meaning: editMeaning,
        notes: editNotes,
        example_sentence: editSentence,
        example_translation: editSentenceTrans,
      });
      setItems((prev) => prev.map((it) => (it.id === id ? updated : it)));
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save edits.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number, word: string) => {
    if (!window.confirm(`Remove "${word}" from your review dictionary?`)) return;
    try {
      await deleteVocab(id);
      setItems((prev) => prev.filter((it) => it.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete word.");
    }
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-stone-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />

      <main className="mx-auto max-w-4xl px-4 sm:px-6 py-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-stone-900">
              My Review Dictionary
            </h1>
            <p className="text-xs text-stone-500 mt-0.5">
              Words you saved while reading with their source sentences —
              scheduled automatically with FSRS.
            </p>
          </div>
          <Link
            href="/review"
            className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-orange-700 transition"
          >
            <Layers className="h-4 w-4" />
            Start Review Session
          </Link>
        </div>

        {/* Search & Due Filter */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by hanzi, pinyin, meaning, or sentence..."
              className="w-full rounded-xl border border-stone-200 bg-white pl-9 pr-3 py-2 text-sm text-stone-800 focus:border-orange-500 focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => setDueOnly((v) => !v)}
            className={`rounded-xl border px-3.5 py-2 text-sm font-medium transition ${
              dueOnly
                ? "border-orange-300 bg-orange-50 text-orange-800"
                : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
            }`}
          >
            Due Only
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12 text-stone-400">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading vocabulary...
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 p-10 text-center">
            <BookMarked className="mx-auto h-8 w-8 text-stone-300" />
            <p className="mt-2 text-sm font-medium text-stone-600">
              {query || dueOnly
                ? "No matching words"
                : "Your custom review dictionary is empty"}
            </p>
            <p className="mt-1 text-xs text-stone-400">
              Open any book in your Library and click a word to add it here.
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {items.map((item) => {
              const due = formatDueLabel(item.due_at);
              const isEditing = editingId === item.id;
              const wordAudioKey = `word-${item.id}`;
              const sentenceAudioKey = `sent-${item.id}`;

              return (
                <div
                  key={item.id}
                  className="rounded-2xl border border-stone-200 bg-white p-4 shadow-xs"
                >
                  {isEditing ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="hanzi-font text-xl font-semibold text-stone-900">
                          {item.word}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(item.id)}
                            disabled={saving}
                            className="inline-flex items-center gap-1 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-700 disabled:opacity-60"
                          >
                            <Check className="h-3.5 w-3.5" />
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100"
                            aria-label="Cancel edit"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-stone-500 mb-1">
                            Pinyin
                          </label>
                          <input
                            type="text"
                            value={editPinyin}
                            onChange={(e) => setEditPinyin(e.target.value)}
                            className="w-full rounded-lg border border-stone-200 px-3 py-1.5 text-sm focus:border-orange-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-stone-500 mb-1">
                            Personal Notes
                          </label>
                          <input
                            type="text"
                            value={editNotes}
                            onChange={(e) => setEditNotes(e.target.value)}
                            placeholder="Optional mnemonic..."
                            className="w-full rounded-lg border border-stone-200 px-3 py-1.5 text-sm focus:border-orange-500 focus:outline-none"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-stone-500 mb-1">
                          Meaning
                        </label>
                        <textarea
                          rows={2}
                          value={editMeaning}
                          onChange={(e) => setEditMeaning(e.target.value)}
                          className="w-full rounded-lg border border-stone-200 px-3 py-1.5 text-sm focus:border-orange-500 focus:outline-none"
                        />
                      </div>

                      <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-stone-500 mb-1">
                            Source Sentence (Chinese)
                          </label>
                          <textarea
                            rows={2}
                            value={editSentence}
                            onChange={(e) => setEditSentence(e.target.value)}
                            className="hanzi-font w-full rounded-lg border border-stone-200 px-3 py-1.5 text-sm focus:border-orange-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-stone-500 mb-1">
                            Sentence Translation (English)
                          </label>
                          <textarea
                            rows={2}
                            value={editSentenceTrans}
                            onChange={(e) =>
                              setEditSentenceTrans(e.target.value)
                            }
                            className="w-full rounded-lg border border-stone-200 px-3 py-1.5 text-sm focus:border-orange-500 focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-baseline gap-2.5">
                          <span className="hanzi-font text-xl font-semibold text-stone-900">
                            {item.word}
                          </span>
                          <span className="text-sm font-medium text-orange-700">
                            {item.pinyin}
                          </span>
                          <StateBadge state={item.state} />
                          <span
                            className={`text-xs font-medium ${
                              due.isDue ? "text-orange-600" : "text-stone-400"
                            }`}
                          >
                            {due.label}
                          </span>
                        </div>
                        <p className="text-sm text-stone-700 leading-relaxed">
                          {item.meaning}
                        </p>

                        {item.example_sentence && (
                          <div className="mt-2 rounded-xl border border-stone-100 bg-stone-50/80 px-3 py-2 space-y-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="hanzi-font text-sm text-stone-800 leading-relaxed">
                                <HighlightedSentence
                                  sentence={item.example_sentence}
                                  word={item.word}
                                />
                              </p>
                              {canSpeak && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleSpeakText(
                                      sentenceAudioKey,
                                      item.example_sentence!
                                    )
                                  }
                                  className={`shrink-0 rounded-md p-1 transition ${
                                    speakingKey === sentenceAudioKey
                                      ? "bg-orange-100 text-orange-700 animate-pulse"
                                      : "text-stone-400 hover:bg-stone-200/70 hover:text-stone-700"
                                  }`}
                                  title="Listen to sentence"
                                  aria-label="Listen to example sentence"
                                >
                                  <Volume2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                            {item.example_translation && (
                              <p className="text-xs text-stone-500">
                                {item.example_translation}
                              </p>
                            )}
                          </div>
                        )}

                        {item.notes && (
                          <p className="text-xs text-stone-500 italic">
                            Note: {item.notes}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {canSpeak && (
                          <button
                            type="button"
                            onClick={() =>
                              handleSpeakText(wordAudioKey, item.word)
                            }
                            className={`rounded-lg p-1.5 transition ${
                              speakingKey === wordAudioKey
                                ? "bg-orange-100 text-orange-700 animate-pulse"
                                : "text-stone-400 hover:bg-orange-50 hover:text-orange-700"
                            }`}
                            aria-label={`Pronounce ${item.word}`}
                            title="Listen to word"
                          >
                            <Volume2 className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => startEdit(item)}
                          className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition"
                          aria-label={`Edit ${item.word}`}
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(item.id, item.word)}
                          className="rounded-lg p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-600 transition"
                          aria-label={`Delete ${item.word}`}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
