"use client";

import { useRef, useState } from "react";
import { FileUp, Loader2, Upload, X } from "lucide-react";
import { uploadBookDocument, type DocumentSummary } from "@/lib/api";

interface BookUploaderProps {
  onUploaded: (doc: DocumentSummary) => void;
  onCancel?: () => void;
}

const ACCEPTED_EXTS = [".pdf", ".epub", ".txt"];

export function BookUploader({ onUploaded, onCancel }: BookUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const acceptFile = (file: File | undefined) => {
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!ACCEPTED_EXTS.some((ext) => lower.endsWith(ext))) {
      setError("Please choose a .pdf, .epub, or .txt file.");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setError("File exceeds the 25 MB limit.");
      return;
    }
    setError(null);
    setSelectedFile(file);
    // Suggest filename without extension if user hasn't typed a custom title
    if (!title.trim()) {
      setTitle(file.name.replace(/\.(pdf|epub|txt)$/i, ""));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    acceptFile(e.dataTransfer.files?.[0]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setError("Please select a PDF, EPUB, or TXT file first.");
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const doc = await uploadBookDocument(selectedFile, title);
      setSelectedFile(null);
      setTitle("");
      onUploaded(doc);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6 shadow-sm">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-stone-900">
          Upload Chinese Book or Document
        </h2>
        <p className="text-xs text-stone-500 mt-0.5">
          Supports text-based <strong>PDF</strong>, <strong>EPUB</strong>{" "}
          (preserves chapters), and <strong>TXT</strong> files up to 25 MB.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Drag-and-drop zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          className={[
            "flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center cursor-pointer transition",
            dragging
              ? "border-orange-500 bg-orange-50/70"
              : selectedFile
                ? "border-orange-300 bg-orange-50/30"
                : "border-stone-300 bg-stone-50/60 hover:border-orange-400 hover:bg-orange-50/20",
          ].join(" ")}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.epub,.txt"
            className="hidden"
            onChange={(e) => acceptFile(e.target.files?.[0])}
          />

          {selectedFile ? (
            <div className="flex items-center gap-3">
              <FileUp className="h-6 w-6 text-orange-600 shrink-0" />
              <div className="text-left">
                <p className="text-sm font-medium text-stone-900 break-all">
                  {selectedFile.name}
                </p>
                <p className="text-xs text-stone-500">
                  {(selectedFile.size / (1024 * 1024) >= 0.1
                    ? `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB`
                    : `${Math.max(1, Math.round(selectedFile.size / 1024))} KB`)}{" "}
                  · Click to replace
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedFile(null);
                  setTitle("");
                }}
                className="rounded-lg p-1 text-stone-400 hover:bg-stone-200/70 hover:text-stone-700"
                aria-label="Remove selected file"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <>
              <Upload className="h-7 w-7 text-stone-400 mb-2" />
              <p className="text-sm font-medium text-stone-700">
                Drop a PDF, EPUB, or TXT file here, or click to browse
              </p>
              <p className="text-xs text-stone-400 mt-1">
                Digestion runs in the background so even full novels load smoothly
              </p>
            </>
          )}
        </div>

        {/* Optional Custom Title */}
        <div>
          <label
            htmlFor="book-title"
            className="block text-xs font-medium text-stone-600 mb-1"
          >
            Book Title (optional — auto-detected from EPUB/filename)
          </label>
          <input
            id="book-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. 活着 / 小王子"
            className="hanzi-font w-full rounded-xl border border-stone-200 bg-stone-50/50 px-3.5 py-2.5 text-sm text-stone-900 focus:border-orange-500 focus:bg-white focus:outline-none"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-center justify-end gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100 transition"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={!selectedFile || uploading}
            className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-orange-700 disabled:opacity-50 transition"
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Upload &amp; Digest
              </>
            )}
          </button>
        </div>
      </form>
    </section>
  );
}
