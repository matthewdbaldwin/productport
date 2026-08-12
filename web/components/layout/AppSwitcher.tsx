'use client';
import { SatelliteAppSwitcher } from '@matthewdbaldwin/microport-ui';
import { useAuth } from '@/contexts/AuthContext';

export function AppSwitcher() {
  const { user } = useAuth();
  return <SatelliteAppSwitcher currentApp="productport" user={user} />;
}
