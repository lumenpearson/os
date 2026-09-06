import { Button } from '@lumen/ui';
import { ExternalLink, FolderOpen, ScrollText } from 'lucide-react';

export interface PdfViewProps {
  /** Blob URL for the file; the SDK revokes it. */
  url: string;
  name: string;
  onReveal: () => void;
}

/**
 * The PDF, handed to whatever renderer the runtime has. Preview does not read
 * the document itself, so it says nothing about page counts and offers no
 * page controls: the embedded reader owns those. If the runtime has no PDF
 * reader the `<object>` shows its fallback instead, which is the panel below.
 */
export function PdfView({ url, name, onReveal }: PdfViewProps) {
  const openExternally = () => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-canvas">
      <object data={url} type="application/pdf" aria-label={name} className="min-h-0 flex-1">
        <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
          <ScrollText aria-hidden className="size-8 stroke-[1.5] text-ink-3" />
          <p className="text-md font-medium text-ink">No PDF reader here</p>
          <p className="max-w-72 text-base text-ink-2">
            This window cannot draw {name}. Opening it in a browser tab uses the reader the browser
            ships with.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Button variant="primary" icon={<ExternalLink />} onClick={openExternally}>
              Open in New Tab
            </Button>
            <Button icon={<FolderOpen />} onClick={onReveal}>
              Reveal in Files
            </Button>
          </div>
        </div>
      </object>
      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-rule bg-surface px-3 py-1.5">
        <p className="mono mr-auto truncate-1 text-xs text-ink-3">
          Paging and search belong to the embedded reader.
        </p>
        <Button size="sm" icon={<ExternalLink />} onClick={openExternally}>
          Open in New Tab
        </Button>
      </div>
    </div>
  );
}
