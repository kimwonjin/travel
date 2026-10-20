"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/supabase";
import { won } from "@/lib/format";
import type { BudgetItem } from "@/lib/types";

export default function BudgetTab({ tripId, people, readOnly }: { tripId: string; people: number; readOnly?: boolean }) {
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [text, setText] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    db().from("budget_items").select("*").eq("trip_id", tripId).order("created_at")
      .then(({ data, error }) => (error ? setError(error.message) : setItems(data as BudgetItem[])));
  }, [tripId]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || !amount) return;
    const { data, error } = await db().from("budget_items")
      .insert({ trip_id: tripId, text: text.trim(), amount: Number(amount) }).select().single();
    if (error) return setError(error.message);
    setItems([...items, data as BudgetItem]);
    setText("");
    setAmount("");
  }

  async function remove(item: BudgetItem) {
    setItems(items.filter((i) => i.id !== item.id));
    const { error } = await db().from("budget_items").delete().eq("id", item.id);
    if (error) setError(error.message);
  }

  const total = items.reduce((s, i) => s + Number(i.amount), 0);

  return (
    <>
      {error && <p className="error">오류: {error}</p>}
      <p className="total">
        합계 <strong>{won(total)}</strong>원
        {people > 1 && <span> (1인당 {won(Math.round(total / people))}원)</span>}
      </p>
      <ul className="list">
        {items.map((item) => (
          <li key={item.id}>
            <span>{item.text} — {won(Number(item.amount))}원</span>
            {!readOnly && <button className="icon" aria-label="삭제" onClick={() => remove(item)}>✕</button>}
          </li>
        ))}
      </ul>
      {!readOnly && <form className="add" onSubmit={add}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="항목 (항공, 숙박…)" />
        <input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="금액" />
        <button>추가</button>
      </form>}
    </>
  );
}
