import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';

interface Opened {
  name: string;
  data?: unknown;
  /** Tells this opening from another one of the same sheet. */
  id?: string;
}

interface SheetState {
  sheet?: Opened;
  /** A step shown over the sheet (a list to pick from), with its own history step. */
  step?: Opened;
}

let openings = 0;
const opened = (name: string, data: unknown): Opened => ({ name, data, id: `${Date.now()}-${++openings}` });

/** The history state that opens a sheet, to navigate to another page with it open. */
export function sheetState(name: string, data?: unknown): SheetState {
  return { sheet: opened(name, data) };
}

/**
 * The history step a close is leaving. Going back happens asynchronously, so
 * until it does, another close (say, from an effect) must not go back again.
 */
let closingKey: string | null = null;

/**
 * Opens a sheet as a step in the browser history, so the phone's Back
 * gesture or button closes the sheet instead of leaving the page.
 */
export function useSheet<T = undefined>(name: string) {
  const location = useLocation();
  const navigate = useNavigate();
  const sheet = (location.state as SheetState | null)?.sheet;
  const isOpen = sheet?.name === name;
  const here = location.pathname + location.search;
  const key = location.key;

  // Where the app is now, for closes that happen after awaiting a request.
  const current = useRef({ key, isOpen });
  useLayoutEffect(() => {
    current.current = { key, isOpen };
    if (closingKey !== null && closingKey !== key) closingKey = null;
  });
  useLayoutEffect(
    () => () => {
      current.current = { key: '', isOpen: false };
    },
    [],
  );

  const open = useCallback(
    (data?: T) => {
      // Switching from another sheet replaces it rather than stacking. The
      // browser's own state is read too, so a quick double tap (before this
      // component sees the first opening) doesn't stack two history steps.
      const showing = (window.history.state as { usr?: SheetState } | null)?.usr?.sheet;
      navigate(here, { state: sheetState(name, data), replace: Boolean(sheet || showing) });
    },
    [navigate, here, name, sheet],
  );

  /**
   * Closes the sheet opened at this history step. Does nothing if the app has
   * moved on since: the sheet was already closed (Back pressed while a request
   * was running), is being closed, or another sheet was opened.
   */
  const close = useCallback(() => {
    if (!current.current.isOpen || current.current.key !== key || closingKey === key) return;
    closingKey = key;
    // A sheet restored by a page reload may have no step to go back to.
    if (key !== 'default') navigate(-1);
    else navigate(here, { replace: true, state: null });
  }, [key, navigate, here]);

  return {
    isOpen,
    data: isOpen ? (sheet?.data as T) : undefined,
    /** Changes each time the sheet is opened, not when Back returns to it. */
    openId: isOpen ? (sheet?.id ?? 'restored') : undefined,
    open,
    close,
  };
}

/**
 * Opens a step over sheet `over` (a list to pick from) as its own history
 * step: Back closes the step and leaves the sheet open.
 */
export function useSheetStep<T = undefined>(over: string, name: string) {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as SheetState | null;
  const isOpen = state?.sheet?.name === over && state.step?.name === name;
  const here = location.pathname + location.search;
  const key = location.key;

  const current = useRef({ key, isOpen });
  useLayoutEffect(() => {
    current.current = { key, isOpen };
    if (closingKey !== null && closingKey !== key) closingKey = null;
  });

  const open = useCallback(
    (data?: T) => navigate(here, { state: { ...state, step: opened(name, data) } }),
    [navigate, here, name, state],
  );

  /** Changes what the step was opened with, for when Back returns to it. */
  const update = useCallback(
    (data: T) => navigate(here, { replace: true, state: { ...state, step: { ...state?.step, data } } }),
    [navigate, here, state],
  );

  /** Closes the step, once, and only if it is still the one showing. */
  const close = useCallback(() => {
    if (!current.current.isOpen || current.current.key !== key || closingKey === key) return;
    closingKey = key;
    if (key !== 'default') navigate(-1);
    else navigate(here, { replace: true, state: { sheet: state?.sheet } });
  }, [key, navigate, here, state]);

  return {
    isOpen,
    data: isOpen ? (state?.step?.data as T) : undefined,
    openId: isOpen ? (state?.step?.id ?? 'restored') : undefined,
    open,
    update,
    close,
  };
}

/**
 * Runs `reset` when a sheet or step is opened, given its `openId`, but not
 * when Back returns to it (say, after a step over it): what was typed in it is still there.
 */
export function useOnOpen(openId: string | undefined, reset: () => void, ready = true) {
  const last = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (openId === undefined || !ready || last.current === openId) return;
    last.current = openId;
    reset();
  }, [openId, ready]);
}

// The app's sheets. Kept here (not next to the components) so component
// files only export components, which keeps hot reload working in dev.

export function useUserSheet() {
  return useSheet<{ id?: number }>('user');
}

/** A link pasted or shared: video or music, then where to save it. */
export function useNewDownloadSheet() {
  return useSheet<{ url: string }>('new-download');
}

/** The folder step of the new download sheet (Back returns to video or music). */
export function useFolderStep() {
  return useSheetStep<{ kind: 'video' | 'music' }>('new-download', 'folder');
}
