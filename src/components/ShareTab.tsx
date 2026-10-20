"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/supabase";
import type { Invite, Member, Role } from "@/lib/types";

const ROLE_NAME = { editor: "편집 가능", viewer: "보기 전용" } as const;

type Props = { tripId: string; role: Role; onLeft: () => void };

export default function ShareTab({ tripId, role, onLeft }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isOwner = role === "owner";

  useEffect(() => {
    db().from("trip_members").select("*").eq("trip_id", tripId).order("created_at")
      .then(({ data, error }) => (error ? setError(error.message) : setMembers(data as Member[])));
    if (isOwner) {
      db().from("trip_invites").select("*").eq("trip_id", tripId).order("created_at")
        .then(({ data, error }) => (error ? setError(error.message) : setInvites(data as Invite[])));
    }
  }, [tripId, isOwner]);

  const link = (code: string) => `${location.origin}/?join=${code}`;

  async function createInvite(r: Invite["role"]) {
    const { data, error } = await db().from("trip_invites").insert({ trip_id: tripId, role: r }).select().single();
    if (error) return setError(error.message);
    setInvites([...invites, data as Invite]);
    copy((data as Invite).code);
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(link(code));
      setCopied(code);
    } catch {
      prompt("아래 링크를 복사해서 보내 주세요", link(code));
    }
  }

  async function cancelInvite(code: string) {
    setInvites(invites.filter((i) => i.code !== code));
    const { error } = await db().from("trip_invites").delete().eq("code", code);
    if (error) setError(error.message);
  }

  async function changeRole(m: Member, r: Member["role"]) {
    setMembers(members.map((x) => (x.user_id === m.user_id ? { ...x, role: r } : x)));
    const { error } = await db().from("trip_members").update({ role: r }).eq("trip_id", tripId).eq("user_id", m.user_id);
    if (error) setError(error.message);
  }

  async function removeMember(m: Member) {
    if (!confirm(`${m.nickname || "이 멤버"}를 내보낼까요?`)) return;
    setMembers(members.filter((x) => x.user_id !== m.user_id));
    const { error } = await db().from("trip_members").delete().eq("trip_id", tripId).eq("user_id", m.user_id);
    if (error) setError(error.message);
  }

  async function leave() {
    if (!confirm("이 여행에서 나갈까요?")) return;
    const { data: { user } } = await db().auth.getUser();
    const { error } = await db().from("trip_members").delete().eq("trip_id", tripId).eq("user_id", user?.id ?? "");
    if (error) return setError(error.message);
    onLeft();
  }

  return (
    <>
      {error && <p className="error">오류: {error}</p>}

      {isOwner ? (
        <>
          <h3>초대 링크 만들기</h3>
          <p className="hint">링크를 받은 사람이 들어오면 이 여행을 같이 볼 수 있어요.</p>
          <div className="row">
            <button className="primary" onClick={() => createInvite("editor")}>✏️ 같이 일정 짜기 링크</button>
            <button className="secondary" onClick={() => createInvite("viewer")}>👀 보기만 하는 링크</button>
          </div>

          {invites.length > 0 && (
            <>
              <h3>만든 링크</h3>
              <ul className="list">
                {invites.map((i) => (
                  <li key={i.code}>
                    <span>{ROLE_NAME[i.role]} 링크 <small className="muted">…{i.code.slice(-4)}</small></span>
                    <button className="pick" onClick={() => copy(i.code)}>{copied === i.code ? "복사됨 ✓" : "복사"}</button>
                    <button className="icon" aria-label="링크 취소" onClick={() => cancelInvite(i.code)}>✕</button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      ) : (
        <>
          <p>이 여행에 <b>{ROLE_NAME[role]}</b> 권한으로 참여 중이에요.</p>
          <button className="link" onClick={leave}>이 여행에서 나가기</button>
        </>
      )}

      <h3>함께하는 사람 ({members.length + 1}명)</h3>
      <ul className="list">
        <li><span>👑 여행 만든 사람</span></li>
        {members.map((m) => (
          <li key={m.user_id}>
            <span>{m.nickname || "이름 없음"}</span>
            {isOwner ? (
              <>
                <select value={m.role} onChange={(e) => changeRole(m, e.target.value as Member["role"])} aria-label="권한">
                  <option value="editor">편집 가능</option>
                  <option value="viewer">보기 전용</option>
                </select>
                <button className="icon" aria-label="내보내기" onClick={() => removeMember(m)}>✕</button>
              </>
            ) : (
              <small className="muted">{ROLE_NAME[m.role]}</small>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
