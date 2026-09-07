"use client";
/**
 * Catches any unhandled render error on /timetable and shows a readable
 * message + a button to retry. Without this, a server-action rejection
 * renders an empty page (Next.js's default behavior).
 */
import { useEffect } from "react";

export default function TimetableError({
  error,
  reset,
}: {
  error:   Error & { digest?: string };
  reset:   () => void;
}) {
  useEffect(() => {
    console.error("[timetable] render error:", error);
  }, [error]);

  return (
    <main className="min-h-screen bg-[#0a0a0f] px-4 py-6 max-w-2xl mx-auto">
      <nav className="flex gap-2 mb-6">
        <a href="/" className="text-[11px] text-[#6b7280] hover:text-white transition-colors pb-0.5">Tasks</a>
        <a href="/readings" className="text-[11px] text-[#6b7280] hover:text-white transition-colors pb-0.5">Readings</a>
        <span className="text-[11px] font-medium text-white border-b border-[#6366f1] pb-0.5">Timetable</span>
      </nav>
      <div className="rounded-xl bg-[#111118] border border-[#ef4444] px-4 py-5 text-sm">
        <p className="text-white font-medium mb-1">Something went wrong</p>
        <p className="text-[#6b7280] text-[12px] mb-3 break-words">
          {error.message || "Unknown error"}
          {error.digest && <span className="block mt-1 opacity-60">id: {error.digest}</span>}
        </p>
        <div className="flex gap-2">
          <button
            onClick={reset}
            className="text-[11px] text-white bg-[#6366f1] hover:bg-[#4f46e5] transition-colors rounded-lg px-3 py-1.5"
          >
            Try again
          </button>
          <a
            href="/timetable"
            className="text-[11px] text-[#6b7280] hover:text-white border border-[#2a2a3a] transition-colors rounded-lg px-3 py-1.5"
          >
            Reload page
          </a>
        </div>
      </div>
    </main>
  );
}
