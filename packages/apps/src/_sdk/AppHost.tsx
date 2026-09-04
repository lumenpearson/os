import type { AppDefinition, AppId, LaunchArgs, Pid, WindowId } from '@lumen/kernel';
import { getKernel, log } from '@lumen/kernel';
import { Button, DialogProvider, Spinner } from '@lumen/ui';
import { Component, type ErrorInfo, type ReactNode, Suspense, useMemo } from 'react';
import { AppProvider } from './context';
import { FileDialogProvider } from './FileDialog';

export interface AppHostProps {
  app: AppDefinition;
  pid: Pid;
  windowId: WindowId;
  args: LaunchArgs;
  /** The window body element; dialogs render inside it so they are window-modal. */
  container: HTMLElement | null;
}

/**
 * Mounts an app inside a window: identity context, window-modal dialogs,
 * file pickers, lazy loading, and a crash boundary. The shell renders one
 * per window; apps never touch this.
 */
export function AppHost({ app, pid, windowId, args, container }: AppHostProps) {
  const value = useMemo(
    () => ({ pid, windowId, appId: app.id, container }),
    [pid, windowId, app.id, container],
  );
  const Component = app.component;
  return (
    <AppProvider value={value}>
      <DialogProvider container={container}>
        <FileDialogProvider>
          <CrashBoundary appId={app.id} pid={pid} windowId={windowId}>
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center bg-surface">
                  <Spinner size={20} />
                </div>
              }
            >
              <Component pid={pid} windowId={windowId} args={args} />
            </Suspense>
          </CrashBoundary>
        </FileDialogProvider>
      </DialogProvider>
    </AppProvider>
  );
}

interface CrashBoundaryProps {
  appId: AppId;
  pid: Pid;
  windowId: WindowId;
  children: ReactNode;
}

class CrashBoundary extends Component<CrashBoundaryProps, { error: Error | null }> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    log.error(this.props.appId, `crashed: ${error.message}`, info.componentStack);
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const { appId, pid } = this.props;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-surface p-6 text-center">
        <p className="text-md font-medium text-ink">This app stopped responding</p>
        <p className="mono max-w-md text-sm text-ink-2 break-words">{error.message}</p>
        <div className="flex gap-2 pt-2">
          <Button
            onClick={() => {
              const kernel = getKernel();
              kernel.kill(pid);
              kernel.launch(appId, {});
            }}
          >
            Relaunch
          </Button>
          <Button variant="primary" onClick={() => getKernel().kill(pid)}>
            Close
          </Button>
        </div>
      </div>
    );
  }
}
