"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Languages,
  List,
  Loader2,
  Minus,
  Palette,
  Play,
  Plus,
  Square,
  Volume2,
  X,
} from "lucide-react";
import {
  addVocab,
  deleteVocab,
  getDocumentSection,
  listSavedWordRefs,
  translateText,
  updateDocumentProgress,
  type DictionaryEntry,
  type DocumentSection,
  type SectionSummary,
  type Token,
} from "@/lib/api";
import {
  getChineseVoices,
  isTtsSupported,
  speakChinese,
  stopSpeaking,
  TTS_RATES,
} from "@/lib/tts";
import { splitWordToneUnits, TONE_TEXT_CLASS } from "@/lib/tones";
import { stripCitations } from "@/lib/textClean";
import { useAuth } from "./AuthProvider";
import { WordPopover } from "./WordPopover";

interface ReaderViewProps {
  documentId: number;
  initialSection: DocumentSection;
  sections: SectionSummary[];
}

interface SelectedWordState {
  key: string;
  token: Token;
  sentence: string | null;
  anchorRect: DOMRect | null;
}

const FONT_SIZES = [20, 24, 28, 34];
const SENTENCE_END_PUNCT = /[。！？!?\n；;]/;
const CLOSING_QUOTES = /^[”’」』》）】"')\s]+$/;

function extractSentenceFromParagraph(
  paragraph: Token[],
  tokenIndex: number
): string | null {
  if (!paragraph.length) return null;

  let start = tokenIndex;
  for (let i = tokenIndex - 1; i >= 0; i--) {
    if (SENTENCE_END_PUNCT.test(paragraph[i].t)) {
      start = i + 1;
      break;
    }
    start = i;
  }
  // Skip leading closing quotes left over from the previous sentence
  while (start < tokenIndex && CLOSING_QUOTES.test(paragraph[start].t)) {
    start++;
  }

  let end = tokenIndex;
  for (let i = tokenIndex; i < paragraph.length; i++) {
    end = i;
    if (SENTENCE_END_PUNCT.test(paragraph[i].t)) {
      // Include trailing closing quote if attached to sentence punctuation
      if (
        i + 1 < paragraph.length &&
        CLOSING_QUOTES.test(paragraph[i + 1].t)
      ) {
        end = i + 1;
      }
      break;
    }
  }

  const raw = stripCitations(
    paragraph
      .slice(start, end + 1)
      .map((tok) => tok.t)
      .join("")
  );
  return raw || null;
}

export function ReaderView({
  documentId,
  initialSection,
  sections,
}: ReaderViewProps) {
  const { user, savePreferences } = useAuth();

  const [section, setSection] = useState<DocumentSection>(initialSection);
  const [loadingSection, setLoadingSection] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showPinyin, setShowPinyin] = useState<boolean>(
    user?.preferences?.show_pinyin ?? true
  );
  const [toneColors, setToneColors] = useState<boolean>(
    user?.preferences?.tone_colors ?? false
  );
  const [fontSizeIdx, setFontSizeIdx] = useState<number>(() => {
    const pref = user?.preferences?.font_size_idx;
    return typeof pref === "number" && pref >= 0 && pref < FONT_SIZES.length
      ? pref
      : 1;
  });
  const [ttsRate, setTtsRate] = useState<number>(() => {
    const pref = user?.preferences?.tts_rate;
    return typeof pref === "number" && pref >= 0.5 && pref <= 1.5 ? pref : 1.0;
  });
  const [ttsVoiceURI, setTtsVoiceURI] = useState<string | null>(
    typeof user?.preferences?.tts_voice_uri === "string"
      ? user.preferences.tts_voice_uri
      : null
  );
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [audioMenuOpen, setAudioMenuOpen] = useState(false);

  // Playback state: single paragraph OR continuous full-section playback
  const [speakingParaIdx, setSpeakingParaIdx] = useState<number | null>(null);
  const [playingSection, setPlayingSection] = useState(false);
  const sectionPlayTokenRef = useRef(0);
  const paraRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Inline paragraph translations & shared client-side translation cache
  const [translationCache, setTranslationCache] = useState<
    Record<string, string>
  >({});
  const [openParaTranslations, setOpenParaTranslations] = useState<
    Record<number, boolean>
  >({});
  const [loadingParaTrans, setLoadingParaTrans] = useState<
    Record<number, boolean>
  >({});
  const [translatingSelectedSentence, setTranslatingSelectedSentence] =
    useState(false);

  const [selected, setSelected] = useState<SelectedWordState | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [savedWords, setSavedWords] = useState<Record<string, number>>({});

  const canSpeak = isTtsSupported();

  const stopAllAudio = useCallback(() => {
    sectionPlayTokenRef.current += 1;
    stopSpeaking();
    setPlayingSection(false);
    setSpeakingParaIdx(null);
  }, []);

  useEffect(() => {
    if (!canSpeak) return;
    const refreshVoices = () => setVoices(getChineseVoices());
    refreshVoices();
    window.speechSynthesis.addEventListener("voiceschanged", refreshVoices);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", refreshVoices);
      stopAllAudio();
    };
  }, [canSpeak, stopAllAudio]);

  useEffect(() => {
    let active = true;
    listSavedWordRefs()
      .then((refs) => {
        if (!active) return;
        const next: Record<string, number> = {};
        for (const r of refs) next[r.word] = r.id;
        setSavedWords(next);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Auto-translate the surrounding sentence whenever a word popover opens
  useEffect(() => {
    const sentence = selected?.sentence;
    if (!sentence || translationCache[sentence]) {
      setTranslatingSelectedSentence(false);
      return;
    }

    let active = true;
    setTranslatingSelectedSentence(true);
    translateText(sentence)
      .then((res) => {
        if (!active) return;
        setTranslationCache((prev) => ({
          ...prev,
          [sentence]: res.translated_text,
        }));
      })
      .catch(() => {
        // non-fatal if translation unavailable
      })
      .finally(() => {
        if (active) setTranslatingSelectedSentence(false);
      });

    return () => {
      active = false;
    };
  }, [selected?.sentence, translationCache]);

  const togglePinyin = useCallback(() => {
    setShowPinyin((prev) => {
      const next = !prev;
      savePreferences({ show_pinyin: next });
      return next;
    });
  }, [savePreferences]);

  const toggleToneColors = useCallback(() => {
    setToneColors((prev) => {
      const next = !prev;
      savePreferences({ tone_colors: next });
      return next;
    });
  }, [savePreferences]);

  const changeFontSize = useCallback(
    (delta: number) => {
      setFontSizeIdx((prev) => {
        const next = Math.max(0, Math.min(FONT_SIZES.length - 1, prev + delta));
        if (next !== prev) {
          savePreferences({ font_size_idx: next });
        }
        return next;
      });
    },
    [savePreferences]
  );

  const handleChangeRate = (rate: number) => {
    setTtsRate(rate);
    savePreferences({ tts_rate: rate });
  };

  const handleChangeVoice = (uri: string) => {
    const next = uri || null;
    setTtsVoiceURI(next);
    savePreferences({ tts_voice_uri: next });
  };

  const handleSpeakParagraph = (paraIdx: number, paragraph: Token[]) => {
    if (!canSpeak) return;
    if (speakingParaIdx === paraIdx && !playingSection) {
      stopAllAudio();
      return;
    }
    stopAllAudio();
    const text = paragraph.map((tok) => tok.t).join("");
    speakChinese(text, {
      rate: ttsRate,
      voiceURI: ttsVoiceURI,
      onStart: () => setSpeakingParaIdx(paraIdx),
      onEnd: () =>
        setSpeakingParaIdx((curr) => (curr === paraIdx ? null : curr)),
      onError: () =>
        setSpeakingParaIdx((curr) => (curr === paraIdx ? null : curr)),
    });
  };

  const handleTogglePlaySection = () => {
    if (!canSpeak) return;
    if (playingSection) {
      stopAllAudio();
      return;
    }

    stopAllAudio();
    setSelected(null);
    const runToken = sectionPlayTokenRef.current + 1;
    sectionPlayTokenRef.current = runToken;
    setPlayingSection(true);

    const paragraphs = section.tokens;
    const playFrom = (idx: number) => {
      if (sectionPlayTokenRef.current !== runToken) return;
      if (idx >= paragraphs.length) {
        setPlayingSection(false);
        setSpeakingParaIdx(null);
        return;
      }

      const text = paragraphs[idx].map((tok) => tok.t).join("").trim();
      if (!text) {
        playFrom(idx + 1);
        return;
      }

      setSpeakingParaIdx(idx);
      paraRefs.current[idx]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });

      speakChinese(text, {
        rate: ttsRate,
        voiceURI: ttsVoiceURI,
        onStart: () => {
          if (sectionPlayTokenRef.current === runToken) {
            setSpeakingParaIdx(idx);
          }
        },
        onEnd: () => {
          if (sectionPlayTokenRef.current === runToken) {
            playFrom(idx + 1);
          }
        },
        onError: () => {
          if (sectionPlayTokenRef.current === runToken) {
            setPlayingSection(false);
            setSpeakingParaIdx(null);
          }
        },
      });
    };

    playFrom(0);
  };

  const handleToggleParagraphTranslation = async (
    paraIdx: number,
    paragraph: Token[]
  ) => {
    if (openParaTranslations[paraIdx]) {
      setOpenParaTranslations((prev) => ({ ...prev, [paraIdx]: false }));
      return;
    }

    setOpenParaTranslations((prev) => ({ ...prev, [paraIdx]: true }));
    const rawText = stripCitations(paragraph.map((tok) => tok.t).join(""));
    if (!rawText || translationCache[rawText]) return;

    setLoadingParaTrans((prev) => ({ ...prev, [paraIdx]: true }));
    try {
      const res = await translateText(rawText);
      setTranslationCache((prev) => ({
        ...prev,
        [rawText]: res.translated_text,
      }));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to translate paragraph."
      );
      setOpenParaTranslations((prev) => ({ ...prev, [paraIdx]: false }));
    } finally {
      setLoadingParaTrans((prev) => ({ ...prev, [paraIdx]: false }));
    }
  };

  const goToSection = useCallback(
    async (nextIndex: number) => {
      if (nextIndex < 0 || nextIndex >= section.section_count) return;
      stopAllAudio();
      setLoadingSection(true);
      setSelected(null);
      setTocOpen(false);
      setOpenParaTranslations({});
      setError(null);
      try {
        const next = await getDocumentSection(documentId, nextIndex);
        setSection(next);
        window.scrollTo({ top: 0, behavior: "smooth" });
        updateDocumentProgress(documentId, nextIndex).catch(() => {});
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load section");
      } finally {
        setLoadingSection(false);
      }
    },
    [documentId, section.section_count, stopAllAudio]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "p" || e.key === "P") {
        togglePinyin();
      } else if (e.key === "t" || e.key === "T") {
        toggleToneColors();
      } else if (e.key === "Escape") {
        if (tocOpen) setTocOpen(false);
        if (audioMenuOpen) setAudioMenuOpen(false);
      } else if (!selected && !tocOpen && !audioMenuOpen) {
        if (e.key === "ArrowLeft" && section.section_index > 0) {
          goToSection(section.section_index - 1);
        } else if (
          e.key === "ArrowRight" &&
          section.section_index < section.section_count - 1
        ) {
          goToSection(section.section_index + 1);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    tocOpen,
    audioMenuOpen,
    selected,
    togglePinyin,
    toggleToneColors,
    goToSection,
    section.section_index,
    section.section_count,
  ]);

  useEffect(() => {
    if (!selected) return;
    const onScroll = () => {
      if (window.innerWidth >= 768) setSelected(null);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [selected]);

  const handleWordClick = (
    key: string,
    token: Token,
    paragraph: Token[],
    tIdx: number,
    el: HTMLButtonElement
  ) => {
    if (selected?.key === key) {
      setSelected(null);
      return;
    }
    stopAllAudio();
    const sentence = extractSentenceFromParagraph(paragraph, tIdx);
    setSelected({
      key,
      token,
      sentence,
      anchorRect: el.getBoundingClientRect(),
    });
  };

  const handleSaveWord = async (payload: {
    word: string;
    pinyin: string;
    meaning: string;
    example_sentence?: string;
    example_translation?: string;
  }) => {
    const created = await addVocab({
      ...payload,
      source_document_id: documentId,
    });
    setSavedWords((prev) => ({ ...prev, [created.word]: created.id }));
  };

  const handleRemoveWord = async (vocabId: number, word: string) => {
    await deleteVocab(vocabId);
    setSavedWords((prev) => {
      const copy = { ...prev };
      delete copy[word];
      return copy;
    });
  };

  const selectedEntries: DictionaryEntry[] = selected?.token.d
    ? selected.token.d
        .map((id) => section.dictionary[String(id)])
        .filter((e): e is DictionaryEntry => Boolean(e))
    : [];

  const selectedSentenceTranslation = selected?.sentence
    ? translationCache[selected.sentence] ?? null
    : null;

  const fontSizePx = FONT_SIZES[fontSizeIdx];

  return (
    <div className="min-h-screen flex flex-col">
      {/* Sticky Reader Toolbar */}
      <header className="sticky top-0 z-30 border-b border-stone-200/90 bg-[#faf8f5]/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-200/70 hover:text-stone-900 transition shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Library</span>
            </Link>
            <h1 className="hanzi-font truncate text-sm sm:text-base font-semibold text-stone-900">
              {section.document_title}
            </h1>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {sections.length > 1 && (
              <button
                type="button"
                onClick={() => setTocOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs sm:text-sm font-medium text-stone-700 hover:bg-stone-100 transition"
                title="Chapters / Sections"
              >
                <List className="h-3.5 w-3.5" />
                <span className="hidden md:inline">Chapters</span>
                <span className="text-stone-400">
                  {section.section_index + 1}/{section.section_count}
                </span>
              </button>
            )}

            {/* Read Whole Section Button */}
            {canSpeak && (
              <button
                type="button"
                onClick={handleTogglePlaySection}
                title={
                  playingSection
                    ? "Stop reading section"
                    : "Listen to whole section"
                }
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs sm:text-sm font-medium transition ${
                  playingSection
                    ? "border-orange-300 bg-orange-600 text-white hover:bg-orange-700"
                    : "border-stone-200 bg-white text-stone-700 hover:bg-stone-100"
                }`}
              >
                {playingSection ? (
                  <>
                    <Square className="h-3 w-3 fill-current" />
                    <span className="hidden sm:inline">
                      Stop{" "}
                      {speakingParaIdx !== null
                        ? `(${speakingParaIdx + 1}/${section.tokens.length})`
                        : ""}
                    </span>
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5 fill-current" />
                    <span className="hidden sm:inline">Listen</span>
                  </>
                )}
              </button>
            )}

            {/* Pinyin Toggle */}
            <button
              type="button"
              onClick={togglePinyin}
              title="Toggle Pinyin (P)"
              className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs sm:text-sm font-medium transition ${
                showPinyin
                  ? "border-orange-200 bg-orange-50 text-orange-800"
                  : "border-stone-200 bg-white text-stone-600 hover:bg-stone-100"
              }`}
            >
              {showPinyin ? (
                <Eye className="h-3.5 w-3.5" />
              ) : (
                <EyeOff className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">Pinyin</span>
            </button>

            {/* Tone Colors Toggle */}
            <button
              type="button"
              onClick={toggleToneColors}
              title="Toggle Tone Colors (T)"
              className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs sm:text-sm font-medium transition ${
                toneColors
                  ? "border-purple-200 bg-purple-50 text-purple-800"
                  : "border-stone-200 bg-white text-stone-600 hover:bg-stone-100"
              }`}
            >
              <Palette className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Tones</span>
            </button>

            {/* Audio Speed & Voice Settings */}
            {canSpeak && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setAudioMenuOpen((v) => !v)}
                  title="Audio Speed & Voice"
                  className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs sm:text-sm font-medium transition ${
                    audioMenuOpen
                      ? "border-orange-300 bg-orange-50 text-orange-800"
                      : "border-stone-200 bg-white text-stone-600 hover:bg-stone-100"
                  }`}
                >
                  <Volume2 className="h-3.5 w-3.5" />
                  <span className="text-xs">{ttsRate}x</span>
                </button>

                {audioMenuOpen && (
                  <div className="absolute right-0 mt-2 w-64 rounded-xl border border-stone-200 bg-white p-3.5 shadow-xl z-40 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-stone-400">
                        Audio Settings
                      </span>
                      <button
                        type="button"
                        onClick={() => setAudioMenuOpen(false)}
                        className="rounded p-0.5 text-stone-400 hover:text-stone-700"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div>
                      <p className="text-xs font-medium text-stone-600 mb-1.5">
                        Speech Speed
                      </p>
                      <div className="grid grid-cols-3 gap-1.5">
                        {TTS_RATES.map((rate) => (
                          <button
                            key={rate}
                            type="button"
                            onClick={() => handleChangeRate(rate)}
                            className={`rounded-lg py-1 text-xs font-medium border transition ${
                              ttsRate === rate
                                ? "border-orange-300 bg-orange-50 text-orange-800"
                                : "border-stone-200 text-stone-600 hover:bg-stone-50"
                            }`}
                          >
                            {rate}x
                          </button>
                        ))}
                      </div>
                    </div>

                    {voices.length > 0 && (
                      <div>
                        <label
                          htmlFor="tts-voice-select"
                          className="block text-xs font-medium text-stone-600 mb-1"
                        >
                          Chinese Voice
                        </label>
                        <select
                          id="tts-voice-select"
                          value={ttsVoiceURI || ""}
                          onChange={(e) => handleChangeVoice(e.target.value)}
                          className="w-full rounded-lg border border-stone-200 bg-stone-50 px-2 py-1.5 text-xs text-stone-700"
                        >
                          <option value="">Auto ({voices[0].name})</option>
                          {voices.map((v) => (
                            <option key={v.voiceURI} value={v.voiceURI}>
                              {v.name} ({v.lang})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Font Size Controls */}
            <div className="inline-flex items-center rounded-lg border border-stone-200 bg-white">
              <button
                type="button"
                onClick={() => changeFontSize(-1)}
                disabled={fontSizeIdx === 0}
                className="p-1.5 text-stone-600 hover:bg-stone-100 disabled:opacity-35 rounded-l-lg transition"
                aria-label="Decrease font size"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="px-1.5 text-xs font-medium text-stone-500 select-none">
                A
              </span>
              <button
                type="button"
                onClick={() => changeFontSize(1)}
                disabled={fontSizeIdx === FONT_SIZES.length - 1}
                className="p-1.5 text-stone-600 hover:bg-stone-100 disabled:opacity-35 rounded-r-lg transition"
                aria-label="Increase font size"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Slide-over Table of Contents Drawer */}
      {tocOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/30 backdrop-blur-[1px]"
            onClick={() => setTocOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative z-10 flex h-full w-80 max-w-[85vw] flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3.5">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">
                  Chapters &amp; Sections
                </p>
                <p className="hanzi-font truncate text-sm font-semibold text-stone-900 mt-0.5">
                  {section.document_title}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTocOpen(false)}
                className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                aria-label="Close chapters"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {sections.map((sec) => {
                const isCurrent = sec.section_index === section.section_index;
                return (
                  <button
                    key={sec.section_index}
                    type="button"
                    onClick={() => goToSection(sec.section_index)}
                    className={`w-full rounded-xl px-3 py-2.5 text-left transition ${
                      isCurrent
                        ? "bg-orange-50 text-orange-900 ring-1 ring-orange-200"
                        : "text-stone-700 hover:bg-stone-100"
                    }`}
                  >
                    <p className="hanzi-font truncate text-sm font-medium">
                      {sec.title || `Section ${sec.section_index + 1}`}
                    </p>
                    <p className="text-xs text-stone-400 mt-0.5">
                      {sec.char_count.toLocaleString()} chars
                    </p>
                  </button>
                );
              })}
            </div>
          </aside>
        </div>
      )}

      {/* Main Reading Area */}
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 sm:px-8 py-8 sm:py-12">
        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mb-6 flex items-center justify-between gap-2 text-xs text-stone-400">
          <span className="hanzi-font truncate">
            {section.title || `Section ${section.section_index + 1}`} ·{" "}
            {section.char_count.toLocaleString()} characters
          </span>
          <span className="shrink-0">
            Click any word for meaning &amp; sentence translation
          </span>
        </div>

        <article
          style={{
            fontSize: `${fontSizePx}px`,
            lineHeight: showPinyin ? 2.65 : 1.95,
          }}
          className={`hanzi-font space-y-6 text-stone-900 transition-opacity ${
            loadingSection ? "opacity-50" : "opacity-100"
          }`}
        >
          {section.tokens.map((paragraph, pIdx) => {
            const isSpeakingPara = speakingParaIdx === pIdx;
            const rawParaText = stripCitations(
              paragraph.map((tok) => tok.t).join("")
            );
            const isTransOpen = Boolean(openParaTranslations[pIdx]);
            const isTransLoading = Boolean(loadingParaTrans[pIdx]);
            const paraTranslation = translationCache[rawParaText];

            return (
              <div
                key={pIdx}
                ref={(el) => {
                  paraRefs.current[pIdx] = el;
                }}
                className={`group relative rounded-xl transition-colors ${
                  isSpeakingPara ? "bg-orange-50/80 -mx-3 px-3 py-1.5" : ""
                }`}
              >
                <div className="flex items-start gap-2">
                  {/* Paragraph Actions: Listen + Translate */}
                  <div className="mt-2 flex flex-col gap-1 shrink-0">
                    {canSpeak && (
                      <button
                        type="button"
                        onClick={() => handleSpeakParagraph(pIdx, paragraph)}
                        title={
                          isSpeakingPara
                            ? "Stop reading"
                            : "Listen to paragraph"
                        }
                        aria-label={
                          isSpeakingPara
                            ? "Stop reading"
                            : "Listen to paragraph"
                        }
                        className={`rounded-lg p-1.5 transition ${
                          isSpeakingPara
                            ? "bg-orange-100 text-orange-700"
                            : "text-stone-300 opacity-75 sm:opacity-0 sm:group-hover:opacity-100 hover:bg-stone-200/70 hover:text-stone-700"
                        }`}
                      >
                        {isSpeakingPara ? (
                          <Square className="h-3.5 w-3.5 fill-current" />
                        ) : (
                          <Volume2 className="h-4 w-4" />
                        )}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        handleToggleParagraphTranslation(pIdx, paragraph)
                      }
                      title={
                        isTransOpen
                          ? "Hide translation"
                          : "Translate paragraph"
                      }
                      aria-label={
                        isTransOpen
                          ? "Hide translation"
                          : "Translate paragraph"
                      }
                      className={`rounded-lg p-1.5 transition ${
                        isTransOpen
                          ? "bg-orange-100 text-orange-700"
                          : "text-stone-300 opacity-75 sm:opacity-0 sm:group-hover:opacity-100 hover:bg-stone-200/70 hover:text-stone-700"
                      }`}
                    >
                      <Languages className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="break-words">
                      {paragraph.map((token, tIdx) => {
                        const key = `${pIdx}-${tIdx}`;
                        if (token.w === false) {
                          return (
                            <span key={key} className="text-stone-700">
                              {token.t}
                            </span>
                          );
                        }

                        const isSelected = selected?.key === key;
                        const isSaved = token.t in savedWords;
                        const toneUnits = toneColors
                          ? splitWordToneUnits(token.t, token.p)
                          : null;

                        return (
                          <button
                            key={key}
                            type="button"
                            data-word-token="true"
                            onClick={(e) =>
                              handleWordClick(
                                key,
                                token,
                                paragraph,
                                tIdx,
                                e.currentTarget
                              )
                            }
                            className={[
                              "inline align-baseline rounded-md px-0.5 mx-[0.06em] transition-colors cursor-pointer text-left",
                              isSelected
                                ? "bg-orange-200/80 text-stone-950 ring-1 ring-orange-400/70"
                                : isSaved
                                  ? "underline decoration-emerald-500/70 decoration-dotted underline-offset-4 hover:bg-emerald-50"
                                  : "hover:bg-orange-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400",
                            ].join(" ")}
                          >
                            {showPinyin && token.p ? (
                              toneUnits ? (
                                <ruby className="word-ruby">
                                  {toneUnits.map((u, uIdx) => (
                                    <span
                                      key={uIdx}
                                      className={TONE_TEXT_CLASS[u.tone]}
                                    >
                                      {u.hanzi}
                                    </span>
                                  ))}
                                  <rp>(</rp>
                                  <rt>
                                    {toneUnits.map((u, uIdx) => (
                                      <span
                                        key={uIdx}
                                        className={TONE_TEXT_CLASS[u.tone]}
                                      >
                                        {uIdx > 0 ? " " : ""}
                                        {u.pinyin}
                                      </span>
                                    ))}
                                  </rt>
                                  <rp>)</rp>
                                </ruby>
                              ) : (
                                <ruby className="word-ruby">
                                  {token.t}
                                  <rp>(</rp>
                                  <rt>{token.p}</rt>
                                  <rp>)</rp>
                                </ruby>
                              )
                            ) : toneUnits ? (
                              <span>
                                {toneUnits.map((u, uIdx) => (
                                  <span
                                    key={uIdx}
                                    className={TONE_TEXT_CLASS[u.tone]}
                                  >
                                    {u.hanzi}
                                  </span>
                                ))}
                              </span>
                            ) : (
                              <span>{token.t}</span>
                            )}
                          </button>
                        );
                      })}
                    </p>

                    {/* Inline Paragraph Translation */}
                    {isTransOpen && (
                      <div className="mt-2 rounded-xl border border-stone-200/80 bg-white/90 px-4 py-2.5 text-sm leading-relaxed text-stone-600 font-sans">
                        {isTransLoading ? (
                          <span className="inline-flex items-center gap-1.5 text-stone-400">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Translating...
                          </span>
                        ) : (
                          paraTranslation || "Translation unavailable."
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </article>

        {section.section_count > 1 && (
          <nav className="mt-14 flex items-center justify-between border-t border-stone-200 pt-6">
            <button
              type="button"
              onClick={() => goToSection(section.section_index - 1)}
              disabled={section.section_index === 0 || loadingSection}
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-40 transition"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            <button
              type="button"
              onClick={() => setTocOpen(true)}
              className="text-sm font-medium text-stone-500 hover:text-orange-700 transition"
            >
              {section.section_index + 1} / {section.section_count}
            </button>
            <button
              type="button"
              onClick={() => goToSection(section.section_index + 1)}
              disabled={
                section.section_index >= section.section_count - 1 ||
                loadingSection
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-40 transition"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </nav>
        )}
      </main>

      {selected && (
        <WordPopover
          token={selected.token}
          entries={selectedEntries}
          sentence={selected.sentence}
          sentenceTranslation={selectedSentenceTranslation}
          translatingSentence={translatingSelectedSentence}
          anchorRect={selected.anchorRect}
          savedVocabId={savedWords[selected.token.t] ?? null}
          ttsRate={ttsRate}
          ttsVoiceURI={ttsVoiceURI}
          onSaveWord={handleSaveWord}
          onRemoveWord={handleRemoveWord}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
