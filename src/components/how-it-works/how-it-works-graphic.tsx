import Image from "next/image";

/**
 * The single source of the How It Works infographic — used by the login-page
 * modal and the standalone /how-it-works page so the image/layout logic
 * only exists once. This is final artwork, not something to recreate in
 * HTML: object-contain, full aspect ratio preserved, no cropping.
 */
export function HowItWorksGraphic({ priority = false }: { priority?: boolean }) {
  return (
    <Image
      src="/action-how-it-works.png"
      alt="How Action works: create an Action by picking a game or challenge, invite a friend, they accept, wait for the result, then someone wins and someone pays."
      width={1536}
      height={1024}
      priority={priority}
      sizes="(min-width: 640px) 90vw, 100vw"
      className="h-auto w-full object-contain"
    />
  );
}
