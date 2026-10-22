export const tokens = {
  colors: {
    brand: {
      primary: '#1D4ED8',
      primaryHover: '#1E40AF',
      primaryLight: '#EFF6FF',
      accent: '#2563EB',
    },
    canvas: {
      light: '#F8FAFC',
      surface: '#FFFFFF',
      surfaceDark: '#0B132B',
      canvasDark: '#030712',
    },
    slate: {
      50: '#F8FAFC',
      100: '#F1F5F9',
      200: '#E2E8F0',
      300: '#CBD5E1',
      400: '#94A3B8',
      500: '#64748B',
      600: '#475569',
      700: '#334155',
      800: '#1E293B',
      900: '#0F172A',
    },
    status: {
      open: '#D97706',
      openBg: '#FFFBEB',
      inProgress: '#2563EB',
      inProgressBg: '#EFF6FF',
      resolved: '#059669',
      resolvedBg: '#ECFDF5',
      error: '#DC2626',
      errorBg: '#FEF2F2',
    },
  },
  typography: {
    fontSans: 'var(--font-sans)',
  },
  borderRadius: {
    sm: '0.25rem',
    md: '0.5rem',
    lg: '0.75rem',
    xl: '1rem',
    '2xl': '1.5rem',
    full: '9999px',
  },
} as const;

export type DesignTokens = typeof tokens;
