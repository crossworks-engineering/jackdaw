'use client';

import { useEffect, useState } from 'react';
import { APP_NAV_FOLDER_NAME_MAX } from '@mantle/web-ui/types/app-nav';
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

/** Create or rename a folder. `initial` present = rename. */
export function FolderNameDialog({
  open,
  onOpenChange,
  initial,
  parentName,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: string;
  /** For a new subfolder: the folder it goes in, named in the description. */
  parentName?: string | null;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState(initial ?? '');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setName(initial ?? '');
      setError(null);
    }
  }, [open, initial]);
  const renaming = initial !== undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = name.trim();
            if (!trimmed) {
              setError('Give the folder a name.');
              return;
            }
            onSubmit(trimmed);
            onOpenChange(false);
          }}
          className="flex flex-col gap-4"
        >
          <DialogHeader>
            <DialogTitle>{renaming ? 'Rename folder' : 'New folder'}</DialogTitle>
            <DialogDescription>
              {renaming
                ? 'Everyone on this brain sees the new name.'
                : parentName
                  ? `Inside ${parentName}. Everyone on this brain sees it.`
                  : 'Everyone on this brain sees the same folders.'}
            </DialogDescription>
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
  onOpenChange,
  onConfirm,
}: {
  folderName: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={folderName !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{folderName}”?</AlertDialogTitle>
          <AlertDialogDescription>
            Only the folder goes. The apps and folders inside it move up one level, for everyone on
            this brain.
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
