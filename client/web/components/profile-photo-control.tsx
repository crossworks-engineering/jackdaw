'use client';

import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ReactCrop, {
  centerCrop,
  convertToPixelCrop,
  makeAspectCrop,
  type Crop,
  type PixelCrop,
} from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Camera, X } from 'lucide-react';
import { apiFetch, apiSend } from '@mantle/web-ui/api-fetch';
import { assetUrl } from '@mantle/web-ui/asset-url';
import { Button } from '@mantle/web-ui/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@mantle/web-ui/ui/dialog';
import { useToast } from '@mantle/web-ui/ui/toast';

/**
 * Profile PHOTO upload with an in-browser crop (react-image-crop) — PROFILE
 * ONLY, never agents: an agent's face is generated, a person's may be real.
 *
 * The crop happens client-side: the picked file (any size the browser can
 * decode) is shown in a dialog with a fixed square, circular selection, and
 * only the cropped square — re-drawn to a canvas at ≤512px and encoded as
 * WebP — is uploaded. So the wire cost is a few tens of KB no matter what
 * the camera produced, and the server's 512KB cap is never the user's
 * problem.
 *
 * Reads its state (the sha8 cache-buster) from the shared ['shell'] query and
 * invalidates it on change, so the rail's face updates the moment an upload
 * lands. The <img> src goes through assetUrl: same-origin rides the session
 * cookie, a detached client appends the shell's short-lived asset token.
 *
 * Precedence across the app: photo → generated seed → initials.
 */

/** Longest edge of the uploaded square. 512 keeps a 64px circle crisp on any
 *  display and encodes to a few tens of KB as WebP. */
const EXPORT_PX = 512;

function centeredSquare(width: number, height: number): Crop {
  return centerCrop(makeAspectCrop({ unit: '%', width: 90 }, 1, width, height), width, height);
}

/** Draw the selected square to a canvas and encode. WebP first; a browser
 *  that can't encode it (toBlob yields null) falls back to JPEG. */
async function cropToBlob(image: HTMLImageElement, crop: PixelCrop): Promise<Blob> {
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;
  const side = Math.min(EXPORT_PX, Math.round(crop.width * scaleX));
  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    image,
    crop.x * scaleX,
    crop.y * scaleY,
    crop.width * scaleX,
    crop.height * scaleY,
    0,
    0,
    side,
    side,
  );
  const encode = (type: string, quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  const blob = (await encode('image/webp', 0.9)) ?? (await encode('image/jpeg', 0.9));
  if (!blob) throw new Error('could not encode the cropped image');
  return blob;
}

export function ProfilePhotoControl() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const shell = useQuery({
    // The shell payload predates the typed pin; only the one field is read.
    queryKey: ['shell'],
    queryFn: () => apiFetch<{ avatarPhotoVersion?: string | null }>('/api/shell'),
  });
  const version = shell.data?.avatarPhotoVersion ?? null;

  const [pickedSrc, setPickedSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [pixelCrop, setPixelCrop] = useState<PixelCrop>();
  const [busy, setBusy] = useState(false);

  const pick = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setPickedSrc(String(reader.result));
    reader.readAsDataURL(file);
  };

  const closeCrop = () => {
    setPickedSrc(null);
    setCrop(undefined);
    setPixelCrop(undefined);
    if (inputRef.current) inputRef.current.value = '';
  };

  const upload = async () => {
    const image = imgRef.current;
    if (!image || !pixelCrop || pixelCrop.width < 1) return;
    setBusy(true);
    try {
      const blob = await cropToBlob(image, pixelCrop);
      const fd = new FormData();
      fd.append('file', new File([blob], 'avatar', { type: blob.type }));
      await apiFetch('/api/profile/photo', { method: 'PUT', body: fd });
      await queryClient.invalidateQueries({ queryKey: ['shell'] });
      toast.success('Photo set — it now stands in for your generated avatar.');
      closeCrop();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed — try again.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await apiSend('/api/profile/photo', 'DELETE');
      await queryClient.invalidateQueries({ queryKey: ['shell'] });
      toast.success('Photo removed — back to the generated avatar.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove the photo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      {version && (
        // eslint-disable-next-line @next/next/no-img-element -- private, token-authed bytes; next/image can't optimize them
        <img
          src={assetUrl(`/api/profile/photo?v=${version}`)}
          alt="Your profile photo"
          className="size-16 shrink-0 rounded-full border object-cover"
        />
      )}
      <div className="flex flex-col items-start gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          <Camera aria-hidden /> {version ? 'Replace photo…' : 'Upload photo…'}
        </Button>
        {version && (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="size-3" aria-hidden /> Remove photo
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) pick(f);
        }}
      />

      <Dialog open={pickedSrc !== null} onOpenChange={(o) => !o && closeCrop()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Crop your photo</DialogTitle>
            <DialogDescription>
              Drag to frame the circle; only the framed square is uploaded.
            </DialogDescription>
          </DialogHeader>
          {pickedSrc && (
            <div className="flex justify-center">
              <ReactCrop
                crop={crop}
                onChange={(c) => setCrop(c)}
                onComplete={(c) => setPixelCrop(c)}
                aspect={1}
                circularCrop
                keepSelection
                minWidth={32}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- local data URL being cropped */}
                <img
                  ref={imgRef}
                  src={pickedSrc}
                  alt="Photo to crop"
                  className="max-h-96"
                  onLoad={(e) => {
                    const el = e.currentTarget;
                    const centered = centeredSquare(el.width, el.height);
                    setCrop(centered);
                    // onComplete only fires on interaction; without this the
                    // upload button would stay dead until the user drags.
                    setPixelCrop(convertToPixelCrop(centered, el.width, el.height));
                  }}
                />
              </ReactCrop>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={busy} onClick={closeCrop}>
              Cancel
            </Button>
            <Button type="button" disabled={busy || !pixelCrop} onClick={upload}>
              Use photo
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
