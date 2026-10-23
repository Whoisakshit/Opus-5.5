import { Lifebuoy } from '@phosphor-icons/react';

export function Brand({ href = '#/' }: { href?: string }) {
  return (
    <a href={href} className="brand" aria-label="Rahat home">
      <span className="brand-mark">
        <Lifebuoy size={20} weight="bold" aria-hidden />
      </span>
      Rahat
    </a>
  );
}
