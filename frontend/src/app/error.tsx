"use client";

import Link from "next/link";
import { AlertCircle, RotateCcw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
      <div className="max-w-md rounded-2xl border border-stone-200 bg-white p-8 shadow-sm space-y-4">
        <AlertCircle className="mx-auto h-10 w-10 text-red-500" />
        <h2 className="text-lg font-bold text-stone-900">
          Something went wrong
        </h2>
        <p className="text-sm text-stone-500">
          {error.message || "An unexpected error occurred while rendering this page."}
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-xl bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 transition"
          >
            <RotateCcw className="h-4 w-4" />
            Try Again
          </button>
          <Link
            href="/"
            className="rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 transition"
          >
            Library
          </Link>
        </div>
      </div>
    </div>
  );
}
