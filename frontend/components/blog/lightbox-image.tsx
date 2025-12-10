"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type LightboxImageProps = React.ImgHTMLAttributes<HTMLImageElement>;

const Overlay = ({
  src,
  alt,
  onClose,
}: {
  src?: string;
  alt?: string;
  onClose: () => void;
}) => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 px-4"
      onClick={onClose}
      role="button"
      aria-label="Close image"
    >
      <img
        src={src}
        alt={alt}
        className="max-h-[90vh] max-w-[90vw] rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body
  );
};

export default function LightboxImage(props: LightboxImageProps) {
  const [open, setOpen] = useState(false);
  const { className, onClick, ...rest } = props;

  return (
    <>
      <img
        {...rest}
        className={`${className ?? ""} cursor-zoom-in transition-transform duration-150 hover:scale-[1.01]`}
        onClick={(e) => {
          onClick?.(e);
          if (!e.defaultPrevented) {
            setOpen(true);
          }
        }}
      />
      {open && <Overlay src={props.src} alt={props.alt} onClose={() => setOpen(false)} />}
    </>
  );
}
