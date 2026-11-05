"use client";

// Lets the guest keep a copy: the browser's print dialog can save the bill as a PDF.
export default function SaveButton() {
  return (
    <button onClick={() => window.print()} className="h-10 rounded-xl px-4 text-sm font-semibold text-stone-600 ring-1 ring-stone-300 hover:bg-white">
      Save as PDF
    </button>
  );
}
