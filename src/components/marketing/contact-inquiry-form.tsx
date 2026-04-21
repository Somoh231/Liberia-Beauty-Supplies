"use client";

import { CONTACT_EMAIL } from "@/lib/site";
import { type FormEvent, useState } from "react";

export function ContactInquiryForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  const fieldClass =
    "mt-2 w-full rounded-2xl border border-[var(--line-strong)] bg-[var(--bg-elevated)] px-4 py-3.5 text-sm text-[var(--fg)] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] outline-none transition duration-200 placeholder:text-[var(--fg-subtle)] focus:border-[#D4AF37]/55 focus:ring-2 focus:ring-[#D4AF37]/22";

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const body = [
      `Name: ${name}`,
      `Email: ${email}`,
      `Phone: ${phone}`,
      "",
      message,
    ].join("\n");
    const href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`Website inquiry from ${name || "guest"}`)}&body=${encodeURIComponent(body)}`;
    window.location.href = href;
    setSent(true);
  };

  const canSend = name.trim().length >= 2 && email.includes("@") && message.trim().length >= 4;

  return (
    <form onSubmit={onSubmit} className="marketing-card border border-[var(--line)] bg-[var(--bg-elevated)]/95 p-6 sm:p-8">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--accent-deep)]">Message the studio</p>
      <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-medium tracking-tight text-[var(--fg)]">
        Send a note
      </h2>
      <p className="mt-2 text-sm text-[var(--fg-muted)]">
        We reply by WhatsApp or email. For appointments, booking online is fastest.
      </p>

      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">Name</span>
          <input
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            className={fieldClass}
            placeholder="Your name"
            required
            minLength={2}
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">Email</span>
          <input
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className={fieldClass}
            placeholder="you@example.com"
            required
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">Phone</span>
          <input
            name="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
            inputMode="tel"
            className={fieldClass}
            placeholder="Optional"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--fg-muted)]">How can we help?</span>
          <textarea
            name="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            className={`${fieldClass} resize-y`}
            placeholder="Services you’re interested in, timing, or questions…"
            required
            minLength={4}
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={!canSend}
        className="mt-8 w-full rounded-full bg-[#D4AF37] px-8 py-3.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#111111] shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_18px_44px_-18px_rgba(212,175,55,0.55)] transition duration-200 [transition-timing-function:var(--ease-out)] hover:brightness-[1.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D4AF37] enabled:active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto sm:min-w-[12rem]"
      >
        Open in email
      </button>

      {sent ? (
        <p
          className="mt-5 rounded-2xl border border-[#D4AF37]/28 bg-[var(--accent-soft)] px-4 py-3 text-sm text-[var(--accent-deep)]"
          role="status"
        >
          If your mail app did not open, email us directly at{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium underline-offset-2 hover:underline">
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      ) : null}
    </form>
  );
}
