"use client";

import { useState } from "react";
import { db } from "@/lib/supabase";

/** 010-1234-5678 → +821012345678 (이미 +로 시작하면 그대로) */
function toE164(input: string): string {
  const digits = input.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("0")) return "+82" + digits.slice(1);
  return "+" + digits;
}

export default function PhoneLogin() {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await db().auth.signInWithOtp({ phone: toE164(phone) });
    setBusy(false);
    if (error) return setError(error.message);
    setSent(true);
  }

  // 인증 성공 시 TravelApp의 onAuthStateChange가 화면을 전환한다
  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await db().auth.verifyOtp({ phone: toE164(phone), token: code.trim(), type: "sms" });
    setBusy(false);
    if (error) setError("인증번호가 맞지 않아요. 다시 확인해 주세요.");
  }

  // 문자 발송(SMS) 설정 전까지 쓰는 테스트용 입장. 설정 후 제거 예정.
  async function skip() {
    setBusy(true);
    setError(null);
    const { error } = await db().auth.signInAnonymously();
    setBusy(false);
    if (error) setError(error.message);
  }

  return (
    <main>
      <section className="panel login">
        <h2>전화번호로 시작하기</h2>
        {!sent ? (
          <form onSubmit={sendCode}>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="010-1234-5678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
            <button className="primary" disabled={busy}>{busy ? "보내는 중…" : "인증번호 받기"}</button>
          </form>
        ) : (
          <form onSubmit={verify}>
            <p className="muted">{phone}(으)로 보낸 6자리 번호를 입력해 주세요.</p>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="인증번호 6자리"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
            <button className="primary" disabled={busy}>{busy ? "확인 중…" : "로그인"}</button>
            <button type="button" className="link" onClick={() => { setSent(false); setCode(""); }}>
              번호 다시 입력
            </button>
          </form>
        )}
        {error && <p className="error">{error}</p>}
        <hr />
        <button type="button" className="link" disabled={busy} onClick={skip}>
          전화번호 없이 시작하기 (테스트용)
        </button>
      </section>
    </main>
  );
}
