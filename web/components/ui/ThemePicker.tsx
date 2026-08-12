'use client';
import { ThemePicker as Base } from '@matthewdbaldwin/microport-ui';
import { THEMES, applyTheme, getStoredTheme, saveTheme, type ThemeId } from '@/lib/theme';

interface Props {
  className?: string;
}

export function ThemePicker({ className = '' }: Props) {
  return (
    <Base<ThemeId>
      themes={THEMES}
      applyTheme={applyTheme}
      getStoredTheme={getStoredTheme}
      saveTheme={saveTheme}
      className={className}
    />
  );
}
