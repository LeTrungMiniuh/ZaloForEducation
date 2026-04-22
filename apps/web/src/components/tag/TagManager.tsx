import React, { useMemo, useState } from "react";
import useTags from "../../hooks/useTags";
import type { TagItem } from "../../hooks/useTags";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function TagManager({ open, onClose }: Props) {
  const { tags, addTag, updateTag, deleteTag } = useTags();
  const [editing, setEditing] = useState<TagItem | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#f59e0b");

  React.useEffect(() => {
    if (!open) {
      setEditing(null);
      setName("");
      setColor("#f59e0b");
    }
  }, [open]);

  const startEdit = (tag: TagItem) => {
    setEditing(tag);
    setName(tag.name);
    setColor(tag.color || "#f59e0b");
  };

  const handleSave = () => {
    if (editing) {
      updateTag(editing.id, name, color);
    } else {
      addTag(name, color);
    }
    setEditing(null);
    setName("");
    setColor("#f59e0b");
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 pt-16">
      <div className="w-full max-w-md rounded-[12px] bg-white p-4 shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">Quản lý thẻ phân loại</h3>
          <button onClick={onClose} className="text-slate-600">Đóng</button>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tên thẻ"
              className="flex-1 rounded border px-3 py-2"
            />
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-12 h-10 p-0 border-0"
            />
            <button
              onClick={handleSave}
              className="rounded px-3 py-2 bg-primary text-white"
            >
              {editing ? "Lưu" : "Thêm"}
            </button>
          </div>

          <div className="space-y-2">
            {tags.length === 0 && (
              <div className="text-sm text-slate-500">Chưa có thẻ nào.</div>
            )}
            {tags.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span style={{ background: t.color }} className="inline-block w-4 h-4 rounded-sm" />
                  <div className="truncate">{t.name}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => startEdit(t)} className="text-sm text-slate-700">Sửa</button>
                  <button onClick={() => deleteTag(t.id)} className="text-sm text-red-600">Xóa</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
