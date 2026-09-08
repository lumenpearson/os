import type { Size, View } from '../zoom';
import { ImageStage } from './ImageStage';
import { TextView } from './TextView';

export interface SvgViewProps {
  url: string;
  /** The markup behind the drawing, once it has been read. */
  source: string | null;
  showSource: boolean;
  name: string;
  view: View;
  onViewChange: (view: View) => void;
  content: Size | null;
  onContentSize: (size: Size) => void;
  onError: () => void;
}

/**
 * An SVG is a picture with readable source, so it gets both: the drawing on
 * the stage, and the markup as text when View Source is on.
 */
export function SvgView({
  url,
  source,
  showSource,
  name,
  view,
  onViewChange,
  content,
  onContentSize,
  onError,
}: SvgViewProps) {
  if (showSource && source !== null) return <TextView text={source} name={name} />;
  return (
    <ImageStage
      url={url}
      name={name}
      view={view}
      onViewChange={onViewChange}
      content={content}
      onContentSize={onContentSize}
      onError={onError}
      checkered
    />
  );
}
