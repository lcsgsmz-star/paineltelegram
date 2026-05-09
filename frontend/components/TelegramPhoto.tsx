import { useEffect, useMemo, useState } from 'react';
import { fetchProtectedPhoto } from '../lib/api';

type TelegramPhotoProps = {
  endpoint?: string | null;
  name: string;
  alt: string;
  className?: string;
  imageClassName?: string;
  fallbackClassName?: string;
};

export function TelegramPhoto({
  endpoint,
  name,
  alt,
  className = '',
  imageClassName = '',
  fallbackClassName = '',
}: TelegramPhotoProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!endpoint) {
      setDataUrl(null);
      return;
    }

    setDataUrl(null);

    void fetchProtectedPhoto(endpoint)
      .then((nextDataUrl) => {
        if (!cancelled) {
          setDataUrl(nextDataUrl);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDataUrl(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  const initials = useMemo(() => {
    const parts = name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || '');

    return parts.join('') || 'TG';
  }, [name]);

  if (dataUrl) {
    return (
      <div className={className}>
        <img src={dataUrl} alt={alt} className={imageClassName} />
      </div>
    );
  }

  return (
    <div className={className}>
      <div className={fallbackClassName}>{initials}</div>
    </div>
  );
}
