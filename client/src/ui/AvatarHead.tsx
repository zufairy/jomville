import { useMemo } from 'react';
import { parseAvatar } from '@dovey/shared';
import { AvatarPreview } from './AvatarPreview';

/** A still, head-cropped avatar from its serialized look. Shared by the rankings page and the in-game popup. */
export function AvatarHead({ avatar, scale, className = 'lb-head' }: { avatar: string; scale: number; className?: string }) {
  const cfg = useMemo(() => parseAvatar(avatar), [avatar]);
  return <AvatarPreview cfg={cfg} focus="head" animate={false} fx={false} scale={scale} className={className} />;
}
