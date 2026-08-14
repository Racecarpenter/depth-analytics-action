"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { compressImage } from "@/lib/utils/compress-image";
import { getAvatarUrl } from "../lib/identity";
import { removeUserAvatar, updateProfile, uploadUserAvatar } from "../mutations";

export function ProfileForm({
  initialDisplayName,
  initialUsername,
  initialAvatarPath,
}: {
  initialDisplayName: string | null;
  initialUsername: string | null;
  initialAvatarPath: string | null;
}) {
  const [displayName, setDisplayName] = useState(initialDisplayName ?? "");
  const [username, setUsername] = useState(initialUsername ?? "");
  const [avatarUrl, setAvatarUrl] = useState(getAvatarUrl(initialAvatarPath));
  const [error, setError] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isAvatarPending, startAvatarTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function handleAvatarPick(file: File | null) {
    if (!file) return;
    setError(undefined);
    startAvatarTransition(async () => {
      const compressed = await compressImage(file, 512);
      const formData = new FormData();
      formData.append("file", compressed);
      const result = await uploadUserAvatar(formData);
      if (!result.ok) {
        setError(result.error ?? "Couldn't upload that photo.");
        return;
      }
      // Local object URL for instant feedback — router.refresh() below also
      // re-fetches the real (Storage) URL, so this is just to avoid a flash
      // of the old/empty avatar while that round-trip is in flight.
      setAvatarUrl(URL.createObjectURL(compressed));
      router.refresh();
    });
  }

  function handleRemoveAvatar() {
    setError(undefined);
    startAvatarTransition(async () => {
      const result = await removeUserAvatar();
      if (!result.ok) {
        setError(result.error ?? "Couldn't remove that photo.");
        return;
      }
      setAvatarUrl(null);
      router.refresh();
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    setSaved(false);
    startTransition(async () => {
      const result = await updateProfile({ displayName, username: username.toLowerCase() });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Avatar url={avatarUrl} label={displayName || "?"} size="lg" />
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              isLoading={isAvatarPending}
              disabled={isAvatarPending}
              onClick={() => fileInputRef.current?.click()}
            >
              {avatarUrl ? "Change photo" : "Add photo"}
            </Button>
            {avatarUrl && (
              <Button type="button" variant="ghost" size="sm" disabled={isAvatarPending} onClick={handleRemoveAvatar}>
                Remove
              </Button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => handleAvatarPick(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="displayName">Display name</Label>
          <Input
            id="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Mike"
            maxLength={40}
          />
        </div>
        <div>
          <Label htmlFor="username">Username</Label>
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint">@</span>
            <Input
              id="username"
              className="pl-8"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
              placeholder="mikey"
              maxLength={20}
            />
          </div>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}
        {saved && !error && <p className="text-sm text-accent">Saved.</p>}

        <Button type="submit" className="w-full tap-target" isLoading={isPending} disabled={isPending}>
          Save
        </Button>
      </form>
    </div>
  );
}
