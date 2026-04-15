'use client';

import React, { useState, useCallback, useMemo, memo } from 'react';
import Image from 'next/image';

type BaseImageProps = Omit<
  React.ComponentProps<typeof Image>,
  | 'src'
  | 'alt'
  | 'width'
  | 'height'
  | 'fill'
  | 'loading'
  | 'placeholder'
  | 'quality'
  | 'onError'
  | 'onLoad'
>;

interface AppImageProps extends BaseImageProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  priority?: boolean;
  quality?: number;
  placeholder?: 'blur' | 'empty';
  blurDataURL?: string;
  fill?: boolean;
  sizes?: string;
  onClick?: () => void;
  fallbackSrc?: string;
  loading?: 'lazy' | 'eager';
  unoptimized?: boolean;
  onError?: React.ComponentProps<typeof Image>['onError'];
  onLoad?: React.ComponentProps<typeof Image>['onLoad'];
}

const AppImage = memo(function AppImage({
  src,
  alt,
  width,
  height,
  className = '',
  priority = false,
  quality = 85,
  placeholder = 'empty',
  blurDataURL,
  fill = false,
  sizes,
  onClick,
  fallbackSrc = '/assets/images/no_image.png',
  loading = 'lazy',
  unoptimized = false,
  onError,
  onLoad,
  ...props
}: AppImageProps) {
  const [imageSrc, setImageSrc] = useState(src);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const isExternalUrl = useMemo(
    () => typeof imageSrc === 'string' && imageSrc.startsWith('http'),
    [imageSrc]
  );
  const resolvedUnoptimized = unoptimized || isExternalUrl;

  const handleError = useCallback<NonNullable<React.ComponentProps<typeof Image>['onError']>>(
    (event) => {
      if (!hasError && imageSrc !== fallbackSrc) {
        setImageSrc(fallbackSrc);
        setHasError(true);
      }
      setIsLoading(false);
      onError?.(event);
    },
    [fallbackSrc, hasError, imageSrc, onError]
  );

  const handleLoad = useCallback<NonNullable<React.ComponentProps<typeof Image>['onLoad']>>(
    (event) => {
      setIsLoading(false);
      setHasError(false);
      onLoad?.(event);
    },
    [onLoad]
  );

  const imageClassName = useMemo(() => {
    const classes = [className];
    if (isLoading) classes.push('bg-gray-200');
    if (onClick) classes.push('cursor-pointer hover:opacity-90 transition-opacity duration-200');
    return classes.filter(Boolean).join(' ');
  }, [className, isLoading, onClick]);

  const blurProps = blurDataURL && placeholder === 'blur' ? { blurDataURL } : {};
  const loadingProps = priority ? { priority: true as const } : { loading };

  if (fill) {
    return (
      <div className="relative" style={{ width: '100%', height: '100%' }}>
        <Image
          src={imageSrc}
          alt={alt}
          className={imageClassName}
          quality={quality}
          placeholder={placeholder}
          unoptimized={resolvedUnoptimized}
          onError={handleError}
          onLoad={handleLoad}
          onClick={onClick}
          fill
          sizes={sizes || '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw'}
          style={{ objectFit: 'cover' }}
          {...loadingProps}
          {...blurProps}
          {...props}
        />
      </div>
    );
  }

  return (
    <Image
      src={imageSrc}
      alt={alt}
      className={imageClassName}
      quality={quality}
      placeholder={placeholder}
      unoptimized={resolvedUnoptimized}
      onError={handleError}
      onLoad={handleLoad}
      onClick={onClick}
      width={width || 400}
      height={height || 300}
      sizes={sizes}
      {...loadingProps}
      {...blurProps}
      {...props}
    />
  );
});

AppImage.displayName = 'AppImage';

export default AppImage;
