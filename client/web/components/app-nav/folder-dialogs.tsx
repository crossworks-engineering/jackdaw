'use client';

import { useEffect, useState } from 'react';
import { APP_NAV_FOLDER_NAME_MAX } from '@mantle/client-types/app-nav';
import { Button } from '@mantle/web-ui/ui/button';
import { Input } from '@mantle/web-ui/ui/input';
import { Field, FieldError, FieldLabel } from '@mantle/web-ui/ui/field';
import { SubmitButton } from '@mantle/web-ui/ui/submit-button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@mantle/web-ui/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@mantle/web-ui/ui/alert-dialog';
import { AppLookFields, type AppLook } from './app-look-picker';
import { AppTile } from './app-tile';

/** Whose folders these are: the brain's (every admin sees them), or a
 *  member's own (only that member sees them until an admin accepts
 *  something filed in one, folder plan phase 5). */
export type FolderAudience = 'brain' | 'member';

/** What the dialog says about who sees a folder. */
export function folderNameNote(
  who: FolderAudience,
  renaming: boolean,
  parentName: string | null | undefined,
): string {
  if (who === 'member') {
    const own = 'Only you see this folder until an admin accepts something in it.';
    return !renaming && parentName ? `Inside ${parentName}. ${own}` : own;
  }
  if (renaming) return 'Everyone on this brain sees the new name.';
  return parentName
    ? `Inside ${parentName}. Everyone on this brain sees it.`
    : 'Everyone on this brain sees the same folders.';
}

/**
 * Create or rename a folder. `initial` present = rename. A new folder also
 * picks its colour and icon here (the same fields the look popover shows
 * for an existing one), so it is made in one write; both default to none,
 * and the name keeps the focus, so a plain folder is still name + Enter.
 */
export function FolderNameDialog({
  open,
  onOpenChange,
  initial,
  parentName,
  who = 'brain',
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: string;
  /** For a new subfolder: the folder it goes in, named in the description. */
  parentName?: string | null;
  who?: FolderAudience;
  /** `look` holds only what was chosen (a rename passes `{}`). */
  onSubmit: (name: string, look: AppLook) => void;
}) {
  const [name, setName] = useState(initial ?? '');
  const [look, setLook] = useState<AppLook>({});
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setName(initial ?? '');
      setLook({});
      setError(null);
    }
  }, [open, initial]);
  const renaming = initial !== undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={renaming ? 'sm:max-w-sm' : 'sm:max-w-md'}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = name.trim();
            if (!trimmed) {
              setError('Give the folder a name.');
              return;
            }
            onSubmit(trimmed, {
              ...(look.icon ? { icon: look.icon } : {}),
              ...(look.color ? { color: look.color } : {}),
            });
            onOpenChange(false);
          }}
          className="flex flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle>{renaming ? 'Rename folder' : 'New folder'}</DialogTitle>
            <DialogDescription>{folderNameNote(who, renaming, parentName)}</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="app-folder-name">Name</FieldLabel>
            <Input
              id="app-folder-name"
              value={name}
              maxLength={APP_NAV_FOLDER_NAME_MAX}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              placeholder="Inspections"
              autoFocus
            />
            {error && <FieldError>{error}</FieldError>}
          </Field>
          {!renaming && (
            <div>
              <div className="mb-3 flex items-center gap-3">
                <AppTile icon={look.icon} color={look.color} kind="folder" size="lg" />
                <p className="min-w-0 truncate text-sm font-medium">
                  {name.trim() || 'New folder'}
                </p>
              </div>
              <AppLookFields
                icon={look.icon}
                color={look.color}
                surface="dialog"
                onChange={(l) => setLook((cur) => ({ ...cur, ...l }))}
              />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <SubmitButton pending={false}>
              {renaming ? 'Rename folder' : 'Create folder'}
            </SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Deleting a folder keeps its contents: they move up one level. */
export function DeleteFolderDialog({
  folderName,
  contents = 'apps',
  who = 'brain',
  merges = false,
  renamesFiles = false,
  onOpenChange,
  onConfirm,
}: {
  folderName: string | null;
  /** What the folder holds besides folders, in the plural ("apps", "files"). */
  contents?: string;
  who?: FolderAudience;
  /** The brain merges a subfolder into a folder of the same name one level
   *  up (the item tree's delete). */
  merges?: boolean;
  /** And gives a file whose name is taken there a new one (Files). */
  renamesFiles?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={folderName !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{folderName}”?</AlertDialogTitle>
          <AlertDialogDescription>
            Only the folder goes. The {contents} and folders inside it move up one level
            {who === 'member' ? '.' : ', for everyone on this brain.'}
            {merges &&
              ' A folder with the same name already there takes in what the one inside held.'}
            {renamesFiles &&
              ' A file whose name is already taken there gets a new one, like report-2.pdf.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={onConfirm}
          >
            Delete folder
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
