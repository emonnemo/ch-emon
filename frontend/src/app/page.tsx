"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  BookOpen,
  Check,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  createTextDocument,
  deleteDocument,
  listDocuments,
  renameDocument,
  type DocumentSummary,
} from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import { Navbar } from "@/components/Navbar";
import { BookUploader } from "@/components/BookUploader";

const SAMPLE_TITLE = "夏天的冰淇淋 (Summer Ice Cream)";
const SAMPLE_TEXT = `今天天气非常暖和，我和好朋友一起去图书馆看书。路过银行门口的时候，我们在大街上慢慢行走，聊着最近的生活。

下午走出图书馆，太阳有点大。朋友笑着说：“不好意思，我有点渴了，我们去买冰淇淋吧！”我们在街角的小店买了两个草莓冰淇淋，味道真不错。

看着公园里玩耍的小朋友，我想起自己小时候也特别喜欢吃冰淇淋。不知不觉，我们已经长大了。虽然时间过得很快，但是和朋友在一起的快乐记忆永远不会消失。`;

type ComposerMode = "closed" | "upload" | "paste";

function SourceBadge({ sourceType }: { sourceType: string }) {
  const styles: Record<string, string> = {
    pdf: "bg-red-50 text-red-700 border-red-200",
    epub: "bg-indigo-50 text-indigo-700 border-indigo-200",
    text: "bg-stone-100 text-stone-600 border-stone-200",
  };
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${
        styles[sourceType] || styles.text
      }`}
    >
      {sourceType.toUpperCase()}
    </span>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [composer, setComposer] = useState<ComposerMode>("closed");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [authLoading, user, router]);

  const fetchDocuments = useCallback(async (isInitial = false) => {
    try {
      const docs = await listDocuments();
      setDocuments(docs);
      setListError(null);
      if (isInitial && docs.length === 0) {
        setComposer("upload");
      }
    } catch (err) {
      setListError(
        err instanceof Error
          ? err.message
          : "Could not reach backend API. Is FastAPI running on port 8000?"
      );
    } finally {
      if (isInitial) setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetchDocuments(true);
    }
  }, [user, fetchDocuments]);

  const hasProcessing = documents.some((d) => d.status === "processing");
  useEffect(() => {
    if (!hasProcessing || !user) return;
    const timer = window.setInterval(() => {
      fetchDocuments(false);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [hasProcessing, user, fetchDocuments]);

  const handleLoadSample = () => {
    setTitle(SAMPLE_TITLE);
    setText(SAMPLE_TEXT);
    setFormError(null);
  };

  const handleSubmitText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !text.trim()) {
      setFormError("Please enter both a title and some Chinese text.");
      return;
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const created = await createTextDocument(title.trim(), text.trim());
      router.push(`/read/${created.id}`);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Failed to digest text."
      );
      setSubmitting(false);
    }
  };

  const handleBookUploaded = (doc: DocumentSummary) => {
    setDocuments((prev) => [doc, ...prev]);
    setComposer("closed");
  };

  const startRename = (doc: DocumentSummary) => {
    setEditingId(doc.id);
    setEditingTitle(doc.title);
  };

  const handleSaveRename = async (id: number) => {
    const trimmed = editingTitle.trim();
    if (!trimmed) return;
    try {
      const updated = await renameDocument(id, trimmed);
      setDocuments((prev) => prev.map((d) => (d.id === id ? updated : d)));
      setEditingId(null);
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Rename failed.");
    }
  };

  const handleDelete = async (id: number, docTitle: string) => {
    if (!window.confirm(`Delete "${docTitle}"?`)) return;
    try {
      await deleteDocument(id);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Failed to delete.");
    }
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-stone-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const filteredDocs = searchQuery.trim()
    ? documents.filter((d) =>
        d.title.toLowerCase().includes(searchQuery.trim().toLowerCase())
      )
    : documents;

  return (
    <div className="min-h-screen">
      <Navbar
        rightSlot={
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                setComposer((m) => (m === "upload" ? "closed" : "upload"))
              }
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs sm:text-sm font-medium transition ${
                composer === "upload"
                  ? "bg-orange-700 text-white"
                  : "bg-orange-600 text-white hover:bg-orange-700"
              }`}
            >
              <Upload className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Upload Book</span>
            </button>
            <button
              type="button"
              onClick={() =>
                setComposer((m) => (m === "paste" ? "closed" : "paste"))
              }
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs sm:text-sm font-medium transition ${
                composer === "paste"
                  ? "border-orange-300 bg-orange-50 text-orange-800"
                  : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
              }`}
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Paste Text</span>
            </button>
          </div>
        }
      />

      <main className="mx-auto max-w-4xl px-4 sm:px-6 py-8 space-y-8">
        {composer === "upload" && (
          <BookUploader
            onUploaded={handleBookUploaded}
            onCancel={documents.length > 0 ? () => setComposer("closed") : undefined}
          />
        )}

        {composer === "paste" && (
          <section className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div>
                <h2 className="text-base font-semibold text-stone-900">
                  Digest New Chinese Text
                </h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  Paste any Chinese article, story, or chapter — words will be
                  grouped with pinyin and CC-CEDICT meanings.
                </p>
              </div>
              <button
                type="button"
                onClick={handleLoadSample}
                className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-800 hover:bg-orange-100 transition"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Load Sample Text
              </button>
            </div>

            <form onSubmit={handleSubmitText} className="space-y-4">
              <div>
                <label
                  htmlFor="doc-title"
                  className="block text-xs font-medium text-stone-600 mb-1"
                >
                  Title
                </label>
                <input
                  id="doc-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. 第一章 · 夏天的故事"
                  className="hanzi-font w-full rounded-xl border border-stone-200 bg-stone-50/50 px-3.5 py-2.5 text-sm text-stone-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="doc-text"
                  className="block text-xs font-medium text-stone-600 mb-1"
                >
                  Chinese Text
                </label>
                <textarea
                  id="doc-text"
                  rows={7}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="在这里粘贴中文文章..."
                  className="hanzi-font w-full rounded-xl border border-stone-200 bg-stone-50/50 px-3.5 py-3 text-base leading-relaxed text-stone-900 focus:border-orange-500 focus:bg-white focus:outline-none"
                />
              </div>

              {formError && <p className="text-sm text-red-600">{formError}</p>}

              <div className="flex items-center justify-end gap-2">
                {documents.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setComposer("closed")}
                    className="rounded-xl px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100 transition"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-orange-700 disabled:opacity-60 transition"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Digesting...
                    </>
                  ) : (
                    <>
                      <BookOpen className="h-4 w-4" />
                      Digest &amp; Read
                    </>
                  )}
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-stone-500">
                Your Library
              </h2>
              <span className="rounded-full bg-stone-200/70 px-2 py-0.5 text-xs font-medium text-stone-600">
                {documents.length}
              </span>
            </div>

            {documents.length > 2 && (
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search books..."
                  className="w-full rounded-xl border border-stone-200 bg-white pl-8 pr-3 py-1.5 text-sm text-stone-800 focus:border-orange-500 focus:outline-none"
                />
              </div>
            )}
          </div>

          {listError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {listError}
            </div>
          )}

          {loadingList ? (
            <div className="flex items-center justify-center py-12 text-stone-400">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading library...
            </div>
          ) : filteredDocs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 p-10 text-center">
              <FileText className="mx-auto h-8 w-8 text-stone-300" />
              <p className="mt-2 text-sm font-medium text-stone-600">
                {searchQuery ? "No matching books found" : "Your library is empty"}
              </p>
              <p className="mt-1 text-xs text-stone-400">
                {searchQuery
                  ? "Try a different search keyword."
                  : "Upload a Chinese PDF/EPUB book or paste a text to start reading."}
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredDocs.map((doc) => {
                const isProcessing = doc.status === "processing";
                const isFailed = doc.status === "failed";
                const isEditing = editingId === doc.id;
                const readPct =
                  doc.section_count > 1
                    ? Math.round(
                        ((doc.last_section_index + 1) / doc.section_count) * 100
                      )
                    : 100;

                return (
                  <div
                    key={doc.id}
                    className={`rounded-2xl border bg-white p-4 shadow-xs transition ${
                      isFailed
                        ? "border-red-200 bg-red-50/30"
                        : "border-stone-200 hover:border-orange-300"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        {isEditing ? (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              handleSaveRename(doc.id);
                            }}
                            className="flex items-center gap-2"
                          >
                            <input
                              type="text"
                              value={editingTitle}
                              onChange={(e) => setEditingTitle(e.target.value)}
                              autoFocus
                              className="hanzi-font flex-1 rounded-lg border border-orange-400 bg-white px-2.5 py-1 text-sm font-semibold text-stone-900 focus:outline-none"
                            />
                            <button
                              type="submit"
                              className="rounded-lg bg-orange-600 p-1.5 text-white hover:bg-orange-700"
                              aria-label="Save title"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100"
                              aria-label="Cancel rename"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </form>
                        ) : (
                          <div className="flex items-center gap-2 flex-wrap">
                            <SourceBadge sourceType={doc.source_type} />
                            {isFailed ? (
                              <h3 className="hanzi-font truncate text-base font-semibold text-stone-900">
                                {doc.title}
                              </h3>
                            ) : (
                              <Link
                                href={`/read/${doc.id}`}
                                className="hanzi-font truncate text-base font-semibold text-stone-900 hover:text-orange-700 transition"
                              >
                                {doc.title}
                              </Link>
                            )}
                          </div>
                        )}

                        {isProcessing ? (
                          <div className="mt-2.5 space-y-1.5 max-w-md">
                            <div className="flex items-center justify-between text-xs text-orange-700 font-medium">
                              <span className="inline-flex items-center gap-1.5">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Digesting &amp; annotating...
                              </span>
                              <span>{doc.progress_percent}%</span>
                            </div>
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-orange-100">
                              <div
                                className="h-full rounded-full bg-orange-500 transition-all duration-300"
                                style={{
                                  width: `${Math.max(8, doc.progress_percent)}%`,
                                }}
                              />
                            </div>
                          </div>
                        ) : isFailed ? (
                          <p className="mt-1.5 inline-flex items-start gap-1.5 text-xs text-red-700">
                            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                            <span>
                              {doc.error_message ||
                                "Failed to process this document."}
                            </span>
                          </p>
                        ) : (
                          <div className="mt-1.5 space-y-2">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
                              <span>
                                {doc.total_chars.toLocaleString()} chars
                              </span>
                              <span>·</span>
                              <span>
                                {doc.section_count}{" "}
                                {doc.section_count === 1
                                  ? "section"
                                  : "sections"}
                              </span>
                              {doc.section_count > 1 && (
                                <>
                                  <span>·</span>
                                  <span className="text-orange-700 font-medium">
                                    Section {doc.last_section_index + 1} /{" "}
                                    {doc.section_count} ({readPct}%)
                                  </span>
                                </>
                              )}
                            </div>

                            {doc.section_count > 1 && (
                              <div className="h-1 w-full max-w-xs overflow-hidden rounded-full bg-stone-100">
                                <div
                                  className="h-full rounded-full bg-orange-500/80"
                                  style={{ width: `${readPct}%` }}
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {doc.status === "ready" && (
                          <Link
                            href={`/read/${doc.id}`}
                            className="rounded-lg bg-stone-100 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-orange-100 hover:text-orange-800 transition"
                          >
                            {doc.last_section_index > 0 ? "Continue" : "Read"}
                          </Link>
                        )}
                        {!isProcessing && !isEditing && (
                          <button
                            type="button"
                            onClick={() => startRename(doc)}
                            className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition"
                            aria-label={`Rename ${doc.title}`}
                            title="Rename"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(doc.id, doc.title)}
                          className="rounded-lg p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-600 transition"
                          aria-label={`Delete ${doc.title}`}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
