import { useCallback, useEffect, useState } from "react";

export type TagItem = { id: string; name: string; color: string };

const TAGS_KEY = "zalo_tags_v1";
const ASSIGN_KEY = "zalo_tag_assignments_v1";

function readTags(): TagItem[] {
  try {
    const raw = localStorage.getItem(TAGS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as TagItem[];
  } catch {
    return [];
  }
}

function writeTags(tags: TagItem[]) {
  localStorage.setItem(TAGS_KEY, JSON.stringify(tags));
}

function readAssigns(): Record<string, string> {
  try {
    const raw = localStorage.getItem(ASSIGN_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

function writeAssigns(map: Record<string, string>) {
  localStorage.setItem(ASSIGN_KEY, JSON.stringify(map));
}

export default function useTags() {
  const [tags, setTags] = useState<TagItem[]>(() => readTags());
  const [assignMap, setAssignMap] = useState<Record<string, string>>( () => readAssigns());

  useEffect(() => {
    writeTags(tags);
  }, [tags]);

  useEffect(() => {
    writeAssigns(assignMap);
  }, [assignMap]);

  const addTag = useCallback((name: string, color: string) => {
    const id = String(Date.now()) + Math.random().toString(36).slice(2, 8);
    const next: TagItem = { id, name: name.trim() || "Không tên", color };
    setTags((prev) => [...prev, next]);
    return next;
  }, []);

  const updateTag = useCallback((id: string, name: string, color: string) => {
    setTags((prev) => prev.map((t) => (t.id === id ? { ...t, name, color } : t)));
  }, []);

  const deleteTag = useCallback((id: string) => {
    setTags((prev) => prev.filter((t) => t.id !== id));
    setAssignMap((prev) => {
      const copy = { ...prev };
      for (const k of Object.keys(copy)) if (copy[k] === id) delete copy[k];
      return copy;
    });
  }, []);

  const assignTag = useCallback((key: string, tagId: string | null) => {
    setAssignMap((prev) => {
      const copy = { ...prev };
      if (!tagId) delete copy[key];
      else copy[key] = tagId;
      return copy;
    });
  }, []);

  const getTagFor = useCallback(
    (key: string) => {
      const tagId = assignMap[key];
      return tags.find((t) => t.id === tagId) || null;
    },
    [assignMap, tags],
  );

  return {
    tags,
    addTag,
    updateTag,
    deleteTag,
    assignTag,
    getTagFor,
    assignMap,
  };
}
