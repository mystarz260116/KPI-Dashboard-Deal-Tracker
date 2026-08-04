import { useEffect, useMemo, useRef, useState } from 'react';
import { authFetch } from '../lib/authFetch';

type MentionableUser = {
  id: string;
  name: string;
};

type MentionTextareaProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
};

let mentionableUsersPromise: Promise<MentionableUser[]> | null = null;
let lastMentionInteractionAt = 0;

export function wasRecentMentionInteraction() {
  return Date.now() - lastMentionInteractionAt < 800;
}

function loadMentionableUsers() {
  if (!mentionableUsersPromise) {
    mentionableUsersPromise = authFetch('/api/deals?path=comments&mode=mentionable-users')
      .then(async (response) => {
        if (!response.ok) throw new Error('mentionable users fetch failed');
        const payload = await response.json();
        return Array.isArray(payload) ? payload : [];
      })
      .catch((error) => {
        mentionableUsersPromise = null;
        console.error('mentionable users fetch error:', error);
        return [];
      });
  }
  return mentionableUsersPromise;
}

function normalizeSearchText(value: string) {
  return value.toLocaleLowerCase('ja').replace(/\s+/g, '');
}

export default function MentionTextarea({
  value,
  onChange,
  placeholder,
  className,
}: MentionTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [users, setUsers] = useState<MentionableUser[]>([]);
  const [cursorPosition, setCursorPosition] = useState(value.length);
  const [isFocused, setIsFocused] = useState(false);

  const activeMention = useMemo(() => {
    const textBeforeCursor = value.slice(0, cursorPosition);
    const match = textBeforeCursor.match(/(?:^|\s)[@＠]([^@＠\n]*)$/);
    if (!match) return null;
    return {
      query: match[1],
      start: Math.max(textBeforeCursor.lastIndexOf('@'), textBeforeCursor.lastIndexOf('＠')),
    };
  }, [cursorPosition, value]);

  const suggestions = useMemo(() => {
    if (!activeMention) return [];
    const query = normalizeSearchText(activeMention.query);
    return users
      .filter((user) => !query || normalizeSearchText(user.name).includes(query))
      .slice(0, 8);
  }, [activeMention, users]);

  const updateCursor = (textarea: HTMLTextAreaElement) => {
    setCursorPosition(textarea.selectionStart ?? textarea.value.length);
  };

  const handleFocus = async () => {
    setIsFocused(true);
    const loadedUsers = await loadMentionableUsers();
    setUsers(loadedUsers);
  };

  const insertMention = (userName: string) => {
    if (!activeMention) return;
    const nextCursorPosition = activeMention.start + userName.length + 2;
    const nextValue = `${value.slice(0, activeMention.start)}@${userName} ${value.slice(cursorPosition)}`;
    onChange(nextValue);
    setCursorPosition(nextCursorPosition);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCursorPosition, nextCursorPosition);
    });
  };

  return (
    <div
      className="relative"
      data-no-card-navigation
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => {
        lastMentionInteractionAt = Date.now();
        event.stopPropagation();
      }}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          updateCursor(event.target);
        }}
        onClick={(event) => updateCursor(event.currentTarget)}
        onKeyUp={(event) => updateCursor(event.currentTarget)}
        onFocus={handleFocus}
        onBlur={() => setIsFocused(false)}
        placeholder={placeholder}
        className={className}
      />
      {isFocused && activeMention && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1 shadow-lg">
          {suggestions.map((user) => (
            <button
              key={user.id}
              type="button"
              onPointerDown={(event) => {
                lastMentionInteractionAt = Date.now();
                event.preventDefault();
                event.stopPropagation();
                insertMention(user.name);
              }}
              className="block min-h-11 w-full touch-manipulation rounded-lg px-3 py-2 text-left text-base font-medium text-zinc-700 hover:bg-purple-50 hover:text-purple-700"
            >
              @{user.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function MentionText({ text, className }: { text: string; className?: string }) {
  const [users, setUsers] = useState<MentionableUser[]>([]);

  useEffect(() => {
    void loadMentionableUsers().then(setUsers);
  }, []);

  const parts = useMemo(() => {
    const names = users
      .map((user) => user.name)
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);
    if (names.length === 0) return [text];

    const result: Array<string | { mention: string; key: string }> = [];
    let plainText = '';
    let index = 0;

    while (index < text.length) {
      const mentionMark = text[index] === '@' || text[index] === '＠' ? text[index] : null;
      const name = mentionMark
        ? names.find((candidate) => text.startsWith(`${mentionMark}${candidate}`, index))
        : undefined;
      if (!name) {
        plainText += text[index];
        index += 1;
        continue;
      }

      if (plainText) {
        result.push(plainText);
        plainText = '';
      }
      result.push({ mention: `${mentionMark}${name}`, key: `${index}:${name}` });
      index += name.length + 1;
    }

    if (plainText) result.push(plainText);
    return result;
  }, [text, users]);

  return (
    <p className={className}>
      {parts.map((part, index) => (
        typeof part === 'string'
          ? <span key={`text:${index}`}>{part}</span>
          : (
            <span
              key={part.key}
              className="rounded bg-purple-100 px-1 font-semibold text-purple-700"
            >
              {part.mention}
            </span>
          )
      ))}
    </p>
  );
}
