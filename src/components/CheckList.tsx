"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/supabase";
import { PACKING_CATEGORIES } from "@/lib/defaults";
import type { CheckItem } from "@/lib/types";

type Props = { table: "checklist_items" | "packing_items"; tripId: string; grouped?: boolean };

/** 체크리스트·짐 목록 공용. grouped면 category별로 묶어서 보여준다. */
export default function CheckList({ table, tripId, grouped }: Props) {
  const [items, setItems] = useState<CheckItem[]>([]);
  const [text, setText] = useState("");
  const [category, setCategory] = useState(PACKING_CATEGORIES[0]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    db().from(table).select("*").eq("trip_id", tripId).order("position").order("created_at")
      .then(({ data, error }) => (error ? setError(error.message) : setItems(data as CheckItem[])));
  }, [table, tripId]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    const row = { trip_id: tripId, text: value, position: items.length, ...(grouped ? { category } : {}) };
    const { data, error } = await db().from(table).insert(row).select().single();
    if (error) return setError(error.message);
    setItems([...items, data as CheckItem]);
    setText("");
  }

  async function toggle(item: CheckItem) {
    setItems(items.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)));
    const { error } = await db().from(table).update({ done: !item.done }).eq("id", item.id);
    if (error) setError(error.message);
  }

  async function remove(item: CheckItem) {
    setItems(items.filter((i) => i.id !== item.id));
    const { error } = await db().from(table).delete().eq("id", item.id);
    if (error) setError(error.message);
  }

  const doneRatio = items.length ? items.filter((i) => i.done).length / items.length : 0;
  const groups = grouped
    ? [...new Set([...PACKING_CATEGORIES, ...items.map((i) => i.category ?? "")])]
    : [""];

  return (
    <>
      {error && <p className="error">오류: {error}</p>}
      <div className="progress"><div style={{ width: `${doneRatio * 100}%` }} /></div>
      {groups.map((g) => {
        const list = grouped ? items.filter((i) => i.category === g) : items;
        if (grouped && !list.length) return null;
        return (
          <div key={g}>
            {grouped && <h3>{g}</h3>}
            <ul className="list">
              {list.map((item) => (
                <li key={item.id} className={item.done ? "done" : ""}>
                  <input type="checkbox" checked={item.done} onChange={() => toggle(item)} />
                  <span>{item.text}</span>
                  <button className="icon" aria-label="삭제" onClick={() => remove(item)}>✕</button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      <form className="add" onSubmit={add}>
        {grouped && (
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {PACKING_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        )}
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={grouped ? "물품 추가" : "항목 추가"} />
        <button>추가</button>
      </form>
    </>
  );
}
