"use client";

import { useState } from "react";
import { setSavedNotes } from "../actions";
import styles from "./note-editor.module.css";

function Pencil() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={styles.icon} aria-hidden>
      <path
        d="M11 2.5l2.5 2.5L6 12.5l-3 .5.5-3L11 2.5z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function NoteEditor({
  jobId,
  note,
}: {
  jobId: string;
  note: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  if (editing) {
    return (
      <form
        className={`${styles.wrap} ${styles.form}`}
        action={async (fd) => {
          setSaving(true);
          try {
            await setSavedNotes(fd);
            setEditing(false);
          } finally {
            setSaving(false);
          }
        }}
      >
        <input type="hidden" name="jobId" value={jobId} />
        <textarea
          name="notes"
          rows={3}
          defaultValue={note ?? ""}
          autoFocus
          placeholder="Notes…"
          className={styles.textarea}
        />
        <div className={styles.row}>
          <button className={styles.save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            className={styles.cancel}
            onClick={() => setEditing(false)}
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className={styles.wrap}>
      {note && <p className={styles.noteText}>{note}</p>}
      <button
        type="button"
        className={styles.toggle}
        onClick={() => setEditing(true)}
      >
        <Pencil />
        {note ? "Edit notes" : "Add notes"}
      </button>
    </div>
  );
}
