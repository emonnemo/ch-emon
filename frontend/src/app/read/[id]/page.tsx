"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, Loader2 } from "lucide-react";
import {
  getDocument,
  getDocumentSection,
  type DocumentDetail,
  type DocumentSection,
} from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import { ReaderView } from "@/components/ReaderView";

export default function ReadDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const documentId = Number(id);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [section, setSection] = useState<DocumentSection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (authLoading || !user) return;
    if (!Number.isFinite(documentId) || documentId <= 0) {
      setError("Invalid document ID.");
      setLoading(false);
      return;
    }

    let active = true;
    let pollTimer: number | null = null;

    const load = async () => {
      try {
        const fetchedDoc = await getDocument(documentId);
        if (!active) return;
        setDoc(fetchedDoc);

        if (fetchedDoc.status === "processing") {
          setLoading(false);
          pollTimer = window.setTimeout(load, 1500);
          return;
        }

        if (fetchedDoc.status === "failed") {
          setError(
            fetchedDoc.error_message || "Failed to digest this document."
          );
          setLoading(false);
          return;
        }

        const startIdx = Math.min(
          Math.max(fetchedDoc.last_section_index, 0),
          Math.max(fetchedDoc.section_count - 1, 0)
        );
        const sec = await getDocumentSection(documentId, startIdx);
        if (active) {
          setSection(sec);
          setLoading(false);
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Failed to load document."
          );
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      active = false;
      if (pollTimer !== null) window.clearTimeout(pollTimer);
    };
  }, [documentId, authLoading, user]);

  if (authLoading || !user || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-stone-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading reader...
      </div>
    );
  }

  if (doc?.status === "processing") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-orange-600" />
        <div className="space-y-1 max-w-sm w-full">
          <h2 className="hanzi-font text-lg font-semibold text-stone-900">
            {doc.title}
          </h2>
          <p className="text-sm text-stone-500">
            Digesting and annotating Chinese text ({doc.progress_percent}%)...
          </p>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-orange-100">
            <div
              className="h-full rounded-full bg-orange-500 transition-all duration-300"
              style={{ width: `${Math.max(8, doc.progress_percent)}%` }}
            />
          </div>
        </div>
        <Link
          href="/"
          className="mt-2 inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Library
        </Link>
      </div>
    );
  }

  if (error || !section || !doc) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center max-w-md mx-auto">
        <AlertCircle className="h-8 w-8 text-red-500" />
        <p className="text-sm text-red-600">{error || "Document not found."}</p>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Library
        </Link>
      </div>
    );
  }

  return (
    <ReaderView
      documentId={documentId}
      initialSection={section}
      sections={doc.sections}
    />
  );
}
