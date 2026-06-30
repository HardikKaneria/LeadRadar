// Radar OIP design tokens — the single source of truth for the live dark theme rollout.
// Everything visual flows from here: change a brand value once and the whole app follows.
// The target-state spec lives in docs/architecture/13-design-system.md.

import type { ThemeConfig } from 'antd';
import { theme } from 'antd';

/** Brand + semantic palette. Keep in sync with the CSS vars in globals.css. */
export const BRAND = {
  /** Radar Emerald — primary action / selection / positive intent. */
  primary: '#3DDC97',
  primaryHover: '#34C987',
  primaryActive: '#2DB77A',
  /** Info accent stays cool so AI/system states remain distinct from primary actions. */
  accent: '#38BDF8',
  success: '#3DDC97',
  warning: '#EAB308',
  error: '#EF4444',
  info: '#38BDF8',
} as const;

/** Dark developer-console scale, from deepest canvas to brightest text. */
export const SURFACE = {
  base: '#0B0F0D', // app canvas
  layout: '#111715', // sider + header
  container: '#151C19', // cards / panels
  elevated: '#1B2420', // dropdowns / modals / popovers
  spotlight: '#223029', // hover rows / active surfaces
  field: '#111715', // inputs / selects
  border: '#26332D',
  borderSubtle: '#1D2823',
  borderStrong: '#33443B',
} as const;

export const TEXT = {
  primary: '#F4F7F5',
  secondary: '#C9D3CE',
  tertiary: '#7E8B85',
  quaternary: '#58645F',
} as const;

const FONT_SANS = 'var(--font-sans), ui-sans-serif, system-ui, -apple-system, sans-serif';
const FONT_MONO = 'var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace';

export const radarTheme: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  cssVar: { key: 'radar' },
  token: {
    colorPrimary: BRAND.primary,
    colorInfo: BRAND.info,
    colorSuccess: BRAND.success,
    colorWarning: BRAND.warning,
    colorError: BRAND.error,
    colorLink: BRAND.primary,
    colorLinkHover: BRAND.primaryHover,

    colorBgBase: SURFACE.base,
    colorTextBase: TEXT.primary,
    colorBgContainer: SURFACE.container,
    colorBgElevated: SURFACE.elevated,
    colorBgLayout: SURFACE.base,
    colorBgSpotlight: SURFACE.spotlight,

    colorBorder: SURFACE.border,
    colorBorderSecondary: SURFACE.borderSubtle,

    colorText: TEXT.primary,
    colorTextSecondary: TEXT.secondary,
    colorTextTertiary: TEXT.tertiary,
    colorTextQuaternary: TEXT.quaternary,

    fontFamily: FONT_SANS,
    fontFamilyCode: FONT_MONO,
    fontSize: 14,

    borderRadius: 10,
    borderRadiusLG: 12,
    borderRadiusSM: 8,

    controlHeight: 36,
    controlHeightLG: 44,
    controlHeightSM: 28,

    lineWidth: 1,
    wireframe: false,

    boxShadow: '0 18px 48px -28px rgba(0, 0, 0, 0.72)',
    boxShadowSecondary: '0 12px 32px -24px rgba(0, 0, 0, 0.7)',
    motionDurationMid: '0.18s',
  },
  components: {
    Layout: {
      headerBg: SURFACE.layout,
      siderBg: SURFACE.layout,
      bodyBg: SURFACE.base,
      headerHeight: 72,
      headerPadding: '0 24px',
      footerBg: SURFACE.base,
    },
    Menu: {
      darkItemBg: 'transparent',
      darkSubMenuItemBg: 'transparent',
      darkPopupBg: SURFACE.elevated,
      darkItemColor: TEXT.secondary,
      darkItemHoverColor: TEXT.primary,
      darkItemHoverBg: 'rgba(61, 220, 151, 0.08)',
      darkItemSelectedBg: 'rgba(61, 220, 151, 0.12)',
      darkItemSelectedColor: TEXT.primary,
      itemHeight: 40,
      itemMarginInline: 8,
      itemBorderRadius: 10,
      iconSize: 18,
      collapsedIconSize: 20,
      fontSize: 14,
    },
    Card: {
      colorBgContainer: SURFACE.container,
      colorBorderSecondary: SURFACE.border,
      borderRadiusLG: 12,
      paddingLG: 20,
      boxShadowTertiary: 'none',
    },
    Button: {
      controlHeight: 36,
      fontWeight: 500,
      primaryShadow: 'none',
      defaultBg: SURFACE.container,
      defaultBorderColor: SURFACE.border,
      defaultColor: TEXT.primary,
    },
    Input: {
      colorBgContainer: SURFACE.field,
      activeBorderColor: BRAND.primary,
      hoverBorderColor: SURFACE.borderStrong,
    },
    InputNumber: {
      colorBgContainer: SURFACE.field,
    },
    Select: {
      colorBgContainer: SURFACE.field,
      colorBgElevated: SURFACE.elevated,
      optionSelectedBg: 'rgba(94, 139, 255, 0.16)',
    },
    DatePicker: {
      colorBgContainer: SURFACE.field,
      colorBgElevated: SURFACE.elevated,
    },
    Table: {
      headerBg: SURFACE.container,
      headerColor: TEXT.tertiary,
      rowHoverBg: SURFACE.spotlight,
      borderColor: SURFACE.borderSubtle,
      colorBgContainer: SURFACE.container,
      cellPaddingBlock: 12,
      cellPaddingInline: 16,
    },
    Tabs: {
      itemColor: TEXT.secondary,
      itemSelectedColor: TEXT.primary,
      inkBarColor: BRAND.primary,
      titleFontSize: 14,
    },
    Segmented: {
      trackBg: SURFACE.field,
      itemSelectedBg: 'rgba(61, 220, 151, 0.16)',
      itemSelectedColor: TEXT.primary,
    },
    Modal: {
      contentBg: SURFACE.elevated,
      headerBg: SURFACE.elevated,
    },
    Tag: {
      borderRadiusSM: 999,
    },
    Tooltip: {
      colorBgSpotlight: SURFACE.elevated,
    },
    Progress: {
      defaultColor: BRAND.primary,
    },
  },
};
